import { getBrokerContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { getBrokerageMembers } from '@/lib/brokerage-members';
import Link from 'next/link';
import type { Metadata } from 'next';
import { H1, TITLE_FONT, BODY_MUTED, CHIPPI_PILL } from '@/lib/typography';
import { cn } from '@/lib/utils';
import { getInitials } from '@/lib/formatting';
import { AlertTriangle, TrendingDown, Clock, Inbox, Check, Star, UserCheck } from 'lucide-react';

export const metadata: Metadata = { title: 'Retention — Teams' };

// ── Risk tier ────────────────────────────────────────────────────────────────

type RiskTier = 'at-risk' | 'steady' | 'thriving';

interface RetentionSignals {
  /** Won deals in the current 30-day window. */
  wonCurrent: number;
  /** Won deals in the prior 30-day window. */
  wonPrior: number;
  /** Days since the most recent ContactActivity in their space. Null = no data. */
  daysSinceActivity: number | null;
  /** Broker-assigned leads with no first contact. */
  unworkedLeads: number;
  /** SLA-nudged + SLA-escalated contacts. */
  slaMisses: number;
}

interface RetentionRow {
  membershipId: string;
  userId: string;
  name: string | null;
  email: string;
  onboard: boolean;
  spaceSlug: string | null;
  risk: RiskTier;
  signals: RetentionSignals;
  /** Pre-built label fragments for the 2-3 visible risk signals. */
  signalBullets: string[];
}

function computeRisk(s: RetentionSignals, onboard: boolean): RiskTier {
  if (!onboard) return 'steady'; // not yet active — no risk signal yet

  // Hard at-risk: any unworked broker leads or SLA misses
  if (s.unworkedLeads > 0 || s.slaMisses > 0) return 'at-risk';

  // Production decline: had wins before but zero now
  if (s.wonPrior > 0 && s.wonCurrent === 0) return 'at-risk';

  // Gone quiet: no activity in 14+ days
  if (s.daysSinceActivity !== null && s.daysSinceActivity >= 14) return 'at-risk';

  // Thriving: winning deals AND active in the last 7 days AND no negatives
  if (
    s.wonCurrent > 0 &&
    s.unworkedLeads === 0 &&
    s.slaMisses === 0 &&
    (s.daysSinceActivity === null || s.daysSinceActivity <= 7)
  ) {
    return 'thriving';
  }

  return 'steady';
}

function buildSignalBullets(s: RetentionSignals, risk: RiskTier): string[] {
  if (risk === 'thriving') {
    const bullets: string[] = [];
    if (s.wonCurrent > 0) {
      bullets.push(`${s.wonCurrent} deal${s.wonCurrent === 1 ? '' : 's'} won this period`);
    }
    if (s.daysSinceActivity !== null) {
      bullets.push(`active ${s.daysSinceActivity === 0 ? 'today' : `${s.daysSinceActivity}d ago`}`);
    }
    return bullets.slice(0, 2);
  }

  if (risk === 'at-risk') {
    const bullets: string[] = [];
    if (s.unworkedLeads > 0) {
      bullets.push(`${s.unworkedLeads} un-worked lead${s.unworkedLeads === 1 ? '' : 's'}`);
    }
    if (s.slaMisses > 0) {
      bullets.push(`${s.slaMisses} SLA miss${s.slaMisses === 1 ? '' : 'es'}`);
    }
    if (s.wonPrior > 0 && s.wonCurrent === 0) {
      bullets.push('production dropped to zero this period');
    }
    if (s.daysSinceActivity !== null && s.daysSinceActivity >= 14) {
      bullets.push(`quiet for ${s.daysSinceActivity} days`);
    }
    return bullets.slice(0, 3);
  }

  // steady
  const bullets: string[] = [];
  if (s.wonCurrent > 0) {
    bullets.push(`${s.wonCurrent} deal${s.wonCurrent === 1 ? '' : 's'} won`);
  }
  if (s.daysSinceActivity !== null) {
    bullets.push(`active ${s.daysSinceActivity === 0 ? 'today' : `${s.daysSinceActivity}d ago`}`);
  }
  return bullets.slice(0, 2);
}

// ── Risk chip ─────────────────────────────────────────────────────────────────

function RiskChip({ risk }: { risk: RiskTier }) {
  const base =
    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold flex-shrink-0';

  if (risk === 'at-risk') {
    return (
      <span
        className={cn(
          base,
          'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
        )}
      >
        <AlertTriangle size={9} aria-hidden />
        Flight risk
      </span>
    );
  }

  if (risk === 'thriving') {
    return (
      <span
        className={cn(
          base,
          'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
        )}
      >
        <Star size={9} aria-hidden />
        Thriving
      </span>
    );
  }

  return (
    <span className={cn(base, 'bg-muted text-muted-foreground')}>
      <Check size={9} aria-hidden />
      Steady
    </span>
  );
}

// ── Signal icon helper ────────────────────────────────────────────────────────

function SignalIcon({ bullet }: { bullet: string }) {
  if (bullet.includes('un-worked') || bullet.includes('SLA')) {
    return <Inbox size={10} className="flex-shrink-0 mt-[1px]" aria-hidden />;
  }
  if (bullet.includes('quiet') || bullet.includes('days')) {
    return <Clock size={10} className="flex-shrink-0 mt-[1px]" aria-hidden />;
  }
  if (bullet.includes('dropped') || bullet.includes('zero')) {
    return <TrendingDown size={10} className="flex-shrink-0 mt-[1px]" aria-hidden />;
  }
  return null;
}

// ── Retain prompt ─────────────────────────────────────────────────────────────

function buildRetainHref(r: RetentionRow): string {
  const displayName = r.name ?? r.email;
  const summary =
    r.signalBullets.length > 0
      ? r.signalBullets.join(', ')
      : 'nothing alarming yet, but worth a check-in';
  const prompt =
    `Help me retain ${displayName}. Signals: ${summary}. ` +
    `Draft a check-in message and what I should raise in our next 1:1.`;
  return `/broker?prompt=${encodeURIComponent(prompt)}`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function BrokerRetentionPage() {
  const ctx = await getBrokerContext();
  if (!ctx) redirect('/');

  const { brokerage } = ctx;

  const members = await getBrokerageMembers(brokerage.id, {
    includeOnboard: true,
    includeSpaceName: true,
  });

  const spaceIds = members.map((m) => m.Space?.id).filter(Boolean) as string[];

  // Window boundaries
  const now = Date.now();
  const PERIOD_MS = 30 * 24 * 3600 * 1000;
  const currentWindowStart = new Date(now - PERIOD_MS).toISOString();
  const priorWindowStart   = new Date(now - 2 * PERIOD_MS).toISOString();

  // Parallel data pull — all scoped to the brokerage's space set.
  const [
    wonCurrentRows,
    wonPriorRows,
    unworkedRows,
    slaNudgedRows,
    slaEscalatedRows,
    recentActivityRows,
  ] = await Promise.all([
    // Won deals in the current 30-day window
    spaceIds.length > 0
      ? supabase
          .from('Deal')
          .select('spaceId')
          .in('spaceId', spaceIds)
          .eq('status', 'won')
          .gte('updatedAt', currentWindowStart)
          .limit(10000)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),

    // Won deals in the prior 30-day window (for production trend)
    spaceIds.length > 0
      ? supabase
          .from('Deal')
          .select('spaceId')
          .in('spaceId', spaceIds)
          .eq('status', 'won')
          .gte('updatedAt', priorWindowStart)
          .lt('updatedAt', currentWindowStart)
          .limit(10000)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),

    // Un-worked broker-assigned leads
    spaceIds.length > 0
      ? supabase
          .from('Contact')
          .select('spaceId')
          .in('spaceId', spaceIds)
          .contains('tags', ['assigned-by-broker'])
          .is('lastContactedAt', null)
          .limit(10000)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),

    // SLA-nudged contacts
    spaceIds.length > 0
      ? supabase
          .from('Contact')
          .select('spaceId')
          .in('spaceId', spaceIds)
          .contains('tags', ['sla-nudged'])
          .limit(10000)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),

    // SLA-escalated contacts
    spaceIds.length > 0
      ? supabase
          .from('Contact')
          .select('spaceId')
          .in('spaceId', spaceIds)
          .contains('tags', ['sla-escalated'])
          .limit(10000)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),

    // Most recent ContactActivity per space — used to derive "days since last activity"
    spaceIds.length > 0
      ? supabase
          .from('ContactActivity')
          .select('spaceId, createdAt')
          .in('spaceId', spaceIds)
          .order('createdAt', { ascending: false })
          .limit(20000)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
  ]);

  // ── Aggregate per-space counts ─────────────────────────────────────────────

  function countBySpace(rows: { spaceId: string }[]): Record<string, number> {
    return rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.spaceId] = (acc[r.spaceId] ?? 0) + 1;
      return acc;
    }, {});
  }

  const wonCurrentBySpace  = countBySpace(wonCurrentRows  as { spaceId: string }[]);
  const wonPriorBySpace    = countBySpace(wonPriorRows    as { spaceId: string }[]);
  const unworkedBySpace    = countBySpace(unworkedRows    as { spaceId: string }[]);
  const nudgedBySpace      = countBySpace(slaNudgedRows   as { spaceId: string }[]);
  const escalatedBySpace   = countBySpace(slaEscalatedRows as { spaceId: string }[]);

  // Latest activity timestamp per space
  const latestActivityBySpace = new Map<string, number>();
  for (const a of recentActivityRows as { spaceId: string; createdAt: string }[]) {
    const ts = new Date(a.createdAt).getTime();
    if (Number.isNaN(ts)) continue;
    const prev = latestActivityBySpace.get(a.spaceId);
    if (prev === undefined || ts > prev) {
      latestActivityBySpace.set(a.spaceId, ts);
    }
  }

  // ── Build retention rows ───────────────────────────────────────────────────

  const rows: RetentionRow[] = members
    .filter((m) => m.User?.onboard) // only joined realtors carry meaningful signals
    .map((m) => {
      const sid = m.Space?.id ?? null;

      const wonCurrent    = sid ? (wonCurrentBySpace[sid]  ?? 0) : 0;
      const wonPrior      = sid ? (wonPriorBySpace[sid]    ?? 0) : 0;
      const unworkedLeads = sid ? (unworkedBySpace[sid]    ?? 0) : 0;
      const slaMisses     = sid
        ? (nudgedBySpace[sid] ?? 0) + (escalatedBySpace[sid] ?? 0)
        : 0;

      const latestActivityMs = sid ? latestActivityBySpace.get(sid) : undefined;
      const daysSinceActivity =
        latestActivityMs !== undefined
          ? Math.floor((now - latestActivityMs) / (24 * 3600 * 1000))
          : null;

      const signals: RetentionSignals = {
        wonCurrent,
        wonPrior,
        daysSinceActivity,
        unworkedLeads,
        slaMisses,
      };

      const risk = computeRisk(signals, m.User?.onboard ?? false);
      const signalBullets = buildSignalBullets(signals, risk);

      return {
        membershipId: m.id,
        userId: m.userId,
        name: m.User?.name ?? null,
        email: m.User?.email ?? '',
        onboard: m.User?.onboard ?? false,
        spaceSlug: m.Space?.slug ?? null,
        risk,
        signals,
        signalBullets,
      };
    });

  // Sort: at-risk first, then steady, then thriving
  const RISK_ORDER: Record<RiskTier, number> = {
    'at-risk': 0,
    'steady':  1,
    'thriving': 2,
  };
  rows.sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk]);

  // ── Status sentence ────────────────────────────────────────────────────────

  const atRisk   = rows.filter((r) => r.risk === 'at-risk');
  const thriving = rows.filter((r) => r.risk === 'thriving');

  const subtitle = (() => {
    if (rows.length === 0) {
      return 'No active realtors yet. Nothing to flag.';
    }
    if (atRisk.length === 0 && thriving.length === 0) {
      return `Your team is holding steady. ${rows.length} active.`;
    }
    if (atRisk.length === 0) {
      return `Your team is holding steady. ${thriving.length > 1 ? `${thriving.length} thriving.` : `${(thriving[0].name ?? thriving[0].email).split(/\s+/)[0]} is thriving.`}`;
    }
    if (atRisk.length === 1) {
      const name = (atRisk[0].name ?? atRisk[0].email).split(/\s+/)[0];
      return `${name} is showing flight-risk signals. The rest are steady.`;
    }
    return `${atRisk.length} agents showing flight-risk signals. Worth a check-in.`;
  })();

  return (
    <div className="space-y-6 max-w-3xl pb-56 md:pb-24">
      <header className="space-y-1.5">
        <p className={cn(BODY_MUTED)}>Retention.</p>
        <h1 className={cn(H1)} style={TITLE_FONT}>
          Who needs a conversation
        </h1>
        <p className={cn(BODY_MUTED)}>{subtitle}</p>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-12 text-center">
          <p className="text-sm text-foreground">Your team is holding steady.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Risk signals will surface here once realtors are active.
          </p>
        </div>
      ) : atRisk.length === 0 ? (
        /* Positive empty state when nobody is at risk */
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
          <p className="text-sm text-foreground">Your team is holding steady.</p>
          <p className="text-xs text-muted-foreground mt-1">
            No flight-risk signals right now. Check back after your next production cycle.
          </p>
        </div>
      ) : null}

      {rows.length > 0 && (
        <ul className="divide-y divide-border/60">
          {rows.map((r) => {
            const displayName = r.name ?? r.email;
            const retainHref  = buildRetainHref(r);

            return (
              <li
                key={r.membershipId}
                className="group/row flex items-center gap-3 py-3"
              >
                {/* Left: avatar + name + chips + signal text */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full bg-muted/40 text-muted-foreground flex items-center justify-center text-xs font-semibold flex-shrink-0">
                    {getInitials(displayName)}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span className="text-sm font-medium text-foreground truncate">
                        {displayName}
                      </span>
                      <RiskChip risk={r.risk} />
                    </div>

                    {/* Signal bullets */}
                    {r.signalBullets.length > 0 && (
                      <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                        {r.signalBullets.map((bullet, i) => (
                          <p
                            key={i}
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                          >
                            <SignalIcon bullet={bullet} />
                            {bullet}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Retain CTA — always visible on mobile, hover-revealed on lg+ */}
                <Link
                  href={retainHref}
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    CHIPPI_PILL,
                    'h-7 px-3 text-[11px] flex-shrink-0',
                    'opacity-100 lg:opacity-0 lg:group-hover/row:opacity-100',
                    'focus-visible:opacity-100',
                  )}
                  aria-label={`Ask Chippi to help retain ${displayName}`}
                  title={`Draft a retention conversation for ${displayName}`}
                >
                  <UserCheck size={12} aria-hidden />
                  Retain
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* Context note — explains the signals so the broker trusts the surface */}
      {rows.length > 0 && (
        <p className={cn('text-xs', BODY_MUTED)}>
          Flight risk is flagged when an agent has un-worked leads, SLA misses, a production drop from the prior 30-day period, or no activity in 14 or more days.
        </p>
      )}
    </div>
  );
}
