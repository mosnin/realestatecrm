'use client';

/**
 * Outcome-first Today dashboard for /chippi/brief.
 *
 * The layout borrows Sicarii/Scalar's hierarchy (one atmospheric hero, one
 * focal metric, four outcomes, ranked work, verified activity) while keeping
 * Chippi's identity, routes, real CRM data, and action model. Nothing here is
 * seeded or estimated: composeBriefDashboard owns every value on first paint.
 */

import React, { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, ArrowUpRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  BODY_MUTED,
  CHIPPI_PILL,
  GHOST_PILL,
  SECTION_LABEL,
  TITLE_FONT,
} from '@/lib/typography';
import { formatCompact, pluralize } from '@/lib/formatting';
import { CHAT_STAGGER_DELAY, DURATION_FAST, EASE_OUT } from '@/lib/motion';
import { AnimatedNumber } from '@/components/motion';
import { AsciiField } from '@/components/marketing/fortitudo/ascii-field';
import { Button } from '@/components/ui/button';
import { DASHBOARD_ROW } from '@/components/ui/surface-card';
import { BriefCell, useBriefMotionEnabled } from './brief-motion';
import { stageWorkDraftHandoff } from '@/lib/chippi/work-draft-handoff';
import type { BriefDashboard as DashboardData } from '@/lib/briefing/dashboard';
import type { BriefCard, SignalKind } from '@/lib/briefing/types';

interface Props {
  slug: string;
  data: DashboardData;
}

export const TODAY_DASHBOARD_SOURCE = {
  repository: 'mosnin/Sicarii',
  commit: 'b235cdbd590ae3652e2603a2187b838a8a204b8f',
  file: 'src/components/dashboard/dashboard-overview.tsx',
} as const;

const ACTION_LABEL: Record<SignalKind, string> = {
  reply: 'Reply',
  call: 'Call',
  prep: 'Prep',
  review: 'Review',
  sign: 'Sign',
  celebrate: 'Noted',
  tip: 'Tip',
};

const RANKED_COMPACT = 3;

export interface TodayOutcomeMetric {
  label: string;
  value: number;
  sub: string;
  href: string;
}

export interface BriefDashboardViewModel {
  focal: { value: string; label: string; href: string };
  primaryStatus: string;
  supportingStatus: string[];
  waitingTotal: number;
  rankedMoves: BriefCard[];
  metrics: TodayOutcomeMetric[];
  isEmpty: boolean;
}

function deepLink(slug: string, href: string): string {
  if (href.startsWith('http')) return href;
  return `/s/${slug}${href}`;
}

function formatToday(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function formatEventTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: date.getMinutes() === 0 ? undefined : '2-digit',
  }).replace(' ', '').toLowerCase();
}

function LocalEventTime({ iso }: { iso: string }) {
  const [label, setLabel] = useState('');
  useEffect(() => setLabel(formatEventTime(iso)), [iso]);
  return <>{label || '\u00a0'}</>;
}

export function daysSince(iso: string | null, now = new Date()): number | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const localDayKey = (value: Date) =>
    Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  return Math.max(0, Math.floor((localDayKey(now) - localDayKey(date)) / 86_400_000));
}

function LocalContactAge({ iso }: { iso: string | null }) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    const since = daysSince(iso);
    setLabel(since === null ? 'no contact logged' : since === 0 ? 'touched today' : `${since}d since touch`);
  }, [iso]);
  return <>{label || '\u00a0'}</>;
}

