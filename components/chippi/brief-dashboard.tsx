'use client';

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  CalendarDays,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CHIPPI_PILL, SECTION_LABEL } from '@/lib/typography';
import { formatCompact, pluralize } from '@/lib/formatting';
import { stageWorkDraftHandoff } from '@/lib/chippi/work-draft-handoff';
import type { BriefDashboard as DashboardData } from '@/lib/briefing/dashboard';
import type { BriefCard } from '@/lib/briefing/types';

interface Props {
  slug: string;
  data: DashboardData;
}

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
  return date
    .toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: date.getMinutes() === 0 ? undefined : '2-digit',
    })
    .replace(' ', '')
    .toLowerCase();
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
  return Math.max(
    0,
    Math.floor((localDayKey(now) - localDayKey(date)) / 86_400_000),
  );
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
    data.needsYou.pendingDrafts +
    (data.needsYou.failedActions ?? 0);
  const isEmpty =
    (data.unavailable?.length ?? 0) === 0 &&
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
    data.brief.headline.trim() ||
    data.brief.emptyState?.invitation.trim() ||
    fallbackStatus;
  // The ranked brief and the independent needs-you queries can diverge when
  // one source is unavailable. Never let the composer's generic "Quiet
  // morning" hide real review work or verified overnight activity.
  const primaryStatus = data.unavailable?.length
    ? 'Some workspace data could not be loaded. Refresh to check your day.'
    : rankedMoves.length === 0 &&
        (waitingTotal > 0 || (data.overnight?.total ?? 0) > 0)
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
  const model = buildBriefDashboardViewModel(slug, data);
  const base = `/s/${slug}`;
  const missing = new Set(data.unavailable ?? []);
  const counts = [
    {
      key: 'failedActions',
      count: data.needsYou.failedActions ?? 0,
      label: 'recent failed or interrupted actions',
      href: '/chippi/activity',
    },
    {
      key: 'clientsWaiting',
      count: data.needsYou.clientsWaiting,
      label: 'conversations with unread replies',
      href: '/inbox',
    },
    {
      key: 'pendingDrafts',
      count: data.needsYou.pendingDrafts,
      label: 'drafts awaiting your decision',
      href: '/chippi/inbox',
    },
    {
      key: 'newLeads',
      count: data.needsYou.newLeads,
      label: 'new leads to contact',
      href: '/leads',
    },
    {
      key: 'followUpsDue',
      count: data.needsYou.followUpsDue,
      label: 'follow-ups due',
      href: '/follow-ups',
    },
  ].filter((item) => item.count > 0 && !missing.has(item.key as never));
  return (
    <div
      className="mx-auto max-w-6xl space-y-8 pb-8"
      data-brief-dashboard="today"
    >
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
        <div>
          <TodayDate />
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Today
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Your next moves, in one place.
          </p>
        </div>
        <Link
          href={`${base}/automations/settings`}
          className="inline-flex min-h-10 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          How Chippi works <ArrowUpRight size={14} />
        </Link>
      </header>
      {missing.size > 0 && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm"
        >
          <AlertCircle size={18} className="shrink-0" />
          <p className="min-w-0 flex-1">
            Some workspace data is unavailable. Your day may have more work than
            shown here.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="min-h-10 font-medium text-brand"
          >
            Refresh
          </button>
        </div>
      )}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.8fr)_minmax(16rem,1fr)] lg:gap-12">
        <div className="min-w-0 space-y-9">
          <section id="needs-you" aria-labelledby="needs-you-heading">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="needs-you-heading" className="text-lg font-semibold">
                Needs you
              </h2>
              <Link
                href={`${base}/chippi/inbox`}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                View all
              </Link>
            </div>
            {model.rankedMoves.length > 0 && (
              <ul className="divide-y divide-border">
                {model.rankedMoves.slice(0, 4).map((card, index) => (
                  <li key={`${card.subject.id}-${card.kind}-${index}`}>
                    <Link
                      className="group flex items-center gap-4 py-4"
                      href={deepLink(
                        slug,
                        card.draftedAction?.kind === 'open'
                          ? card.draftedAction.href
                          : card.subject.href,
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium group-hover:text-brand">
                          {card.subject.name}
                        </span>
                        <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                          {card.evidence}
                        </span>
                      </span>
                      <ArrowUpRight
                        size={16}
                        className="shrink-0 text-muted-foreground"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {counts.length > 0 && (
              <ul className="divide-y divide-border">
                {counts.map((item) => (
                  <li key={item.key}>
                    <Link
                      href={`${base}${item.href}`}
                      className="flex min-h-14 items-center justify-between gap-4 py-3 text-sm hover:text-brand"
                    >
                      <span>
                        <span className="font-semibold">{item.count}</span>{' '}
                        {item.label}
                      </span>
                      <ArrowUpRight size={15} className="shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {counts.length === 0 && model.rankedMoves.length === 0 && (
              <p className="py-4 text-sm leading-relaxed text-muted-foreground">
                {missing.size
                  ? 'Refresh to check what needs attention.'
                  : 'No items need your attention in the data checked.'}
              </p>
            )}
          </section>
          <section
            aria-labelledby="completed-heading"
            className="border-t border-border pt-7"
            data-verified-activity
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="completed-heading" className="text-lg font-semibold">
                Work completed
              </h2>
              <Link
                href={`${base}/chippi/activity`}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Activity <span aria-hidden>↗</span>
              </Link>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Recorded actions in the last 12 hours
            </p>
            {missing.has('overnight') ? (
              <p className="py-5 text-sm text-muted-foreground">
                Activity could not be loaded.
              </p>
            ) : data.overnight?.total ? (
              <ul className="mt-3 divide-y divide-border">
                {data.overnight.buckets.map((bucket) => (
                  <li
                    key={bucket.label}
                    className="flex items-center gap-3 py-4"
                  >
                    <CheckCircle2
                      size={18}
                      className="shrink-0 text-emerald-600 dark:text-emerald-400"
                    />
                    <span className="text-sm">
                      <strong className="font-semibold">{bucket.count}</strong>{' '}
                      {bucket.label}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="py-5 text-sm leading-relaxed text-muted-foreground">
                No completed actions recorded in this window.{' '}
                <Link
                  className="text-brand hover:underline"
                  href={`${base}/automations`}
                >
                  Set up work for Chippi
                </Link>
                .
              </div>
            )}
          </section>
          <WorkTaskEntry slug={slug} data={data} />
        </div>
        <aside className="min-w-0 space-y-7 border-t border-border pt-7 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
          <section aria-labelledby="tours-heading">
            <div className="flex items-center justify-between">
              <h2 id="tours-heading" className="text-base font-semibold">
                Upcoming tours
              </h2>
              <CalendarDays size={17} className="text-muted-foreground" />
            </div>
            {missing.has('tours') ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Calendar could not be loaded.
              </p>
            ) : data.tours.length ? (
              <ul className="mt-3 divide-y divide-border">
                {data.tours.map((tour) => (
                  <li key={tour.id}>
                    <Link
                      href={deepLink(slug, tour.href)}
                      className="block py-4"
                    >
                      <p className="text-sm font-medium">
                        <LocalEventTime iso={tour.startsAt} />
                      </p>
                      <p className="mt-2 text-sm font-medium">
                        {tour.guestName ?? 'Showing'}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {tour.propertyAddress ?? 'View appointment details'}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                No upcoming tours in today’s calendar.
              </p>
            )}
            <Link
              href={`${base}/calendar`}
              className="mt-4 inline-flex min-h-10 items-center text-sm text-brand"
            >
              View calendar →
            </Link>
          </section>
          {data.pipeline && !missing.has('pipeline') && (
            <section className="border-t border-border pt-6">
              <h2 className="text-base font-semibold">Deals to watch</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                {data.pipeline.closingThisWeek} closing this week ·{' '}
                {data.pipeline.atRisk} at risk
              </p>
              <Link
                href={`${base}/deals`}
                className="mt-3 inline-flex min-h-10 items-center text-sm text-brand"
              >
                Open deals →
              </Link>
            </section>
          )}
          <section className="rounded-lg bg-muted/50 p-5">
            <h2 className="text-sm font-semibold">Put Chippi to work</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Connect your inbox and calendar, then set the work Chippi should
              handle for you.
            </p>
            <Link
              href={`${base}/chippi/integrations`}
              className="mt-3 inline-flex min-h-10 items-center text-sm font-medium text-brand"
            >
              Manage connections →
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

function WorkTaskEntry({ slug, data }: { slug: string; data: DashboardData }) {
  const examples = useMemo(() => buildGroundedWorkExamples(data), [data]);
  const [exampleIndex, setExampleIndex] = useState(0);
  const [task, setTask] = useState('');
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const launchTimer = useRef<number | null>(null);

  useEffect(() => {
    if (examples.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const interval = window.setInterval(() => {
      setExampleIndex((current) => (current + 1) % examples.length);
    }, 5200);
    return () => window.clearInterval(interval);
  }, [examples]);

  useEffect(
    () => () => {
      if (launchTimer.current !== null)
        window.clearTimeout(launchTimer.current);
    },
    [],
  );

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
      setHandoffError(
        'Could not start that task. Your text is still here. Try again.',
      );
      return;
    }
    setLaunching(true);
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    launchTimer.current = window.setTimeout(
      () => window.location.assign(`/s/${slug}/chippi`),
      reducedMotion ? 0 : 100,
    );
  }

  if (launching)
    return (
      <p role="status" className="py-5 text-sm text-muted-foreground">
        Opening Chippi to start your task…
      </p>
    );

  return (
    <form onSubmit={submit} className="mt-7" data-work-entry="today">
      <div className="flex flex-col gap-2 rounded-2xl border border-border/80 bg-background/90 p-2 shadow-[0_8px_28px_-24px_rgba(17,17,19,0.5)] transition-[border-color,box-shadow] focus-within:border-ring/60 focus-within:ring-2 focus-within:ring-ring/25 sm:flex-row sm:items-center">
        <label htmlFor="today-work-goal" className="sr-only">
          Work goal for Chippi
        </label>
        <input
          id="today-work-goal"
          value={task}
          onChange={(event) => setTask(event.target.value)}
          placeholder="Tell Chippi what to handle next…"
          className="h-11 min-w-0 flex-1 bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/75"
          autoComplete="off"
          maxLength={5000}
          aria-describedby={handoffError ? 'today-work-goal-error' : undefined}
        />
        <button
          type="submit"
          disabled={task.trim().length < 3}
          className={cn(
            CHIPPI_PILL,
            'h-11 shrink-0 justify-center px-5 disabled:cursor-not-allowed disabled:opacity-45',
          )}
        >
          Start work
          <ArrowRight aria-hidden className="size-3.5" />
        </button>
      </div>
      {handoffError && (
        <p
          id="today-work-goal-error"
          role="alert"
          className="mt-2 px-1 text-xs text-destructive"
        >
          {handoffError}
        </p>
      )}
      <div className="mt-2 flex flex-col gap-1.5 px-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Chippi executes your task and reports the result. Exceptions come to
          you.
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
    <p
      className={cn(SECTION_LABEL, 'normal-case tracking-normal')}
      aria-hidden={!label}
    >
      {label || '\u00a0'}
    </p>
  );
}
