/**
 * Next Move — the agent-computed "what now?" for a deal.
 *
 * `computeNextMove(spaceId, dealId)` loads a compact, spaceId-scoped snapshot
 * of the deal (stage, dates, linked contact, recent deal + contact activity),
 * asks the LLM for ONE grounded next move as strict JSON, validates hard, and
 * persists the result onto the Deal row (`nextMoveText` / `nextMoveKind` /
 * `nextMoveComputedAt`). The kanban chip and quick panel read those columns.
 *
 * Callers: the daily cron (/api/cron/next-moves) and the on-demand refresh
 * route (POST /api/deals/[id]/next-move).
 *
 * Grounding contract mirrors lib/agent/quick-draft.ts: the model may use ONLY
 * facts in the payload. A malformed, empty, or unusable response never blocks
 * the feature — we fall back to a deterministic move derived from the same
 * facts (near close date → closing prep; otherwise → check in with the
 * contact), so an open deal always ends the call with a fresh move.
 *
 * LLM calls go through getLLMClient() with the OpenRouter usage-accounting
 * opt-in, and token/cost telemetry lands in ChatUsage via recordChatUsage
 * (route 'agent') — same billing contract as every other text call.
 */

import { supabase } from '@/lib/supabase';
import {
  getLLMClient,
  hasLLMKey,
  openaiModel,
  usageAccountingParams,
} from '@/lib/llm';
import { recordChatUsage } from '@/lib/usage/record-chat-usage';
import { logger } from '@/lib/logger';

export const NEXT_MOVE_KINDS = [
  'follow_up',
  'schedule',
  'document',
  'deadline',
  'other',
] as const;
export type NextMoveKind = (typeof NEXT_MOVE_KINDS)[number];

export interface NextMove {
  text: string;
  kind: NextMoveKind;
  /** ISO timestamp written to Deal.nextMoveComputedAt. */
  computedAt: string;
}

export const NEXT_MOVE_MAX_CHARS = 140;

// Same model + rationale as quick-draft: this is a short structured copy
// task, not a reasoning task, and gpt-4.1-mini reliably spends the budget on
// the requested JSON instead of hidden reasoning.
const MODEL = 'gpt-4.1-mini';
// One small generation; the same foreground latency budget the compose path
// uses. The cron caller runs bounded concurrency, so this also bounds a tick.
const TIMEOUT_MS = 15_000;

const ACTIVITY_LINE_MAX = 80;
const MS_PER_DAY = 86_400_000;

const SYSTEM_PROMPT =
  'You are Chippi, an AI assistant for a real-estate CRM. Given facts about one deal, name the single best next move the realtor should take today. ' +
  'GROUNDING: use ONLY facts present in the user JSON. Never invent showings, conversations, documents, deadlines, or listings that are not in the JSON. ' +
  'Voice: specific, human, imperative — like a sharp colleague ("Buyer quiet 6 days — check in about the Elm St showing"), never generic filler ("reach out to nurture the relationship"). No em dashes are fine; no exclamation marks. ' +
  `The move MUST be at most ${NEXT_MOVE_MAX_CHARS} characters. ` +
  "Pick kind from exactly: 'follow_up' (contact the person), 'schedule' (book a showing/call/tour), 'document' (send, chase, or sign paperwork), 'deadline' (a dated commitment like closing or inspection needs action), 'other'. " +
  'Output strict JSON and nothing else: {"move": string, "kind": string}.';

interface DealSnapshot {
  id: string;
  title: string | null;
  address: string | null;
  status: string;
  stageId: string | null;
  closeDate: string | null;
  followUpAt: string | null;
  nextAction: string | null;
  nextActionDueAt: string | null;
  stageChangedAt: string | null;
  updatedAt: string | null;
}

interface ContactSnapshot {
  id: string;
  name: string | null;
  lastContactedAt: string | null;
}

/** Facts handed to the model — also the input to the deterministic fallback. */
interface NextMoveFacts {
  title: string | null;
  address: string | null;
  stage: string | null;
  daysInStage: number | null;
  daysUntilClose: number | null;
  followUpAt: string | null;
  realtorNextAction: string | null;
  contactName: string | null;
  daysSinceContactTouch: number | null;
  recentActivity: string[];
}

