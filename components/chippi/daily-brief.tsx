'use client';

/**
 * DailyBrief — the 7am focal surface.
 *
 * Lives in three states (see use-brief-lifecycle.ts):
 *
 *   live     full brief is the focal element of the workspace
 *   settled  collapses to a one-line receipt above the composer
 *   carried  same-day return visit, same as settled
 *
 * Reads from /api/agent/briefing on mount. Fires 'seen' PATCH the first
 * time it renders, 'acted' the first time a card is tapped. Auto-
 * collapses 60 seconds after 'seen'; manual Open re-expands.
 *
 * Visual language: paper-flat, title-serif headline, hairline card
 * borders, no shadows, no icons inside cards, no emoji. The verb
 * pill at the right of each card is the only loud element below
 * the headline. Mobile stacks the tag above the content + pushes the
 * action button to a second row so the surface holds at 320–414px.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { BODY_MUTED, TITLE_FONT, PRIMARY_PILL, GHOST_PILL, SECTION_LABEL } from '@/lib/typography';
import { FOCUS_CARD_MAX } from '@/lib/geometry';
import type { Brief, BriefCard, SignalKind, SignalSource } from '@/lib/briefing/types';
import {
  useBriefLifecycle,
  formatProgress,
  formatLastOpened,
} from './use-brief-lifecycle';

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
  showIntro: boolean;
}

// The verb tag on each card. Realtor's vocabulary — "WIN" not "NOTED",
// because "noted" is product-internal and a fresh realtor has to translate
// it. A closing is a win; the brief calls it a win.
const ACTION_LABEL: Record<SignalKind, string> = {
  reply: 'REPLY',
  call: 'CALL',
  prep: 'PREP',
  review: 'REVIEW',
  sign: 'SIGN',
  celebrate: 'WIN',
  tip: 'TIP',
};

const VERB: Record<SignalKind, string> = {
  reply: 'Open',
  call: 'Call',
  prep: 'Open',
  review: 'Open',
  sign: 'Open',
  celebrate: 'Open',
  tip: 'Open',
};

/** Loading status that swaps in at 1.2s — calmer than a spinner. */
const SLOW_STATUS_MS = 1200;
const TIMEOUT_FALLBACK_MS = 4000;

function deepLink(slug: string, href: string): string {
  if (href.startsWith('http')) return href;
  return `/s/${slug}${href}`;
}

