/**
 * Usage aggregation — reads the agentic telemetry tables that exist today.
 *
 * What this can and cannot see:
 *
 *   ExecutionStep.costUsd  — the authoritative per-call dollar cost. Every
 *                            autonomous agent step (LLM call or tool call)
 *                            writes a row here via the Python StepLedger.
 *                            This is the source for total / daily / weekly
 *                            spend. It carries no model column, so it can't
 *                            be broken down by model on its own.
 *
 *   GoalDecomposition      — planner calls. Carries `llmModel` plus prompt /
 *                            completion token counts but NO precomputed cost.
 *                            We derive its cost here from the same pricing
 *                            table the Python ledger uses, which lets us show
 *                            a real by-model breakdown for planner traffic.
 *
 *   ChatUsage              — one row per interactive chat turn, with a
 *                            precomputed `costUsd` and `model`. Folded into
 *                            the headline total and the by-model breakdown.
 *
 * All aggregation is in-process on a bounded set of rows: a single space's
 * telemetry over at most ~31 days. No unbounded scans, no RPCs to maintain.
 */

import { supabase } from '@/lib/supabase';

/* ─── Pricing — mirrors agent/ledger.py MODEL_PRICES (USD per 1M tokens) ──── */

const MODEL_PRICES: Record<string, { in: number; out: number }> = {
  'gpt-5-mini': { in: 0.75, out: 4.5 },
  'gpt-5.4-mini': { in: 0.75, out: 4.5 },
  'gpt-4.1-mini': { in: 0.4, out: 1.6 },
  'gpt-4o': { in: 2.5, out: 10.0 },
  'gpt-4.1': { in: 2.0, out: 8.0 },
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
  'openai/gpt-5.5': { in: 5.0, out: 30.0 },
  'openai/gpt-5-mini': { in: 0.75, out: 4.5 },
  'openai/gpt-4.1-mini': { in: 0.4, out: 1.6 },
  'openai/gpt-4o-mini': { in: 0.15, out: 0.6 },
  'x-ai/grok-4.3': { in: 1.25, out: 2.5 },
  'anthropic/claude-opus-4.7': { in: 5.0, out: 25.0 },
  'moonshotai/kimi-k2.6': { in: 0.73, out: 3.49 },
  'qwen/qwen3.6-flash': { in: 0.19, out: 1.13 },
};
const DEFAULT_PRICE = { in: 2.5, out: 10.0 };

function priceFor(model: string): { in: number; out: number } {
  return MODEL_PRICES[model] ?? DEFAULT_PRICE;
}

function decompositionCost(model: string, tokensIn: number, tokensOut: number): number {
  const p = priceFor(model);
  return (tokensIn / 1_000_000) * p.in + (tokensOut / 1_000_000) * p.out;
}

/* ─── Types ────────────────────────────────────────────────────────────────── */

export interface ModelUsage {
  model: string;
  costUsd: number;
  requests: number;
}

export interface MonthlyUsage {
  /** Total spend for the month — ExecutionStep cost + derived planner cost. */
  totalUsd: number;
  /** Per-model breakdown. Sourced from GoalDecomposition (planner calls). */
  byModel: ModelUsage[];
}

export interface DailyUsage {
  /** ISO date, YYYY-MM-DD. */
  day: string;
  costUsd: number;
  requests: number;
}

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

/** First instant of a given UTC month, ISO. */
function monthStart(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toISOString();
}

/** First instant of the following UTC month, ISO. */
function monthEnd(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 1)).toISOString();
}

function toNumber(v: string | number | null | undefined): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}

/* ─── Queries ──────────────────────────────────────────────────────────────── */

/**
 * Total spend and by-model breakdown for one calendar month (UTC).
 *
 * `totalUsd` is the headline number: every ExecutionStep cost in the window
 * plus the derived cost of every planner decomposition in the window.
 *
 * `byModel` is planner-call traffic only — ExecutionStep has no model column,
 * so it can't be attributed. This is honest, not a gap to paper over.
 */
