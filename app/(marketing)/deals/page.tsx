/**
 * `/deals`, Pipelines. PageHero ("A pipeline that runs itself.") → how the
 * board runs (open split: self-advancing stages + plain-language log, with a
 * skeleton kanban illustration in the pastel frame) → 2×2 bento of owner
 * image slots (deals-board / deals-log / deals-forecast / deals-handoff) →
 * CTA. White canvas, Bricolage inherited, mt-24/32 air between every beat.
 */

import Link from 'next/link';
import { ArrowRight, ArrowUpRight, FileText, ImagePlus } from 'lucide-react';
import { PageHero } from '@/components/marketing/site/page-hero';
import { FadeUp, FeatureGrid, Stagger, StaggerItem, StatStrip } from '@/components/marketing/site/section';
import { ResultsStat } from '@/components/marketing/site/home/results-stat';

export const metadata = {
  title: 'Deals · Chippi',
  description:
    'A pipeline that runs itself. Stages advance as things actually happen, every move lands in a plain-language log, and the board reflects today, not last week.',
};

/* Skeleton kanban data, three columns, cards with status chips. */
const COLUMNS = [
  {
    name: 'NEW',
    cards: [
      { chip: 'Hot · scored', tone: 'bg-[#ff4b29]/10 text-[#ff4b29]' },
      { chip: 'Reply sent', tone: 'bg-emerald-100 text-emerald-700' },
    ],
  },
  {
    name: 'TOURING',
    cards: [
      { chip: 'Tour Sat 2:00', tone: 'bg-blue-100 text-blue-700' },
      { chip: 'Follow-up set', tone: 'bg-amber-100 text-amber-700' },
    ],
  },
  {
    name: 'APPLICATION',
    cards: [
      { chip: 'Docs in', tone: 'bg-emerald-100 text-emerald-700' },
      { chip: 'Approved', tone: 'bg-emerald-100 text-emerald-700' },
    ],
  },
];

/* The full stage ladder, one deal row per stage, with a status pill. */
const STAGES: {
  name: string;
  count: string;
  deal: string;
  meta: string;
  pill: string;
  tone: string;
}[] = [
  {
    name: 'New',
    count: '6',
    deal: 'Priya · 2-bed rental',
    meta: 'Landed 9m ago',
    pill: 'Scored · Hot',
    tone: 'bg-[#ff4b29]/10 text-[#ff4b29]',
  },
  {
    name: 'Contacted',
    count: '4',
    deal: 'Maya · loft downtown',
    meta: 'Reply sent',
    pill: 'Awaiting back',
    tone: 'bg-amber-100 text-amber-700',
  },
  {
    name: 'Touring',
    count: '3',
    deal: '14 Oak St · the Lees',
    meta: 'Sat 2:00',
    pill: 'Tour booked',
    tone: 'bg-blue-100 text-blue-700',
  },
  {
    name: 'Offer',
    count: '2',
    deal: 'Devon · 3-bed colonial',
    meta: 'Docs in',
    pill: 'Under review',
    tone: 'bg-indigo-100 text-indigo-700',
  },
  {
    name: 'Won',
    count: '5',
    deal: 'Sasha · garden unit',
    meta: 'Closed today',
    pill: 'Approved',
    tone: 'bg-emerald-100 text-emerald-700',
  },
];

/* What each stage means, the narrative behind the ladder, tinted-cell grid.
   No invented metrics: this describes what enters a stage and what moves it. */
const STAGE_STORY: { kicker: string; title: string; body: string }[] = [
  {
    kicker: 'New',
    title: 'A lead just landed.',
    body: 'Scored with the reason the moment it arrives, with the next action ready for Chippi to execute.',
  },
  {
    kicker: 'Contacted',
    title: 'The first reply is out.',
    body: 'Chippi sent the reply you requested. The card carries who you are waiting on and when you last reached them.',
  },
  {
    kicker: 'Touring',
    title: 'A time is on the calendar.',
    body: 'Tour proposed against your real availability and booked. Confirmations and reminders ride along automatically.',
  },
  {
    kicker: 'Offer',
    title: 'Paperwork is moving.',
    body: 'Application in, documents filed to the deal. The stage advances itself as each piece signs, nothing retyped.',
  },
  {
    kicker: 'Won',
    title: 'Closed, with the reason.',
    body: 'The deal lands in Won and the why is on the record, so the next handoff reads like a colleague briefed it.',
  },
];