/** Pure, behavior-testable hierarchy derived only from the server-owned data. */
export function buildBriefDashboardViewModel(
  slug: string,
  data: DashboardData,
): BriefDashboardViewModel {
  const rankedMoves = data.brief.tip
    ? [...data.brief.cards, data.brief.tip]
    : [...data.brief.cards];
  const waitingTotal =
    data.needsYou.newLeads +
    data.needsYou.followUpsDue +
    data.needsYou.clientsWaiting +
    data.needsYou.pendingDrafts;
  const isEmpty =
    waitingTotal === 0 &&
    rankedMoves.length === 0 &&
    (data.pipeline?.active ?? 0) === 0 &&
    (data.pipeline?.openValue ?? 0) === 0 &&
    (data.overnight?.total ?? 0) === 0 &&
    data.hotLeads.length === 0 &&
    data.tours.length === 0 &&
    data.reactivations.length === 0 &&
    data.topReferrers.length === 0 &&
    (data.reputation?.requested ?? 0) === 0;

  let focal: BriefDashboardViewModel['focal'];
  if (data.pipeline && data.pipeline.openValue > 0) {
    focal = {
      value: formatCompact(data.pipeline.openValue),
      label: 'open pipeline',
      href: `/s/${slug}/deals`,
    };
  } else if (rankedMoves.length > 0) {
    focal = {
      value: rankedMoves.length.toLocaleString('en-US'),
      label: pluralize(rankedMoves.length, 'ranked move'),
      href: '#needs-you',
    };
  } else if (waitingTotal > 0) {
    focal = {
      value: waitingTotal.toLocaleString('en-US'),
      label: pluralize(waitingTotal, 'item needing you', 'items needing you'),
      href: '#needs-you',
    };
  } else if (data.overnight && data.overnight.total > 0) {
    focal = {
      value: data.overnight.total.toLocaleString('en-US'),
      label: pluralize(data.overnight.total, 'verified move'),
      href: `/s/${slug}/chippi/activity`,
    };
  } else {
    focal = { value: '0', label: 'items needing you', href: '#needs-you' };
  }

  const fallbackStatus =
    waitingTotal > 0
      ? `${waitingTotal.toLocaleString('en-US')} ${pluralize(waitingTotal, 'item is', 'items are')} waiting on you.`
      : data.overnight && data.overnight.total > 0
        ? `${data.overnight.total.toLocaleString('en-US')} completed ${pluralize(data.overnight.total, 'move is', 'moves are')} ready to review.`
        : 'Nothing urgent is waiting right now.';

  const composedStatus =
    data.brief.headline.trim() || data.brief.emptyState?.invitation.trim() || fallbackStatus;
  // The ranked brief and the independent needs-you queries can diverge when
  // one source is unavailable. Never let the composer's generic "Quiet
  // morning" hide real review work or verified overnight activity.
  const primaryStatus =
    rankedMoves.length === 0 && (waitingTotal > 0 || (data.overnight?.total ?? 0) > 0)
      ? fallbackStatus
      : composedStatus;
  const supportingStatus = [
    data.brief.subheadline,
    data.brief.momentum,
    data.brief.tomorrow,
  ].filter((line): line is string => Boolean(line?.trim()));

  return {
    focal,
    primaryStatus,
    supportingStatus,
    waitingTotal,
    rankedMoves,
    isEmpty,
    metrics: [
      {
        label: 'New leads',
        value: data.needsYou.newLeads,
        sub: 'not yet contacted',
        href: `/s/${slug}/leads`,
      },
      {
        label: 'Follow-ups due',
        value: data.needsYou.followUpsDue,
        sub: 'today or overdue',
        href: `/s/${slug}/follow-ups`,
      },
      {
        label: 'Clients waiting',
        value: data.needsYou.clientsWaiting,
        sub: 'unread replies',
        href: `/s/${slug}/inbox`,
      },
      {
        label: 'Active deals',
        value: data.pipeline?.active ?? 0,
        sub:
          data.pipeline && data.pipeline.closingThisWeek > 0
            ? `${data.pipeline.closingThisWeek} closing this week`
            : 'current pipeline',
        href: `/s/${slug}/deals`,
      },
    ],
  };
}