/** "Wed · May 28" below sm, full weekday at sm+. */
function formatBriefDate(iso: string, compact: boolean): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';
  if (compact) {
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
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
          showIntro: false,
        }
      : null,
  );
  const [loading, setLoading] = useState(!initialBrief);
  const [slow, setSlow] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [errored, setErrored] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [forceExpanded, setForceExpanded] = useState(false);
  const [showYesterday, setShowYesterday] = useState(false);

  useEffect(() => {
    if (initialBrief) return;
    let cancelled = false;
    setErrored(false);
    setSlow(false);
    setTimedOut(false);
    setLoading(true);
    const slowTimer = setTimeout(() => !cancelled && setSlow(true), SLOW_STATUS_MS);
    const timeoutTimer = setTimeout(() => !cancelled && setTimedOut(true), TIMEOUT_FALLBACK_MS);

    (async () => {
      try {
        const res = await fetch('/api/agent/briefing');
        if (!res.ok) {
          // Don't fail silently — surface a calm error with Try again.
          // The original silent return null left the realtor with a
          // blank space where the brief should be, no recovery path.
          if (!cancelled) {
            setErrored(true);
            setLoading(false);
          }
          return;
        }
        const json = (await res.json()) as ApiResponse;
        if (!cancelled) {
          setData(json);
          setLoading(false);
          setTimedOut(false);
          // Fire 'seen' on first render — best-effort, never blocks UI.
          if (json.status === 'pending') {
            void fetch('/api/agent/briefing', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ event: 'seen' }),
            }).catch(() => {});
            // Optimistically reflect the new state so the lifecycle hook
            // starts ticking from this exact moment, not from a later
            // refetch that we never do.
            setData((prev) =>
              prev ? { ...prev, status: 'seen', seenAt: new Date().toISOString() } : prev,
            );
          }
        }
      } catch {
        if (!cancelled) {
          setErrored(true);
          setLoading(false);
        }
      } finally {
        clearTimeout(slowTimer);
        clearTimeout(timeoutTimer);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(slowTimer);
      clearTimeout(timeoutTimer);
    };
  }, [initialBrief, retryNonce]);

  const lifecycle = useBriefLifecycle({
    status: data?.status ?? 'pending',
    seenAt: data?.seenAt ?? null,
    forceExpanded,
    forceCollapsed: false,
  });

  // Track which cards the realtor has tapped this session so the surface
  // can show a quiet "opened" marker on the cards behind the one they're
  // navigating to. The PATCH is fire-and-forget; this state is local.
  const [tappedIndices, setTappedIndices] = useState<Set<number>>(new Set());

  function recordActed(cardIndex: number, source: SignalSource, kind: SignalKind): void;
  function recordActed(): void;
  function recordActed(cardIndex?: number, source?: SignalSource, kind?: SignalKind) {
    // Body shape depends on whether this came from a card tap (B5
    // telemetry) or from the empty-state "Plan with Chippi" button
    // (which has no card identity).
    const body =
      typeof cardIndex === 'number' && source && kind
        ? { event: 'acted' as const, cardIndex, source, kind }
        : { event: 'acted' as const };
    void fetch('/api/agent/briefing', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {});

    // Q5 Feedback: a quiet toast confirms the tap registered before the
    // navigation pulls the realtor to the next surface. Without this, the
    // only signal the tap worked was the URL change — too subtle, too late.
    // The subject name is what the realtor cares about, so we lead with it.
    if (typeof cardIndex === 'number' && data) {
      const card = cardIndex < data.brief.cards.length
        ? data.brief.cards[cardIndex]
        : data.brief.tip;
      if (card) {
        const verb =
          kind === 'call' ? 'Calling' :
          kind === 'tip' ? 'Opening tip' : 'Opening';
        toast.success(`${verb} ${card.subject.name}.`);
      }
      setTappedIndices((prev) => new Set(prev).add(cardIndex));
    }

    // Optimistically flip status — the lifecycle hook collapses on next tick.
    setData((prev) =>
      prev ? { ...prev, status: 'acted', actedAt: prev.actedAt ?? new Date().toISOString() } : prev,
    );
  }

  if (loading) {
    return (
      <div className={cn(FOCUS_CARD_MAX, 'mx-auto rounded-lg border border-border/70 bg-card p-6')}>
        <p className={cn(BODY_MUTED, 'mb-4')}>{slow ? 'Reading your day…' : 'Looking at your day.'}</p>
        <div className="space-y-2 animate-pulse">
          <div className="h-3 w-full rounded bg-muted/40" />
          <div className="h-3 w-5/6 rounded bg-muted/40" />
        </div>
        {timedOut && (
          <div className="mt-4 flex items-center gap-3">
            <p className={cn(BODY_MUTED, 'text-xs')}>This is taking longer than usual.</p>
            <button
              type="button"
              onClick={() => setRetryNonce((n) => n + 1)}
              className="text-xs text-foreground underline underline-offset-2 hover:no-underline"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    );
  }

  // Explicit error surface — one calm sentence + recovery action. The
  // fetch failure used to set data to null silently and the component
  // rendered nothing; per the rubric, errors are named and recoverable.
  if (errored && !data) {
    return (
      <div className={cn(FOCUS_CARD_MAX, 'mx-auto rounded-lg border border-border/70 bg-card p-6')}>
        <p className={cn(BODY_MUTED, 'mb-3')}>I couldn&apos;t reach your brief just now.</p>
        <button
          type="button"
          onClick={() => setRetryNonce((n) => n + 1)}
          className={cn(GHOST_PILL, 'h-8 px-3 text-xs')}
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data) return null;

  // Settled / carried — render the collapsed receipt above the composer
  // and yield the screen back to the chat surface as the focal element.
  if (lifecycle === 'settled') {
    return (
      <CollapsedBrief
        data={data}
        slug={slug}
        onExpand={() => setForceExpanded(true)}
        onToggleYesterday={() => setShowYesterday((v) => !v)}
      />
    );
  }

  return (
    <LiveBrief
      data={data}
      slug={slug}
      showYesterday={showYesterday}
      tappedIndices={tappedIndices}
      onAct={recordActed}
      onToggleYesterday={() => setShowYesterday((v) => !v)}
    />
  );
}

// ── Live state ────────────────────────────────────────────────────────────────

function LiveBrief({
  data,
  slug,
  showYesterday,
  tappedIndices,
  onAct,
  onToggleYesterday,
}: {
  data: ApiResponse;
  slug: string;
  showYesterday: boolean;
  tappedIndices: Set<number>;
  onAct: (cardIndex?: number, source?: SignalSource, kind?: SignalKind) => void;
  onToggleYesterday: () => void;
}) {
  const { brief, createdAt, showIntro } = data;
  const time = formatBriefTime(createdAt);

  return (
    <div className={cn(FOCUS_CARD_MAX, 'mx-auto')}>
      <div className="flex items-baseline justify-between mb-4 gap-2">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className={SECTION_LABEL}>Today&apos;s brief</span>
          {/* Yesterday access from live state — without this, the realtor
              who expanded the brief has no way to look back. */}
          <button
            type="button"
            onClick={onToggleYesterday}
            className="text-[11px] uppercase tracking-wider text-muted-foreground
                       hover:text-foreground transition-colors"
          >
            {showYesterday ? 'Hide yesterday' : 'Yesterday'}
          </button>
        </div>
        <span className={cn(SECTION_LABEL, 'tabular-nums truncate')}>
          {time} <span className="hidden sm:inline">· {formatBriefDate(createdAt, false)}</span>
          <span className="sm:hidden">· {formatBriefDate(createdAt, true)}</span>
        </span>
      </div>

      {brief.emptyState ? (
        <>
          <div className="rounded-lg border border-border/70 bg-card px-6 py-10">
            <h1
              className="text-[24px] sm:text-[28px] leading-tight tracking-tight text-foreground"
              style={TITLE_FONT}
            >
              {brief.headline}
            </h1>
            <p className={cn(BODY_MUTED, 'mt-3 max-w-md')}>{brief.emptyState.invitation}</p>
            {showIntro && <IntroLine slug={slug} />}
            <div className="mt-6">
              <Link
                href={`/s/${slug}/chippi`}
                onClick={() => onAct()}
                className={cn(PRIMARY_PILL, 'min-h-[44px] sm:min-h-0')}
              >
                Plan with Chippi
              </Link>
            </div>
          </div>
          {(brief.momentum || brief.tomorrow) && (
            <div className="mt-6 px-6 space-y-1.5">
              {brief.momentum && <p className={BODY_MUTED}>{brief.momentum}</p>}
              {brief.tomorrow && <p className={BODY_MUTED}>{brief.tomorrow}</p>}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="rounded-lg border border-border/70 bg-card px-6 pt-6 pb-2">
            <h1
              className="text-[24px] sm:text-[28px] leading-snug tracking-tight text-foreground"
              style={TITLE_FONT}
            >
              {brief.headline}
            </h1>
            {brief.subheadline && (
              <p className={cn(BODY_MUTED, 'mt-2')}>{brief.subheadline}</p>
            )}
            {showIntro && <IntroLine slug={slug} />}

            {/* Cards list — only renders when there are actual cards. When
                cards is empty AND tip is the primary brief (headline =
                tip.subject), the headline + subheadline above already
                carry the tip's info; rendering it again as a card row
                would duplicate. */}
            {brief.cards.length > 0 && (
              <ul className="mt-6 divide-y divide-border/60">
                {brief.cards.map((card, idx) => (
                  <BriefCardRow
                    key={`${card.subject.id}-${idx}`}
                    slug={slug}
                    card={card}
                    cardIndex={idx}
                    tapped={tappedIndices.has(idx)}
                    onAct={onAct}
                  />
                ))}
                {brief.tip && (
                  <BriefCardRow
                    key={`tip-${brief.tip.subject.id}`}
                    slug={slug}
                    card={brief.tip}
                    cardIndex={brief.cards.length}
                    tapped={tappedIndices.has(brief.cards.length)}
                    onAct={onAct}
                  />
                )}
              </ul>
            )}
            {/* Tip-as-primary action — when cards is empty but a tip
                replaced the empty state, give the realtor the explicit
                CTA to open the tip's subject. */}
            {brief.cards.length === 0 && brief.tip && (
              <div className="mt-6">
                <Link
                  href={deepLink(slug, brief.tip.subject.href)}
                  onClick={() => onAct(0, brief.tip!.source, brief.tip!.kind)}
                  className={cn(PRIMARY_PILL, 'min-h-[44px] sm:min-h-0')}
                >
                  Open
                </Link>
              </div>
            )}
          </div>

          {(brief.momentum || brief.tomorrow) && (
            <div className="mt-6 px-6 space-y-1.5">
              {brief.momentum && <p className={BODY_MUTED}>{brief.momentum}</p>}
              {brief.tomorrow && <p className={BODY_MUTED}>{brief.tomorrow}</p>}
            </div>
          )}
        </>
      )}

      {showYesterday && (
        <div className="mt-8 opacity-80">
          <YesterdayBrief slug={slug} onCollapse={onToggleYesterday} />
        </div>
      )}
    </div>
  );
}

function IntroLine({ slug }: { slug: string }) {
  return (
    <p className={cn(BODY_MUTED, 'mt-3 text-xs')}>
      This is your morning brief. I&apos;ll have one ready by 7am every day.{' '}
      <Link
        href={`/s/${slug}/settings?tab=privacy#brief`}
        className="underline underline-offset-2 hover:text-foreground"
      >
        Tune it in settings →
      </Link>
    </p>
  );
}

// ── Card row — mobile stacks tag above content, button drops to a second row ──

function BriefCardRow({
  slug,
  card,
  cardIndex,
  tapped,
  onAct,
}: {
  slug: string;
  card: BriefCard;
  cardIndex: number;
  tapped: boolean;
  onAct: (cardIndex: number, source: SignalSource, kind: SignalKind) => void;
}) {
  const tag = ACTION_LABEL[card.kind];
  const verb = VERB[card.kind];
  const isTip = card.kind === 'tip';
  const href = deepLink(
    slug,
    card.draftedAction?.kind === 'open' ? card.draftedAction.href : card.subject.href,
  );

  return (
    <li className={cn('flex flex-col sm:flex-row sm:items-start sm:gap-6 py-4 gap-2', tapped && 'opacity-60')}>
      {/* Tip tag reads italic + lighter weight so it doesn't compete with
          action verbs (REPLY, CALL) for the realtor's eye. Tips are
          earned wisdom, not tasks — the visual treats them as such. */}
      <span
        className={cn(
          SECTION_LABEL,
          'sm:pt-0.5 sm:w-14 sm:shrink-0 tabular-nums',
          isTip && 'italic font-normal text-muted-foreground/80',
        )}
      >
        {tag}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{card.subject.name}</p>
        <p className={cn(BODY_MUTED, 'mt-0.5')}>{card.evidence}</p>
      </div>
      <div className="flex justify-end sm:contents">
        {tapped ? (
          /* Q8 evaluation: once tapped, the row reads as "you opened this"
             instead of presenting the same action as if untapped. */
          <span className={cn(
            'shrink-0 inline-flex items-center h-9 px-3 text-xs',
            'text-muted-foreground italic',
          )}>
            opened
          </span>
        ) : (
          <Link
            href={href}
            onClick={() => onAct(cardIndex, card.source, card.kind)}
            className={cn(GHOST_PILL, 'shrink-0 min-h-[44px] sm:min-h-0')}
          >
            {verb}
          </Link>
        )}
      </div>
    </li>
  );
}

// ── Collapsed state ──────────────────────────────────────────────────────────

function CollapsedBrief({
  data,
  slug,
  onExpand,
  onToggleYesterday,
}: {
  data: ApiResponse;
  slug: string;
  onExpand: () => void;
  onToggleYesterday: () => void;
}) {
  const { brief, seenAt, actedAt } = data;
  const progress = formatProgress(brief.cards.length, actedAt);
  const lastOpened = formatLastOpened(seenAt);

  return (
    <div className={cn(FOCUS_CARD_MAX, 'mx-auto')}>
      <div className="flex items-center justify-between gap-3 border-y border-border/60">
        {/* Whole-row clickable — padding + hover bg make the affordance
            obvious. A bare text link with no chrome reads as decoration. */}
        <button
          type="button"
          onClick={onExpand}
          className="flex items-baseline gap-3 min-w-0 flex-1 text-left
                     px-2 py-2 -mx-2 rounded-md
                     hover:bg-foreground/[0.04] transition-colors
                     focus-visible:outline-none focus-visible:ring-2
                     focus-visible:ring-foreground/20"
        >
          <span className={cn(SECTION_LABEL, 'shrink-0')}>Today&apos;s brief</span>
          <span className={cn(BODY_MUTED, 'text-xs truncate')}>
            {progress}
            {lastOpened && ` · last opened ${lastOpened}`}
          </span>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onExpand}
            className={cn(GHOST_PILL, 'h-7 px-3 text-xs')}
          >
            Open
          </button>
          <button
            type="button"
            onClick={onToggleYesterday}
            className="text-xs text-muted-foreground hover:text-foreground
                       transition-colors px-2 py-1 rounded-md
                       hover:bg-foreground/[0.04]
                       focus-visible:outline-none focus-visible:ring-2
                       focus-visible:ring-foreground/20"
          >
            Yesterday
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Yesterday's brief — one-day window, muted treatment ──────────────────────

function YesterdayBrief({ slug, onCollapse }: { slug: string; onCollapse: () => void }) {
  const [yBrief, setYBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/agent/briefing?day=yesterday');
        if (!res.ok) {
          if (!cancelled) setLoading(false);
          return;
        }
        const json = await res.json();
        if (!cancelled) {
          setYBrief(json.brief);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className={cn(FOCUS_CARD_MAX, 'mx-auto')}>
        <p className={cn(SECTION_LABEL, 'mb-2')}>Yesterday</p>
        <div className="h-3 w-2/3 rounded bg-muted/40 animate-pulse" />
      </div>
    );
  }

  if (!yBrief) {
    return (
      <div className={cn(FOCUS_CARD_MAX, 'mx-auto')}>
        <div className="flex items-baseline justify-between gap-2 mb-3">
          <p className={SECTION_LABEL}>Yesterday</p>
          <button
            type="button"
            onClick={onCollapse}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Hide
          </button>
        </div>
        <p className={BODY_MUTED}>No brief for yesterday.</p>
      </div>
    );
  }

  return (
    <div className={cn(FOCUS_CARD_MAX, 'mx-auto')}>
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <p className={SECTION_LABEL}>Yesterday</p>
        <button
          type="button"
          onClick={onCollapse}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Hide
        </button>
      </div>
      <div className="rounded-lg border border-border/40 bg-card px-6 py-5">
        <p className="text-sm text-muted-foreground">{yBrief.headline}</p>
        {yBrief.subheadline && <p className={cn(BODY_MUTED, 'mt-1 text-xs')}>{yBrief.subheadline}</p>}
      </div>
    </div>
  );
}
