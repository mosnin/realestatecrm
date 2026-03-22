import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { chatWithRAG } from '@/lib/ai';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import type { SpaceSetting } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Rate limit: 60 requests per user per hour
    const { allowed } = await checkRateLimit(`ai:chat:${userId}`, 60, 3600);
    if (!allowed) {
      return NextResponse.json({ error: 'AI chat rate limit exceeded. Please wait before sending more messages.' }, { status: 429 });
    }

    const { messages, slug, conversationId } = await req.json();

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
          const autoTitle = lastUserMsg.content.trim().slice(0, 60);
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

    // Use per-space API key if set, otherwise fall back to env var
    const { data: settings, error: settingsError } = await supabase
      .from('SpaceSetting')
      .select('*')
      .eq('spaceId', space.id)
      .maybeSingle();
    if (settingsError) throw settingsError;

    const stream = await chatWithRAG(messages, space.id, space.name, (settings as any)?.anthropicApiKey);

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
