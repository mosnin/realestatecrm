import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getBrokerageMembers } from '@/lib/brokerage-members';
import { resolveBrokerContext } from '@/lib/agent/broker-context';
import { supabase } from '@/lib/supabase';
import { dealHealth, HEALTH_META } from '@/lib/deals/health';
import { formatCurrency, formatCompact } from '@/lib/formatting';
import {
  H1,
  TITLE_FONT,
  BODY_MUTED,
  SECTION_RHYTHM,
  SECTION_LABEL,
  META,
} from '@/lib/typography';
import { cn } from '@/lib/utils';
import { StaggerList, StaggerItem } from '@/components/motion/stagger-list';
import { Building2 } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Deals — Brokerage' };

// ── Types ────────────────────────────────────────────────────────────────────

type DealRow = {
  id: string;
  spaceId: string;
  title: string;
  value: number | null;
  address: string | null;
  priority: string;
  closeDate: string | null;
  stageId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  stageChangedAt: string | null;
  followUpAt: string | null;
  nextAction: string | null;
  nextActionDueAt: string | null;
};

type StageRow = {
  id: string;
  name: string;
  color: string;
  position: number;
};

// Status display config — mirrors the realtor kanban vocabulary.
const STATUS_PILL: Record<string, { label: string; classes: string }> = {
  active: {
    label: 'Active',
    classes:
      'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15',
  },
  won: {
    label: 'Won',
    classes:
      'text-sky-700 bg-sky-50 dark:text-sky-400 dark:bg-sky-500/15',
  },
  lost: {
    label: 'Lost',
    classes:
      'text-rose-700 bg-rose-50 dark:text-rose-400 dark:bg-rose-500/15',
  },
  on_hold: {
    label: 'On hold',
    classes:
      'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15',
  },
};

// Grouping — broker sees deals in attention order, not alphabetical.
// Leading with deals that need eyes: stuck and at-risk active first,
// then on-track active, then won/on-hold/lost at the bottom.
type GroupKey = 'needs-attention' | 'active' | 'won' | 'on_hold' | 'lost';

const GROUP_META: Record<
  GroupKey,
  { label: string; description: string }
> = {
  'needs-attention': {
    label: 'Needs attention',
    description: 'Stuck or at-risk active deals',
  },
  active: {
    label: 'On track',
    description: 'Active deals moving forward',
  },
  won: { label: 'Won', description: 'Closed and won' },
  on_hold: { label: 'On hold', description: 'Paused or pending' },
  lost: { label: 'Lost', description: 'Closed and lost' },
};

const GROUP_ORDER: GroupKey[] = [
  'needs-attention',
  'active',
  'won',
  'on_hold',
  'lost',
];

// ── Enriched deal ────────────────────────────────────────────────────────────

