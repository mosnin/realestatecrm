'use client';

/**
 * AgentInboxShowcase + AgentPipelineShowcase, two feature sections for the
 * Chippi marketing site. Both reuse the FeatureShowcase shell and the frosted
 * mockup kit, but each step's mockup uses a distinct visual metaphor:
 *   - Inbox: an email/chat conversation (incoming card, chat bubbles, a draft
 *     composer with approve/edit/skip, a sent-and-logged confirmation).
 *   - Pipeline: a kanban board (mini columns with deal cards, a card advancing,
 *     a queued follow-up, an aging-deal flag).
 */

import {
  Inbox,
  Target,
  PenLine,
  Check,
  CheckCircle2,
  ListChecks,
  KanbanSquare,
  Bell,
  CalendarClock,
  Phone,
  ArrowRight,
  Clock,
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
  FeatureShowcase,
  Frost,
  Row,
  rowV,
  type ShowcaseStep,
} from './feature-showcase';

/* ── shared small helpers ──────────────────────────────────────────────── */

const Chip = ({ label, tone }: { label: string; tone: string }) => (
  <span className={'rounded-full px-2 py-0.5 text-[10px] font-medium ' + tone}>{label}</span>
);

const Avatar = ({ initials }: { initials: string }) => (
  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#ff7a45] to-[#ff5fa2] text-[12px] font-semibold text-black">
    {initials}
  </span>
);

/* ── 1) Inbox: an email / chat conversation ────────────────────────────── */

