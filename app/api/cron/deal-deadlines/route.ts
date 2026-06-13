/**
 * GET /api/cron/deal-deadlines
 *
 * Every 6 hours. The contract-to-close reminder engine.
 *
 * Walks `DealChecklistItem` rows that carry a reminder (reminderLeadDays set,
 * not yet reminded, not yet completed) whose due date is within their lead
 * window, AND whose parent deal sits in a closing-phase stage
 * (under_contract / closing / closed). For each such deadline it finds the
 * DealContacts whose role is in the item's `assignedRoles` and drafts an
 * `AgentDraft` (email, status 'pending') per contact — a reminder the realtor
 * approves in /s/[slug]/chippi/approvals. It then stamps `reminderSentAt` so
 * the deadline is reminded exactly once.
 *
 * NEVER sends. The agent only produces pending drafts; outbound channels fire
 * only when the realtor approves a draft.
 *
 * Idempotency: a day-lock SETNX guards against duplicate cron invocations, and
 * a per-item SETNX lock guards against two ticks racing on the same deadline
 * in the window before `reminderSentAt` is written. `reminderSentAt` is the
 * durable one-shot guard; the locks are the race guard.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { redis } from '@/lib/redis';
import { monitorCron } from '@/lib/cron-monitor';
import { isValidRole, roleLabel } from '@/lib/deals/roles';
import type { DealContactRole, DealStageKind } from '@/lib/types';

const MS_PER_DAY = 86_400_000;

// Upper bound on a row's reminderLeadDays (mirrors set_deal_deadline's zod
// .max(60)). Used to pre-filter candidates in SQL — we fetch anything due
// within MAX_LEAD days then apply each row's own lead in JS. A row can never
// have a lead larger than this, so the SQL bound is safe.
const MAX_LEAD_DAYS = 60;

// Stages where contract-to-close reminders make sense. A deadline on a deal
// still in 'lead' or 'qualified' isn't a contingency clock yet.
const CLOSING_STAGE_KINDS: DealStageKind[] = ['under_contract', 'closing', 'closed'];

// Drafts expire if the realtor never acts — a stale "inspection in 3 days"
// reminder is noise a week later. 14 days is comfortably past any lead window.
const DRAFT_TTL_DAYS = 14;

// Cap rows per run so a backlog can't blow the serverless budget. The next
// tick (6h later) picks up the remainder; reminderSentAt keeps it idempotent.
const MAX_ITEMS_PER_RUN = 500;

interface CandidateItem {
  id: string;
  dealId: string;
  kind: string;
  label: string;
  dueAt: string | null;
  spaceId: string;
  assignedRoles: string[] | null;
  reminderLeadDays: number | null;
}

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/deal-deadlines] CRON_SECRET env var is not set — rejecting request');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Run-level idempotency. The reminder cadence is daily-ish, so a 6-hour
  // grain with a short lock window absorbs a Vercel retry without double work.
  // 7h TTL > the 6h cadence so the lock always clears before the next tick.
  const slotKey = new Date().toISOString().slice(0, 13); // hour granularity
  const lockKey = `cron-lock:deal-deadlines:${slotKey}`;
  const claimed = await redis.set(lockKey, '1', { nx: true, ex: 7 * 60 * 60 });
  if (claimed !== 'OK') {
    return NextResponse.json({ ok: true, skipped: 'already_ran_this_slot', slot: slotKey });
  }

  const now = Date.now();
  const horizonIso = new Date(now + MAX_LEAD_DAYS * MS_PER_DAY).toISOString();

  // ── 1. Candidate deadlines ──────────────────────────────────────────────
  // Conditions match the partial index idx_deal_checklist_reminder_due
  // (completedAt NULL, reminderSentAt NULL, reminderLeadDays NOT NULL) plus a
  // dueAt upper bound. No lower bound — an overdue contingency still earns a
  // reminder ("this was due 2 days ago").
  const { data: itemRows, error: itemErr } = await supabase
    .from('DealChecklistItem')
    .select('id, dealId, kind, label, dueAt, spaceId, assignedRoles, reminderLeadDays')
    .is('completedAt', null)
    .is('reminderSentAt', null)
    .not('reminderLeadDays', 'is', null)
    .not('dueAt', 'is', null)
    .lte('dueAt', horizonIso)
    .order('dueAt', { ascending: true })
    .limit(MAX_ITEMS_PER_RUN);
  if (itemErr) {
    console.error('[cron/deal-deadlines] candidate query failed', itemErr);
    return NextResponse.json({ error: 'DB query failed' }, { status: 500 });
  }

  const candidates = ((itemRows ?? []) as CandidateItem[]).filter((it) => {
    // Per-row lead window: dueAt - now <= reminderLeadDays days.
    if (it.dueAt == null || it.reminderLeadDays == null) return false;
    const dueMs = new Date(it.dueAt).getTime();
    if (isNaN(dueMs)) return false;
    return dueMs - now <= it.reminderLeadDays * MS_PER_DAY;
    // (overdue rows pass too: dueMs - now is negative)
  });

  if (candidates.length === 0) {
    return NextResponse.json({ scanned: 0, drafted: 0, items: 0 });
  }

  // ── 2. Resolve which deals are in a closing-phase stage ─────────────────
  // One query for the candidate deals + their stage kind, then a set of
  // deal ids that qualify. Keeps us off fragile PostgREST embedded filters.
  const dealIds = Array.from(new Set(candidates.map((c) => c.dealId)));
  const { data: dealRows, error: dealErr } = await supabase
    .from('Deal')
    .select('id, title, stageId, DealStage:stageId(kind)')
    .in('id', dealIds);
  if (dealErr) {
    console.error('[cron/deal-deadlines] deal query failed', dealErr);
    return NextResponse.json({ error: 'DB query failed' }, { status: 500 });
  }

  const dealInfo = new Map<string, { title: string; kind: DealStageKind | null }>();
  for (const row of (dealRows ?? []) as Array<{
    id: string;
    title: string;
    DealStage: { kind: DealStageKind | null } | { kind: DealStageKind | null }[] | null;
  }>) {
    // PostgREST returns the embedded resource as an object for a to-one FK,
    // but defensively handle the array shape too.
    const stage = Array.isArray(row.DealStage) ? row.DealStage[0] : row.DealStage;
    dealInfo.set(row.id, { title: row.title, kind: stage?.kind ?? null });
  }

  // ── 3. Pull DealContacts (with email) for the qualifying deals ──────────
  const qualifyingDealIds = dealIds.filter((id) => {
    const info = dealInfo.get(id);
    return info != null && info.kind != null && CLOSING_STAGE_KINDS.includes(info.kind);
  });

  if (qualifyingDealIds.length === 0) {
    return NextResponse.json({ scanned: candidates.length, drafted: 0, items: 0 });
  }

  const { data: contactRows, error: contactErr } = await supabase
    .from('DealContact')
    .select('dealId, contactId, role, Contact:contactId(id, name, email)')
    .in('dealId', qualifyingDealIds);
  if (contactErr) {
    console.error('[cron/deal-deadlines] deal-contact query failed', contactErr);
    return NextResponse.json({ error: 'DB query failed' }, { status: 500 });
  }

  // dealId -> role -> [{contactId, name, email}]
  const contactsByDealRole = new Map<string, Map<string, { contactId: string; name: string | null; email: string | null }>>();
  for (const row of (contactRows ?? []) as Array<{
    dealId: string;
    contactId: string;
    role: string | null;
    Contact: { id: string; name: string | null; email: string | null } | { id: string; name: string | null; email: string | null }[] | null;
  }>) {
    if (!row.role) continue;
    const contact = Array.isArray(row.Contact) ? row.Contact[0] : row.Contact;
    let roleMap = contactsByDealRole.get(row.dealId);
    if (!roleMap) {
      roleMap = new Map();
      contactsByDealRole.set(row.dealId, roleMap);
    }
    // Key by contactId so a contact wearing the same role twice can't double up.
    roleMap.set(`${row.role}:${row.contactId}`, {
      contactId: row.contactId,
      name: contact?.name ?? null,
      email: contact?.email ?? null,
    });
  }

  // ── 4. Draft per qualifying deadline ────────────────────────────────────
  let drafted = 0;
  let itemsReminded = 0;
  const draftsToInsert: Array<Record<string, unknown>> = [];
  const remindedItemIds: string[] = [];
  const expiresAt = new Date(now + DRAFT_TTL_DAYS * MS_PER_DAY).toISOString();

  for (const item of candidates) {
    const info = dealInfo.get(item.dealId);
    if (!info || info.kind == null || !CLOSING_STAGE_KINDS.includes(info.kind)) continue;

    // Per-item race lock — a second concurrent tick that slipped past the
    // run-lock can't double-draft this deadline. 1h TTL is plenty; the durable
    // guard is reminderSentAt, written below.
    const itemLockKey = `cron-lock:deal-deadlines:item:${item.id}`;
    const itemClaimed = await redis.set(itemLockKey, '1', { nx: true, ex: 60 * 60 });
    if (itemClaimed !== 'OK') continue;

    const roles = (item.assignedRoles ?? []).filter(isValidRole);
    const roleMap = contactsByDealRole.get(item.dealId);

    // Gather the recipients across all assigned roles, deduped by contactId.
    const recipients = new Map<string, { name: string | null; email: string | null; role: string }>();
    if (roles.length > 0 && roleMap) {
      for (const [key, c] of roleMap) {
        const role = key.split(':')[0];
        if (!roles.includes(role as DealContactRole)) continue;
        if (!recipients.has(c.contactId)) {
          recipients.set(c.contactId, { name: c.name, email: c.email, role });
        }
      }
    }

    const dueMs = item.dueAt ? new Date(item.dueAt).getTime() : now;
    const daysLeft = Math.round((Date.UTC(
      new Date(dueMs).getUTCFullYear(),
      new Date(dueMs).getUTCMonth(),
      new Date(dueMs).getUTCDate(),
    ) - Date.UTC(
      new Date(now).getUTCFullYear(),
      new Date(now).getUTCMonth(),
      new Date(now).getUTCDate(),
    )) / MS_PER_DAY);

    // Always stamp the item as reminded once we've processed it — even if no
    // recipient resolved (no contact in the assigned role). Otherwise the same
    // deadline would be re-scanned every tick forever with nobody to draft to.
    remindedItemIds.push(item.id);
    itemsReminded += 1;

    for (const [contactId, r] of recipients) {
      // Skip recipients with no email — an email draft needs a destination,
      // and the realtor can't approve-and-send to a blank address.
      if (!r.email) continue;
      const draft = buildDeadlineDraft({
        spaceId: item.spaceId,
        contactId,
        dealId: item.dealId,
        dealTitle: info.title,
        deadlineLabel: item.label,
        daysLeft,
        dueAt: item.dueAt,
        recipientName: r.name,
        recipientRole: r.role,
        expiresAt,
      });
      draftsToInsert.push(draft);
      drafted += 1;
    }
  }

  // ── 5. Persist drafts + stamp reminders ─────────────────────────────────
  if (draftsToInsert.length > 0) {
    const { error: draftErr } = await supabase.from('AgentDraft').insert(draftsToInsert);
    if (draftErr) {
      console.error('[cron/deal-deadlines] draft insert failed', draftErr);
      // Don't stamp reminderSentAt if we failed to create the drafts — let the
      // next tick retry cleanly rather than silently dropping the reminder.
      return NextResponse.json({ error: 'Draft insert failed' }, { status: 500 });
    }
  }

  if (remindedItemIds.length > 0) {
    const stampedAt = new Date().toISOString();
    const { error: stampErr } = await supabase
      .from('DealChecklistItem')
      .update({ reminderSentAt: stampedAt, updatedAt: stampedAt })
      .in('id', remindedItemIds);
    if (stampErr) {
      // Drafts already landed; a failed stamp means the next tick could
      // re-draft. Surface it so the monitor flags the run, but the per-item
      // lock (1h) blunts the duplicate window in practice.
      console.error('[cron/deal-deadlines] reminder stamp failed', stampErr);
      return NextResponse.json({ error: 'Reminder stamp failed', drafted }, { status: 500 });
    }
  }

  const summary = {
    scanned: candidates.length,
    items: itemsReminded,
    drafted,
  };
  console.log('[cron/deal-deadlines] run complete', summary);
  return NextResponse.json(summary);
}

// ── Draft builder ───────────────────────────────────────────────────────────

function buildDeadlineDraft(input: {
  spaceId: string;
  contactId: string | null;
  dealId: string;
  dealTitle: string;
  deadlineLabel: string;
  daysLeft: number;
  dueAt: string | null;
  recipientName: string | null;
  recipientRole: string;
  expiresAt: string;
}): Record<string, unknown> {
  const dueLabel = input.dueAt
    ? new Date(input.dueAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    : 'soon';
  const timing =
    input.daysLeft < 0
      ? `was due ${Math.abs(input.daysLeft)} day${Math.abs(input.daysLeft) === 1 ? '' : 's'} ago`
      : input.daysLeft === 0
        ? 'is due today'
        : `is due in ${input.daysLeft} day${input.daysLeft === 1 ? '' : 's'}`;
  const roleName = roleLabel(input.recipientRole as DealContactRole) ?? 'team';
  const greetName = input.recipientName?.trim() || 'there';

  const subject = `${input.deadlineLabel} · ${input.dealTitle}`;
  const content = [
    `Hi ${greetName},`,
    '',
    `A quick note on ${input.dealTitle}. The ${input.deadlineLabel.toLowerCase()} ${timing} (${dueLabel}).`,
    '',
    `Wanted to make sure this is on your radar and see if you need anything from my side to keep us on track.`,
    '',
    `Thanks.`,
  ].join('\n');

  return {
    id: crypto.randomUUID(),
    spaceId: input.spaceId,
    contactId: input.contactId,
    dealId: input.dealId,
    channel: 'email',
    subject,
    content,
    reasoning: `${input.deadlineLabel} on ${input.dealTitle} ${timing}. Drafted a reminder to the ${roleName.toLowerCase()} (${greetName}) so it doesn't slip.`,
    priority: input.daysLeft <= 0 ? 2 : 1,
    status: 'pending',
    expiresAt: input.expiresAt,
  };
}

export const GET = monitorCron('deal-deadlines', { crontab: '0 */6 * * *' }, handler);
