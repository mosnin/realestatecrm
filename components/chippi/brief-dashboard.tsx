'use client';

/**
 * BriefDashboard — the bento-grid daily dashboard rendered on /chippi/brief.
 *
 * A calm, premium "state of your day + business" surface. Every number on
 * it is real, gathered server-side by composeBriefDashboard and passed in
 * via props — there is no client fetch on mount, so the grid paints with
 * truthful numbers on first byte (no zeros that count up after a round-trip,
 * no waterfall).
 *
 * Visual language matches the rest of Chippi:
 *   - serif display numbers / greeting via TITLE_FONT (var(--font-title))
 *   - typography tokens from lib/typography (STAT_NUMBER_COMPACT, SECTION_LABEL…)
 *   - hairline borders (border-border/70), paper-flat cards (bg-card)
 *   - theme-aware (bg-background / text-foreground) — light + dark
 *   - responsive bento: 4-col grid on desktop, collapses to 1 col on mobile
 *
 * Motion (this pass): every cell fades up on a 40ms cascade and lifts a
 * hair on hover; stat numbers count up via AnimatedNumber; actionable rows
 * lean toward the realtor (arrow slides, hairline accent) as they reach for
 * them. All of it honors prefers-reduced-motion via brief-motion helpers —
 * confident, never bouncy. The numbers, links, and actions are untouched.
 *
 * The bento cells (varied col/row spans):
 *   ┌─────────────────────────────┬───────────────┐
 *   │ GREETING (date + line)      │ NEEDS YOU      │ ← 3 stat tiles inside
 *   ├───────────────┬─────────────┤ (new leads /   │
 *   │ ON DECK       │ TODAY        │  follow-ups /  │
 *   │ (action rows) │ (tours)      │  drafts)       │
 *   ├───────────────┴──────┬───────┴───────────────┤
 *   │ PIPELINE             │ HOT LEADS             │
 *   ├──────────────────────┴───────────────────────┤
 *   │ OVERNIGHT (what Chippi did, last 12h)         │
 *   └───────────────────────────────────────────────┘
 *
 * A cell renders its own calm empty state when its data is absent; it never
 * fabricates a number. Cells with no data at all (e.g. no active deals →
 * pipeline) are omitted entirely.
 */

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Users,
  CalendarClock,
  FileText,
  MessagesSquare,
  Flame,
  TrendingUp,
  ArrowUpRight,
  Sparkles,
  Check,
  ChevronDown,
  Star,
  HeartHandshake,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  TITLE_FONT,
  STAT_NUMBER_COMPACT,
  SECTION_LABEL,
  BODY,
  BODY_MUTED,
  H1,
} from '@/lib/typography';
import { formatCompact, pluralize } from '@/lib/formatting';
import { CHAT_STAGGER_DELAY, DURATION_FAST, EASE_OUT } from '@/lib/motion';
import { AnimatedNumber } from '@/components/motion/animated-number';
import { AccentBarLabel, CARD_TITLE } from '@/components/ui/surface-card';
import { BriefCell, useBriefMotionEnabled } from './brief-motion';
import type { BriefDashboard as DashboardData } from '@/lib/briefing/dashboard';
import type { BriefCard, SignalKind } from '@/lib/briefing/types';

interface Props {
  slug: string;
  data: DashboardData;
}

const ACTION_LABEL: Record<SignalKind, string> = {
  reply: 'REPLY',
  call: 'CALL',
  prep: 'PREP',
  review: 'REVIEW',
  sign: 'SIGN',
  celebrate: 'NOTED',
  tip: 'TIP',
};

