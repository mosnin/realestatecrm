/**
 * Drip sequence engine — enroll a contact into a scripted nurture cadence,
 * then advance due enrollments tick by tick.
 *
 * Two entry points:
 *   enrollContact()      — validates + inserts one "DripEnrollment" row.
 *   advanceEnrollments() — ONE space's due work for one cron tick: for every
 *                           'enrolled' row whose current step's dayOffset has
 *                           come due, either STOP the sequence (the contact
 *                           replied since enrolling) or schedule the step and
 *                           move the pointer forward.
 *
 * SAFETY — mirrors lib/workflows/scheduled-dispatch.ts's contract exactly:
 * this module NEVER sends a message itself. A due step becomes a
 * "ScheduledMessage" row (same columns/lifecycle the workflow
 * `schedule_message` action writes — lib/workflows/actions.ts), which the
 * EXISTING scheduled-message dispatcher later processes per its `autonomy`
 * (draft/notify/auto). Reusing that table + dispatcher means the drip engine
 * inherits every safety rail already proven there (rate limit, audit,
 * realtor notification, claim-based no-duplicate-send) for free — this file
 * adds no new send path.
 *
 * STOP-ON-REPLY is checked BEFORE anything else on a due enrollment: any
 * inbound signal on the contact since enrollment (an inbound "ContactActivity"
 * — the /api/agent/inbound webhook path — OR an inbound "InboxMessage" — both
 * inbound capture paths dual-write here, see lib/inbox.ts) flips the
 * enrollment to status='stopped', stopReason='replied' and skips scheduling.
 * A live conversation must never get talked over by a canned drip step.
 *
 * TENANT SCOPING: every query here carries an explicit `.eq('spaceId', …)` —
 * the service-role client bypasses RLS, so that filter IS the boundary
 * (CLAUDE.md). "DripSequence"/"DripEnrollment" are not yet registered in
 * lib/tenant-db.ts's TENANT_TABLES (that file is owned by another track this
 * wave — flagged as a follow-up), so tenantTable() isn't used here; the scope
 * is applied by hand on every read/write instead.
 */

import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { unscoped } from '@/lib/supabase-guard';
import { logger } from '@/lib/logger';
import { parseDripSteps, type DripStep } from './schema';
import type { WorkflowAutonomy } from '@/lib/workflows/schema';

const CROSS_SPACE_DISCOVERY_REASON =
  'cron cross-tenant: discovering which spaces have live drip enrollments before ' +
  'fanning out to per-space advanceEnrollments(), which scopes every real read/write by spaceId';

/** Don't let one tick walk an unbounded number of enrollments — the overflow
 *  is picked up on the next tick (mirrors scheduled-dispatch's MAX_PER_TICK). */
export const MAX_ENROLLMENTS_PER_TICK = 200;
/** Cap on how many spaces one cron tick fans out to. */
export const MAX_SPACES_PER_TICK = 25;

// ── enrollContact ────────────────────────────────────────────────────────

export type EnrollOutcome = 'enrolled' | 'sequence_not_found' | 'contact_not_found' | 'already_enrolled' | 'failed';

export interface EnrollResult {
  outcome: EnrollOutcome;
  enrollmentId?: string;
  error?: string;
}

/**
 * Enroll one contact into one sequence. Validates the sequence is active and
 * belongs to spaceId, and the contact belongs to spaceId — a caller can never
 * enroll a contact into another tenant's sequence or vice versa. Returns a
 * typed outcome rather than throwing so callers (the API route) can map it to
 * the right HTTP status without string-matching an error message.
 */
