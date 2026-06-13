/**
 * enrollInPlay — put a contact on a nurture play.
 *
 * An enrollment is just an AgentGoal: goalType from the play def, a calm
 * description, metadata `{ playKind, step: 0 }`, and `nextActionAt` set to when
 * step 0 is due (now + steps[0].delayDays). The play-advancement cron walks
 * due goals, drafts the step, and bumps step / nextActionAt — or completes the
 * goal after the last step.
 *
 * Idempotent by (contactId, playKind): if an ACTIVE goal already carries this
 * playKind for this contact, we skip rather than stack a second sequence. A
 * lead that fires `new_lead` twice (form + manual add) must not get two
 * speed-to-lead runs talking over each other.
 *
 * Service-role + explicit spaceId scoping, like the rest of the repo. Never
 * throws on the enrollment path the trigger system depends on — callers there
 * treat a failed enrollment as a no-op, not a reason to fail the parent write.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { getPlay, type PlayKind } from './definitions';

export type EnrollOutcome =
  | { enrolled: true; goalId: string }
  | { enrolled: false; reason: 'already_enrolled' | 'unknown_play' | 'error' };

interface EnrollOptions {
  /** Provenance tag stored on the goal metadata: 'trigger' | 'manual' | tool. */
  enrolledBy?: string;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export async function enrollInPlay(
  spaceId: string,
  contactId: string,
  playKind: PlayKind | string,
  opts: EnrollOptions = {},
): Promise<EnrollOutcome> {
  const play = getPlay(playKind);
  if (!play) {
    return { enrolled: false, reason: 'unknown_play' };
  }
  if (play.steps.length === 0) {
    // A play with no steps can't enroll anyone — treat as a config bug, not a crash.
    return { enrolled: false, reason: 'unknown_play' };
  }

  // ── Idempotency: one active enrollment per (contact, playKind) ──────────
  // metadata->>'playKind' is the discriminator; status='active' scopes to a
  // live sequence (completed/cancelled goals don't block a fresh enrollment).
  const { data: existing, error: existingErr } = await supabase
    .from('AgentGoal')
    .select('id')
    .eq('spaceId', spaceId)
    .eq('contactId', contactId)
    .eq('status', 'active')
    .eq('metadata->>playKind', play.kind)
    .limit(1)
    .maybeSingle();
  if (existingErr) {
    logger.warn('[plays.enroll] active-goal lookup failed', { spaceId, contactId, playKind: play.kind }, existingErr);
    return { enrolled: false, reason: 'error' };
  }
  if (existing) {
    return { enrolled: false, reason: 'already_enrolled' };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const nextActionAt = addDays(now, play.steps[0].delayDays).toISOString();

  const { data: inserted, error: insertErr } = await supabase
    .from('AgentGoal')
    .insert({
      id: crypto.randomUUID(),
      spaceId,
      contactId,
      goalType: play.goalType,
      description: `${play.name}: ${play.description}`,
      status: 'active',
      priority: 0,
      metadata: {
        playKind: play.kind,
        step: 0,
        enrolledBy: opts.enrolledBy ?? 'system',
      },
      nextActionAt,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    logger.error('[plays.enroll] insert failed', { spaceId, contactId, playKind: play.kind }, insertErr);
    return { enrolled: false, reason: 'error' };
  }

  return { enrolled: true, goalId: inserted.id as string };
}
