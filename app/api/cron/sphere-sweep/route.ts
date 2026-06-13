/**
 * GET /api/cron/sphere-sweep
 *
 * Daily After-Close sweep (07:00 UTC). Walks every active space and finds the
 * relationship-book contacts who are due for a retention touch:
 *
 *   • a scheduled touch that's come due (nextTouchAt <= now), OR
 *   • a past_client / dormant contact whose closing ANNIVERSARY falls inside
 *     the next ~14 days (month/day of lastClosedAt).
 *
 * For each, it drafts an `email` AgentDraft into the approval inbox with a
 * clear reasoning line, then pushes nextTouchAt out 90 days so the same
 * contact doesn't resurface tomorrow. The draft is DETERMINISTIC — no LLM
 * call in the sweep (cost, latency, and the same "don't let a model misfire
 * on autonomous output" rule the onboarding reveal follows). The realtor
 * edits and approves in the inbox.
 *
 * IMPORTANT: this endpoint never sends email or SMS. It only writes
 * `status: 'pending'` AgentDraft rows. Outbound fires only when the realtor
 * approves a draft.
 *
 * Auth: Bearer ${CRON_SECRET} (matches the other crons).
 * Disable: set CRON_SPHERE_SWEEP_DISABLED=1 to short-circuit.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { monitorCron } from '@/lib/cron-monitor';
import { logger } from '@/lib/logger';

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const ANNIVERSARY_WINDOW_DAYS = 14;
const TOUCH_BUMP_DAYS = 90;

// Don't pile drafts on a space the realtor hasn't burned down. Same spirit as
// the agent-sweep backlog guard.
const PENDING_DRAFT_BACKLOG_LIMIT = 10;
// Cap drafts created per space per run so one neglected sphere can't flood the
// inbox in a single sweep.
const MAX_DRAFTS_PER_SPACE = 5;
// Page size for the active-space fetch (avoids PostgREST's silent row cap).
const SPACE_PAGE_SIZE = 1000;
// Wall-clock budget — stop picking up new spaces past this so a large fleet
// exits cleanly with partial progress instead of being killed mid-run.
const SWEEP_BUDGET_MS = 270_000;

// Give the long sweep the full serverless ceiling rather than the 10s default.
export const maxDuration = 300;

type ContactRow = {
  id: string;
  name: string;
  email: string | null;
  relationshipStage: string | null;
  lastClosedAt: string | null;
  nextTouchAt: string | null;
};

type SpaceOutcome = {
  spaceId: string;
  drafted: number;
  skipped: number;
};

/** Days from `now` until the next month/day anniversary of `closedAt`, wrapping
 *  the year boundary. Null if unparseable. Calendar-date math (UTC month/day),
 *  not a 365-day count — leap years and timezones don't shift "it's been a year." */
function daysUntilAnniversary(closedAt: string | null, now: Date): number | null {
  if (!closedAt) return null;
  const closed = new Date(closedAt);
  if (isNaN(closed.getTime())) return null;
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let next = Date.UTC(now.getUTCFullYear(), closed.getUTCMonth(), closed.getUTCDate());
  if (next < todayUTC) {
    next = Date.UTC(now.getUTCFullYear() + 1, closed.getUTCMonth(), closed.getUTCDate());
  }
  return Math.round((next - todayUTC) / MS_PER_DAY);
}

function firstNameOf(name: string): string {
  const t = (name ?? '').trim().split(/\s+/)[0];
  return t || 'there';
}

type DueReason =
  | { kind: 'touch_due' }
  | { kind: 'anniversary'; days: number };

/** Decide whether a contact is due, and why. Scheduled touch wins over
 *  anniversary when both fire — it's the more specific, already-decided action. */
