'use client';

/**
 * Broker-analytics breakdown sections (additive):
 *   - Lead source: leads per channel + per-source conversion rate.
 *   - Win / loss by reason: closed deals grouped by the close-reason taxonomy.
 *
 * Visual language mirrors analytics-client.tsx (STYLESHEET.md): neutral-first
 * bars (bg-foreground/[0.12] on a faint track), serif tabular numbers on focal
 * stats, hairline-divider section cards, muted captions. No brand color, no
 * decorative emerald/amber. Reuses the shared typography + motion tokens only —
 * no design-system primitives are modified.
 */

import { motion } from 'framer-motion';
import { H3, CAPTION, SECTION_LABEL, META, TITLE_FONT, SECTION_RHYTHM } from '@/lib/typography';
import { cn } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';
import type { LeadSourceRow, WinLossByReason } from '@/lib/broker-analytics-breakdowns';

// ── Shared neutral bar ──────────────────────────────────────────────────────

function Bar({ value, maxValue }: { value: number; maxValue: number }) {
  const pct = maxValue > 0 ? Math.max((value / maxValue) * 100, value > 0 ? 2 : 0) : 0;
  return (
    <div className="relative h-2 w-full rounded-full overflow-hidden bg-foreground/[0.05]">
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full bg-foreground/[0.18]"
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
      />
    </div>
  );
}

// ── Section shell (hairline card) ───────────────────────────────────────────

function Section({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/70 bg-background p-5 space-y-4">
      <div className="space-y-0.5">
        <h3 className={H3}>{title}</h3>
        {sub && <p className={CAPTION}>{sub}</p>}
      </div>
      {children}
    </section>
  );
}

// ── Lead-source breakdown ───────────────────────────────────────────────────

function LeadSourceBreakdown({ rows }: { rows: LeadSourceRow[] }) {
  if (rows.length === 0) {
    return (
      <Section title="Lead source" sub="Where your leads came from">
        <p className={CAPTION}>No attributed leads yet.</p>
      </Section>
    );
  }
  const maxLeads = Math.max(...rows.map((r) => r.leads), 1);
  return (
    <Section title="Lead source" sub="Leads by channel, with conversion to application">
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.key} className="grid grid-cols-[7rem_1fr_auto] items-center gap-3">
            <span className={cn(CAPTION, 'truncate text-foreground')} title={r.label}>
              {r.label}
            </span>
            <div className="flex items-center gap-2">
              <Bar value={r.leads} maxValue={maxLeads} />
              <span className="text-xs tabular-nums text-foreground font-medium w-8 text-right">
                {r.leads}
              </span>
            </div>
            <span className={cn(META, 'w-24 text-right')}>
              {r.conversionRate}% conv · {r.converted}
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── Win / loss by reason ────────────────────────────────────────────────────

function ReasonColumn({
  heading,
  total,
  rows,
}: {
  heading: string;
  total: number;
  rows: { key: string; label: string; count: number }[];
}) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <p className={SECTION_LABEL}>{heading}</p>
        <p className="text-sm tabular-nums text-foreground" style={TITLE_FONT}>
          {total}
        </p>
      </div>
      {rows.length === 0 ? (
        <p className={CAPTION}>No {heading.toLowerCase()} deals recorded.</p>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <div key={r.key} className="grid grid-cols-[1fr_auto] items-center gap-3">
              <div className="space-y-1">
                <span className={cn(CAPTION, 'text-foreground')}>{r.label}</span>
                <Bar value={r.count} maxValue={max} />
              </div>
              <span className="text-xs tabular-nums text-foreground font-medium w-6 text-right">
                {r.count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WinLossBreakdown({ data }: { data: WinLossByReason }) {
  if (data.totalWon === 0 && data.totalLost === 0) {
    return (
      <Section title="Win / loss reasons" sub="Why deals closed">
        <p className={CAPTION}>No closed deals yet.</p>
      </Section>
    );
  }
  return (
    <Section title="Win / loss reasons" sub="Why deals were won or lost">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <ReasonColumn heading="Won" total={data.totalWon} rows={data.won} />
        <ReasonColumn heading="Lost" total={data.totalLost} rows={data.lost} />
      </div>
    </Section>
  );
}

// ── Public wrapper ──────────────────────────────────────────────────────────

export function AnalyticsBreakdowns({
  leadSources,
  winLoss,
}: {
  leadSources: LeadSourceRow[];
  winLoss: WinLossByReason;
}) {
  return (
    <div className={SECTION_RHYTHM}>
      <LeadSourceBreakdown rows={leadSources} />
      <WinLossBreakdown data={winLoss} />
    </div>
  );
}