/** Examples mention only counts/records present in this dashboard snapshot. */
export function buildGroundedWorkExamples(data: DashboardData): string[] {
  const examples: string[] = [];
  if (data.needsYou.followUpsDue > 0) {
    examples.push(
      `Work through my ${data.needsYou.followUpsDue} due ${pluralize(data.needsYou.followUpsDue, 'follow-up')} and move each one forward`,
    );
  }
  if (data.needsYou.newLeads > 0) {
    examples.push(
      `Prioritize my ${data.needsYou.newLeads} new ${pluralize(data.needsYou.newLeads, 'lead')} and contact each with a personalized first touch`,
    );
  }
  if (data.pipeline && data.pipeline.active > 0) {
    examples.push(
      `Review my ${data.pipeline.active} active ${pluralize(data.pipeline.active, 'deal')} and flag the highest-leverage next moves`,
    );
  }
  if (data.tours.length > 0) {
    examples.push(
      `Prepare me for ${data.tours.length} ${pluralize(data.tours.length, 'tour')} on today's calendar`,
    );
  }
  if (data.hotLeads.length > 0) {
    examples.push(
      `Rank my ${data.hotLeads.length} hottest ${pluralize(data.hotLeads.length, 'lead')} and build a contact plan`,
    );
  }
  if (data.reactivations.length > 0) {
    examples.push(
      data.reactivations.length === 1
        ? 'Build a reactivation plan for this past client'
        : `Build a reactivation plan for these ${data.reactivations.length} past clients`,
    );
  }
  if (examples.length === 0) {
    examples.push('Plan my day from the real priorities in my CRM');
  }
  return Array.from(new Set(examples));
}

export function BriefDashboard({ slug, data }: Props) {
  const model = useMemo(() => buildBriefDashboardViewModel(slug, data), [slug, data]);
  let index = 0;
  const delay = () => 0.04 + index++ * CHAT_STAGGER_DELAY;
  const hasSupportingPanels =
    data.tours.length > 0 ||
    data.hotLeads.length > 0 ||
    data.reactivations.length > 0 ||
    data.topReferrers.length > 0 ||
    (data.reputation?.requested ?? 0) > 0;

  return (
    <div
      className="space-y-5"
      data-brief-dashboard="today"
      data-design-source={`${TODAY_DASHBOARD_SOURCE.repository}@${TODAY_DASHBOARD_SOURCE.commit}:${TODAY_DASHBOARD_SOURCE.file}`}
    >
      <BriefCell
        span="w-full"
        delay={delay()}
        className="min-h-[31rem] overflow-hidden sm:min-h-[34rem]"
      >
        <div
          aria-hidden="true"
          data-chippi-atmosphere="ascii-field"
          className="chippi-dashboard-atmosphere pointer-events-none absolute inset-0"
        >
          <AsciiField className="h-full w-full" cell={13} speed={0.035} />
        </div>
        <Hero slug={slug} data={data} model={model} />
      </BriefCell>

      {model.isEmpty ? (
        <EmptyTodayOrientation slug={slug} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" data-outcome-grid>
            {model.metrics.map((metric) => (
              <BriefCell key={metric.label} span="h-full" delay={delay()} interactive>
                <MetricLink metric={metric} />
              </BriefCell>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.75fr)_minmax(18rem,0.8fr)]">
            <BriefCell span="min-w-0" delay={delay()}>
              <NeedsYouPanel slug={slug} data={data} rankedMoves={model.rankedMoves} />
            </BriefCell>
            <BriefCell span="min-w-0" delay={delay()}>
              <ActivityPanel slug={slug} overnight={data.overnight} />
            </BriefCell>
          </div>
        </>
      )}

      {hasSupportingPanels && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {data.tours.length > 0 && (
            <BriefCell span="min-w-0" delay={delay()}>
              <ToursPanel slug={slug} tours={data.tours} />
            </BriefCell>
          )}
          {data.hotLeads.length > 0 && (
            <BriefCell span="min-w-0" delay={delay()}>
              <HotLeadsPanel slug={slug} hotLeads={data.hotLeads} />
            </BriefCell>
          )}
          {(data.reactivations.length > 0 || data.topReferrers.length > 0) && (
            <BriefCell span="min-w-0" delay={delay()}>
              <PastClientsPanel
                slug={slug}
                reactivations={data.reactivations}
                topReferrers={data.topReferrers}
              />
            </BriefCell>
          )}
          {data.reputation && data.reputation.requested > 0 && (
            <BriefCell span="min-w-0" delay={delay()}>
              <ReputationPanel reputation={data.reputation} />
            </BriefCell>
          )}
        </div>
      )}
    </div>
  );
}

