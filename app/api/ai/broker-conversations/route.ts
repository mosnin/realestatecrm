/**
 * Conversation CRUD for the broker Chippi surface.
 *
 * Parallel to `app/api/ai/conversations/route.ts` (the realtor route) but
 * gated on broker access via `resolveBrokerContext()` (defense layer 2).
 *
 * Broker conversations are stored on the brokerage_owner's personal Space,
 * with a `[BROKER_CHIPPI] <brokerageId>` title prefix so they:
 *   (a) stay out of the realtor's conversation list (the realtor page
 *       filters with NOT LIKE '[BROKER_CHIPPI]%' and the existing
 *       NOT LIKE '[BROKERAGE_CHAT]%'),
 *   (b) can be filtered cleanly when listing broker chats here, and
 *   (c) carry the brokerage id in the title so a multi-brokerage admin
 *       sees the right set per brokerage they're acting against.
 *
 * Auth is by broker MEMBERSHIP, never by Space ownership — broker
 * conversations live on the broker_OWNER's space, so a `broker_admin`
 * (who does NOT own that space) must still be able to list, read, rename,
 * and delete them. The realtor routes (`/api/ai/messages`,
 * `/api/ai/conversations/[id]`) all enforce `Space.ownerId === caller`, so
 * a broker_admin gets 403/404 there — which is exactly why this route owns
 * the full lifecycle for broker chats.
 *
 * Scoping is tight: every operation resolves the broker's own brokerage from
 * the Clerk session, anchors on that brokerage's owner Space, and verifies
 * the target conversation's title carries this brokerage's
 * `[BROKER_CHIPPI] <brokerageId>` prefix. A broker only ever touches their
 * own brokerage's conversations.
 *
 * Title shape:
 *   `[BROKER_CHIPPI] <brokerageId>`                 — untitled (just created)
 *   `[BROKER_CHIPPI] <brokerageId> <displayName>`   — renamed by the broker
 *
 * The prefix is load-bearing (filtering + brokerage scoping), so RENAME
 * stores the human display name AFTER the prefix and never strips it. GET
 * parses the prefix off and returns a clean `title` for the sidebar plus a
 * `preview` (last message) line.
 */

import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { resolveBrokerContext } from '@/lib/agent/broker-context';

export const runtime = 'nodejs';

const CONV_TITLE_PREFIX = '[BROKER_CHIPPI]';

/** Find the broker_owner's personal Space — broker conversations anchor here. */
async function resolvePersistenceSpaceId(brokerageOwnerId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('Space')
    .select('id')
    .eq('ownerId', brokerageOwnerId)
    .maybeSingle();
  if (error || !data) return null;
  return data.id as string;
}

/**
 * Strip the `[BROKER_CHIPPI] <brokerageId>` prefix off a stored title and
 * return the clean human display name. Returns '' for an untitled
 * conversation (one that has only the prefix), which the sidebar renders as
 * a fallback ("New conversation").
 */
function displayTitle(rawTitle: string | null, brokerageId: string): string {
  const prefix = `${CONV_TITLE_PREFIX} ${brokerageId}`;
  if (!rawTitle) return '';
  if (rawTitle === prefix) return '';
  if (rawTitle.startsWith(`${prefix} `)) return rawTitle.slice(prefix.length + 1).trim();
  return '';
}

/**
 * Verify a conversation belongs to this broker's brokerage: it must live on
 * the brokerage owner's Space AND carry this brokerage's title prefix. Returns
 * the raw conversation row, or null if it isn't this brokerage's to touch.
 */
async function getScopedConversation(
  conversationId: string,
  spaceId: string,
  brokerageId: string,
): Promise<{ id: string; spaceId: string; title: string | null } | null> {
  const { data, error } = await supabase
    .from('Conversation')
    .select('id, spaceId, title')
    .eq('id', conversationId)
    .eq('spaceId', spaceId)
    .maybeSingle();
  if (error || !data) return null;
  const prefix = `${CONV_TITLE_PREFIX} ${brokerageId}`;
  const title = (data.title ?? '') as string;
  if (title !== prefix && !title.startsWith(`${prefix} `)) return null;
  return data as { id: string; spaceId: string; title: string | null };
}

