import { redirect } from 'next/navigation';
import { getBrokerageMembers } from '@/lib/brokerage-members';
import { resolveBrokerContext } from '@/lib/agent/broker-context';
import { supabase } from '@/lib/supabase';
import { dealHealth, HEALTH_META } from '@/lib/deals/health';
import { formatCurrency, formatCompact } from '@/lib/formatting';
import { H1, TITLE_FONT, BODY_MUTED, SECTION_RHYTHM, SECTION_LABEL, META } from '@/lib/typography';
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

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function BrokerDealsPage() {
  // Gate — brokers and admins only.
  const ctx = await resolveBrokerContext();
  if (!ctx) redirect('/');

  const { brokerage } = ctx;

  // Resolve all realtor members (same pattern as broker pipeline).
  const allMembers = await getBrokerageMembers(brokerage.id, { includeSpaceName: true });
  const members = allMembers.filter((m) => m.role === 'realtor_member');

  const spaceIds = members.map((m) => m.Space?.id).filter(Boolean) as string[];

  // Build spaceId → realtor name lookup.
  const spaceToRealtor = new Map<string, string>();
  for (const m of members) {
    const name = m.User?.name ?? m.User?.email ?? 'Unknown';
    if (m.Space?.id) {
      spaceToRealtor.set(m.Space.id, name);
    }
  }

  // Fetch all deals across member spaces — newest/active first, capped at 5000.
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

  // ── Enrich deals ──────────────────────────────────────────────────────────

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
    closeDate: string | null;
    createdAt: string;
  };

  let totalValue = 0;
  let activeCount = 0;
  let wonCount = 0;

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
      closeDate: d.closeDate,
      createdAt: d.createdAt,
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
    if (wonCount > 0) {
      parts.push(`${wonCount} won`);
    }
    if (parts.length === 0) return 'Every deal across your brokerage.';
    return `${parts.join(' · ')}.`;
  })();

  // ── Render ────────────────────────────────────────────────────────────────

  const isEmpty = enriched.length === 0;

  return (
    <div className={cn('max-w-5xl mx-auto pb-56 md:pb-24', SECTION_RHYTHM)}>
      {/* Status-sentence header — serif H1 + one-line status, per STYLESHEET §The status-sentence pattern */}
      <header className="space-y-1.5">
        <p className={BODY_MUTED}>Brokerage.</p>
        <h1 className={cn(H1)} style={TITLE_FONT}>
          Deals
        </h1>
        <p className={BODY_MUTED}>{statusSentence}</p>
      </header>

      {isEmpty ? (
        /* Empty state — dashed-border house style per STYLESHEET §Empty states */
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
        /* Row list — divide-y, paper-flat, StaggerList entrance per STYLESHEET §Motion */
        <div>
          {/* Column header */}
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 items-center px-1 pb-2">
            <p className={cn(SECTION_LABEL)}>Deal</p>
            <p className={cn(SECTION_LABEL, 'text-right w-28')}>Value</p>
            <p className={cn(SECTION_LABEL, 'w-24')}>Stage</p>
            <p className={cn(SECTION_LABEL, 'w-16')}>Status</p>
            <p className={cn(SECTION_LABEL, 'w-32')}>Realtor</p>
          </div>

          <StaggerList className="divide-y divide-border/60">
            {enriched.map((deal) => {
              const statusPill = STATUS_PILL[deal.status] ?? STATUS_PILL.active;
              const isActive = deal.status === 'active';

              return (
                <StaggerItem key={deal.id}>
                  <div
                    className={cn(
                      'grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 items-center py-3 px-1',
                      'transition-colors duration-150 hover:bg-foreground/[0.04]',
                      deal.status === 'lost' && 'opacity-55',
                      deal.status === 'on_hold' && 'opacity-70',
                    )}
                  >
                    {/* Deal name + address */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {/* Health dot — only on active deals, mirrors DealCard */}
                        {isActive && (
                          <span
                            className={cn(
                              'w-1.5 h-1.5 rounded-full flex-shrink-0',
                              deal.healthDotClass,
                            )}
                            title={deal.healthLabel}
                            aria-label={`Health: ${deal.healthLabel}`}
                          />
                        )}
                        <p
                          className={cn(
                            'text-sm font-medium text-foreground truncate',
                            deal.status === 'lost' && 'line-through text-muted-foreground',
                          )}
                        >
                          {deal.title}
                        </p>
                      </div>
                      {deal.address && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {deal.address}
                        </p>
                      )}
                    </div>

                    {/* Value — serif tabular-nums, focal note per STYLESHEET */}
                    <div className="text-right w-28">
                      {deal.value != null ? (
                        <p
                          className="text-sm tabular-nums text-foreground font-medium"
                          style={TITLE_FONT}
                        >
                          {formatCurrency(deal.value)}
                        </p>
                      ) : (
                        <p className={META}>—</p>
                      )}
                    </div>

                    {/* Stage name with color dot */}
                    <div className="w-24">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: deal.stageColor }}
                          aria-hidden
                        />
                        <p className="text-xs text-muted-foreground truncate">
                          {deal.stageName}
                        </p>
                      </div>
                    </div>

                    {/* Status pill */}
                    <div className="w-16">
                      <span
                        className={cn(
                          'inline-flex text-xs font-medium rounded-full px-2 py-0.5',
                          statusPill.classes,
                        )}
                      >
                        {statusPill.label}
                      </span>
                    </div>

                    {/* Owning realtor */}
                    <div className="w-32">
                      <p className="text-xs text-muted-foreground truncate">
                        {deal.realtorName}
                      </p>
                    </div>
                  </div>
                </StaggerItem>
              );
            })}
          </StaggerList>

          {/* Footer count */}
          <p className={cn(META, 'pt-4 text-right')}>
            {enriched.length.toLocaleString()} {enriched.length === 1 ? 'deal' : 'deals'} total
          </p>
        </div>
      )}
    </div>
  );
}
