'use client';

/**
 * DailyBrief — the 7am focal surface.
 *
 * Reads from /api/agent/briefing on mount, renders the headline + cards +
 * (Phase B) momentum/tomorrow lines, fires a 'seen' PATCH the first time
 * the realtor lays eyes on it. Tapping a card fires 'acted' before the
 * navigation.
 *
 * Visual language: paper-flat. Title serif on the headline. Hairline
 * borders between cards. No shadows, no icons, no emoji. Verb at the
 * right of each card is the only loud element below the headline.
 *
 * Empty state (no signals above the confidence floor) collapses to one
 * sentence — Chippi offering an invitation rather than padding the
 * surface with filler.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { BODY_MUTED, TITLE_FONT, PRIMARY_PILL, GHOST_PILL, SECTION_LABEL } from '@/lib/typography';
import { FOCUS_CARD_MAX } from '@/lib/geometry';
import type { Brief, BriefCard, SignalKind } from '@/lib/briefing/types';

interface Props {
  slug: string;
  /** When set, render this brief directly instead of fetching. Used for
   *  preview surfaces (settings page mock) and tests. */
  initialBrief?: Brief;
}

interface ApiResponse {
  id: string | null;
  status: 'pending' | 'seen' | 'acted' | 'failed';
  brief: Brief;
  createdAt: string;
  seenAt: string | null;
  actedAt: string | null;
}

const ACTION_LABEL: Record<SignalKind, string> = {
  reply: 'REPLY',
  call: 'CALL',
  prep: 'PREP',
  review: 'REVIEW',
  sign: 'SIGN',
  celebrate: 'NOTED',
};

const VERB: Record<SignalKind, string> = {
  reply: 'Open',
  call: 'Call',
  prep: 'Open',
  review: 'Open',
  sign: 'Open',
  celebrate: 'Open',
};

function deepLink(slug: string, href: string): string {
  if (href.startsWith('http')) return href;
  return `/s/${slug}${href}`;
}

function formatBriefTime(iso: string): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function DailyBrief({ slug, initialBrief }: Props) {
  const [data, setData] = useState<ApiResponse | null>(
    initialBrief
      ? {
          id: null,
          status: 'pending',
          brief: initialBrief,
          createdAt: new Date().toISOString(),
          seenAt: null,
          actedAt: null,
        }
      : null,
  );
  const [loading, setLoading] = useState(!initialBrief);

  useEffect(() => {
    if (initialBrief) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/agent/briefing');
        if (!res.ok) {
          if (!cancelled) setLoading(false);
          return;
        }
        const json = (await res.json()) as ApiResponse;
        if (!cancelled) {
          setData(json);
          setLoading(false);
          // Fire 'seen' on first render — best-effort, never blocks UI.
          if (json.status === 'pending') {
            void fetch('/api/agent/briefing', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ event: 'seen' }),
            }).catch(() => {});
          }
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialBrief]);

  function recordActed() {
    void fetch('/api/agent/briefing', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'acted' }),
    }).catch(() => {});
  }

  if (loading) {
    return (
      <div className={cn(FOCUS_CARD_MAX, 'mx-auto rounded-lg border border-border/70 bg-card p-6')}>
        <p className={cn(BODY_MUTED, 'mb-4')}>Looking at your day.</p>
        <div className="space-y-2 animate-pulse">
          <div className="h-3 w-full rounded bg-muted/40" />
          <div className="h-3 w-5/6 rounded bg-muted/40" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { brief, createdAt } = data;
  const time = formatBriefTime(createdAt);
  const date = new Date(createdAt).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <div className={cn(FOCUS_CARD_MAX, 'mx-auto')}>
      <div className="flex items-baseline justify-between mb-4">
        <span className={SECTION_LABEL}>Today&apos;s brief</span>
        <span className={cn(SECTION_LABEL, 'tabular-nums')}>
          {time} &middot; {date}
        </span>
      </div>

      {brief.emptyState ? (
        <div className="rounded-lg border border-border/70 bg-card px-6 py-10">
          <h1
            className="text-[28px] leading-tight tracking-tight text-foreground"
            style={TITLE_FONT}
          >
            {brief.headline}
          </h1>
          <p className={cn(BODY_MUTED, 'mt-3 max-w-md')}>{brief.emptyState.invitation}</p>
          <div className="mt-6">
            <Link
              href={`/s/${slug}/chippi`}
              onClick={recordActed}
              className={cn(PRIMARY_PILL)}
            >
              Tell Chippi
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border/70 bg-card px-6 pt-6 pb-2">
            <h1
              className="text-[28px] leading-snug tracking-tight text-foreground"
              style={TITLE_FONT}
            >
              {brief.headline}
            </h1>
            {brief.subheadline && (
              <p className={cn(BODY_MUTED, 'mt-2')}>{brief.subheadline}</p>
            )}

            <ul className="mt-6 divide-y divide-border/60">
              {brief.cards.map((card, idx) => (
                <BriefCardRow key={`${card.subject.id}-${idx}`} slug={slug} card={card} onAct={recordActed} />
              ))}
            </ul>
          </div>

          {(brief.momentum || brief.tomorrow) && (
            <div className="mt-6 px-6 space-y-1.5">
              {brief.momentum && <p className={BODY_MUTED}>{brief.momentum}</p>}
              {brief.tomorrow && <p className={BODY_MUTED}>{brief.tomorrow}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BriefCardRow({
  slug,
  card,
  onAct,
}: {
  slug: string;
  card: BriefCard;
  onAct: () => void;
}) {
  const tag = ACTION_LABEL[card.kind];
  const verb = VERB[card.kind];
  const href = deepLink(slug, card.draftedAction?.kind === 'open' ? card.draftedAction.href : card.subject.href);

  return (
    <li className="flex items-start gap-6 py-4">
      <span className={cn(SECTION_LABEL, 'pt-0.5 w-14 shrink-0 tabular-nums')}>{tag}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{card.subject.name}</p>
        <p className={cn(BODY_MUTED, 'mt-0.5')}>{card.evidence}</p>
      </div>
      <Link
        href={href}
        onClick={onAct}
        className={cn(GHOST_PILL, 'shrink-0')}
      >
        {verb}
      </Link>
    </li>
  );
}