function dueReason(contact: ContactRow, now: Date): DueReason | null {
  if (contact.nextTouchAt) {
    const due = new Date(contact.nextTouchAt);
    if (!isNaN(due.getTime()) && due.getTime() <= now.getTime()) {
      return { kind: 'touch_due' };
    }
  }
  if (contact.relationshipStage === 'past_client' || contact.relationshipStage === 'dormant') {
    const annivDays = daysUntilAnniversary(contact.lastClosedAt, now);
    if (annivDays !== null && annivDays >= 0 && annivDays <= ANNIVERSARY_WINDOW_DAYS) {
      return { kind: 'anniversary', days: annivDays };
    }
  }
  return null;
}

/** A calm, deterministic first-touch the realtor can send or edit. No LLM. */
function composeDraft(contact: ContactRow, reason: DueReason): {
  subject: string;
  content: string;
  reasoning: string;
} {
  const first = firstNameOf(contact.name);
  if (reason.kind === 'anniversary') {
    const when =
      reason.days === 0 ? 'today' : reason.days === 1 ? 'tomorrow' : `in ${reason.days} days`;
    return {
      subject: `thinking of you, ${first}`,
      content:
        `Hi ${first},\n\n` +
        `it's hard to believe how fast the time has gone since we closed. ` +
        `i was thinking of you and wanted to check in. how's the place treating you?\n\n` +
        `if there's ever anything you need, or someone you know who's looking to make a move, i'm always here.`,
      reasoning: `Closing anniversary ${when}. A past client worth a warm hello, drafted so the touch doesn't slip.`,
    };
  }
  return {
    subject: `checking in, ${first}`,
    content:
      `Hi ${first},\n\n` +
      `just wanted to reach out and see how things are going. ` +
      `no agenda. i like to stay in touch with the people i've worked with.\n\n` +
      `if there's anything i can help with, or anyone in your circle thinking about a move, you know where to find me.`,
    reasoning: 'A scheduled sphere touch came due. Drafted a check-in so the relationship stays warm.',
  };
}

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/sphere-sweep] CRON_SECRET env var is not set — rejecting request');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (process.env.CRON_SPHERE_SWEEP_DISABLED) {
    console.log('[cron/sphere-sweep] CRON_SPHERE_SWEEP_DISABLED is set — skipping sweep');
    return NextResponse.json({ status: 'disabled' });
  }

  const startedAt = Date.now();
  const now = new Date();

  // ── 1. Fetch ALL active spaces (paginated) ──────────────────────────────
  const allSpaces: { id: string }[] = [];
  for (let from = 0; ; from += SPACE_PAGE_SIZE) {
    const { data, error: spaceErr } = await supabase
      .from('Space')
      .select('id')
      .in('stripeSubscriptionStatus', ['active', 'trialing'])
      .order('id', { ascending: true })
      .range(from, from + SPACE_PAGE_SIZE - 1);
    if (spaceErr) {
      console.error('[cron/sphere-sweep] Failed to load spaces', spaceErr);
      return NextResponse.json({ error: 'DB query failed' }, { status: 500 });
    }
    const page = (data ?? []) as { id: string }[];
    allSpaces.push(...page);
    if (page.length < SPACE_PAGE_SIZE) break;
  }

  if (allSpaces.length === 0) {
    return NextResponse.json({ totalSpaces: 0, drafted: 0, spacesWithDrafts: 0 });
  }

  // ── 2. Sweep each space ─────────────────────────────────────────────────
  const outcomes: SpaceOutcome[] = [];
  for (const space of allSpaces) {
    if (Date.now() - startedAt > SWEEP_BUDGET_MS) break;
    try {
      outcomes.push(await sweepSpace(space.id, now));
    } catch (err) {
      logger.warn('[cron/sphere-sweep] space sweep threw', { spaceId: space.id }, err);
    }
  }

  const drafted = outcomes.reduce((sum, o) => sum + o.drafted, 0);
  const spacesWithDrafts = outcomes.filter((o) => o.drafted > 0).length;
  const remaining = allSpaces.length - outcomes.length;
  const summary = {
    totalSpaces: allSpaces.length,
    sweptSpaces: outcomes.length,
    drafted,
    spacesWithDrafts,
    remaining,
    budgetExhausted: remaining > 0,
    durationMs: Date.now() - startedAt,
  };
  console.log('[cron/sphere-sweep] Sweep complete', summary);
  return NextResponse.json(summary);
}

