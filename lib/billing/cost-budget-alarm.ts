/**
 * Daily ChatUsage vs credit-grant Sentry alarm. Called from the cleanup cron
 * (no new route). Cross-tenant on purpose — annotated with `.unscoped()`.
 */

import { supabase } from '@/lib/supabase';
import { unscoped } from '@/lib/supabase-guard';
import { captureMessage } from '@/lib/observability';
import { logger } from '@/lib/logger';
import {
  DEFAULT_COST_ALARM_MULTIPLIER,
  spacesOverBudget,
  type SpaceCostRow,
} from '@/lib/billing/cost-vs-credits';

const MAX_USAGE_ROWS = 5_000;

export async function alarmDailyCostBudgets(
  multiplier = DEFAULT_COST_ALARM_MULTIPLIER,
): Promise<{ scanned: number; over: number }> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { data: usage, error: usageErr } = await unscoped(
    supabase.from('ChatUsage').select('spaceId, costUsd').gte('createdAt', since).limit(MAX_USAGE_ROWS),
    'cron cross-tenant: daily ChatUsage cost vs credit-grant budget alarm',
  );
  if (usageErr) {
    logger.error('[cost-vs-credits] ChatUsage scan failed', { err: usageErr.message });
    return { scanned: 0, over: 0 };
  }

  const bySpace = new Map<string, number>();
  for (const row of (usage ?? []) as { spaceId: string; costUsd: string | number | null }[]) {
    bySpace.set(row.spaceId, (bySpace.get(row.spaceId) ?? 0) + parseFloat(String(row.costUsd ?? 0)));
  }
  const spaceIds = Array.from(bySpace.keys());
  if (spaceIds.length === 0) return { scanned: 0, over: 0 };

  const { data: spaces, error: spaceErr } = await unscoped(
    supabase.from('Space').select('id, plan').in('id', spaceIds),
    'cron cross-tenant: resolve plan for cost-vs-credits alarm',
  );
  if (spaceErr) {
    logger.error('[cost-vs-credits] Space plan lookup failed', { err: spaceErr.message });
    return { scanned: spaceIds.length, over: 0 };
  }

  const planById = new Map(
    ((spaces ?? []) as { id: string; plan: string | null }[]).map((s) => [s.id, s.plan]),
  );
  const rows: SpaceCostRow[] = spaceIds.map((spaceId) => ({
    spaceId,
    plan: planById.get(spaceId) ?? null,
    costUsd: bySpace.get(spaceId) ?? 0,
  }));
  const over = spacesOverBudget(rows, 1, multiplier);

  for (const hit of over) {
    captureMessage(
      `Space daily LLM cost exceeds ${multiplier}× credit-grant budget`,
      'warning',
      {
        spaceId: hit.spaceId,
        plan: hit.plan,
        costUsd: hit.costUsd,
        budgetUsd: hit.budgetUsd,
        ratio: hit.ratio,
      },
    );
    logger.warn('[cost-vs-credits] space over daily grant budget', {
      spaceId: hit.spaceId,
      plan: hit.plan,
      costUsd: hit.costUsd,
      budgetUsd: hit.budgetUsd,
      ratio: Number(hit.ratio.toFixed(2)),
    });
  }

  return { scanned: spaceIds.length, over: over.length };
}