type EnrichedDeal = {
  id: string;
  title: string;
  address: string | null;
  value: number | null;
  status: string;
  stageName: string;
  stageColor: string;
  realtorName: string;
  healthDotClass: string;
  healthLabel: string;
  healthReason: string;
  healthState: 'on-track' | 'at-risk' | 'stuck';
  closeDate: string | null;
  createdAt: string;
  group: GroupKey;
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function BrokerDealsPage() {
  // Gate — brokers and admins only.
  const ctx = await resolveBrokerContext();
  if (!ctx) redirect('/');

  const { brokerage } = ctx;

  // Resolve ALL brokerage members — same pattern as broker/people/page.tsx.
  // Includes owners, admins, and realtor_members. The old filter that scoped
  // only to realtor_member was silently dropping the owner's and admins' deals.
  const allMembers = await getBrokerageMembers(brokerage.id, {
    includeSpaceName: true,
  });

  const memberSpaceIds = allMembers
    .map((m) => m.Space?.id)
    .filter(Boolean) as string[];

  // Belt-and-suspenders: if the owner has a space not in memberships, include it.
  const ownerSpaceIds: string[] = [];
  if (memberSpaceIds.length === 0) {
    const { data: ownerSpaces } = await supabase
      .from('Space')
      .select('id')
      .eq('ownerId', brokerage.ownerId)
      .limit(10);
    ownerSpaceIds.push(
      ...((ownerSpaces ?? []).map((s: { id: string }) => s.id)),
    );
  }

  const spaceIds = [...new Set([...memberSpaceIds, ...ownerSpaceIds])];

  // Build spaceId → realtor name lookup across all members.
  const spaceToRealtor = new Map<string, string>();
  for (const m of allMembers) {
    const sid = m.Space?.id;
    if (!sid) continue;
    spaceToRealtor.set(sid, m.User?.name ?? m.User?.email ?? 'Unknown');
  }

  // Fetch all deals across member spaces. Active first so the broker sees
  // live pipeline before closed/lost; capped at 5000.
  const { data: dealsRaw } = spaceIds.length > 0
    ? await supabase
        .from('Deal')
        .select(
          'id, spaceId, title, value, address, priority, closeDate, stageId, status, createdAt, updatedAt, stageChangedAt, followUpAt, nextAction, nextActionDueAt',
        )
        .in('spaceId', spaceIds)
        .order('createdAt', { ascending: false })
        .limit(5000)
    : { data: [] as DealRow[] };

  // Fetch stages across the same spaces for name + color.
  const { data: stagesRaw } = spaceIds.length > 0
    ? await supabase
        .from('DealStage')
        .select('id, name, color, position')
        .in('spaceId', spaceIds)
        .order('position', { ascending: true })
        .limit(1000)
    : { data: [] as StageRow[] };

  const stageMap = new Map<string, StageRow>();
  for (const s of (stagesRaw ?? []) as StageRow[]) {
    stageMap.set(s.id, s);
  }

  // ── Enrich + classify deals ───────────────────────────────────────────────

  let totalValue = 0;
  let activeCount = 0;
  let wonCount = 0;
  let needsAttentionCount = 0;

  const enriched: EnrichedDeal[] = [];

  for (const d of (dealsRaw ?? []) as DealRow[]) {
    const stage = stageMap.get(d.stageId);
    const health = dealHealth({
      status: d.status as 'active' | 'won' | 'lost' | 'on_hold',
      stageChangedAt: d.stageChangedAt ? new Date(d.stageChangedAt) : null,
      updatedAt: new Date(d.updatedAt),
      closeDate: d.closeDate ? new Date(d.closeDate) : null,
      followUpAt: d.followUpAt ? new Date(d.followUpAt) : null,
      nextAction: d.nextAction,
      nextActionDueAt: d.nextActionDueAt ? new Date(d.nextActionDueAt) : null,
    });
    const healthMeta = HEALTH_META[health.state];

    if (d.status === 'active' || d.status === 'on_hold') {
      totalValue += d.value ?? 0;
    }
    if (d.status === 'active') activeCount += 1;
    if (d.status === 'won') wonCount += 1;

    // Classify into attention group.
    let group: GroupKey;
    if (
      d.status === 'active' &&
      (health.state === 'stuck' || health.state === 'at-risk')
    ) {
      group = 'needs-attention';
      needsAttentionCount += 1;
    } else if (d.status === 'active') {
      group = 'active';
    } else {
      group = d.status as GroupKey;
    }

    enriched.push({
      id: d.id,
      title: d.title,
      address: d.address,
      value: d.value,
      status: d.status,
      stageName: stage?.name ?? 'Unknown',
      stageColor: stage?.color ?? '#888',
      realtorName: spaceToRealtor.get(d.spaceId) ?? 'Unknown',
      healthDotClass: healthMeta.dotClass,
      healthLabel: healthMeta.label,
      healthReason: health.reason,
      healthState: health.state,
      closeDate: d.closeDate,
      createdAt: d.createdAt,
      group,
    });
  }

  // Group and sort: within each group, at-risk/stuck precede on-track;
  // within same health tier, higher value first.
  const groups = new Map<GroupKey, EnrichedDeal[]>();
  for (const g of GROUP_ORDER) groups.set(g, []);

  for (const deal of enriched) {
    groups.get(deal.group)?.push(deal);
  }

  // Sort within each group by health urgency then value descending.
  const HEALTH_RANK: Record<string, number> = { stuck: 0, 'at-risk': 1, 'on-track': 2 };
  for (const [, list] of groups) {
    list.sort((a, b) => {
      const hr = (HEALTH_RANK[a.healthState] ?? 2) - (HEALTH_RANK[b.healthState] ?? 2);
      if (hr !== 0) return hr;
      return (b.value ?? 0) - (a.value ?? 0);
    });
  }

  // ── Status sentence ───────────────────────────────────────────────────────

  const statusSentence = (() => {
    if (enriched.length === 0) return 'No deals across your brokerage yet.';
    const parts: string[] = [];
    if (activeCount > 0) {
      parts.push(
        `${formatCompact(totalValue)} across ${activeCount} active ${activeCount === 1 ? 'deal' : 'deals'}`,
      );
    }
    if (needsAttentionCount > 0) {
      parts.push(
        `${needsAttentionCount} ${needsAttentionCount === 1 ? 'deal needs' : 'deals need'} attention`,
      );
    }
    if (wonCount > 0) {
      parts.push(`${wonCount} won`);
    }
    if (parts.length === 0) return 'Every deal across your brokerage.';
    return `${parts.join(', ')}.`;
  })();

  // ── Render ────────────────────────────────────────────────────────────────

  const isEmpty = enriched.length === 0;
  const activeGroups = GROUP_ORDER.filter((g) => (groups.get(g)?.length ?? 0) > 0);

  return (
    <div className={cn('max-w-5xl mx-auto pb-56 md:pb-24', SECTION_RHYTHM)}>
      {/* Status-sentence header — per STYLESHEET §The status-sentence pattern */}
      <header className="space-y-1.5">
        <p className={BODY_MUTED}>Brokerage.</p>
        <h1 className={cn(H1)} style={TITLE_FONT}>
          Deals
        </h1>
        <p className={BODY_MUTED}>{statusSentence}</p>
      </header>

      {isEmpty ? (
        /* Empty state — per STYLESHEET §Empty states */
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
          <div className="flex justify-center mb-3">
            <Building2 size={24} className="text-muted-foreground/40" />
          </div>
          <p className="text-sm text-foreground">No deals yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Deals created by your member realtors will appear here.
          </p>
        </div>
      ) : (
        <div className={SECTION_RHYTHM}>
          {activeGroups.map((groupKey) => {
            const deals = groups.get(groupKey) ?? [];
            if (deals.length === 0) return null;
            const meta = GROUP_META[groupKey];

            return (
              <section key={groupKey}>
                {/* Section label */}
                <div className="flex items-baseline gap-2 pb-2 border-b border-border/60">
                  <p className={SECTION_LABEL}>{meta.label}</p>
                  <p className={cn(META, 'normal-case tracking-normal')}>
                    {deals.length}
                  </p>
                </div>

                {/* Deal cards — card vocabulary per DealCard, paper-flat */}
                <StaggerList
                  key={groupKey}
                  className="divide-y divide-border/60 mt-0"
                >
                  {deals.map((deal) => {
                    const statusPill =
                      STATUS_PILL[deal.status] ?? STATUS_PILL.active;
                    const isActive = deal.status === 'active';

                    // Drill-in: prefill the broker Chippi with an audit prompt.
                    const auditPrompt = `Audit the deal "${deal.title}" owned by ${deal.realtorName}. What needs attention?`;
                    const drillHref = `/broker?prompt=${encodeURIComponent(auditPrompt)}`;

                    return (
                      <StaggerItem key={deal.id}>
                        <Link
                          href={drillHref}
                          className={cn(
                            'flex items-start gap-3 py-3 px-1 rounded-sm',
                            'transition-colors duration-150 hover:bg-foreground/[0.04]',
                            deal.status === 'lost' && 'opacity-55',
                            deal.status === 'on_hold' && 'opacity-70',
                          )}
                        >
                          {/* Health dot column — only on active deals */}
                          <div className="flex-shrink-0 w-4 flex items-center justify-center pt-1">
                            {isActive && (
                              <span
                                className={cn(
                                  'w-1.5 h-1.5 rounded-full',
                                  deal.healthDotClass,
                                )}
                                title={
                                  deal.healthReason
                                    ? `${deal.healthLabel}: ${deal.healthReason}`
                                    : deal.healthLabel
                                }
                                aria-label={`Health: ${deal.healthLabel}${
                                  deal.healthReason ? `, ${deal.healthReason}` : ''
                                }`}
                              />
                            )}
                          </div>

                          {/* Main content — title, address, meta row */}
                          <div className="flex-1 min-w-0">
                            {/* Title */}
                            <p
                              className={cn(
                                'text-sm font-medium text-foreground leading-snug truncate',
                                deal.status === 'lost' &&
                                  'line-through text-muted-foreground',
                              )}
                            >
                              {deal.title}
                            </p>

                            {/* Address */}
                            {deal.address && (
                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                {deal.address}
                              </p>
                            )}

                            {/* Meta row: stage dot + name, status pill, realtor */}
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              {/* Stage dot + name */}
                              <span className="inline-flex items-center gap-1 flex-shrink-0">
                                <span
                                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: deal.stageColor }}
                                  aria-hidden
                                />
                                <span className="text-[11px] text-muted-foreground">
                                  {deal.stageName}
                                </span>
                              </span>

                              {/* Status pill */}
                              <span
                                className={cn(
                                  'inline-flex text-[10px] font-medium rounded-full px-1.5 py-0.5 flex-shrink-0',
                                  statusPill.classes,
                                )}
                              >
                                {statusPill.label}
                              </span>

                              {/* Realtor byline */}
                              <span className={cn(META, 'normal-case tracking-normal truncate')}>
                                {deal.realtorName}
                              </span>
                            </div>
                          </div>

                          {/* Value — serif tabular-nums, focal note per STYLESHEET */}
                          <div className="flex-shrink-0 text-right pl-2">
                            {deal.value != null ? (
                              <p
                                className="text-sm tabular-nums text-foreground font-medium"
                                style={TITLE_FONT}
                              >
                                {formatCurrency(deal.value)}
                              </p>
                            ) : (
                              <p className={META}></p>
                            )}
                          </div>
                        </Link>
                      </StaggerItem>
                    );
                  })}
                </StaggerList>
              </section>
            );
          })}

          {/* Footer count */}
          <p className={cn(META, 'pt-2 text-right')}>
            {enriched.length.toLocaleString()}{' '}
            {enriched.length === 1 ? 'deal' : 'deals'} total
          </p>
        </div>
      )}
    </div>
  );
}