const STEPS_INBOX: ShowcaseStep[] = [
  {
    key: 'land',
    title: 'New lead lands',
    desc: 'Email, text, and portal leads all arrive in one worked queue. Chippi scores each one against your live pipeline the moment it lands.',
    mockup: (
      <Frost title="Inbox" badge="3 new">
        <motion.div
          variants={rowV}
          className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3"
        >
          <Avatar initials="DM" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium text-white">Daniel Mercer</span>
            <span className="block truncate text-[11px] text-white/45">
              Is 214 Larch still available for a weekend tour?
            </span>
          </span>
          <Chip label="Hot · scored" tone="bg-[#ff7a45]/15 text-[#ff9a6e]" />
        </motion.div>
        <Row
          icon={Inbox}
          title="Priya Raman"
          meta="Text · asking about financing"
          right={<Chip label="Warm" tone="bg-amber-400/15 text-amber-300" />}
        />
        <Row
          icon={Inbox}
          title="Zillow lead"
          meta="Portal · saved 88 Pine three times"
          right={<Chip label="Cold" tone="bg-white/10 text-white/60" />}
        />
      </Frost>
    ),
  },
  {
    key: 'read',
    title: 'Chippi reads the thread',
    desc: 'It reads the whole conversation, pulls out the details that matter, and lines them up against the listing so nothing gets missed.',
    mockup: (
      <Frost title="Thread" badge="Daniel Mercer">
        <motion.div variants={rowV} className="flex justify-start">
          <span className="max-w-[80%] rounded-2xl rounded-tl-sm bg-white/[0.06] px-3.5 py-2.5 text-[12.5px] leading-snug text-white/80">
            Hi, saw 214 Larch online. We have around 650k to work with and need at least 3 beds.
          </span>
        </motion.div>
        <motion.div variants={rowV} className="flex justify-start">
          <span className="max-w-[80%] rounded-2xl rounded-tl-sm bg-white/[0.06] px-3.5 py-2.5 text-[12.5px] leading-snug text-white/80">
            Could we see it this weekend if it is still open?
          </span>
        </motion.div>
        <motion.div variants={rowV} className="flex flex-wrap gap-1.5 px-1 pt-1">
          <Chip label="budget 650k" tone="bg-white/[0.08] text-white/70" />
          <Chip label="3 bed" tone="bg-white/[0.08] text-white/70" />
          <Chip label="wants weekend tour" tone="bg-sky-400/15 text-sky-300" />
        </motion.div>
      </Frost>
    ),
  },
  {
    key: 'draft',
    title: 'A reply, in your voice',
    desc: 'Chippi writes the reply the way you would, ready to go. Nothing sends without your tap, so you approve, edit, or skip.',
    mockup: (
      <Frost title="Draft" badge="In your voice">
        <motion.div
          variants={rowV}
          className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 text-[12.5px] leading-relaxed text-white/80"
        >
          Hi Daniel, great to hear from you. 214 Larch is still available and it is a strong fit at
          three beds within your range. I have Saturday at 11:00 or Sunday at 2:00 open for a tour.
          Which works better for you?
        </motion.div>
        <motion.div variants={rowV} className="flex items-center gap-2 px-1 pt-1">
          <span className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-[#ff7a45] to-[#ff5fa2] px-3 py-2 text-[12px] font-semibold text-black">
            <Check className="h-3.5 w-3.5" />
            Approve
          </span>
          <span className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[12px] font-medium text-white/75">
            <PenLine className="h-3.5 w-3.5" />
            Edit
          </span>
          <span className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[12px] font-medium text-white/55">
            Skip
          </span>
        </motion.div>
      </Frost>
    ),
  },
  {
    key: 'sent',
    title: 'Sent and logged',
    desc: 'One tap sends the reply in your voice, then Chippi files it to the deal so the timeline stays complete on its own.',
    mockup: (
      <Frost title="Done" badge="Just now">
        <Row
          icon={Check}
          title="Reply sent in your voice"
          meta="to Daniel Mercer · email"
          tone="text-emerald-300/80"
        />
        <Row
          icon={ListChecks}
          title="Logged to the deal"
          meta="214 Larch · timeline updated"
          tone="text-white/55"
        />
        <motion.div
          variants={rowV}
          className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"
        >
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-sky-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1 text-[12.5px] text-white/75">Tour times offered, awaiting reply</span>
          <Chip label="Next: book" tone="bg-sky-400/15 text-sky-300" />
        </motion.div>
      </Frost>
    ),
  },
];

const TOP_FEATURES_INBOX = [
  { icon: Inbox, title: 'One worked queue', desc: 'Email, text, and portal leads in one place.' },
  { icon: Target, title: 'Scored on arrival', desc: 'Hot, warm, or cold, with the reason.' },
  { icon: PenLine, title: 'Drafted in your voice', desc: 'A reply waiting, ready to send.' },
];

export function AgentInboxShowcase() {
  return (
    <FeatureShowcase
      eyebrow="The inbox, worked"
      headline={
        <>
          Every lead, answered
          <br className="hidden sm:block" /> before you open it.
        </>
      }
      product={{
        name: 'Smart Inbox',
        icon: Inbox,
        desc: 'Chippi reads each inbound, scores it against your live pipeline, and writes the reply in your voice. Nothing sends without your tap.',
        cta: { label: 'See it work', href: '/demo' },
      }}
      topFeatures={TOP_FEATURES_INBOX}
      steps={STEPS_INBOX}
      image="/marketing/feature-3.jpg"
      imageSide="right"
    />
  );
}

/* ── 2) Pipeline: a kanban board ───────────────────────────────────────── */

const DealCard = ({
  name,
  price,
  dot,
  className,
  chip,
}: {
  name: string;
  price: string;
  dot: string;
  className?: string;
  chip?: React.ReactNode;
}) => (
  <div className={'rounded-lg border border-white/[0.08] bg-white/[0.03] p-2 ' + (className ?? '')}>
    <div className="flex items-center gap-1.5">
      <span className={'h-1.5 w-1.5 flex-shrink-0 rounded-full ' + dot} />
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-white">{name}</span>
    </div>
    <span className="mt-1 block text-[10px] text-white/45">{price}</span>
    {chip ? <div className="mt-1.5">{chip}</div> : null}
  </div>
);

const Column = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-2">
    <span className="mb-2 block text-[9px] font-medium uppercase tracking-wider text-white/40">{label}</span>
    <div className="space-y-1.5">{children}</div>
  </div>
);

