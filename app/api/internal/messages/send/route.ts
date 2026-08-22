/**
 * POST /api/internal/messages/send — the Chippi agent's door into team
 * messaging. Authed by AGENT_INTERNAL_SECRET (Modal/Python runtime), not
 * Clerk — same contract as /api/internal/studio/*.
 *
 * The agent run carries spaceId only, so this route resolves the space owner,
 * verifies they belong to a brokerage, matches the recipient against the
 * brokerage roster by name/email, then reuses the exact same data path the
 * Messages UI uses (ensureDmChannel + postMessage) — one write path, whether
 * a human or Chippi is typing.
 *
 * Ambiguity is an error, not a guess: "message Sam" with two Sams on the
 * floor returns the candidates so the agent can ask the realtor which one.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { ensureDmChannel, postMessage, rosterForBrokerage } from '@/lib/messaging';
import { logger } from '@/lib/logger';
import { unscoped } from '@/lib/supabase-guard';
import {
  RUN_POLICY_HEADER,
  runPolicyEnforcementMode,
  verifyRunPolicy,
} from '@/lib/agent/run-policy';

export const runtime = 'nodejs';

const MAX_MESSAGE = 2000;

export async function POST(req: NextRequest) {
  const secret = process.env.AGENT_INTERNAL_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  if (req.headers.get('Authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { spaceId?: unknown; recipient?: unknown; message?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const spaceId = typeof body.spaceId === 'string' ? body.spaceId : '';
  const recipient = typeof body.recipient === 'string' ? body.recipient.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, MAX_MESSAGE) : '';
  if (!spaceId || !recipient || !message) {
    return NextResponse.json({ error: 'spaceId, recipient, and message are required' }, { status: 400 });
  }

  const policyToken = req.headers.get(RUN_POLICY_HEADER);
  const policy = verifyRunPolicy(policyToken, {
    spaceId,
    requiredCapability: 'team_message:send',
  });
  if (policy.ok) {
    if (
      policy.claims.mode !== 'interactive' &&
      !(
        policy.claims.mode === 'voice_control' &&
        policy.claims.capabilities.includes('proposal:decide')
      )
    ) {
      logger.warn('[internal/messages/send] unattended run denied', {
        runId: policy.claims.runId,
        spaceId,
        mode: policy.claims.mode,
      });
      return NextResponse.json(
        { error: 'Unattended runs must propose team messages for review.', code: 'RUN_POLICY_DENIED' },
        { status: 403 },
      );
    }
  } else if (policyToken || runPolicyEnforcementMode() === 'enforce') {
    logger.warn('[internal/messages/send] missing or invalid run policy', {
      spaceId,
      reason: policy.reason,
    });
    return NextResponse.json(
      { error: 'A valid run capability grant is required.', code: 'RUN_POLICY_REQUIRED' },
      { status: 403 },
    );
  } else {
    logger.warn('[internal/messages/send] legacy caller allowed in shadow mode', {
      spaceId,
      reason: policy.reason,
    });
  }

  // Runaway-loop guard: a compromised secret or looping agent must not be
  // able to flood a team's inboxes.
  const rl = await checkRateLimit(`msg:internal:send:${spaceId}`, 30, 3600);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many team messages this hour.' }, { status: 429 });
  }

  // spaceId → owner (the realtor Chippi is acting for) → their brokerage.
  const { data: space } = await supabase
    .from('Space')
    .select('id, ownerId')
    .eq('id', spaceId)
    .maybeSingle();
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

  const senderId = (space as { ownerId: string }).ownerId;
  // This route resolves the sender from the space rather than trusting a body
  // field.  A signed policy is still subject-bound: prevent a valid grant for
  // a different user in the same workspace from sending as the owner.
  if (policy.ok && policy.claims.subject !== senderId) {
    logger.warn('[internal/messages/send] run policy subject mismatch', {
      runId: policy.claims.runId,
      spaceId,
      claimedSubject: policy.claims.subject,
      senderId,
    });
    return NextResponse.json(
      { error: 'Run capability grant is not bound to this sender.', code: 'RUN_POLICY_DENIED' },
      { status: 403 },
    );
  }
  const { data: membership } = await unscoped(
    supabase.from('BrokerageMembership'),
    'membership lookup by userId then team send uses that brokerageId',
  )
    .select('brokerageId')
    .eq('userId', senderId)
    .limit(1)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json(
      { error: 'This real estate agent is not part of a brokerage — there is no team to message.' },
      { status: 404 },
    );
  }
  const brokerageId = (membership as { brokerageId: string }).brokerageId;

  // Match the recipient on the roster: exact email, else case-insensitive
  // name substring. Zero matches → not found; several → ask, don't guess.
  const roster = await rosterForBrokerage(brokerageId);
  const needle = recipient.toLowerCase();
  const candidates = roster.filter(
    (m) =>
      m.userId !== senderId &&
      (m.email.toLowerCase() === needle || (m.name ?? '').toLowerCase().includes(needle)),
  );
  if (candidates.length === 0) {
    return NextResponse.json(
      { error: `No teammate matching "${recipient}" on this brokerage.` },
      { status: 404 },
    );
  }
  if (candidates.length > 1) {
    return NextResponse.json(
      {
        error: `"${recipient}" matches ${candidates.length} teammates — which one?`,
        candidates: candidates.map((c) => ({ name: c.name, email: c.email })),
      },
      { status: 409 },
    );
  }

  const target = candidates[0];
  // A 503 with a plain-language error lets the agent tell the realtor the
  // send didn't happen, instead of an opaque 500 it can't explain.
  let channel;
  try {
    ({ channel } = await ensureDmChannel(brokerageId, senderId, target.userId, senderId));
  } catch (error) {
    logger.error('[internal/messages/send] DM creation failed', { brokerageId }, error);
    return NextResponse.json(
      { error: 'Team messaging is temporarily unavailable. The message was not sent.' },
      { status: 503 },
    );
  }
  const sent = await postMessage(channel, senderId, { body: message, kind: 'text' });

  return NextResponse.json({
    ok: true,
    messageId: sent.id,
    channelId: channel.id,
    recipient: { name: target.name, email: target.email },
  });
}
