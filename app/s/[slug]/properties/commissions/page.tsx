import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { ArrowRight, DollarSign, Trophy, Clock } from 'lucide-react';
import { computeCommission, type CommissionSplit } from '@/lib/commissions';
import { formatCurrency } from '@/lib/formatting';

export const dynamic = 'force-dynamic';

interface DealRow {
  id: string;
  title: string;
  status: 'active' | 'won' | 'lost' | 'on_hold';
  value: number | null;
  commissionRate: number | null;
  closeDate: string | null;
  updatedAt: string;
}

/**
 * YTD commission overview. Groups deals into:
 *   Won this year: closed + won within current YTD → contributes to "closed net"
 *   In flight: active deals → contributes to "expected net" (not guaranteed)
 *
 * Unpaid outgoing splits across all closed deals produce the "still owed out"
 * number, which answers the "what cheques do I still need to cut" question.
 */
export default async function PropertiesCommissionsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();

  const [dealsResult, splitsResult] = await Promise.all([
    supabase
      .from('Deal')
      .select('id, title, status, value, commissionRate, closeDate, updatedAt')
      .eq('spaceId', space.id)
      .order('updatedAt', { ascending: false }),
    supabase
      .from('CommissionSplit')
      .select('*')
      .eq('spaceId', space.id),
  ]);

  const deals = (dealsResult.data ?? []) as DealRow[];
  const splits = (splitsResult.data ?? []) as CommissionSplit[];
  const splitsByDeal = new Map<string, CommissionSplit[]>();
  for (const s of splits) {
    const arr = splitsByDeal.get(s.dealId) ?? [];
    arr.push(s);
    splitsByDeal.set(s.dealId, arr);
  }

  const closedYtd = deals.filter((d) => d.status === 'won' && d.updatedAt >= yearStart);
  const inFlight = deals.filter((d) => d.status === 'active');

  let closedNet = 0;
  let expectedNet = 0;
  let stillOwedOut = 0;
  let closedGci = 0;

  for (const d of closedYtd) {
    const r = computeCommission(d.value, d.commissionRate, splitsByDeal.get(d.id) ?? []);
    closedNet += r.net;
    closedGci += r.gci;
    stillOwedOut += r.outgoingUnpaid;
  }
  for (const d of inFlight) {
    const r = computeCommission(d.value, d.commissionRate, splitsByDeal.get(d.id) ?? []);
    expectedNet += r.net;
  }

  return (
    <div className="space-y-5 max-w-[1200px]">
      <div>
        <Link
          href={`/s/${slug}/properties`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
        >
          ← Properties
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">Commissions</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          YTD closed income, what&apos;s in flight, and who still owes what.
        </p>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <HeadlineCard icon={Trophy} tint="emerald" label="Closed net YTD" value={formatCurrency(closedNet)} sub={`${closedYtd.length} won deal${closedYtd.length === 1 ? '' : 's'}`} />
        <HeadlineCard icon={DollarSign} tint="slate" label="Closed GCI YTD" value={formatCurrency(closedGci)} sub="before splits" />
        <HeadlineCard icon={ArrowRight} tint="violet" label="Expected net" value={formatCurrency(expectedNet)} sub={`${inFlight.length} active deal${inFlight.length === 1 ? '' : 's'}`} />
        <HeadlineCard icon={Clock} tint="amber" label="Still owed out" value={formatCurrency(stillOwedOut)} sub="unpaid splits across closed deals" />
      </div>

      {/* Closed deals table */}
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <header className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Trophy size={14} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold">Closed this year</h2>
          <span className="text-[11px] text-muted-foreground">{closedYtd.length}</span>
        </header>
        {closedYtd.length === 0 ? (
          <p className="px-4 py-6 text-xs text-muted-foreground text-center">
            No won deals yet this year. They&apos;ll show here with net-to-you when you close.
          </p>
        ) : (
          <CommissionTable rows={closedYtd} splitsByDeal={splitsByDeal} slug={slug} />
        )}
      </section>

      {/* In-flight deals */}
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <header className="px-4 py-3 border-b border-border flex items-center gap-2">
          <ArrowRight size={14} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold">In flight</h2>
          <span className="text-[11px] text-muted-foreground">{inFlight.length}</span>
        </header>
        {inFlight.length === 0 ? (
          <p className="px-4 py-6 text-xs text-muted-foreground text-center">No active deals right now.</p>
        ) : (
          <CommissionTable rows={inFlight} splitsByDeal={splitsByDeal} slug={slug} />
        )}
      </section>
    </div>
  );
}

function CommissionTable({
  rows,
  splitsByDeal,
  slug,
}: {
  rows: DealRow[];
  splitsByDeal: Map<string, CommissionSplit[]>;
  slug: string;
}) {
  return (
    <div className="divide-y divide-border">
      <div className="hidden sm:grid grid-cols-[minmax(0,2fr)_90px_80px_90px_90px_40px] px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30">
        <span>Deal</span>
        <span className="text-right">Value</span>
        <span className="text-right">Rate</span>
        <span className="text-right">GCI</span>
        <span className="text-right">Net</span>
        <span />
      </div>
      {rows.map((d) => {
        const r = computeCommission(d.value, d.commissionRate, splitsByDeal.get(d.id) ?? []);
        return (
          <Link
            key={d.id}
            href={`/s/${slug}/deals/${d.id}`}
            className="group flex flex-col sm:grid sm:grid-cols-[minmax(0,2fr)_90px_80px_90px_90px_40px] px-4 py-2.5 hover:bg-muted/30 transition-colors"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{d.title}</p>
              {d.closeDate && (
                <p className="text-[11px] text-muted-foreground">
                  {new Date(d.closeDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              )}
            </div>
            <span className="hidden sm:block text-right tabular-nums text-sm">
              {d.value != null ? formatCurrency(d.value) : '—'}
            </span>
            <span className="hidden sm:block text-right tabular-nums text-sm">
              {d.commissionRate != null ? `${d.commissionRate}%` : '—'}
            </span>
            <span className="hidden sm:block text-right tabular-nums text-sm">
              {formatCurrency(r.gci)}
            </span>
            <span className="hidden sm:block text-right tabular-nums text-sm font-semibold">
              {formatCurrency(r.net)}
            </span>
            <span className="hidden sm:flex justify-end text-muted-foreground/40 group-hover:text-foreground transition-colors">
              <ArrowRight size={12} />
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function HeadlineCard({
  icon: Icon,
  tint,
  label,
  value,
  sub,
}: {
  icon: typeof DollarSign;
  tint: 'emerald' | 'slate' | 'violet' | 'amber';
  label: string;
  value: string;
  sub: string;
}) {
  const bg = {
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
    slate:   'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300',
    violet:  'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400',
    amber:   'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  }[tint];

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${bg}`}>
        <Icon size={15} />
      </div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular-nums mt-0.5">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>
    </div>
  );
}
