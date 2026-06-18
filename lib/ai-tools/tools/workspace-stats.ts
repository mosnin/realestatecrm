/**
 * `workspace_stats` — a KPI snapshot of the workspace as a tool-ui StatsDisplay.
 *
 * Read-only. Answers "how am I doing", "show my numbers", "give me the
 * dashboard". Returns four headline metrics with period-over-period diffs
 * where they can be computed honestly:
 *   - Active contacts   (total leads in the book)
 *   - Open deals        (status = active)
 *   - Pipeline value    (sum of active deal values, currency)
 *   - Won (30d)         (deals closed-won in the last 30 days, with the diff
 *                        vs the prior 30-day window)
 *
 * The result `data` is shaped exactly like the StatsDisplay serializable
 * payload (`{ id, title, description, stats }`) so the dispatch can render it
 * directly via `display: 'stats'`. We never fabricate trailing data — sparklines
 * are omitted because the workspace doesn't store a per-day metric history.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { defineTool } from '../types';

const parameters = z
  .object({})
  .describe('Headline workspace KPIs (active contacts, open deals, pipeline value, won this month).');

interface StatPayload {
  id: string;
  title: string;
  description?: string;
  stats: Array<{
    key: string;
    label: string;
    value: number;
    format?:
      | { kind: 'number'; decimals?: number; compact?: boolean }
      | { kind: 'currency'; currency: string; decimals?: number };
    diff?: { value: number; decimals?: number; upIsPositive?: boolean; label?: string };
  }>;
}

const MS_PER_DAY = 86_400_000;

export const workspaceStatsTool = defineTool<typeof parameters, StatPayload>({
  name: 'workspace_stats',
  riskLevel: 'safe',
  description:
    'Headline workspace KPIs as a stat card: active contacts, open deals, pipeline value, and deals won in the last 30 days (with change vs the prior 30 days). Use for "how am I doing", "my numbers", "dashboard".',
  parameters,
  requiresApproval: false,

  async handler(_args, ctx) {
    const now = Date.now();
    const cutoff30 = new Date(now - 30 * MS_PER_DAY).toISOString();
    const cutoff60 = new Date(now - 60 * MS_PER_DAY).toISOString();

    // Contacts in the book (the realtor's personal leads).
    const contactsP = supabase
      .from('Contact')
      .select('id', { count: 'exact', head: true })
      .eq('spaceId', ctx.space.id)
      .abortSignal(ctx.signal);

    // Active deals — count + values for the pipeline sum.
    const activeDealsP = supabase
      .from('Deal')
      .select('value')
      .eq('spaceId', ctx.space.id)
      .eq('status', 'active')
      .abortSignal(ctx.signal);

    // Won deals across the last 60 days so we can split into this-30 vs prior-30.
    const wonP = supabase
      .from('Deal')
      .select('closedAt')
      .eq('spaceId', ctx.space.id)
      .eq('status', 'won')
      .gte('closedAt', cutoff60)
      .abortSignal(ctx.signal);

    const [contactsRes, activeRes, wonRes] = await Promise.all([contactsP, activeDealsP, wonP]);

    if (contactsRes.error || activeRes.error || wonRes.error) {
      const msg =
        contactsRes.error?.message ||
        activeRes.error?.message ||
        wonRes.error?.message ||
        'unknown error';
      return { summary: `Could not load workspace stats: ${msg}`, display: 'error' };
    }

    const activeContacts = contactsRes.count ?? 0;
    const activeDeals = (activeRes.data ?? []) as Array<{ value: number | null }>;
    const openDeals = activeDeals.length;
    const pipelineValue = activeDeals.reduce((sum, d) => sum + (d.value ?? 0), 0);

    const wonRows = (wonRes.data ?? []) as Array<{ closedAt: string | null }>;
    let wonThis30 = 0;
    let wonPrior30 = 0;
    for (const w of wonRows) {
      if (!w.closedAt) continue;
      if (w.closedAt >= cutoff30) wonThis30 += 1;
      else if (w.closedAt >= cutoff60) wonPrior30 += 1;
    }

    // StatsDisplay renders `diff.value` as a PERCENT. A percentage change is
    // only meaningful with a non-zero prior window, so we omit the diff when
    // prior is zero rather than divide-by-zero or fake an absolute count.
    const wonDiffPct =
      wonPrior30 > 0 ? ((wonThis30 - wonPrior30) / wonPrior30) * 100 : null;

    const stats: StatPayload['stats'] = [
      { key: 'contacts', label: 'Active contacts', value: activeContacts, format: { kind: 'number' } },
      { key: 'deals', label: 'Open deals', value: openDeals, format: { kind: 'number' } },
      {
        key: 'pipeline',
        label: 'Pipeline value',
        value: Math.round(pipelineValue),
        format: { kind: 'currency', currency: 'USD', decimals: 0 },
      },
      {
        key: 'won',
        label: 'Won (30d)',
        value: wonThis30,
        format: { kind: 'number' },
        ...(wonDiffPct !== null
          ? { diff: { value: Math.round(wonDiffPct), decimals: 0, label: 'vs prior 30d' } }
          : {}),
      },
    ];

    const fmtMoney = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    });
    const summary =
      `Workspace: ${activeContacts} contact${activeContacts === 1 ? '' : 's'}, ` +
      `${openDeals} open deal${openDeals === 1 ? '' : 's'} worth ${fmtMoney.format(pipelineValue)}, ` +
      `${wonThis30} won in the last 30 days.`;

    return {
      summary,
      data: {
        id: 'workspace-stats',
        title: 'Workspace snapshot',
        stats,
      },
      display: 'stats',
    };
  },
});
