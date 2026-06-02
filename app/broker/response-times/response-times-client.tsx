'use client';

import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STAT_NUMBER, CAPTION, SECTION_LABEL } from '@/lib/typography';

// ── Types ────────────────────────────────────────────────────────────────────

export type RealtorResponseData = {
  userId: string;
  name: string;
  email: string;
  avgResponseMs: number | null;
  fastestResponseMs: number | null;
  contactedCount: number;
  waitingCount: number;
};

export type WaitingLead = {
  id: string;
  name: string;
  email: string | null;
  createdAt: string;
  ageMs: number;
  realtorName: string;
  realtorUserId: string;
};

type Props = {
  realtorData: RealtorResponseData[];
  waitingLeads: WaitingLead[];
  teamAvgMs: number | null;
  totalContacted: number;
  totalWaiting: number;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const ONE_HOUR = 3_600_000;
const FOUR_HOURS = 4 * ONE_HOUR;
const TWENTY_FOUR_HOURS = 24 * ONE_HOUR;

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < ONE_HOUR) return `${Math.round(ms / 60_000)}m`;
  if (ms < TWENTY_FOUR_HOURS) {
    const hrs = Math.floor(ms / ONE_HOUR);
    const mins = Math.round((ms % ONE_HOUR) / 60_000);
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }
  const days = Math.floor(ms / TWENTY_FOUR_HOURS);
  const hrs = Math.round((ms % TWENTY_FOUR_HOURS) / ONE_HOUR);
  return hrs > 0 ? `${days}d ${hrs}h` : `${days}d`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < ONE_HOUR) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < TWENTY_FOUR_HOURS) return `${Math.floor(diff / ONE_HOUR)}h ago`;
  const days = Math.floor(diff / TWENTY_FOUR_HOURS);
  return `${days}d ago`;
}

function urgencyLevel(ageMs: number): 'red' | 'amber' | 'normal' {
  if (ageMs > TWENTY_FOUR_HOURS) return 'red';
  if (ageMs > FOUR_HOURS) return 'amber';
  return 'normal';
}

function getBarWidth(value: number | null, maxValue: number): number {
  if (value === null || maxValue === 0) return 0;
  return Math.min(100, Math.max(4, (value / maxValue) * 100));
}

// ── Component ────────────────────────────────────────────────────────────────

export function ResponseTimesClient({
  realtorData,
  waitingLeads,
  teamAvgMs,
  totalContacted,
  totalWaiting,
}: Props) {
  const maxAvg = Math.max(
    ...realtorData.map((r) => r.avgResponseMs ?? 0),
    1,
  );

  return (
    <div className="space-y-6">
      {/* ── Summary — hairline stat grid (printed-paper vocabulary) ── */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-xl overflow-hidden border border-border/60 bg-border/60">
        <div className="bg-background px-4 py-4">
          <p className={cn(STAT_NUMBER)}>
            {teamAvgMs !== null ? formatDuration(teamAvgMs) : '—'}
          </p>
          <p className={cn(CAPTION, 'mt-1')}>Team avg response</p>
        </div>
        <div className="bg-background px-4 py-4">
          <p className={cn(STAT_NUMBER)}>{totalContacted}</p>
          <p className={cn(CAPTION, 'mt-1')}>Leads contacted</p>
        </div>
        <div className="bg-background px-4 py-4">
          <p className={cn(STAT_NUMBER)}>{totalWaiting}</p>
          <p className={cn(CAPTION, 'mt-1')}>Waiting for contact</p>
        </div>
        <div className="bg-background px-4 py-4">
          <p className={cn(STAT_NUMBER)}>{realtorData.length}</p>
          <p className={cn(CAPTION, 'mt-1')}>Realtors</p>
        </div>
      </section>

      {/* ── Leads waiting for contact ─────────────────────────── */}
      {waitingLeads.length > 0 && (
        <section className="space-y-3">
          <p className={cn(SECTION_LABEL)}>
            Waiting for contact
            <span className="ml-2 normal-case tracking-normal text-muted-foreground/70">
              {waitingLeads.length}
            </span>
          </p>
          <ul className="divide-y divide-border/60 border-y border-border/60 max-h-[400px] overflow-y-auto">
            {waitingLeads.map((lead) => {
              const urgency = urgencyLevel(lead.ageMs);
              const waitTone =
                urgency === 'red'
                  ? 'text-rose-700 dark:text-rose-400'
                  : urgency === 'amber'
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-muted-foreground';
              return (
                <li
                  key={lead.id}
                  className="flex items-center gap-3 py-3 hover:bg-foreground/[0.04] transition-colors -mx-2 px-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{lead.name}</p>
                    {lead.email && (
                      <p className="text-xs text-muted-foreground truncate">{lead.email}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-xs font-medium ${waitTone}`}>
                      Waiting {formatDuration(lead.ageMs)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Assigned to {lead.realtorName}
                    </p>
                  </div>
                  {urgency === 'red' && (
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-rose-700 bg-rose-50 dark:text-rose-400 dark:bg-rose-500/15 flex-shrink-0">
                      Overdue
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Per-realtor stats with bar chart ──────────────────── */}
      <section className="space-y-4">
        <p className={cn(SECTION_LABEL)}>Response time by realtor</p>

        {realtorData.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
            <p className="text-sm text-foreground">No realtors on the team yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Invite realtors and their response times will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {realtorData.map((realtor) => {
              const tier =
                realtor.avgResponseMs !== null && realtor.avgResponseMs > TWENTY_FOUR_HOURS
                  ? 'red'
                  : realtor.avgResponseMs !== null && realtor.avgResponseMs > FOUR_HOURS
                    ? 'amber'
                    : 'normal';
              return (
                <div key={realtor.userId} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-medium text-xs flex-shrink-0">
                        {realtor.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{realtor.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {realtor.contactedCount} contacted
                          {realtor.waitingCount > 0 && (
                            <span className="text-amber-700 dark:text-amber-400">
                              {' '}&middot; {realtor.waitingCount} waiting
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-medium tabular-nums">
                        {realtor.avgResponseMs !== null
                          ? formatDuration(realtor.avgResponseMs)
                          : '—'}
                      </p>
                      {realtor.fastestResponseMs !== null && (
                        <p className="text-[11px] text-muted-foreground flex items-center gap-0.5 justify-end">
                          <Zap size={10} className="text-muted-foreground" />
                          {formatDuration(realtor.fastestResponseMs)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Bar — tier color carries meaning (response speed). */}
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        tier === 'red'
                          ? 'bg-rose-500'
                          : tier === 'amber'
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                      }`}
                      style={{
                        width: `${getBarWidth(realtor.avgResponseMs, maxAvg)}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 pt-3 border-t border-border/60">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            Under 4h
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            4–24h
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            Over 24h
          </div>
        </div>
      </section>
    </div>
  );
}