export async function getMonthlyUsage(
  spaceId: string,
  year: number,
  month: number,
): Promise<MonthlyUsage> {
  const start = monthStart(year, month);
  const end = monthEnd(year, month);

  const [stepRes, decompRes, studioRes, chatRes] = await Promise.all([
    supabase
      .from('ExecutionStep')
      .select('costUsd')
      .eq('spaceId', spaceId)
      .gte('createdAt', start)
      .lt('createdAt', end),
    supabase
      .from('GoalDecomposition')
      .select('llmModel, promptTokens, completionTokens')
      .eq('spaceId', spaceId)
      .gte('createdAt', start)
      .lt('createdAt', end),
    supabase
      .from('StudioGeneration')
      .select('model, costUsd')
      .eq('spaceId', spaceId)
      .gte('createdAt', start)
      .lt('createdAt', end),
    supabase
      .from('ChatUsage')
      .select('model, costUsd')
      .eq('spaceId', spaceId)
      .gte('createdAt', start)
      .lt('createdAt', end),
  ]);

  if (stepRes.error) throw stepRes.error;
  if (decompRes.error) throw decompRes.error;
  if (studioRes.error) throw studioRes.error;
  if (chatRes.error) throw chatRes.error;

  let totalUsd = 0;
  for (const row of stepRes.data ?? []) {
    totalUsd += toNumber((row as { costUsd: string | number | null }).costUsd);
  }

  const modelMap = new Map<string, ModelUsage>();
  for (const row of decompRes.data ?? []) {
    const r = row as {
      llmModel: string | null;
      promptTokens: number | null;
      completionTokens: number | null;
    };
    const model = r.llmModel ?? 'unknown';
    const tokensIn = toNumber(r.promptTokens);
    const tokensOut = toNumber(r.completionTokens);
    const cost = decompositionCost(model, tokensIn, tokensOut);

    totalUsd += cost;

    const entry = modelMap.get(model) ?? { model, costUsd: 0, requests: 0 };
    entry.costUsd += cost;
    entry.requests += 1;
    modelMap.set(model, entry);
  }

  // Studio generations carry their own model id and dollar cost — fold them
  // into both the headline total and the by-model breakdown.
  for (const row of studioRes.data ?? []) {
    const r = row as { model: string | null; costUsd: string | number | null };
    const model = r.model ?? 'unknown';
    const cost = toNumber(r.costUsd);

    totalUsd += cost;

    const entry = modelMap.get(model) ?? { model, costUsd: 0, requests: 0 };
    entry.costUsd += cost;
    entry.requests += 1;
    modelMap.set(model, entry);
  }

  // Chat turns carry a precomputed costUsd and the model the turn ran on.
  for (const row of chatRes.data ?? []) {
    const r = row as { model: string | null; costUsd: string | number | null };
    const model = r.model ?? 'unknown';
    const cost = toNumber(r.costUsd);

    totalUsd += cost;

    const entry = modelMap.get(model) ?? { model, costUsd: 0, requests: 0 };
    entry.costUsd += cost;
    entry.requests += 1;
    modelMap.set(model, entry);
  }

  const byModel = [...modelMap.values()].sort((a, b) => b.costUsd - a.costUsd);

  return { totalUsd: round6(totalUsd), byModel };
}

/**
 * Per-day spend and request count for the last `daysBack` days (inclusive of
 * today, UTC). Returns one entry per day, oldest first, with zero-filled gaps
 * so the sparkline has a continuous baseline.
 */
export async function getDailyUsage(
  spaceId: string,
  daysBack: number,
): Promise<DailyUsage[]> {
  const days = Math.max(1, Math.min(daysBack, 90));
  const now = new Date();
  // Start of the window: midnight UTC, (days - 1) days ago.
  const windowStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1)),
  );

  const [stepRes, studioRes, chatRes] = await Promise.all([
    supabase
      .from('ExecutionStep')
      .select('costUsd, createdAt')
      .eq('spaceId', spaceId)
      .gte('createdAt', windowStart.toISOString()),
    supabase
      .from('StudioGeneration')
      .select('costUsd, createdAt')
      .eq('spaceId', spaceId)
      .gte('createdAt', windowStart.toISOString()),
    supabase
      .from('ChatUsage')
      .select('costUsd, createdAt')
      .eq('spaceId', spaceId)
      .gte('createdAt', windowStart.toISOString()),
  ]);

  if (stepRes.error) throw stepRes.error;
  if (studioRes.error) throw studioRes.error;
  if (chatRes.error) throw chatRes.error;

  // Seed every day in the window with zeros so the sparkline is continuous.
  const buckets = new Map<string, DailyUsage>();
  for (let i = 0; i < days; i++) {
    const d = new Date(windowStart.getTime() + i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, { day: key, costUsd: 0, requests: 0 });
  }

  const addRow = (costUsd: string | number | null, createdAt: string) => {
    const key = createdAt.slice(0, 10);
    const bucket = buckets.get(key);
    if (!bucket) return; // outside the zero-filled window — ignore
    bucket.costUsd += toNumber(costUsd);
    bucket.requests += 1;
  };

  for (const row of stepRes.data ?? []) {
    const r = row as { costUsd: string | number | null; createdAt: string };
    addRow(r.costUsd, r.createdAt);
  }
  for (const row of studioRes.data ?? []) {
    const r = row as { costUsd: string | number | null; createdAt: string };
    addRow(r.costUsd, r.createdAt);
  }
  for (const row of chatRes.data ?? []) {
    const r = row as { costUsd: string | number | null; createdAt: string };
    addRow(r.costUsd, r.createdAt);
  }

  return [...buckets.values()]
    .map((b) => ({ ...b, costUsd: round6(b.costUsd) }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
