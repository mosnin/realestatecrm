/**
 * Conversation CRUD for the broker Chippi surface.
 *
 * Parallel to `app/api/ai/conversations/route.ts` (the realtor route) but
 * gated on broker access via `resolveBrokerContext()` (defense layer 2).
 *
 * Broker conversations are stored on the brokerage_owner's personal Space,
 * with a `[BROKER_CHIPPI]` title prefix so they:
 *   (a) stay out of the realtor's conversation list (the realtor page
 *       filters with NOT LIKE '[BROKER_CHIPPI]%' and the existing
 *       NOT LIKE '[BROKERAGE_CHAT]%'),
 *   (b) can be filtered cleanly when listing broker chats here, and
 *   (c) carry the brokerage id in the title so a multi-brokerage admin
 *       sees the right set per brokerage they're acting against.
 *
 * Phase 1 scope: create + list conversations the broker has had with
 * Chippi. PATCH/DELETE follow the same pattern but aren't required for
 * Phase 1 wiring.
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

export async function GET(_req: NextRequest) {
  const brokerCtx = await resolveBrokerContext();
  if (!brokerCtx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const spaceId = await resolvePersistenceSpaceId(brokerCtx.brokerage.ownerId);
  if (!spaceId) return NextResponse.json([]);

  const titlePrefix = `${CONV_TITLE_PREFIX} ${brokerCtx.brokerage.id}`;
  const { data, error } = await supabase
    .from('Conversation')
    .select('*')
    .eq('spaceId', spaceId)
    .ilike('title', `${titlePrefix}%`)
    .order('updatedAt', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: 'Failed to load conversations' }, { status: 500 });

  return NextResponse.json(data ?? []);
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

  return NextResponse.json(data, { status: 201 });
}