/* Honest facts, no invented conversion metrics. */
const FACTS: { value: string; label: string }[] = [
  { value: '24/7', label: 'The board stays current around the clock' },
  { value: 'Logged', label: 'Every send on the record' },
  { value: 'OAuth', label: 'Email, calendar, and CRMs you already pay for' },
];

/* The 2×2 bento, owner image slots, FeaturesBento style exactly. */
const CELLS = [
  {
    slot: 'deals-board',
    title: 'The board, current.',
    sub: 'Stages advance as things happen, \nit reflects today, not last week.',
  },
  {
    slot: 'deals-log',
    title: 'Every move, logged.',
    sub: 'A plain-language history on every deal, \nthe why, not just the what.',
  },
  {
    slot: 'deals-forecast',
    title: 'The pipeline, added up.',
    sub: 'Values and dates stay in sync,\nso you see what is actually landing.',
  },
  {
    slot: 'deals-handoff',
    title: 'Handoffs with the history.',
    sub: 'The whole record rides along, \nnothing retyped, nothing lost.',
  },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
      <span aria-hidden className="text-[13px] leading-none text-[#ff4b29]">
        ✦
      </span>
      {children}
    </p>
  );
}

function ImageSlot({ name }: { name: string }) {
  return (
    <div
      data-slot={name}
      className="mt-8 flex h-64 items-center justify-center rounded-2xl bg-gradient-to-b from-[#f6f6f8] to-white ring-1 ring-black/5 sm:h-72"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <ImagePlus className="h-5 w-5 text-neutral-300" />
        <p className="text-xs text-neutral-400">
          Image placeholder, <span className="font-medium text-neutral-500">{name}</span>
        </p>
      </div>
    </div>
  );
}

