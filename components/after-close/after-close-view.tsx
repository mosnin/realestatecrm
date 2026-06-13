'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { H1, TITLE_FONT, SECTION_LABEL } from '@/lib/typography';
import { StaggerList, StaggerItem } from '@/components/motion/stagger-list';

export type RelationshipStageTag = 'past_client' | 'referral_target' | 'dormant';

export interface RelationshipRow {
  id: string;
  name: string;
  stage: RelationshipStageTag;
  lastClosedAt: string | null;
  lastContactedAt: string | null;
  nextTouchAt: string | null;
  referralAskedAt: string | null;
  /** Days until the next closing anniversary (null when no close date). */
  anniversaryDays: number | null;
  /** True when the anniversary is inside the upcoming window. */
  anniversaryDue: boolean;
}

interface Props {
  slug: string;
  rows: RelationshipRow[];
}

// ── Small helpers ────────────────────────────────────────────────────────────

function relativeDays(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  const a = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const b = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const days = Math.round((a - b) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

function futureDays(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  const a = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const b = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const days = Math.round((b - a) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'due';
  if (days === 1) return 'tomorrow';
  if (days < 30) return `in ${days}d`;
  return `in ${Math.round(days / 30)}mo`;
}

function anniversaryPhrase(days: number | null): string {
  if (days === null) return 'anniversary';
  if (days === 0) return 'anniversary today';
  if (days === 1) return 'anniversary tomorrow';
  return `anniversary in ${days}d`;
}

// Status pill — the sanctioned tone palette from STYLESHEET. At most one per row.
function Pill({ tone, children }: { tone: 'due' | 'quiet'; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex text-xs font-medium rounded-full px-2.5 py-0.5 whitespace-nowrap',
        tone === 'due'
          ? 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15'
          : 'text-muted-foreground bg-muted',
      )}
    >
      {children}
    </span>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────────

function Row({ slug, row }: { slug: string; row: RelationshipRow }) {
  const lastTouch = relativeDays(row.lastContactedAt);
  const nextTouch = futureDays(row.nextTouchAt);

  return (
    <StaggerItem className="flex items-center gap-3 px-4 py-3">
      <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 bg-muted text-muted-foreground">
        {row.name.charAt(0).toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Link
            href={`/s/${slug}/contacts/${row.id}`}
            className="text-sm font-medium text-foreground hover:text-muted-foreground transition-colors truncate"
          >
            {row.name}
          </Link>
          {row.stage === 'past_client' && row.anniversaryDue && (
            <Pill tone="due">{anniversaryPhrase(row.anniversaryDays)}</Pill>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {lastTouch ? `last reached ${lastTouch}` : 'not reached yet'}
          </span>
          {nextTouch && (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              next touch {nextTouch}
            </span>
          )}
        </div>
      </div>
    </StaggerItem>
  );
}

// ── Section ──────────────────────────────────────────────────────────────────

function Section({
  label,
  hint,
  slug,
  rows,
}: {
  label: string;
  hint: string;
  slug: string;
  rows: RelationshipRow[];
}) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between px-1">
        <p className={SECTION_LABEL}>{label}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
      <StaggerList className="rounded-xl border border-border/70 divide-y divide-border/60 bg-card">
        {rows.map((row) => (
          <Row key={row.id} slug={slug} row={row} />
        ))}
      </StaggerList>
    </section>
  );
}

// ── View ─────────────────────────────────────────────────────────────────────

export function AfterCloseView({ slug, rows }: Props) {
  const pastClients = rows.filter((r) => r.stage === 'past_client');
  const referralTargets = rows.filter((r) => r.stage === 'referral_target');
  const dormant = rows.filter((r) => r.stage === 'dormant');

  const anniversariesDue = pastClients.filter((r) => r.anniversaryDue).length;

  const statusSentence =
    rows.length === 0
      ? 'no one in your book yet.'
      : anniversariesDue > 0
        ? `${anniversariesDue} ${anniversariesDue === 1 ? 'anniversary' : 'anniversaries'} coming up.`
        : `${rows.length} ${rows.length === 1 ? 'person' : 'people'} to keep close.`;

  return (
    <div className="space-y-6 max-w-4xl pb-12">
      <header className="space-y-1.5">
        <p className="text-sm text-muted-foreground">Relationships.</p>
        <h1 className={H1} style={TITLE_FONT}>
          The people you already won
        </h1>
        <p className="text-sm text-muted-foreground">{statusSentence}</p>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
          <p className="text-sm text-foreground">No past clients yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            When you close a deal, the people on it land here so Chippi can keep them warm.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          <Section
            label="Past clients"
            hint="anniversaries, last contact, next touch"
            slug={slug}
            rows={pastClients}
          />
          <Section
            label="Referral targets"
            hint="people worth asking"
            slug={slug}
            rows={referralTargets}
          />
          <Section
            label="Dormant"
            hint="gone quiet, worth a re-engage"
            slug={slug}
            rows={dormant}
          />
        </div>
      )}
    </div>
  );
}
