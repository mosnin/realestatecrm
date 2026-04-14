import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { chatWithRAG } from '@/lib/ai';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';


/**
 * Strip HTML tags and control characters from a string.
 * Used to sanitize auto-generated conversation titles derived from user input.
 */
function sanitizeTitle(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')           // strip HTML tags
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // strip control chars (preserve \n, \r, \t)
    .replace(/\s+/g, ' ')             // collapse whitespace
    .trim();
}

function sanitizeIncomingMessages(raw: any[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((m) => {
      const role = m?.role === 'assistant' ? 'assistant' : m?.role === 'user' ? 'user' : null;
      if (!role) return null;
      return {
        role,
        content: typeof m?.content === 'string' ? m.content : String(m?.content ?? ''),
      };
    })
    .filter((m): m is { role: 'user' | 'assistant'; content: string } => Boolean(m));
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Rate limit: 60 requests per user per hour
    const { allowed } = await checkRateLimit(`ai:chat:${userId}`, 60, 3600);
    if (!allowed) {
      return NextResponse.json({ error: 'AI chat rate limit exceeded. Please wait before sending more messages.' }, { status: 429 });
    }

    const { messages: rawMessages, slug, conversationId } = await req.json();
    const messages = sanitizeIncomingMessages(rawMessages);

    const space = await getSpaceFromSlug(slug);
    if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

    // Verify the authenticated user owns this space
    const { data: owner } = await supabase
      .from('User')
      .select('id')
      .eq('clerkId', userId)
      .eq('id', space.ownerId)
      .maybeSingle();
    if (!owner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Validate conversation ownership if provided
    if (conversationId) {
      const { data: conv } = await supabase
        .from('Conversation')
        .select('id, spaceId')
        .eq('id', conversationId)
        .maybeSingle();
      if (!conv || conv.spaceId !== space.id) {
        return NextResponse.json({ error: 'Invalid conversation' }, { status: 400 });
      }
    }

    // Save user message to DB
    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === 'user');
    if (lastUserMsg) {
      const { error } = await supabase
        .from('Message')
        .insert({
          id: crypto.randomUUID(),
          spaceId: space.id,
          conversationId: conversationId ?? null,
          role: 'user',
          content: lastUserMsg.content,
        });
      if (error) throw error;

      // Auto-title conversation on first user message
      if (conversationId) {
        const { data: conv } = await supabase
          .from('Conversation')
          .select('title')
          .eq('id', conversationId)
          .maybeSingle();
        if (conv?.title === 'New conversation') {
          const autoTitle = sanitizeTitle(lastUserMsg.content).slice(0, 60) || 'Chat';
          await supabase
            .from('Conversation')
            .update({ title: autoTitle, updatedAt: new Date().toISOString() })
            .eq('id', conversationId);
        } else {
          await supabase
            .from('Conversation')
            .update({ updatedAt: new Date().toISOString() })
            .eq('id', conversationId);
        }
      }
    }

    const stream = await chatWithRAG(messages, space.id, space.name);

    // Collect the full response text to save to DB (non-blocking)
    const [streamForResponse, streamForSave] = stream.tee();
    void (async () => {
      try {
        const reader = streamForSave.getReader();
        let fullText = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullText += new TextDecoder().decode(value);
        }
        const { error: insertError } = await supabase
          .from('Message')
          .insert({
            id: crypto.randomUUID(),
            spaceId: space.id,
            conversationId: conversationId ?? null,
            role: 'assistant',
            content: fullText,
          });
        if (insertError) console.error('[chat] failed to save assistant message', insertError);

        if (conversationId) {
          const { error: updateError } = await supabase
            .from('Conversation')
            .update({ updatedAt: new Date().toISOString() })
            .eq('id', conversationId);
          if (updateError) console.error('[chat] failed to update conversation timestamp', updateError);
        }
      } catch (err) {
        console.error('[chat] error in background save', err);
      }
    })();

    return new NextResponse(streamForResponse, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked'
      }
    });
  } catch (error) {
    // Log full error server-side; never return internal details to the client
    console.error('[chat] unhandled error', error);
    return new NextResponse('AI service error', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}