export const GET = monitorCron('sphere-sweep', { crontab: '0 7 * * *' }, handler);

// ── Helpers ────────────────────────────────────────────────────────────────

async function sweepSpace(spaceId: string, now: Date): Promise<SpaceOutcome> {
  // Backlog guard: skip spaces already sitting on a pile of pending drafts.
  const { count: pendingCount } = await supabase
    .from('AgentDraft')
    .select('id', { count: 'exact', head: true })
    .eq('spaceId', spaceId)
    .eq('status', 'pending');
  if ((pendingCount ?? 0) >= PENDING_DRAFT_BACKLOG_LIMIT) {
    return { spaceId, drafted: 0, skipped: 0 };
  }

  // Candidate set: anything in the relationship book that could be due. We
  // filter precisely in JS (the anniversary check is month/day math Postgres
  // can't express in a simple .lte()). The relationship_stage partial index
  // keeps this query cheap.
  const { data, error } = await supabase
    .from('Contact')
    .select('id, name, email, relationshipStage, lastClosedAt, nextTouchAt')
    .eq('spaceId', spaceId)
    .is('brokerageId', null)
    .in('relationshipStage', ['past_client', 'dormant', 'referral_target'])
    .limit(2000);
  if (error || !data) return { spaceId, drafted: 0, skipped: 0 };

  let drafted = 0;
  let skipped = 0;

  for (const contact of data as ContactRow[]) {
    if (drafted >= MAX_DRAFTS_PER_SPACE) break;

    const reason = dueReason(contact, now);
    if (!reason) continue;

    // Per-contact idempotency: don't stack a second pending draft on someone
    // who already has one waiting. Cheap head-count keyed by contactId.
    const { count: contactPending } = await supabase
      .from('AgentDraft')
      .select('id', { count: 'exact', head: true })
      .eq('spaceId', spaceId)
      .eq('contactId', contact.id)
      .eq('status', 'pending');
    if ((contactPending ?? 0) > 0) {
      skipped++;
      // Still push the touch out so we re-evaluate later, not tomorrow.
      await bumpNextTouch(contact.id, spaceId, now);
      continue;
    }

    const { subject, content, reasoning } = composeDraft(contact, reason);
    const { error: insertErr } = await supabase.from('AgentDraft').insert({
      id: crypto.randomUUID(),
      spaceId,
      contactId: contact.id,
      channel: 'email',
      subject,
      content,
      reasoning,
      priority: reason.kind === 'anniversary' && reason.days <= 7 ? 5 : 2,
      status: 'pending',
      // Give the realtor two weeks to act before the draft ages out of the inbox.
      expiresAt: new Date(now.getTime() + 14 * MS_PER_DAY).toISOString(),
    });
    if (insertErr) {
      logger.warn('[cron/sphere-sweep] draft insert failed', { spaceId, contactId: contact.id }, insertErr);
      continue;
    }

    await bumpNextTouch(contact.id, spaceId, now);
    drafted++;
  }

  return { spaceId, drafted, skipped };
}

/** Push nextTouchAt out 90 days so a swept contact doesn't resurface tomorrow. */
async function bumpNextTouch(contactId: string, spaceId: string, now: Date): Promise<void> {
  const next = new Date(now.getTime() + TOUCH_BUMP_DAYS * MS_PER_DAY).toISOString();
  const { error } = await supabase
    .from('Contact')
    .update({ nextTouchAt: next, updatedAt: now.toISOString() })
    .eq('id', contactId)
    .eq('spaceId', spaceId);
  if (error) {
    logger.warn('[cron/sphere-sweep] nextTouch bump failed', { spaceId, contactId }, error);
  }
}