function isoDate(input: string): string | null {
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function daysBetween(from: Date, now: Date): number {
  return Math.floor((now.getTime() - from.getTime()) / MS_PER_DAY);
}

function trimLine(s: string | null): string {
  const v = (s ?? '').trim().replace(/\s+/g, ' ');
  return v.length <= ACTIVITY_LINE_MAX ? v : v.slice(0, ACTIVITY_LINE_MAX - 1) + '…';
}

function firstName(name: string | null): string | null {
  const first = (name ?? '').trim().split(/\s+/)[0];
  return first || null;
}

/**
 * Deterministic fallback when the LLM is unavailable or returns garbage.
 * Priority: a near/overdue close date is the loudest fact; otherwise the
 * classic stale-deal nudge on the linked contact; otherwise a neutral review.
 */
function fallbackMove(facts: NextMoveFacts): { move: string; kind: NextMoveKind } {
  if (facts.daysUntilClose != null && facts.daysUntilClose <= 7) {
    return { move: 'Confirm closing prep', kind: 'deadline' };
  }
  const first = firstName(facts.contactName);
  if (first) {
    return { move: `Check in with ${first}`, kind: 'follow_up' };
  }
  return { move: 'Review this deal and set the next step', kind: 'other' };
}

/**
 * Hard validation of the model output. Returns null on anything unusable so
 * the caller falls back deterministically. A valid move with an unknown kind
 * is kept and downgraded to 'other' — the text is the valuable part.
 */
function parseModelMove(raw: string): { move: string; kind: NextMoveKind } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const candidate = (parsed as { move?: unknown }).move;
  if (typeof candidate !== 'string') return null;
  let move = candidate.trim().replace(/\s+/g, ' ');
  if (!move) return null;
  if (move.length > NEXT_MOVE_MAX_CHARS) {
    move = move.slice(0, NEXT_MOVE_MAX_CHARS - 1).trimEnd() + '…';
  }
  const rawKind = (parsed as { kind?: unknown }).kind;
  const kind: NextMoveKind = NEXT_MOVE_KINDS.includes(rawKind as NextMoveKind)
    ? (rawKind as NextMoveKind)
    : 'other';
  return { move, kind };
}