const STEPS_PIPELINE: ShowcaseStep[] = [
  {
    key: 'board',
    title: 'The board, at a glance',
    desc: 'Every deal sits in the right stage, read live from the work itself. One look tells you where the whole pipeline stands.',
    mockup: (
      <Frost title="Pipeline" badge="Live">
        <motion.div variants={rowV} className="grid grid-cols-3 gap-2">
          <Column label="New">
            <DealCard name="Daniel Mercer" price="$650k" dot="bg-[#ff9a6e]" />
            <DealCard name="Priya Raman" price="$420k" dot="bg-white/40" />
          </Column>
          <Column label="Touring">
            <DealCard name="The Ortega" price="$880k" dot="bg-sky-400" />
          </Column>
          <Column label="Offer">
            <DealCard name="Jade Lin" price="$1.2M" dot="bg-emerald-400" />
          </Column>
        </motion.div>
      </Frost>
    ),
  },
  {
    key: 'advance',
    title: 'A deal advances',
    desc: 'When a tour is booked or an offer comes in, Chippi moves the deal to the next stage on its own, so the board is never behind.',
    mockup: (
      <Frost title="Pipeline" badge="Updated">
        <motion.div variants={rowV} className="grid grid-cols-3 gap-2">
          <Column label="New">
            <DealCard name="Priya Raman" price="$420k" dot="bg-white/40" />
          </Column>
          <Column label="Touring">
            <DealCard
              name="Daniel Mercer"
              price="$650k"
              dot="bg-[#ff9a6e]"
              className="border-[#ff7a45]/40 bg-[#ff7a45]/10 ring-1 ring-[#ff7a45]/40"
              chip={<Chip label="→ Touring" tone="bg-[#ff7a45]/15 text-[#ff9a6e]" />}
            />
            <DealCard name="The Ortega" price="$880k" dot="bg-sky-400" />
          </Column>
          <Column label="Offer">
            <DealCard name="Jade Lin" price="$1.2M" dot="bg-emerald-400" />
          </Column>
        </motion.div>
        <Row
          icon={ArrowRight}
          title="Daniel Mercer moved to Touring"
          meta="tour booked Sat 11:00"
          tone="text-[#ff9a6e]"
        />
      </Frost>
    ),
  },
  {
    key: 'next',
    title: 'Next touch queued',
    desc: 'The moment a deal moves, Chippi schedules the right follow-up so the next step is always set without you tracking it.',
    mockup: (
      <Frost title="Follow-up" badge="Queued">
        <motion.div
          variants={rowV}
          className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3"
        >
          <Avatar initials="DM" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium text-white">Daniel Mercer</span>
            <span className="block text-[11px] text-white/45">214 Larch · post-tour check-in</span>
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-sky-400/15 px-2.5 py-1 text-[11px] font-medium text-sky-300">
            <Bell className="h-3 w-3" />
            Call Tue 10:00
          </span>
        </motion.div>
        <Row
          icon={CalendarClock}
          title="Added to your day"
          meta="queued automatically"
          tone="text-emerald-300/80"
        />
        <Row
          icon={Phone}
          title="Jade Lin"
          meta="offer follow-up · Thu 9:00"
          tone="text-white/55"
          right={<Chip label="queued" tone="bg-white/10 text-white/60" />}
        />
      </Frost>
    ),
  },
  {
    key: 'aging',
    title: 'Before it goes cold',
    desc: 'When a deal sits quiet too long, Chippi flags it before it cools and suggests the next move to bring it back to life.',
    mockup: (
      <Frost title="Needs a nudge" badge="2 flagged">
        <motion.div
          variants={rowV}
          className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3"
        >
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-400" />
            <span className="min-w-0 flex-1 text-[12.5px] font-medium text-white">Priya Raman · $420k</span>
            <Chip label="3 days quiet" tone="bg-amber-400/15 text-amber-300" />
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-white/55">
            <Clock className="h-3 w-3 text-amber-300/80" />
            Suggested: send the financing options she asked about
          </div>
        </motion.div>
        <Row
          icon={Bell}
          title="The Ortega"
          meta="no reply since tour"
          right={<Chip label="2 days quiet" tone="bg-amber-400/15 text-amber-300" />}
        />
        <Row
          icon={CheckCircle2}
          title="The rest are on track"
          meta="nothing else stalling"
          tone="text-emerald-300/80"
        />
      </Frost>
    ),
  },
];

const TOP_FEATURES_PIPELINE = [
  { icon: KanbanSquare, title: 'Always current', desc: 'Stages update from the work itself.' },
  { icon: Bell, title: 'Next touch queued', desc: 'Follow-ups scheduled automatically.' },
  { icon: CalendarClock, title: 'Nothing stalls', desc: 'Aging deals surface before they cool.' },
];

export function AgentPipelineShowcase() {
  return (
    <FeatureShowcase
      eyebrow="Your pipeline, in motion"
      headline={
        <>
          Deals that move
          <br className="hidden sm:block" /> themselves forward.
        </>
      }
      product={{
        name: 'Live Pipeline',
        icon: KanbanSquare,
        desc: 'Chippi advances each deal as things happen, queues the next touch, and keeps every stage current so nothing stalls.',
        cta: { label: 'See it work', href: '/demo' },
      }}
      topFeatures={TOP_FEATURES_PIPELINE}
      steps={STEPS_PIPELINE}
      image="/marketing/feature-2.jpg"
      imageSide="right"
    />
  );
}