export async function enrollContact(params: {
  spaceId: string;
  sequenceId: string;
  contactId: string;
}): Promise<EnrollResult> {
  const { spaceId, sequenceId, contactId } = params;

  const { data: sequence, error: seqErr } = await supabase
    .from('DripSequence')
    .select('id, active')
    .eq('id', sequenceId)
    .eq('spaceId', spaceId)
    .maybeSingle();
  if (seqErr) {
    logger.error('[drip.engine] sequence lookup failed', { spaceId, sequenceId }, seqErr);
    return { outcome: 'failed', error: seqErr.message };
  }
  if (!sequence || !(sequence as { active: boolean }).active) {
    return { outcome: 'sequence_not_found' };
  }

  const { data: contact, error: contactErr } = await supabase
    .from('Contact')
    .select('id')
    .eq('id', contactId)
    .eq('spaceId', spaceId)
    .maybeSingle();
  if (contactErr) {
    logger.error('[drip.engine] contact lookup failed', { spaceId, contactId }, contactErr);
    return { outcome: 'failed', error: contactErr.message };
  }
  if (!contact) {
    return { outcome: 'contact_not_found' };
  }

  const nowIso = new Date().toISOString();
  const { data: inserted, error: insertErr } = await supabase
    .from('DripEnrollment')
    .insert({
      id: crypto.randomUUID(),
      spaceId,
      sequenceId,
      contactId,
      enrolledAt: nowIso,
      currentStep: 0,
      status: 'enrolled',
      stopReason: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .select('id')
    .single();

  if (insertErr) {
    // The partial unique index (sequenceId, contactId) WHERE status='enrolled'
    // is the concurrency backstop — a duplicate enroll racing this one lands
    // here as a unique_violation (23505), not a lost/duplicate enrollment.
    if ((insertErr as { code?: string }).code === '23505') {
      return { outcome: 'already_enrolled' };
    }
    logger.error('[drip.engine] enrollment insert failed', { spaceId, sequenceId, contactId }, insertErr);
    return { outcome: 'failed', error: insertErr.message };
  }

  return { outcome: 'enrolled', enrollmentId: (inserted as { id: string }).id };
}

// ── advanceEnrollments ───────────────────────────────────────────────────

interface DripEnrollmentRow {
  id: string;
  spaceId: string;
  sequenceId: string;
  contactId: string;
  enrolledAt: string;
  currentStep: number;
  status: 'enrolled' | 'completed' | 'stopped';
}

interface DripSequenceRow {
  id: string;
  active: boolean;
  steps: unknown;
}

export interface AdvanceSummary {
  spaceId: string;
  due: number;
  scheduled: number;
  stoppedReplied: number;
  completed: number;
  skipped: number;
  failed: number;
}

function emptySummary(spaceId: string): AdvanceSummary {
  return { spaceId, due: 0, scheduled: 0, stoppedReplied: 0, completed: 0, skipped: 0, failed: 0 };
}

/**
 * Has this contact sent anything inbound since `sinceIso`? Checks both
 * capture paths' write targets (see module doc): "ContactActivity" rows
 * tagged metadata.source='inbound' (the /api/agent/inbound webhook) and
 * "InboxMessage" rows with direction='inbound' (both capture paths dual-write
 * here). Either hit is a reply — OR, not AND. Fails CLOSED: a lookup error is
 * treated as "assume replied" so a DB hiccup can never cause a drip message to
 * talk over a live conversation; the enrollment is left untouched (not
 * force-stopped) so the next tick just retries the check.
 */
async function hasRepliedSince(
  spaceId: string,
  contactId: string,
  sinceIso: string,
): Promise<{ replied: boolean; indeterminate: boolean }> {
  const [activityRes, inboxRes] = await Promise.all([
    supabase
      .from('ContactActivity')
      .select('id')
      .eq('spaceId', spaceId)
      .eq('contactId', contactId)
      .eq('metadata->>source', 'inbound')
      .gte('createdAt', sinceIso)
      .limit(1),
    supabase
      .from('InboxMessage')
      .select('id')
      .eq('spaceId', spaceId)
      .eq('contactId', contactId)
      .eq('direction', 'inbound')
      .gte('createdAt', sinceIso)
      .limit(1),
  ]);

  if (activityRes.error || inboxRes.error) {
    logger.warn('[drip.engine] reply check failed — treating as indeterminate (not stopping)', {
      spaceId,
      contactId,
    }, activityRes.error ?? inboxRes.error);
    return { replied: false, indeterminate: true };
  }

  const replied = (activityRes.data?.length ?? 0) > 0 || (inboxRes.data?.length ?? 0) > 0;
  return { replied, indeterminate: false };
}

/**
 * Map the space's earned autonomy onto the drip-scheduled ScheduledMessage
 * row, the same "earned, not configured" posture lib/trust-ladder.ts
 * documents. "AgentSettings.autonomyLevel" is the realtor-facing dial
 * (app/api/agent/settings): 'autonomous' has earned hands-off sending, so
 * drip steps go out via the dispatcher's 'auto' path; every other level
 * ('draft_required', 'suggest_only' — or no row yet, which is the same as
 * never having graduated) is DRAFT-only, the safe default. FOLLOW-UP: a
 * dedicated per-sequence autonomy override (draft/notify/auto, matching
 * Workflow's granularity) would let a realtor graduate drip independently of
 * the general agent dial — flagged, not built, to stay in scope this pass.
 */
async function resolveAutonomy(spaceId: string): Promise<WorkflowAutonomy> {
  const { data, error } = await supabase
    .from('AgentSettings')
    .select('autonomyLevel')
    .eq('spaceId', spaceId)
    .maybeSingle();
  if (error) {
    logger.warn('[drip.engine] autonomy lookup failed — defaulting to draft', { spaceId }, error);
    return 'draft';
  }
  const level = (data as { autonomyLevel?: string } | null)?.autonomyLevel;
  return level === 'autonomous' ? 'auto' : 'draft';
}

/**
 * Advance ONE space's due drip enrollments. Loads that space's active
 * sequences + a batch of its 'enrolled' rows, and for each row whose current
 * step is due: stop-on-reply check first, else schedule + advance the
 * pointer. One failing row can't abort the batch — mirrors
 * dispatchDueScheduledMessages's per-row isolation.
 */
export async function advanceEnrollments(spaceId: string, now: Date = new Date()): Promise<AdvanceSummary> {
  const summary = emptySummary(spaceId);

  const { data: sequenceRows, error: seqErr } = await supabase
    .from('DripSequence')
    .select('id, active, steps')
    .eq('spaceId', spaceId);
  if (seqErr) {
    logger.error('[drip.engine] sequence load failed', { spaceId }, seqErr);
    return summary;
  }
  const sequences = new Map<string, DripSequenceRow>();
  for (const row of (sequenceRows ?? []) as unknown as DripSequenceRow[]) {
    sequences.set(row.id, row);
  }

  const { data: enrollmentRows, error: enrErr } = await supabase
    .from('DripEnrollment')
    .select('id, spaceId, sequenceId, contactId, enrolledAt, currentStep, status')
    .eq('spaceId', spaceId)
    .eq('status', 'enrolled')
    .order('enrolledAt', { ascending: true })
    .limit(MAX_ENROLLMENTS_PER_TICK);
  if (enrErr) {
    logger.error('[drip.engine] enrollment load failed', { spaceId }, enrErr);
    return summary;
  }

  const enrollments = (enrollmentRows ?? []) as unknown as DripEnrollmentRow[];

  // Autonomy is one lookup per space per tick, not per enrollment.
  const autonomy = await resolveAutonomy(spaceId);

  for (const enrollment of enrollments) {
    try {
      const outcome = await processEnrollment(enrollment, sequences, autonomy, now);
      summary[outcome] += 1;
    } catch (err) {
      logger.error('[drip.engine] enrollment processing threw', { spaceId, enrollmentId: enrollment.id }, err);
      summary.failed += 1;
    }
  }

  summary.due = enrollments.length;
  return summary;
}

type ProcessOutcome = 'scheduled' | 'stoppedReplied' | 'completed' | 'skipped' | 'failed';

async function processEnrollment(
  enrollment: DripEnrollmentRow,
  sequences: Map<string, DripSequenceRow>,
  autonomy: WorkflowAutonomy,
  now: Date,
): Promise<ProcessOutcome> {
  const sequence = sequences.get(enrollment.sequenceId);
  if (!sequence) {
    // The sequence row is gone (hard-deleted outside the FK's normal cascade
    // path, or a stale reference) — nothing left to walk. Stop rather than
    // spin on it forever.
    await setEnrollmentStatus(enrollment, 'stopped', 'sequence_deleted');
    return 'skipped';
  }
  if (!sequence.active) {
    // Paused, not dead — leave the enrollment as-is; it resumes the moment the
    // realtor reactivates the sequence.
    return 'skipped';
  }

  let steps: DripStep[];
  try {
    steps = parseDripSteps(sequence.steps);
  } catch (err) {
    logger.error('[drip.engine] sequence has invalid steps — skipping', {
      spaceId: enrollment.spaceId,
      sequenceId: enrollment.sequenceId,
    }, err);
    return 'failed';
  }

  if (enrollment.currentStep >= steps.length) {
    await setEnrollmentStatus(enrollment, 'completed', null);
    return 'completed';
  }

  const step = steps[enrollment.currentStep];
  const dueAt = new Date(enrollment.enrolledAt);
  dueAt.setUTCDate(dueAt.getUTCDate() + step.dayOffset);
  if (dueAt.getTime() > now.getTime()) {
    return 'skipped'; // not due yet
  }

  // STOP-ON-REPLY — checked before scheduling anything, every due tick.
  const { replied, indeterminate } = await hasRepliedSince(
    enrollment.spaceId,
    enrollment.contactId,
    enrollment.enrolledAt,
  );
  if (indeterminate) {
    return 'skipped'; // retry next tick rather than risk talking over a reply
  }
  if (replied) {
    await setEnrollmentStatus(enrollment, 'stopped', 'replied');
    return 'stoppedReplied';
  }

  // Schedule this step — mirrors runScheduleMessage's ScheduledMessage insert
  // (lib/workflows/actions.ts) column-for-column, so the existing dispatcher
  // (lib/workflows/scheduled-dispatch.ts) processes it with zero new code.
  const nowIso = now.toISOString();
  const scheduledMessageId = crypto.randomUUID();
  const { error: schedErr } = await tenantTable(supabase, 'ScheduledMessage', {
    spaceId: enrollment.spaceId,
  }).insert({
    id: scheduledMessageId,
    spaceId: enrollment.spaceId,
    workflowId: null,
    runId: null,
    channel: step.channel,
    recipientContactId: enrollment.contactId,
    instruction: step.instruction,
    sendAt: nowIso,
    autonomy,
    status: 'pending',
    detail: {
      source: 'drip',
      sequenceId: enrollment.sequenceId,
      enrollmentId: enrollment.id,
      step: enrollment.currentStep,
      dayOffset: step.dayOffset,
    },
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  if (schedErr) {
    logger.error('[drip.engine] ScheduledMessage insert failed', {
      spaceId: enrollment.spaceId,
      enrollmentId: enrollment.id,
    }, schedErr);
    return 'failed';
  }

  const nextStep = enrollment.currentStep + 1;
  if (nextStep >= steps.length) {
    await advanceEnrollmentRow(enrollment, nextStep, 'completed', null);
  } else {
    await advanceEnrollmentRow(enrollment, nextStep, 'enrolled', null);
  }
  return 'scheduled';
}

async function setEnrollmentStatus(
  enrollment: DripEnrollmentRow,
  status: 'completed' | 'stopped',
  stopReason: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('DripEnrollment')
    .update({ status, stopReason, updatedAt: new Date().toISOString() })
    .eq('id', enrollment.id)
    .eq('spaceId', enrollment.spaceId);
  if (error) {
    logger.warn('[drip.engine] enrollment status update failed', { id: enrollment.id, status }, error);
  }
}

async function advanceEnrollmentRow(
  enrollment: DripEnrollmentRow,
  currentStep: number,
  status: 'enrolled' | 'completed',
  stopReason: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('DripEnrollment')
    .update({ currentStep, status, stopReason, updatedAt: new Date().toISOString() })
    .eq('id', enrollment.id)
    .eq('spaceId', enrollment.spaceId);
  if (error) {
    logger.warn('[drip.engine] enrollment advance failed', { id: enrollment.id }, error);
  }
}

// ── cross-space tick driver ──────────────────────────────────────────────

/**
 * The cron entry point: discover which spaces have live drip work, then run
 * advanceEnrollments per space (every real read/write inside stays spaceId
 * scoped). The discovery query itself is a deliberate cross-tenant scan — an
 * unattended maintenance sweep, not a request path — annotated with
 * .unscoped() per lib/supabase-guard.ts's documented escape hatch.
 */
export async function advanceAllDueSpaces(now: Date = new Date()): Promise<AdvanceSummary[]> {
  const { data, error } = await unscoped(
    supabase.from('DripEnrollment').select('spaceId'),
    CROSS_SPACE_DISCOVERY_REASON,
  )
    .eq('status', 'enrolled')
    .limit(2000);
  if (error) {
    logger.error('[drip.engine] cross-space discovery failed', undefined, error);
    return [];
  }

  const spaceIds = Array.from(
    new Set(((data ?? []) as unknown as Array<{ spaceId: string }>).map((r) => r.spaceId)),
  ).slice(0, MAX_SPACES_PER_TICK);

  const summaries: AdvanceSummary[] = [];
  for (const spaceId of spaceIds) {
    summaries.push(await advanceEnrollments(spaceId, now));
  }
  return summaries;
}