function Hero({
  slug,
  data,
  model,
}: {
  slug: string;
  data: DashboardData;
  model: BriefDashboardViewModel;
}) {
  const greeting = data.ownerName ? `Good to see you, ${data.ownerName}.` : 'Good to see you.';
  const focusHref = model.isEmpty ? `/s/${slug}/contacts` : model.focal.href;
  const focusCta = model.isEmpty
    ? 'Add a contact'
    : model.focal.href.startsWith('#')
      ? 'View priorities'
      : 'Open pipeline';

  return (
    <div className="relative z-10 flex min-h-[31rem] flex-col justify-between p-6 sm:min-h-[34rem] sm:p-9 lg:p-11">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-foreground/70">
            CHIPPI // TODAY
          </p>
          <TodayDate />
        </div>
        <h1
          className="mt-10 max-w-3xl text-[2.65rem] leading-[0.98] tracking-[-0.035em] text-foreground sm:text-[3.65rem] lg:text-[4.5rem]"
          style={TITLE_FONT}
        >
          {greeting}
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-foreground/80 sm:text-lg">
          {model.primaryStatus}
        </p>
        {model.supportingStatus.length > 0 && (
          <div className="mt-2 max-w-2xl space-y-1">
            {model.supportingStatus.map((line) => (
              <p key={line} className={BODY_MUTED}>
                {line}
              </p>
            ))}
          </div>
        )}
        <WorkTaskEntry slug={slug} data={data} />
      </div>

      <div className="mt-10 flex flex-col gap-7 border-t chippi-dashboard-divider pt-7 sm:flex-row sm:items-end sm:justify-between">
        {model.isEmpty ? (
          <div className="max-w-xl">
            <p className="text-lg font-medium text-foreground">Your workspace is ready.</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Add your first contact or connect an inbox, then Chippi can surface real priorities here.
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-baseline gap-3">
              <span
                className="text-[4rem] leading-none tracking-[-0.055em] text-foreground sm:text-[5.5rem]"
                style={TITLE_FONT}
              >
                {model.focal.value}
              </span>
              <span className="max-w-32 text-sm leading-snug text-muted-foreground">
                {model.focal.label}
              </span>
            </div>
            {data.pipeline && (
              <p className="mt-3 text-xs text-muted-foreground">
                {data.pipeline.active} active · {data.pipeline.closingThisWeek} closing this week ·{' '}
                {data.pipeline.atRisk} at risk
              </p>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Link href={focusHref} className={GHOST_PILL}>
            {focusCta}
            <ArrowUpRight aria-hidden className="size-3.5" />
          </Link>
          <Link href={`/s/${slug}/chippi`} className={CHIPPI_PILL}>
            Ask Chippi
            <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function WorkTaskEntry({ slug, data }: { slug: string; data: DashboardData }) {
  const examples = useMemo(() => buildGroundedWorkExamples(data), [data]);
  const [exampleIndex, setExampleIndex] = useState(0);
  const [task, setTask] = useState('');
  const [handoffError, setHandoffError] = useState<string | null>(null);

  useEffect(() => {
    if (examples.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const interval = window.setInterval(() => {
      setExampleIndex((current) => (current + 1) % examples.length);
    }, 5200);
    return () => window.clearInterval(interval);
  }, [examples]);

  const activeExample = examples[exampleIndex] ?? examples[0];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const outcome = task.trim();
    if (outcome.length < 3) return;
    setHandoffError(null);
    let staged = false;
    try {
      staged = stageWorkDraftHandoff(window.sessionStorage, slug, outcome);
    } catch {
      staged = false;
    }
    if (!staged) {
      setHandoffError('Chippi could not carry that goal into Work yet. Your text is still here — try again.');
      return;
    }
    window.location.assign(`/s/${slug}/chippi`);
  }

  return (
    <form onSubmit={submit} className="mt-7 max-w-3xl" data-work-entry="today">
      <div className="flex flex-col gap-2 rounded-2xl border border-border/80 bg-background/90 p-2 shadow-[0_8px_28px_-24px_rgba(17,17,19,0.5)] transition-[border-color,box-shadow] focus-within:border-ring/60 focus-within:ring-2 focus-within:ring-ring/25 sm:flex-row sm:items-center">
        <label htmlFor="today-work-goal" className="sr-only">
          Work goal for Chippi
        </label>
        <input
          id="today-work-goal"
          value={task}
          onChange={(event) => setTask(event.target.value)}
          placeholder={activeExample}
          className="h-11 min-w-0 flex-1 bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/75"
          autoComplete="off"
          maxLength={5000}
          aria-describedby={handoffError ? 'today-work-goal-error' : undefined}
        />
        <button
          type="submit"
          disabled={task.trim().length < 3}
          className={cn(CHIPPI_PILL, 'h-11 shrink-0 justify-center px-5 disabled:cursor-not-allowed disabled:opacity-45')}
        >
          Start work
          <ArrowRight aria-hidden className="size-3.5" />
        </button>
      </div>
      {handoffError && (
        <p id="today-work-goal-error" role="alert" className="mt-2 px-1 text-xs text-destructive">
          {handoffError}
        </p>
      )}
      <div className="mt-2 flex flex-col gap-1.5 px-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Opens in Work mode as a draft. You review it before sending.
        </p>
        <button
          type="button"
          onClick={() => setTask(activeExample)}
          className="max-w-full truncate text-left text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:max-w-[24rem]"
          title={activeExample}
        >
          Use example: {activeExample}
        </button>
      </div>
    </form>
  );
}

function TodayDate() {
  const [label, setLabel] = useState('');
  useEffect(() => setLabel(formatToday()), []);
  return (
    <p className={cn(SECTION_LABEL, 'normal-case tracking-normal')} aria-hidden={!label}>
      {label || '\u00a0'}
    </p>
  );
}

function EmptyTodayOrientation({ slug }: { slug: string }) {
  const actions = [
    { label: 'Add your first contact', detail: 'Give Chippi real people and context to work with.', href: `/s/${slug}/contacts` },
    { label: 'Connect your inbox', detail: 'Bring conversations and follow-ups into one place.', href: `/s/${slug}/chippi/integrations` },
    { label: 'Ask Chippi', detail: 'Start in Chat or give Work a goal.', href: `/s/${slug}/chippi` },
  ];
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-3" aria-label="Get started">
      {actions.map((action) => (
        <BriefCell key={action.label} span="h-full" interactive>
          <Link href={action.href} className="group flex min-h-40 h-full flex-col justify-between p-5 sm:p-6">
            <p className="text-sm font-medium text-foreground group-hover:underline group-hover:underline-offset-4">
              {action.label}
            </p>
            <p className="mt-8 max-w-xs text-xs leading-relaxed text-muted-foreground">{action.detail}</p>
          </Link>
        </BriefCell>
      ))}
    </section>
  );
}

function MetricLink({ metric }: { metric: TodayOutcomeMetric }) {
  return (
    <Link
      href={metric.href}
      data-outcome-metric={metric.label}
      className="group/metric flex min-h-40 h-full flex-col justify-between p-5 sm:p-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30"
    >
      <p
        className="text-[2.6rem] leading-none tracking-[-0.04em] text-foreground sm:text-[3.15rem]"
        style={TITLE_FONT}
      >
        <AnimatedNumber value={metric.value} />
      </p>
      <div className="mt-7">
        <p className="text-sm font-medium text-foreground group-hover/metric:underline group-hover/metric:underline-offset-4">
          {metric.label}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{metric.sub}</p>
      </div>
    </Link>
  );
}

function SectionHeader({
  eyebrow,
  title,
  meta,
  href,
  cta = 'View',
}: {
  eyebrow: string;
  title: string;
  meta?: ReactNode;
  href?: string;
  cta?: string;
}) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div>
        <p className={SECTION_LABEL}>{eyebrow}</p>
        <h2 className="mt-2 text-[1.65rem] leading-tight tracking-[-0.025em] text-foreground" style={TITLE_FONT}>
          {title}
        </h2>
      </div>
      <div className="shrink-0 text-xs text-muted-foreground">
        {href ? (
          <Link
            href={href}
            className="inline-flex items-center gap-1 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            {cta}
            <ArrowUpRight aria-hidden className="size-3" />
          </Link>
        ) : (
          meta
        )}
      </div>
    </header>
  );
}

function NeedsYouPanel({
  slug,
  data,
  rankedMoves,
}: {
  slug: string;
  data: DashboardData;
  rankedMoves: BriefCard[];
}) {
  const [expanded, setExpanded] = useState(false);
  const motionOn = useBriefMotionEnabled();
  const visible = rankedMoves.slice(0, RANKED_COMPACT);
  const hidden = rankedMoves.slice(RANKED_COMPACT);

  return (
    <section id="needs-you" className="p-6 sm:p-8">
      <SectionHeader
        eyebrow="Needs you"
        title="Ranked moves"
        meta={`${rankedMoves.length} ${pluralize(rankedMoves.length, 'move')}`}
      />

      {rankedMoves.length > 0 ? (
        <ol className="mt-6">
          {visible.map((card, cardIndex) => (
            <RankedMoveRow
              key={`${card.subject.id}-${card.kind}-${cardIndex}`}
              slug={slug}
              card={card}
              rank={cardIndex + 1}
            />
          ))}
          {expanded &&
            hidden.map((card, hiddenIndex) => (
              <motion.li
                key={`${card.subject.id}-${card.kind}-hidden-${hiddenIndex}`}
                initial={motionOn ? { opacity: 0, y: -4 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: DURATION_FAST,
                  ease: EASE_OUT,
                  delay: motionOn ? hiddenIndex * 0.03 : 0,
                }}
              >
                <RankedMoveLink
                  slug={slug}
                  card={card}
                  rank={RANKED_COMPACT + hiddenIndex + 1}
                />
              </motion.li>
            ))}
        </ol>
      ) : (
        <p className="mt-7 max-w-lg text-sm leading-relaxed text-muted-foreground">
          No ranked CRM move is waiting right now. New signals will appear here when they clear
          Chippi&apos;s confidence floor.
        </p>
      )}

      {hidden.length > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="mt-3 h-auto gap-1 rounded-sm p-0 text-[11px] text-muted-foreground has-[>svg]:px-0 hover:bg-transparent hover:text-foreground active:scale-100"
        >
          {expanded ? 'Show less' : `${hidden.length} more`}
          <ChevronDown
            aria-hidden
            className={cn('size-3 transition-transform duration-200', expanded && 'rotate-180')}
          />
        </Button>
      )}

      {data.needsYou.clientsWaiting > 0 && (
        <div className="mt-6 border-t chippi-dashboard-divider pt-4">
          <Link
            href={`/s/${slug}/inbox`}
            className="group/waiting flex items-baseline justify-between gap-4 rounded-xl px-2 py-2 -mx-2 transition-colors hover:bg-foreground/[0.025]"
          >
            <span className="text-sm text-foreground">
              {data.needsYou.clientsWaiting} {pluralize(data.needsYou.clientsWaiting, 'client')} waiting
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground group-hover/waiting:text-foreground">
              Open inbox
              <ArrowUpRight aria-hidden className="size-3" />
            </span>
          </Link>
        </div>
      )}
      {data.needsYou.pendingDrafts > 0 && (
        <div className="mt-2 border-t chippi-dashboard-divider pt-4">
          <Link
            href={`/s/${slug}/chippi/inbox`}
            className="group/waiting flex items-baseline justify-between gap-4 rounded-xl px-2 py-2 -mx-2 transition-colors hover:bg-foreground/[0.025]"
          >
            <span className="text-sm text-foreground">
              {data.needsYou.pendingDrafts} {pluralize(data.needsYou.pendingDrafts, 'draft')} ready for review
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground group-hover/waiting:text-foreground">
              Review drafts
              <ArrowUpRight aria-hidden className="size-3" />
            </span>
          </Link>
        </div>
      )}
    </section>
  );
}

function RankedMoveRow({ slug, card, rank }: { slug: string; card: BriefCard; rank: number }) {
  return (
    <li>
      <RankedMoveLink slug={slug} card={card} rank={rank} />
    </li>
  );
}

function RankedMoveLink({ slug, card, rank }: { slug: string; card: BriefCard; rank: number }) {
  const href = deepLink(
    slug,
    card.draftedAction?.kind === 'open' ? card.draftedAction.href : card.subject.href,
  );
  return (
    <Link href={href} className={DASHBOARD_ROW}>
      <span className="w-9 shrink-0 pt-0.5 font-mono text-xs tabular-nums text-muted-foreground/70">
        {String(rank).padStart(2, '0')}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {ACTION_LABEL[card.kind]}
          </span>
          <span className="text-sm font-medium text-foreground group-hover/row:underline group-hover/row:underline-offset-4">
            {card.subject.name}
          </span>
        </span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
          {card.evidence}
        </span>
      </span>
      <ArrowUpRight
        aria-hidden
        className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/50 transition-colors group-hover/row:text-foreground"
      />
    </Link>
  );
}

function ActivityPanel({
  slug,
  overnight,
}: {
  slug: string;
  overnight: DashboardData['overnight'];
}) {
  return (
    <section className="p-6 sm:p-8" data-verified-activity>
      <SectionHeader
        eyebrow="Chippi activity"
        title="Verified moves"
        href={`/s/${slug}/chippi/activity`}
        cta="Activity"
      />
      {overnight && overnight.buckets.length > 0 ? (
        <div className="mt-7">
          <div className="flex items-baseline gap-2">
            <span className="text-[3.8rem] leading-none tracking-[-0.05em] text-foreground" style={TITLE_FONT}>
              <AnimatedNumber value={overnight.total} />
            </span>
            <span className="text-xs text-muted-foreground">completed in 12h</span>
          </div>
          <dl className="mt-7">
            {overnight.buckets.map((bucket) => (
              <div key={bucket.label} className="flex items-baseline justify-between gap-4 border-t chippi-dashboard-divider py-3 first:border-t-0">
                <dt className="text-sm text-muted-foreground">
                  {singularize(bucket.label, bucket.count)}
                </dt>
                <dd className="font-mono text-xs tabular-nums text-foreground">{bucket.count}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <p className="mt-7 text-sm leading-relaxed text-muted-foreground">
          No completed Chippi activity has been logged in the last 12 hours.
        </p>
      )}
    </section>
  );
}

function ToursPanel({ slug, tours }: { slug: string; tours: DashboardData['tours'] }) {
  return (
    <section className="p-6 sm:p-8">
      <SectionHeader
        eyebrow="Today"
        title="Tours"
        href={`/s/${slug}/calendar`}
        cta="Calendar"
      />
      <ul className="mt-6">
        {tours.map((tour) => (
          <li key={tour.id}>
            <Link href={deepLink(slug, tour.href)} className={DASHBOARD_ROW}>
              <span className="w-14 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                <LocalEventTime iso={tour.startsAt} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground group-hover/row:underline group-hover/row:underline-offset-4">
                  {tour.guestName?.trim() || 'Tour'}
                </span>
                {tour.propertyAddress && (
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {tour.propertyAddress}
                  </span>
                )}
              </span>
              <ArrowUpRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground/50 group-hover/row:text-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HotLeadsPanel({
  slug,
  hotLeads,
}: {
  slug: string;
  hotLeads: DashboardData['hotLeads'];
}) {
  return (
    <section className="p-6 sm:p-8">
      <SectionHeader eyebrow="People" title="Hot leads" href={`/s/${slug}/leads`} cta="All leads" />
      <ul className="mt-6">
        {hotLeads.map((lead) => {
          return (
            <li key={lead.id}>
              <Link href={`/s/${slug}/contacts/${lead.id}`} className={DASHBOARD_ROW}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground group-hover/row:underline group-hover/row:underline-offset-4">
                    {lead.name}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    <LocalContactAge iso={lead.lastContactedAt} />
                  </span>
                </span>
                {typeof lead.leadScore === 'number' && (
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    score {lead.leadScore}
                  </span>
                )}
                <ArrowUpRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground/50 group-hover/row:text-foreground" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PastClientsPanel({
  slug,
  reactivations,
  topReferrers,
}: {
  slug: string;
  reactivations: DashboardData['reactivations'];
  topReferrers: DashboardData['topReferrers'];
}) {
  return (
    <section className="p-6 sm:p-8">
      <SectionHeader eyebrow="Relationships" title="Past clients" href={`/s/${slug}/contacts`} cta="People" />
      {reactivations.length > 0 && (
        <ul className="mt-6">
          {reactivations.map((reactivation) => (
            <li key={reactivation.id}>
              <Link href={`/s/${slug}/contacts/${reactivation.id}`} className={DASHBOARD_ROW}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground group-hover/row:underline group-hover/row:underline-offset-4">
                    {reactivation.name?.trim() || 'Past client'}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {reactivation.reason}
                  </span>
                </span>
                {typeof reactivation.dealValue === 'number' && reactivation.dealValue > 0 && (
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {formatCompact(reactivation.dealValue)}
                  </span>
                )}
                <ArrowUpRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground/50 group-hover/row:text-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {topReferrers.length > 0 && (
        <div className={cn('border-t chippi-dashboard-divider pt-5', reactivations.length > 0 ? 'mt-5' : 'mt-7')}>
          <p className={SECTION_LABEL}>Top referrers</p>
          <ul className="mt-2">
            {topReferrers.map((referrer) => (
              <li key={referrer.id} className="flex items-baseline justify-between gap-4 py-2">
                <Link
                  href={`/s/${slug}/contacts/${referrer.id}`}
                  className="truncate text-sm text-foreground hover:underline hover:underline-offset-4"
                >
                  {referrer.name?.trim() || 'A client'}
                </Link>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {referrer.referralCount} {pluralize(referrer.referralCount, 'referral')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ReputationPanel({
  reputation,
}: {
  reputation: NonNullable<DashboardData['reputation']>;
}) {
  return (
    <section className="p-6 sm:p-8">
      <SectionHeader eyebrow="Reputation" title="Review follow-through" />
      <div className="mt-7 grid grid-cols-2 gap-4">
        <div>
          <p className="text-[2.8rem] leading-none tracking-[-0.04em] text-foreground" style={TITLE_FONT}>
            <AnimatedNumber value={reputation.requested} />
          </p>
          <p className="mt-2 text-xs text-muted-foreground">requested in 90 days</p>
        </div>
        <div>
          <p className="text-[2.8rem] leading-none tracking-[-0.04em] text-foreground" style={TITLE_FONT}>
            <AnimatedNumber value={reputation.clicked} />
          </p>
          <p className="mt-2 text-xs text-muted-foreground">clicked through</p>
        </div>
      </div>
      <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
        {reputation.clicked > 0
          ? `${reputation.clicked} of ${reputation.requested} ${pluralize(reputation.requested, 'review request')} opened.`
          : `${reputation.requested} ${pluralize(reputation.requested, 'review request')} sent; none opened yet.`}
      </p>
    </section>
  );
}

function singularize(label: string, count: number): string {
  if (count !== 1) return label;
  const [head, ...rest] = label.split(' ');
  return head.endsWith('s') ? [head.slice(0, -1), ...rest].join(' ') : label;
}