/** One grounded LLM call → validated move, or null. Never throws. */
async function composeMoveWithLLM(
  spaceId: string,
  facts: NextMoveFacts,
): Promise<{ move: string; kind: NextMoveKind } | null> {
  if (!hasLLMKey()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const client = getLLMClient();
    const model = openaiModel(MODEL);
    const response = await client.chat.completions.create(
      {
        model,
        temperature: 0.4,
        max_tokens: 120,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(facts) },
        ],
        // Cast: `usage` is an OpenRouter request extension the OpenAI SDK's
        // param type doesn't know about; empty on direct-OpenAI deploys.
        ...(usageAccountingParams() as Record<string, never>),
      },
      { signal: controller.signal },
    );

    // Billing accuracy: every completed call lands in ChatUsage, exact
    // OpenRouter cost preferred (usage-accounting opt-in above).
    const u = response.usage as
      | (typeof response.usage & {
          prompt_tokens_details?: { cached_tokens?: number };
          cost?: number;
        })
      | undefined;
    if (u) {
      const costUsd =
        typeof u.cost === 'number' && Number.isFinite(u.cost) && u.cost >= 0
          ? u.cost
          : undefined;
      void recordChatUsage({
        spaceId,
        model,
        promptTokens: u.prompt_tokens ?? 0,
        completionTokens: u.completion_tokens ?? 0,
        cachedTokens: u.prompt_tokens_details?.cached_tokens ?? 0,
        costUsd,
        route: 'agent',
        runtime: 'ts',
      });
    }

    const raw = response.choices?.[0]?.message?.content?.trim();
    if (!raw) {
      logger.warn('[next-move] compose unusable', { reason: 'empty_response' });
      return null;
    }
    const validated = parseModelMove(raw);
    if (!validated) {
      logger.warn('[next-move] compose unusable', { reason: 'malformed_json' });
    }
    return validated;
  } catch (err) {
    logger.warn('[next-move] compose failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Compute and persist the next move for one deal.
 *
 * Returns the persisted move, or null when:
 *   - the deal doesn't exist in this space (tenant scoping — the .eq IS the
 *     security boundary),
 *   - the deal is no longer active (the stale chip is cleared instead), or
 *   - the final Deal update fails (nothing was persisted; don't claim it).
 */
export async function computeNextMove(
  spaceId: string,
  dealId: string,
  opts: { now?: Date } = {},
): Promise<NextMove | null> {
  const now = opts.now ?? new Date();

  const { data: dealRow, error: dealErr } = await supabase
    .from('Deal')
    .select(
      'id, title, address, status, stageId, closeDate, followUpAt, nextAction, nextActionDueAt, stageChangedAt, updatedAt',
    )
    .eq('id', dealId)
    .eq('spaceId', spaceId)
    .maybeSingle();
  if (dealErr) {
    logger.warn('[next-move] deal load failed', { dealId, err: dealErr.message });
    return null;
  }
  if (!dealRow) return null;
  const deal = dealRow as unknown as DealSnapshot;

  // A closed/held deal has no "next move" — clear any stale chip and stop.
  if (deal.status !== 'active') {
    await supabase
      .from('Deal')
      .update({ nextMoveText: null, nextMoveKind: null, nextMoveComputedAt: now.toISOString() })
      .eq('id', dealId)
      .eq('spaceId', spaceId);
    return null;
  }

  // ── Small scoped context loads ─────────────────────────────────────────
  const [stageResult, dcResult, dealActResult] = await Promise.all([
    deal.stageId
      ? supabase.from('DealStage').select('name').eq('id', deal.stageId).eq('spaceId', spaceId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('DealContact').select('contactId').eq('dealId', dealId).limit(3),
    supabase
      .from('DealActivity')
      .select('type, content, createdAt')
      .eq('dealId', dealId)
      .eq('spaceId', spaceId)
      .order('createdAt', { ascending: false })
      .limit(4),
  ]);

  const contactIds = ((dcResult.data ?? []) as Array<{ contactId: string }>).map(
    (r) => r.contactId,
  );
  let contact: ContactSnapshot | null = null;
  if (contactIds.length > 0) {
    // Ownership-scoped: DealContact has no spaceId column, so the Contact
    // read re-asserts tenancy rather than trusting the join table.
    const { data: contactRows } = await supabase
      .from('Contact')
      .select('id, name, lastContactedAt')
      .in('id', contactIds)
      .eq('spaceId', spaceId)
      .limit(1);
    contact = ((contactRows ?? []) as ContactSnapshot[])[0] ?? null;
  }

  let contactActivityRows: Array<{ type: string; content: string | null; createdAt: string }> = [];
  if (contact) {
    const { data } = await supabase
      .from('ContactActivity')
      .select('type, content, createdAt')
      .eq('contactId', contact.id)
      .eq('spaceId', spaceId)
      .order('createdAt', { ascending: false })
      .limit(4);
    contactActivityRows = (data ?? []) as typeof contactActivityRows;
  }

  // ── Fact assembly ──────────────────────────────────────────────────────
  const activityLines = [
    ...((dealActResult.data ?? []) as Array<{ type: string; content: string | null; createdAt: string }>),
    ...contactActivityRows,
  ]
    .filter((r) => r.createdAt && !isNaN(new Date(r.createdAt).getTime()))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6)
    .map((r) => {
      const date = isoDate(r.createdAt);
      const content = trimLine(r.content);
      return content ? `${date} — ${r.type}: ${content}` : `${date} — ${r.type}`;
    });

  const close = deal.closeDate ? new Date(deal.closeDate) : null;
  const daysUntilClose =
    close && !isNaN(close.getTime()) ? -daysBetween(close, now) : null;
  const stageRef = deal.stageChangedAt ? new Date(deal.stageChangedAt) : null;
  const daysInStage =
    stageRef && !isNaN(stageRef.getTime()) ? daysBetween(stageRef, now) : null;

  // "Quiet for N days" — newest of lastContactedAt / any contact activity.
  let lastTouch: Date | null =
    contact?.lastContactedAt && !isNaN(new Date(contact.lastContactedAt).getTime())
      ? new Date(contact.lastContactedAt)
      : null;
  for (const r of contactActivityRows) {
    const d = new Date(r.createdAt);
    if (!isNaN(d.getTime()) && (!lastTouch || d > lastTouch)) lastTouch = d;
  }
  const daysSinceContactTouch = lastTouch ? Math.max(0, daysBetween(lastTouch, now)) : null;

  const facts: NextMoveFacts = {
    title: deal.title,
    address: deal.address,
    stage: (stageResult.data as { name?: string } | null)?.name ?? null,
    daysInStage,
    daysUntilClose,
    followUpAt: deal.followUpAt ? isoDate(deal.followUpAt) : null,
    realtorNextAction: deal.nextAction,
    contactName: contact?.name ?? null,
    daysSinceContactTouch,
    recentActivity: activityLines,
  };

  // ── Compose (LLM first, deterministic fallback always available) ───────
  const composed = (await composeMoveWithLLM(spaceId, facts)) ?? fallbackMove(facts);

  const computedAt = now.toISOString();
  const { error: writeErr } = await supabase
    .from('Deal')
    .update({
      nextMoveText: composed.move,
      nextMoveKind: composed.kind,
      nextMoveComputedAt: computedAt,
    })
    .eq('id', dealId)
    .eq('spaceId', spaceId);
  if (writeErr) {
    logger.warn('[next-move] write failed', { dealId, err: writeErr.message });
    return null;
  }

  return { text: composed.move, kind: composed.kind, computedAt };
}
