import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug } from '@/lib/space';
import { tenantTable } from '@/lib/tenant-db';
import { checkRateLimit } from '@/lib/rate-limit';
import { RESERVED_TITLE_LIKE_PATTERNS } from '@/lib/chat/conversation-access';
import { parseConversationMode } from '@/lib/chat/conversation-mode';
import { parseWorkExecutionMode } from '@/lib/chat/work-execution-mode';

const rateLimited = () =>
  NextResponse.json(
    { error: 'too many requests. try again shortly.' },
    { status: 429, headers: { 'Retry-After': '60' } },
  );

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { allowed } = await checkRateLimit(`ai:conversations:${userId}`, 20, 60);
    if (!allowed) return rateLimited();

    const slug = req.nextUrl.searchParams.get('slug');
    if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
    const requestedLimit = Number.parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(requestedLimit, 50))
      : 50;

    const space = await getSpaceFromSlug(slug);
    if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

    const { data: owner } = await supabase
      .from('User')
      .select('id')
      .eq('clerkId', userId)
      .eq('id', space.ownerId)
      .maybeSingle();
    if (!owner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data, error } = await tenantTable(supabase, 'Conversation', { spaceId: space.id })
      .select('*')
      // Reserved broker/team prefixes are sourced from
      // lib/chat/conversation-access so the realtor exclusion set lives in one
      // place. The realtor surface never serves broker-Chippi or team chats.
      .not('title', 'like', RESERVED_TITLE_LIKE_PATTERNS[0])
      .not('title', 'like', RESERVED_TITLE_LIKE_PATTERNS[1])
      .order('updatedAt', { ascending: false })
      .limit(limit);
    if (error) return NextResponse.json({ error: 'Failed to load conversations' }, { status: 500 });

    const conversations = (data ?? []) as Array<{ id: string; [key: string]: unknown }>;

    // Fetch the last message for each conversation to provide a preview line.
    // Single query: grab the most-recent message per conversationId for this
    // set of conversations, then map them back by id.
    const ids = conversations.map((c) => c.id);
    let previewMap: Record<string, string> = {};
    if (ids.length > 0) {
      // PostgREST doesn't support GROUP BY, so we fetch with a high-enough
      // limit and deduplicate in JS. We order descending so the first row we
      // see for each conversationId is the latest one.
      const { data: msgs } = await tenantTable(supabase, 'Message', { spaceId: space.id })
        .select('conversationId, content')
        .in('conversationId', ids)
        .order('createdAt', { ascending: false })
        .limit(limit * 20); // bounded generous cap; deduplication below

      if (msgs) {
        for (const msg of msgs as Array<{ conversationId?: string; content?: string }>) {
          if (msg.conversationId && !(msg.conversationId in previewMap)) {
            const text = (msg.content ?? '').replace(/\s+/g, ' ').trim();
            previewMap[msg.conversationId] = text.length > 60 ? text.slice(0, 59) + '…' : text;
          }
        }
      }
    }

    const result = conversations.map((c) => ({
      ...c,
      preview: previewMap[c.id] ?? null,
    }));

    return NextResponse.json(result);
  } catch (err) {
    console.error('[conversations] GET error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { allowed } = await checkRateLimit(`ai:conversations:${userId}`, 20, 60);
    if (!allowed) return rateLimited();

    const { slug, mode: rawMode, executionMode: rawExecutionMode } = await req.json();
    if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
    const mode = parseConversationMode(rawMode);
    const executionMode = parseWorkExecutionMode(rawExecutionMode);

    const space = await getSpaceFromSlug(slug);
    if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

    const { data: owner } = await supabase
      .from('User')
      .select('id')
      .eq('clerkId', userId)
      .eq('id', space.ownerId)
      .maybeSingle();
    if (!owner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const now = new Date().toISOString();
    const { data, error } = await tenantTable(supabase, 'Conversation', { spaceId: space.id })
      .insert({
        id: crypto.randomUUID(),
        spaceId: space.id,
        title: 'New conversation',
        mode,
        executionMode,
        createdAt: now,
        updatedAt: now,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('[conversations] POST error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