/** Skeleton kanban illustration, three columns + the plain-language log. */
function PipelineSketch() {
  return (
    <div className="rounded-[36px] bg-gradient-to-br from-[#ffe3cf] via-[#ffd2b3] to-[#ffc4dd] p-5">
      <div
        className="overflow-hidden rounded-3xl shadow-xl backdrop-blur-xl"
        style={{
          background: 'rgba(255, 255, 255, 0.72)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.65)',
        }}
      >
        <div className="p-6 sm:p-8">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h3 className="text-2xl font-semibold tracking-tight text-zinc-950">Pipeline</h3>
            <span className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-2.5 py-1 text-[10px] text-neutral-700 sm:text-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Up to date
            </span>
          </div>

          {/* The board, three columns */}
          <div className="rounded-2xl bg-gradient-to-b from-white to-[#fff1e6] p-3 ring-1 ring-inset ring-black/5 sm:p-4">
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {COLUMNS.map((col) => (
                <div key={col.name}>
                  <div className="flex items-center justify-between px-1 pb-2">
                    <span className="text-[9px] tracking-widest text-neutral-500 sm:text-[10px]">
                      {col.name}
                    </span>
                    <span className="text-[9px] text-neutral-400">{col.cards.length}</span>
                  </div>
                  <div className="space-y-2">
                    {col.cards.map((card) => (
                      <div
                        key={card.chip}
                        className="rounded-xl border border-black/5 bg-white/90 p-2 shadow-sm"
                      >
                        <div className="h-1.5 w-3/4 rounded bg-neutral-900/70" />
                        <div className="mt-1.5 h-1.5 w-1/2 rounded bg-neutral-200/80" />
                        <span
                          className={`mt-2 inline-flex rounded-full px-1.5 py-0.5 text-[8px] font-medium sm:text-[9px] ${card.tone}`}
                        >
                          {card.chip}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* The log, plain language */}
          <div className="mt-4 rounded-2xl border border-black/5 bg-white/90 shadow-sm">
            <div className="flex items-center justify-between border-b border-black/5 px-3 py-2">
              <span className="text-[10px] tracking-widest text-neutral-500">CHIPPI LOG</span>
              <span className="h-2 w-2 rounded-full bg-gradient-to-r from-[#ff7a47] to-[#ff4b29]" />
            </div>
            <div className="space-y-2 p-3 text-[10px] text-neutral-600 sm:text-xs">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#ff4b29]" />
                <span>Moved Maya to Touring, tour booked for Saturday</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#ff4b29]/50" />
                <span>Marked 14 Oak St lost, chose another rental, reason logged</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The five-stage ladder, a wide skeleton board, one deal row per stage. */
function StageLadder() {
  return (
    <div className="rounded-[2rem] bg-white p-4 shadow-[0_18px_60px_-24px_rgba(20,20,40,0.12)] ring-1 ring-black/5 sm:rounded-[2.5rem] sm:p-6">
      <div className="overflow-x-auto">
        <div className="grid min-w-[680px] grid-cols-5 gap-3 sm:gap-4">
          {STAGES.map((stage, i) => (
            <div key={stage.name} className="flex flex-col">
              {/* Column head */}
              <div className="flex items-center justify-between px-1 pb-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                  {stage.name}
                </span>
                <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">
                  {stage.count}
                </span>
              </div>
              {/* Active deal card */}
              <div className="rounded-2xl border border-black/5 bg-gradient-to-b from-white to-[#fdf4ee] p-3 shadow-sm ring-1 ring-inset ring-black/5">
                <div className="flex items-center gap-2">
                  <div
                    className={`h-7 w-7 flex-shrink-0 rounded-full ${
                      i === STAGES.length - 1
                        ? 'bg-gradient-to-r from-emerald-400 to-emerald-600'
                        : 'bg-gradient-to-r from-[#ff7a47] to-[#ff4b29]'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-semibold text-zinc-950">
                      {stage.deal}
                    </div>
                    <div className="truncate text-[10px] text-neutral-500">{stage.meta}</div>
                  </div>
                </div>
                <span
                  className={`mt-2.5 inline-flex rounded-full px-2 py-0.5 text-[9px] font-medium ${stage.tone}`}
                >
                  {stage.pill}
                </span>
              </div>
              {/* Ghost rows, the stack behind */}
              <div className="mt-2 space-y-2">
                <div className="rounded-xl border border-black/5 bg-white/70 p-2.5">
                  <div className="h-1.5 w-3/4 rounded bg-neutral-200/90" />
                  <div className="mt-1.5 h-1.5 w-1/2 rounded bg-neutral-200/70" />
                </div>
                <div className="rounded-xl border border-black/5 bg-white/60 p-2.5">
                  <div className="h-1.5 w-2/3 rounded bg-neutral-200/80" />
                  <div className="mt-1.5 h-1.5 w-2/5 rounded bg-neutral-200/60" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DealsPage() {
  return (
    <>
      <PageHero
        eyebrow="Deals"
        title="A pipeline that runs itself."
        sub="Stages advance as things actually happen, and every move lands in a plain-language log. The board reflects today, not last week."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'Book a demo', href: '/demo' }}
      />

      {/* How the board runs, open split, skeleton kanban */}
      <section className="mx-auto max-w-7xl px-6">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <FadeUp>
            <Eyebrow>How it runs</Eyebrow>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              The board keeps itself honest.
            </h2>

            <div className="mt-8 border-t border-neutral-200 pt-6">
              <div className="space-y-5">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#ff4b29]/10">
                    <ArrowUpRight className="h-4 w-4 text-[#ff4b29]" />
                  </div>
                  <div>
                    <h3 className="font-medium text-zinc-950">Stages advance themselves</h3>
                    <p className="mt-1 text-sm text-neutral-600">
                      Tour booked, application in, docs signed, the card moves the
                      moment it happens, and the dates and value stay in sync.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#ff4b29]/10">
                    <FileText className="h-4 w-4 text-[#ff4b29]" />
                  </div>
                  <div>
                    <h3 className="font-medium text-zinc-950">Every move, in plain language</h3>
                    <p className="mt-1 text-sm text-neutral-600">
                      The log reads like a colleague wrote it: what moved, when, and
                      why. Won and lost reasons land on the record, not in your head.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 border-t border-neutral-200 pt-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <span className="text-2xl font-semibold tracking-tight text-zinc-950">24/7</span>
                  <p className="mt-1 text-xs text-neutral-600">
                    The board stays current around the clock
                  </p>
                </div>
                <div>
                  <span className="text-2xl font-semibold tracking-tight text-zinc-950">Logged</span>
                  <p className="mt-1 text-xs text-neutral-600">
                    Every send on the record, in your workspace
                  </p>
                </div>
              </div>
            </div>
          </FadeUp>

          <FadeUp delay={0.1}>
            <PipelineSketch />
          </FadeUp>
        </div>
      </section>

      {/* The bento, owner image slots */}
      <section className="mt-24 sm:mt-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Stagger className="grid gap-6 sm:grid-cols-2 sm:gap-8">
            {CELLS.map((cell) => (
              <StaggerItem key={cell.slot} className="h-full">
                <div className="h-full rounded-3xl bg-white p-7 shadow-[0_18px_60px_-24px_rgba(20,20,40,0.12)] ring-1 ring-black/5 sm:p-9">
                  <h3 className="text-xl font-semibold tracking-tight text-zinc-950 sm:text-2xl">
                    {cell.title}
                  </h3>
                  <p className="mt-3 whitespace-pre-line text-base leading-relaxed text-neutral-500">
                    {cell.sub}
                  </p>
                  <ImageSlot name={cell.slot} />
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* The full stage ladder, wide skeleton board + honest facts */}
      <section className="mt-24 sm:mt-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <FadeUp className="mx-auto max-w-2xl text-center">
            <Eyebrow>The stages</Eyebrow>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              New to Won, one clean ladder.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
              Five stages, every deal where it actually is. Chippi slides each
              card forward the moment the work happens, you never drag a thing.
            </p>
          </FadeUp>
          <FadeUp delay={0.1} className="mt-12">
            <StageLadder />
          </FadeUp>
          <StatStrip stats={FACTS} className="mt-8" />
        </div>
      </section>

      {/* What each stage means, narrative tinted-cell grid */}
      <section className="mt-24 sm:mt-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <FadeUp>
            <Eyebrow>Stage by stage</Eyebrow>
            <h2 className="mt-4 max-w-xl text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              What happens in each column.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-neutral-600">
              The board is not just where a deal sits, it is what Chippi did to
              get it there. Here is the work behind every move.
            </p>
          </FadeUp>
          <FeatureGrid items={STAGE_STORY} columns={3} className="mt-12" />
        </div>
      </section>

      {/* The pipeline, added up, gray stat card */}
      <div className="mt-24 sm:mt-32">
        <ResultsStat />
      </div>

      {/* CTA */}
      <section className="mt-24 px-4 sm:mt-32 sm:px-6">
        <FadeUp className="mx-auto max-w-3xl text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
            Let the board run itself.
          </h2>
          <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-neutral-600">
            Connect your inbox and calendar, Chippi keeps every deal current
            from first touch to close.
          </p>
          <div className="mt-9 flex justify-center">
            <Link
              href="/login/realtor?intent=signup"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#ff4b29] px-7 text-[15px] font-semibold text-white transition-all duration-150 hover:bg-[#e84418] active:scale-[0.98]"
            >
              Start free trial
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <p className="mt-4 text-sm text-neutral-500">
            7 days free, then $97/mo. Cancel anytime.
          </p>
        </FadeUp>
      </section>
    </>
  );
}