/** How many On Deck rows show before the "show more" drill-down. */
const ON_DECK_COMPACT = 3;

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
  if (isNaN(date.getTime())) return '';
  const h = date.getHours();
  const m = date.getMinutes();
  const meridiem = h >= 12 ? 'p' : 'a';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${meridiem}` : `${h12}:${m.toString().padStart(2, '0')}${meridiem}`;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - d.getTime()) / 86_400_000));
}

// ── Shell ───────────────────────────────────────────────────────────────────

export function BriefDashboard({ slug, data }: Props) {
  const { brief, needsYou, pipeline, overnight, hotLeads, tours, reputation, reactivations, topReferrers } =
    data;

  const hasOnDeck = brief.cards.length > 0 || brief.tip != null;
  const hasTours = tours.length > 0;
  const hasPipeline = pipeline != null && pipeline.active > 0;
  const hasHotLeads = hotLeads.length > 0;
  const hasOvernight = overnight != null && overnight.buckets.length > 0;
  const hasReputation = reputation != null && reputation.requested > 0;
  const hasReactivations = reactivations.length > 0 || topReferrers.length > 0;

  let i = 0;
  const delay = () => 0.04 + i++ * CHAT_STAGGER_DELAY;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 sm:gap-5">
      {/* GREETING — wide hero row. The view's ONE solid accent card. */}
      <BriefCell span="md:col-span-2 md:row-span-1" delay={delay()} accent>
        <GreetingCell ownerName={data.ownerName} momentum={brief.momentum} tomorrow={brief.tomorrow} />
      </BriefCell>

      {/* NEEDS YOU — tall right rail, three linked stat tiles */}
      <BriefCell span="md:col-span-2 md:row-span-2" delay={delay()}>
        <NeedsYouCell slug={slug} needsYou={needsYou} />
      </BriefCell>

      {/* ON DECK — the ranked action cards from the composed brief */}
      {hasOnDeck && (
        <BriefCell span="md:col-span-2 md:row-span-1" delay={delay()}>
          <OnDeckCell slug={slug} cards={brief.cards} tip={brief.tip} />
        </BriefCell>
      )}

      {/* TODAY — tours scheduled for today */}
      {hasTours && (
        <BriefCell span="md:col-span-2" delay={delay()}>
          <ToursCell slug={slug} tours={tours} />
        </BriefCell>
      )}

      {/* PIPELINE — active deal counts + open value */}
      {hasPipeline && pipeline && (
        <BriefCell span="md:col-span-2" delay={delay()}>
          <PipelineCell slug={slug} pipeline={pipeline} />
        </BriefCell>
      )}

      {/* HOT LEADS — named, scored-hot contacts */}
      {hasHotLeads && (
        <BriefCell span="md:col-span-2" delay={delay()}>
          <HotLeadsCell slug={slug} hotLeads={hotLeads} />
        </BriefCell>
      )}

      {/* REPUTATION — post-close review campaigns (requested / clicked) */}
      {hasReputation && reputation && (
        <BriefCell span="md:col-span-2" delay={delay()}>
          <ReputationCell reputation={reputation} />
        </BriefCell>
      )}

      {/* REACTIVATE — dormant past clients worth a touch + top referrers */}
      {hasReactivations && (
        <BriefCell span="md:col-span-2" delay={delay()}>
          <ReactivateCell slug={slug} reactivations={reactivations} topReferrers={topReferrers} />
        </BriefCell>
      )}

      {/* OVERNIGHT — what Chippi did in the last 12h, full width */}
      {hasOvernight && overnight && (
        <BriefCell span="md:col-span-4" delay={delay()}>
          <OvernightCell slug={slug} overnight={overnight} />
        </BriefCell>
      )}
    </div>
  );
}

// ── REPUTATION ────────────────────────────────────────────────────────────────

function ReputationCell({
  reputation,
}: {
  reputation: NonNullable<DashboardData['reputation']>;
}) {
  const { requested, clicked } = reputation;
  return (
    <div className="p-6 sm:p-7">
      <CellHeader label="Reputation" icon={Star} />
      <div className="mt-3 grid grid-cols-2 gap-x-3">
        <Stat value={<AnimatedNumber value={requested} />} label="requested" />
        <Stat
          value={<AnimatedNumber value={clicked} />}
          label="clicked through"
          dim={clicked === 0}
        />
      </div>
      <p className={cn(BODY_MUTED, 'text-xs mt-3')}>
        {clicked > 0
          ? `${clicked} of ${requested} ${pluralize(requested, 'review request')} opened in the last 90 days.`
          : `${requested} ${pluralize(requested, 'review request')} sent in the last 90 days — none opened yet.`}
      </p>
    </div>
  );
}

// ── Cell header ───────────────────────────────────────────────────────────────

/** Card heading: friendly semibold title + a quiet top-right control. */
function CellHeader({
  label,
  href,
  cta,
  icon: Icon,
}: {
  label: string;
  href?: string;
  cta?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        {Icon && <Icon size={15} className="text-muted-foreground/70" />}
        <h2 className={CARD_TITLE}>{label}</h2>
      </div>
      {href && (
        <Link
          href={href}
          className="group/cta inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {cta ?? 'View'}
          <ArrowUpRight
            size={12}
            className="transition-transform duration-200 group-hover/cta:translate-x-0.5 group-hover/cta:-translate-y-0.5"
          />
        </Link>
      )}
    </div>
  );
}

// ── GREETING ──────────────────────────────────────────────────────────────────

function GreetingCell({
  ownerName,
  momentum,
  tomorrow,
}: {
  ownerName: string | null;
  momentum: string | null;
  tomorrow: string | null;
}) {
  // ChippiPageShell already renders "Today." above; the bento greeting names
  // the date and (when present) the realtor, with the momentum/tomorrow prose
  // as a quiet sub-line. No fabricated copy — momentum/tomorrow are null when
  // there's nothing real to say. This cell is the view's ONE accent card, so
  // every line rides white ink on the agent-orange surface.
  const line = ownerName ? `Good morning, ${ownerName}.` : 'Good morning.';
  return (
    <div className="p-6 sm:p-7">
      <p className="text-[11px] font-medium uppercase tracking-wider text-white/85">
        {formatToday()}
      </p>
      <h1 className={cn(H1, 'mt-1.5 text-white')} style={TITLE_FONT}>
        {line}
      </h1>
      {(momentum || tomorrow) && (
        <div className="mt-3 space-y-0.5">
          {momentum && <p className="text-sm text-white/85">{momentum}</p>}
          {tomorrow && <p className="text-sm text-white/85">{tomorrow}</p>}
        </div>
      )}
    </div>
  );
}

// ── NEEDS YOU ───────────────────────────────────────────────────────────────

function NeedsYouCell({ slug, needsYou }: { slug: string; needsYou: DashboardData['needsYou'] }) {
  const tiles: {
    n: number;
    label: string;
    sub: string;
    href: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
  }[] = [
    {
      n: needsYou.newLeads,
      label: pluralize(needsYou.newLeads, 'New lead', 'New leads'),
      sub: 'not yet contacted',
      href: `/s/${slug}/leads`,
      icon: Users,
    },
    {
      n: needsYou.followUpsDue,
      label: pluralize(needsYou.followUpsDue, 'Follow-up due', 'Follow-ups due'),
      sub: 'today or overdue',
      href: `/s/${slug}/follow-ups`,
      icon: CalendarClock,
    },
    {
      n: needsYou.pendingDrafts,
      label: pluralize(needsYou.pendingDrafts, 'Draft ready', 'Drafts ready'),
      sub: 'approve or edit',
      href: `/s/${slug}/chippi/inbox`,
      icon: FileText,
    },
  ];

  // Clients waiting on a reply only appears when someone actually is — an empty
  // inbox shouldn't add a permanently-zero row to the "what needs you" list.
  if (needsYou.clientsWaiting > 0) {
    tiles.push({
      n: needsYou.clientsWaiting,
      label: pluralize(needsYou.clientsWaiting, 'Client waiting', 'Clients waiting'),
      sub: 'unread reply on your desk',
      href: `/s/${slug}/inbox`,
      icon: MessagesSquare,
    });
  }

  const allClear = tiles.every((t) => t.n === 0);

  return (
    <div className="flex h-full flex-col p-6 sm:p-7">
      <CellHeader label="What needs you" />
      <div className="mt-3 flex-1 divide-y divide-border/60">
        {tiles.map((t) => {
          const dim = t.n === 0;
          return (
            <Link
              key={t.label}
              href={t.href}
              className={cn(
                'group/row flex items-center gap-4 py-3.5 first:pt-0 last:pb-0 -mx-1.5 px-1.5 rounded-lg transition-colors',
                'hover:bg-foreground/[0.035] active:bg-foreground/[0.06]',
              )}
            >
              {/* Number — the loud note. Non-zero counts sit at full weight;
                  cleared counts recede so the eye lands on what's waiting. */}
              <span
                className={cn(
                  STAT_NUMBER_COMPACT,
                  'leading-none w-12 shrink-0 tabular-nums transition-colors',
                  dim && 'text-muted-foreground/55',
                )}
                style={TITLE_FONT}
              >
                <AnimatedNumber value={t.n} />
              </span>
              <div className="flex-1 min-w-0">
                <p className={cn(BODY, 'font-medium flex items-center gap-1.5')}>
                  <t.icon
                    size={13}
                    className={cn(
                      'transition-colors',
                      dim
                        ? 'text-muted-foreground/50'
                        : 'text-muted-foreground/70 group-hover/row:text-foreground',
                    )}
                  />
                  {t.label}
                </p>
                <p className={cn(BODY_MUTED, 'text-xs mt-0.5')}>{t.sub}</p>
              </div>
              <ArrowUpRight
                size={15}
                className="text-muted-foreground/40 group-hover/row:text-foreground group-hover/row:translate-x-0.5 group-hover/row:-translate-y-0.5 transition-all duration-200 shrink-0"
              />
            </Link>
          );
        })}
      </div>
      {allClear && (
        <p className={cn(BODY_MUTED, 'text-xs mt-3 pt-3 border-t border-border/60 flex items-center gap-1.5')}>
          <Check size={12} className="text-muted-foreground/70 shrink-0" />
          All clear. Nothing waiting on you right now.
        </p>
      )}
    </div>
  );
}

// ── ON DECK ─────────────────────────────────────────────────────────────────

function OnDeckCell({
  slug,
  cards,
  tip,
}: {
  slug: string;
  cards: BriefCard[];
  tip: BriefCard | null;
}) {
  const rows = tip ? [...cards, tip] : cards;
  const [expanded, setExpanded] = useState(false);
  const motionOn = useBriefMotionEnabled();

  const overflow = rows.length - ON_DECK_COMPACT;
  // The first N always show; overflow rows live in `hidden` and reveal in
  // place when expanded. Keeping `visible` constant (never the full list)
  // means each overflow row mounts exactly once — under the animated branch
  // — so the staggered reveal plays without double-rendering a card.
  const visible = overflow > 0 ? rows.slice(0, ON_DECK_COMPACT) : rows;
  const hidden = overflow > 0 ? rows.slice(ON_DECK_COMPACT) : [];

  return (
    <div className="p-6 sm:p-7">
      <CellHeader label="On deck" icon={Sparkles} />
      <ul className="mt-2 divide-y divide-border/60">
        {visible.map((card, idx) => (
          <OnDeckRow key={`${card.subject.id}-${idx}`} slug={slug} card={card} />
        ))}
        {/* Overflow rows reveal in place — the cell stays glanceable while
            still holding every ranked card. AnimatePresence-free height
            isn't needed; a simple staggered fade reads calm and is cheap. */}
        {expanded &&
          hidden.map((card, idx) => (
            <motion.li
              key={`hidden-${card.subject.id}-${idx}`}
              initial={motionOn ? { opacity: 0, y: -4 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DURATION_FAST, ease: EASE_OUT, delay: motionOn ? idx * 0.03 : 0 }}
            >
              <OnDeckRowInner slug={slug} card={card} />
            </motion.li>
          ))}
      </ul>
      {overflow > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-sm"
        >
          {expanded ? 'Show less' : `${overflow} more`}
          <ChevronDown
            size={12}
            className={cn('transition-transform duration-200', expanded && 'rotate-180')}
          />
        </button>
      )}
    </div>
  );
}

/** A single On Deck row wrapped in its own <li>. */
function OnDeckRow({ slug, card }: { slug: string; card: BriefCard }) {
  return (
    <li>
      <OnDeckRowInner slug={slug} card={card} />
    </li>
  );
}

/** The row body — shared by the compact list and the expanded overflow rows. */
function OnDeckRowInner({ slug, card }: { slug: string; card: BriefCard }) {
  const href = deepLink(
    slug,
    card.draftedAction?.kind === 'open' ? card.draftedAction.href : card.subject.href,
  );
  return (
    <Link
      href={href}
      className="group/row flex items-start gap-3 py-3 -mx-1.5 px-1.5 rounded-lg hover:bg-foreground/[0.035] active:bg-foreground/[0.06] transition-colors"
    >
      <span
        className={cn(
          SECTION_LABEL,
          'w-12 shrink-0 pt-0.5 tabular-nums transition-colors group-hover/row:text-foreground/80',
        )}
      >
        {ACTION_LABEL[card.kind]}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{card.subject.name}</p>
        <p className={cn(BODY_MUTED, 'text-xs mt-0.5 line-clamp-2')}>{card.evidence}</p>
      </div>
      <ArrowUpRight
        size={15}
        className="text-muted-foreground/40 group-hover/row:text-foreground group-hover/row:translate-x-0.5 group-hover/row:-translate-y-0.5 transition-all duration-200 shrink-0 mt-0.5"
      />
    </Link>
  );
}

// ── TODAY (tours) ─────────────────────────────────────────────────────────────

function ToursCell({ slug, tours }: { slug: string; tours: DashboardData['tours'] }) {
  return (
    <div className="p-6 sm:p-7">
      <CellHeader label="Today" icon={CalendarClock} href={`/s/${slug}/calendar`} cta="Calendar" />
      <ul className="mt-2 space-y-1">
        {tours.map((t) => {
          const name = t.guestName?.trim() || 'Tour';
          return (
            <li key={t.id}>
              <Link
                href={deepLink(slug, t.href)}
                className="group/row flex items-baseline gap-3 -mx-1.5 px-1.5 py-1.5 rounded-lg hover:bg-foreground/[0.035] active:bg-foreground/[0.06] transition-colors"
              >
                <span className="text-sm tabular-nums text-muted-foreground w-12 shrink-0 transition-colors group-hover/row:text-foreground">
                  {formatEventTime(t.startsAt)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-sm text-foreground group-hover/row:underline underline-offset-2 decoration-foreground/30">
                    {name}
                  </span>
                  {t.propertyAddress && (
                    <span className={cn(BODY_MUTED, 'text-xs block truncate')}>{t.propertyAddress}</span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── PIPELINE ──────────────────────────────────────────────────────────────────

function PipelineCell({ slug, pipeline }: { slug: string; pipeline: NonNullable<DashboardData['pipeline']> }) {
  return (
    <div className="p-6 sm:p-7">
      <CellHeader label="Pipeline" icon={TrendingUp} href={`/s/${slug}/deals`} cta="Deals" />
      <div className="mt-3 grid grid-cols-2 gap-y-4 gap-x-3">
        <Stat
          value={<AnimatedNumber value={pipeline.active} />}
          label={pluralize(pipeline.active, 'active deal')}
        />
        <Stat
          value={
            pipeline.openValue > 0 ? (
              <AnimatedNumber value={pipeline.openValue} format={(n) => formatCompact(n)} />
            ) : (
              '—'
            )
          }
          label="open value"
          dim={pipeline.openValue === 0}
        />
        <Stat
          value={<AnimatedNumber value={pipeline.closingThisWeek} />}
          label="closing this week"
          dim={pipeline.closingThisWeek === 0}
        />
        <Stat
          value={<AnimatedNumber value={pipeline.atRisk} />}
          label="at risk"
          dim={pipeline.atRisk === 0}
          warn={pipeline.atRisk > 0}
        />
      </div>
    </div>
  );
}

function Stat({
  value,
  label,
  dim,
  warn,
}: {
  value: React.ReactNode;
  label: string;
  dim?: boolean;
  warn?: boolean;
}) {
  // Small-stat pattern from the reference: short vertical accent bar beside
  // the label, focal number beneath.
  return (
    <div className="min-w-0">
      <AccentBarLabel>{label}</AccentBarLabel>
      <p
        className={cn(
          STAT_NUMBER_COMPACT,
          'leading-none tabular-nums mt-1.5',
          dim && 'text-muted-foreground/60',
          warn && 'text-foreground',
        )}
        style={TITLE_FONT}
      >
        {value}
      </p>
    </div>
  );
}

// ── HOT LEADS ─────────────────────────────────────────────────────────────────

function HotLeadsCell({ slug, hotLeads }: { slug: string; hotLeads: DashboardData['hotLeads'] }) {
  return (
    <div className="p-6 sm:p-7">
      <CellHeader label="Hot leads" icon={Flame} href={`/s/${slug}/leads`} cta="People" />
      <ul className="mt-2 divide-y divide-border/60">
        {hotLeads.map((lead) => {
          const since = daysSince(lead.lastContactedAt);
          const sub =
            since === null
              ? 'no contact logged'
              : since === 0
                ? 'touched today'
                : `${since}d since touch`;
          return (
            <li key={lead.id}>
              <Link
                href={`/s/${slug}/contacts/${lead.id}`}
                className="group/row flex items-center gap-3 py-2.5 -mx-1.5 px-1.5 rounded-lg hover:bg-foreground/[0.035] active:bg-foreground/[0.06] transition-colors"
              >
                <span className="flex-1 min-w-0">
                  <span className="text-sm text-foreground truncate block group-hover/row:underline underline-offset-2 decoration-foreground/30">
                    {lead.name}
                  </span>
                  <span className={cn(BODY_MUTED, 'text-xs')}>{sub}</span>
                </span>
                {typeof lead.leadScore === 'number' && (
                  <span className="text-xs tabular-nums text-muted-foreground shrink-0 transition-colors group-hover/row:text-foreground">
                    {lead.leadScore}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── REACTIVATE (past clients + referrers) ─────────────────────────────────────

function ReactivateCell({
  slug,
  reactivations,
  topReferrers,
}: {
  slug: string;
  reactivations: DashboardData['reactivations'];
  topReferrers: DashboardData['topReferrers'];
}) {
  return (
    <div className="p-6 sm:p-7">
      <CellHeader
        label="Past clients"
        icon={HeartHandshake}
        href={`/s/${slug}/contacts`}
        cta="People"
      />
      {reactivations.length > 0 ? (
        <ul className="mt-2 divide-y divide-border/60">
          {reactivations.map((r) => {
            const name = r.name?.trim() || 'Past client';
            return (
              <li key={r.id}>
                <Link
                  href={`/s/${slug}/contacts/${r.id}`}
                  className="group/row flex items-center gap-3 py-2.5 -mx-1.5 px-1.5 rounded-lg hover:bg-foreground/[0.035] active:bg-foreground/[0.06] transition-colors"
                >
                  <span className="flex-1 min-w-0">
                    <span className="text-sm text-foreground truncate block group-hover/row:underline underline-offset-2 decoration-foreground/30">
                      {name}
                    </span>
                    <span className={cn(BODY_MUTED, 'text-xs')}>{r.reason}</span>
                  </span>
                  {typeof r.dealValue === 'number' && r.dealValue > 0 && (
                    <span className="text-xs tabular-nums text-muted-foreground shrink-0 transition-colors group-hover/row:text-foreground">
                      {formatCompact(r.dealValue)}
                    </span>
                  )}
                  <ArrowUpRight
                    size={15}
                    className="text-muted-foreground/40 group-hover/row:text-foreground group-hover/row:translate-x-0.5 group-hover/row:-translate-y-0.5 transition-all duration-200 shrink-0"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={cn(BODY_MUTED, 'text-xs mt-3')}>
          No past clients are due for a check-in right now.
        </p>
      )}

      {/* Top referrers — only shown when referrals have actually been recorded. */}
      {topReferrers.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/60">
          <AccentBarLabel>Top referrers</AccentBarLabel>
          <ul className="mt-1.5 space-y-1">
            {topReferrers.map((ref) => (
              <li key={ref.id} className="flex items-baseline justify-between gap-3">
                <Link
                  href={`/s/${slug}/contacts/${ref.id}`}
                  className="text-sm text-foreground truncate hover:underline underline-offset-2 decoration-foreground/30"
                >
                  {ref.name?.trim() || 'A client'}
                </Link>
                <span className={cn(BODY_MUTED, 'text-xs tabular-nums shrink-0')}>
                  {ref.referralCount} {pluralize(ref.referralCount, 'referral')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── OVERNIGHT ─────────────────────────────────────────────────────────────────

function OvernightCell({
  slug,
  overnight,
}: {
  slug: string;
  overnight: NonNullable<DashboardData['overnight']>;
}) {
  return (
    <div className="p-6 sm:p-7">
      <CellHeader
        label="Overnight"
        icon={Sparkles}
        href={`/s/${slug}/chippi/activity`}
        cta="Activity"
      />
      <div className="mt-4 flex flex-wrap gap-x-8 gap-y-4">
        {overnight.buckets.map((b) => (
          <div key={b.label} className="min-w-0">
            <AccentBarLabel>{singularize(b.label, b.count)}</AccentBarLabel>
            <p
              className={cn(STAT_NUMBER_COMPACT, 'leading-none tabular-nums mt-1.5')}
              style={TITLE_FONT}
            >
              <AnimatedNumber value={b.count} />
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Trim the trailing "s" from the bucket noun when count is 1 (drafts → draft). */
function singularize(label: string, count: number): string {
  if (count !== 1) return label;
  const [head, ...rest] = label.split(' ');
  if (head.endsWith('s')) return [head.slice(0, -1), ...rest].join(' ');
  return label;
}