export async function GET(req: NextRequest) {
  const brokerCtx = await resolveBrokerContext();
  if (!brokerCtx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const spaceId = await resolvePersistenceSpaceId(brokerCtx.brokerage.ownerId);
  if (!spaceId) return NextResponse.json([]);

  const brokerageId = brokerCtx.brokerage.id;

  // Single-conversation message load — broker-safe equivalent of
  // `/api/ai/messages`, gated by broker membership instead of Space
  // ownership so broker_admin can read history on the owner's space.
  const conversationId = req.nextUrl.searchParams.get('conversationId');
  if (conversationId) {
    const conv = await getScopedConversation(conversationId, spaceId, brokerageId);
    if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: msgs, error: msgErr } = await supabase
      .from('Message')
      .select('id, role, content, blocks, createdAt')
      .eq('conversationId', conversationId)
      .order('createdAt', { ascending: true })
      .limit(50);
    if (msgErr) return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 });
    return NextResponse.json(msgs ?? []);
  }

  const titlePrefix = `${CONV_TITLE_PREFIX} ${brokerageId}`;
  const { data, error } = await supabase
    .from('Conversation')
    .select('*')
    .eq('spaceId', spaceId)
    .ilike('title', `${titlePrefix}%`)
    .order('updatedAt', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: 'Failed to load conversations' }, { status: 500 });

  const conversations = data ?? [];

  // Last message per conversation → preview line. Mirrors the realtor GET:
  // PostgREST has no GROUP BY, so fetch descending and keep the first row
  // seen per conversationId.
  const ids = conversations.map((c) => c.id);
  const previewMap: Record<string, string> = {};
  if (ids.length > 0) {
    const { data: previewMsgs } = await supabase
      .from('Message')
      .select('conversationId, content')
      .in('conversationId', ids)
      .order('createdAt', { ascending: false })
      .limit(ids.length * 20);
    if (previewMsgs) {
      for (const msg of previewMsgs) {
        if (msg.conversationId && !(msg.conversationId in previewMap)) {
          const text = (msg.content ?? '').replace(/\s+/g, ' ').trim();
          previewMap[msg.conversationId] = text.length > 60 ? text.slice(0, 59) + '…' : text;
        }
      }
    }
  }

  // Return a CLEAN display title (prefix stripped) so the sidebar shows a
  // human name, never the raw `[BROKER_CHIPPI] <uuid>`. Keep the stored
  // value too in case a caller needs it.
  const result = conversations.map((c) => ({
    ...c,
    rawTitle: c.title,
    title: displayTitle(c.title, brokerageId),
    preview: previewMap[c.id] ?? null,
  }));

  return NextResponse.json(result);
}

export async function POST(_req: NextRequest) {
  const brokerCtx = await resolveBrokerContext();
  if (!brokerCtx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const spaceId = await resolvePersistenceSpaceId(brokerCtx.brokerage.ownerId);
  if (!spaceId) {
    return NextResponse.json(
      { error: 'Broker chat is not available for this brokerage yet.' },
      { status: 503 },
    );
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('Conversation')
    .insert({
      id: crypto.randomUUID(),
      spaceId,
      // Title carries the brokerage id so a future multi-brokerage admin
      // can filter cleanly. The leading prefix keeps it out of the
      // realtor's conversation list.
      title: `${CONV_TITLE_PREFIX} ${brokerCtx.brokerage.id}`,
      createdAt: now,
      updatedAt: now,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });

  // Hand back a clean display title (empty for a brand-new chat) so the
  // sidebar's optimistic insert matches the GET shape.
  return NextResponse.json(
    { ...data, rawTitle: data.title, title: displayTitle(data.title, brokerCtx.brokerage.id) },
    { status: 201 },
  );
}

/**
 * Rename — broker-membership gated, scoped to this brokerage's prefix.
 *
 * The `[BROKER_CHIPPI] <brokerageId>` prefix is PRESERVED: the human display
 * name is stored AFTER it. Stripping the prefix (as the realtor PATCH does)
 * would drop the conversation out of the broker list and fork a new one on
 * the next message — so rename here is non-destructive by construction.
 */
export async function PATCH(req: NextRequest) {
  const brokerCtx = await resolveBrokerContext();
  if (!brokerCtx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const spaceId = await resolvePersistenceSpaceId(brokerCtx.brokerage.ownerId);
  if (!spaceId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const brokerageId = brokerCtx.brokerage.id;

  const body = await req.json().catch(() => null);
  const id = body?.id;
  const rawName = body?.title;
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }
  if (typeof rawName !== 'string' || !rawName.trim()) {
    return NextResponse.json({ error: 'title required' }, { status: 400 });
  }

  const conv = await getScopedConversation(id, spaceId, brokerageId);
  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const prefix = `${CONV_TITLE_PREFIX} ${brokerageId}`;
  const stored = `${prefix} ${rawName.trim()}`;

  const { data, error } = await supabase
    .from('Conversation')
    .update({ title: stored, updatedAt: new Date().toISOString() })
    .eq('id', id)
    .eq('spaceId', spaceId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: 'Failed to rename conversation' }, { status: 500 });

  return NextResponse.json({
    ...data,
    rawTitle: data.title,
    title: displayTitle(data.title, brokerageId),
  });
}

/**
 * Delete — broker-membership gated, scoped to this brokerage's prefix.
 * Removes the conversation's messages first, then the row, both scoped.
 */
export async function DELETE(req: NextRequest) {
  const brokerCtx = await resolveBrokerContext();
  if (!brokerCtx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const spaceId = await resolvePersistenceSpaceId(brokerCtx.brokerage.ownerId);
  if (!spaceId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const brokerageId = brokerCtx.brokerage.id;

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const conv = await getScopedConversation(id, spaceId, brokerageId);
  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Messages first — the conversation row is the scoping anchor, so removing
  // it last keeps the operation re-runnable if the message delete fails.
  const { error: msgErr } = await supabase.from('Message').delete().eq('conversationId', id);
  if (msgErr) return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 });

  const { error } = await supabase
    .from('Conversation')
    .delete()
    .eq('id', id)
    .eq('spaceId', spaceId);
  if (error) return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 });

  return NextResponse.json({ success: true });
}
