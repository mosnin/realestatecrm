'use client';

/**
 * Chippi product-story showcases, the three sections that walk through how the
 * agent works end to end: it READS every signal, DECIDES what matters, then
 * ACTS with your approval. Each reuses the FeatureShowcase shell but ships its
 * own custom frosted metaphor mockups (multi-source ingestion, scoring + ranked
 * list, action card + approval gate) so the panels stay visually distinct from
 * each other and from BrokerageShowcase.
 */

import {
  Radar,
  History,
  ScanSearch,
  Mail,
  MessageSquare,
  Home,
  Inbox,
  Phone,
  CalendarDays,
  CheckCircle2,
  Target,
  ListChecks,
  MessageSquareQuote,
  ShieldCheck,
  PenLine,
  ScrollText,
  Check,
  Pencil,
  X,
  Send,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { DecryptedText } from '@/components/ui/decrypted-text';
import {
  FeatureShowcase,
  Frost,
  Row,
  rowV,
  type ShowcaseStep,
} from './feature-showcase';

/* ── Shared little atoms (kept tiny + tone-driven, matching house style) ──── */

const Chip = ({ label, tone }: { label: string; tone: string }) => (
  <span className={'rounded-full px-2 py-0.5 text-[10px] font-medium ' + tone}>{label}</span>
);

/** A small emerald status line, used for "coverage" / "done" confirmations. */
const StatusLine = ({ icon: Icon, label }: { icon: React.ElementType; label: string }) => (
  <motion.div variants={rowV} className="flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-emerald-400/15 text-emerald-300">
      <Icon className="h-3.5 w-3.5" />
    </span>
    <span className="text-[12px] text-white/75">{label}</span>
  </motion.div>
);

/* ═══════════════════════════════════════════════════════════════════════════
 * 1) READS, metaphor = multi-source ingestion into one unified stream.
 * ═══════════════════════════════════════════════════════════════════════════ */

const READS_TOP = [
  { icon: Radar, title: 'Every channel', desc: 'Email, text, and portal in one stream.' },
  { icon: History, title: 'History in context', desc: 'The whole relationship, already loaded.' },
  { icon: ScanSearch, title: 'Nothing missed', desc: 'Round the clock coverage.' },
];

/** One labeled source tile (Email / SMS / Zillow) with a live dot. */
const SourceTile = ({ icon: Icon, label, tone }: { icon: React.ElementType; label: string; tone: string }) => (
  <div className="relative flex flex-col items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-2 py-3">
    <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]" />
    <span className={'flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] ' + tone}>
      <Icon className="h-3.5 w-3.5" />
    </span>
    <span className="text-[10.5px] text-white/60">{label}</span>
  </div>
);

const READS_STEPS: ShowcaseStep[] = [
  {
    key: 'channels',
    title: 'Every channel, one stream',
    desc: 'Email, text, portal leads, and replies, all flow into a single live stream the moment they arrive, no tab-hopping, no inbox left unread.',
    mockup: (
      <Frost title="Sources" badge="Live">
        <motion.div variants={rowV} className="grid grid-cols-3 gap-2 px-1">
          <SourceTile icon={Mail} label="Email" tone="text-sky-300/80" />
          <SourceTile icon={MessageSquare} label="SMS" tone="text-[#ff9a6e]" />
          <SourceTile icon={Home} label="Zillow" tone="text-emerald-300/80" />
        </motion.div>
        <motion.div variants={rowV} className="flex justify-center py-0.5 text-white/25">
          <span className="text-[14px] leading-none">↓</span>
        </motion.div>
        <motion.div variants={rowV} className="flex items-center gap-3 rounded-xl border border-[#ff7a45]/25 bg-[#ff7a45]/[0.06] p-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#ff7a45] to-[#ff5fa2] text-black">
            <Inbox className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium text-white">Unified inbox</span>
            <span className="block text-[11px] text-white/50">3 new, merged just now</span>
          </span>
          <Chip label="+3" tone="bg-white/10 text-white/70" />
        </motion.div>
      </Frost>
    ),
  },
  {
    key: 'context',
    title: 'History in context',
    desc: 'Before Chippi reads a new message, the entire relationship is already loaded, every email, tour, and call, so nothing is read in a vacuum.',
    mockup: (
      <Frost title="Contact">
        <motion.div variants={rowV} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#ff7a45] to-[#ff5fa2] text-[12px] font-semibold text-black">
            SC
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium text-white">Sarah Chen</span>
            <span className="block text-[11px] text-white/45">Downtown buyer · 8 touches</span>
          </span>
        </motion.div>
        <motion.div variants={rowV} className="relative px-1 pt-2">
          <span aria-hidden className="absolute left-3 right-3 top-[18px] h-px bg-white/[0.1]" />
          <div className="relative flex items-start justify-between">
            {[
              { icon: Mail, label: 'Email', tone: 'text-sky-300/80' },
              { icon: CalendarDays, label: 'Tour', tone: 'text-[#ff9a6e]' },
              { icon: Phone, label: 'Call', tone: 'text-emerald-300/80' },
              { icon: Mail, label: 'Reply', tone: 'text-sky-300/80' },
            ].map((t, i) => {
              const Icon = t.icon;
              return (
                <span key={i} className="flex w-12 flex-col items-center gap-1.5">
                  <span className={'flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-[#0b0b0d] ' + t.tone}>
                    <Icon className="h-3 w-3" />
                  </span>
                  <span className="text-[9.5px] text-white/45">{t.label}</span>
                </span>
              );
            })}
          </div>
        </motion.div>
      </Frost>
    ),
  },
  {
    key: 'intent',
    title: 'Understands intent',
    desc: 'Chippi pulls the facts that matter out of plain language, budget, beds, timing, financing, and keeps them attached to the lead.',
    mockup: (
      <Frost title="Extracted" badge="From reply">
        <motion.div variants={rowV} className="flex flex-wrap gap-1.5 px-1 py-1">
          {[
            { label: 'budget 650k', tone: 'bg-[#ff7a45]/15 text-[#ff9a6e]' },
            { label: '3 bed', tone: 'bg-white/[0.06] text-white/70' },
            { label: 'downtown', tone: 'bg-sky-400/15 text-sky-300' },
            { label: 'weekend tours', tone: 'bg-white/[0.06] text-white/70' },
            { label: 'pre-approved', tone: 'bg-emerald-400/15 text-emerald-300' },
            { label: 'parking', tone: 'bg-white/[0.06] text-white/70' },
          ].map((c) => (
            <Chip key={c.label} label={c.label} tone={c.tone} />
          ))}
        </motion.div>
        <motion.div variants={rowV} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-[12px] leading-relaxed text-white/65">
          {'"Loved the loft, can we see two more downtown this weekend?"'}
        </motion.div>
      </Frost>
    ),
  },
  {
    key: 'covered',
    title: 'Nothing missed',
    desc: 'While you sleep, show, and close, Chippi keeps reading, so the moment a lead reaches out, it has already been seen.',
    mockup: (
      <Frost title="Coverage" badge="24/7">
        <StatusLine icon={CheckCircle2} label="12 inbound read today" />
        <StatusLine icon={CheckCircle2} label="0 left unattended" />
        <StatusLine icon={CheckCircle2} label="Last signal seen 40s ago" />
      </Frost>
    ),
  },
];

export function ChippiReadsShowcase() {
  return (
    <FeatureShowcase
      eyebrow="Reads everything"
      headline={
        <>
          {/* The headline decrypts into place — meaning resolving out of
              noise, which is literally what this section claims Chippi does
              with inbound signals. One accent; the second line stays still. */}
          <DecryptedText text="It sees every signal," />
          <br className="hidden sm:block" /> the moment it arrives.
        </>
      }
      product={{
        name: 'Always Listening',
        icon: Radar,
        desc: 'Email, text, portal leads, and replies, Chippi reads them all the instant they land, with the full history already in context.',
        cta: { label: 'See it work', href: '/demo' },
      }}
      topFeatures={READS_TOP}
      steps={READS_STEPS}
      image="/marketing/chippi-1.jpg"
      imageSide="right"
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 2) DECIDES, metaphor = scoring + ranked call list with reasons.
 * ═══════════════════════════════════════════════════════════════════════════ */

const DECIDES_TOP = [
  { icon: Target, title: 'Scored on arrival', desc: 'Hot, warm, or cold, with the reason.' },
  { icon: ListChecks, title: 'Ranked by intent', desc: 'The call list, ordered for you.' },
  { icon: MessageSquareQuote, title: 'The reason, in plain words', desc: 'Never a black box.' },
];

/** A ranked row: position, name, score bar, score number. */
const RankRow = ({ pos, name, score, width }: { pos: number; name: string; score: number; width: string }) => (
  <motion.div variants={rowV} className="flex items-center gap-3 rounded-xl px-2 py-2">
    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-[11px] font-semibold text-white/70">
      {pos}
    </span>
    <span className="w-20 flex-shrink-0 truncate text-[12.5px] font-medium text-white">{name}</span>
    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
      <span className="block h-full rounded-full bg-gradient-to-r from-[#ff7a45] to-[#ff5fa2]" style={{ width }} />
    </span>
    <span className="w-7 flex-shrink-0 text-right text-[12px] font-semibold text-white/80">{score}</span>
  </motion.div>
);

const DECIDES_STEPS: ShowcaseStep[] = [
  {
    key: 'score',
    title: 'Scored on arrival',
    desc: 'Every lead is scored against your live pipeline the second it lands, hot, warm, or cold, with the signal that earned the score.',
    mockup: (
      <Frost title="Lead score">
        <motion.div variants={rowV} className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <span className="relative flex h-16 w-16 flex-shrink-0 items-center justify-center">
            <span
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{ background: 'conic-gradient(#ff7a45 0% 92%, rgba(255,255,255,0.08) 92% 100%)' }}
            />
            <span className="absolute inset-[3px] rounded-full bg-[#0b0b0d]" />
            <span className="relative text-[20px] font-semibold text-white">92</span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="text-[13px] font-medium text-white">Sarah Chen</span>
              <Chip label="Hot" tone="bg-[#ff7a45]/15 text-[#ff9a6e]" />
            </span>
            <span className="mt-1 block text-[11.5px] leading-snug text-white/55">
              Pre-approved and asked to tour this weekend.
            </span>
          </span>
        </motion.div>
      </Frost>
    ),
  },
  {
    key: 'rank',
    title: 'Ranked by intent',
    desc: 'Chippi orders the day for you, the lead most likely to close sits at the top, so your first hour is never guesswork.',
    mockup: (
      <Frost title="Call list" badge="Now">
        <RankRow pos={1} name="Sarah Chen" score={92} width="92%" />
        <RankRow pos={2} name="Marcus Lee" score={78} width="78%" />
        <RankRow pos={3} name="Dana Brooks" score={64} width="64%" />
        <RankRow pos={4} name="Tom Alvarez" score={41} width="41%" />
      </Frost>
    ),
  },
  {
    key: 'why',
    title: 'The reason, in plain words',
    desc: 'No black box. Every score comes with the few facts behind it, so you trust the order before you dial.',
    mockup: (
      <Frost title="Why this score">
        <motion.div variants={rowV} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
          <span className="text-[12.5px] font-medium text-white">Sarah Chen</span>
          <Chip label="92 · Hot" tone="bg-[#ff7a45]/15 text-[#ff9a6e]" />
        </motion.div>
        <motion.div variants={rowV} className="flex flex-wrap gap-1.5 px-1 pt-1">
          {[
            'replied in 4 min',
            'pre-approved',
            'asked to tour',
          ].map((c) => (
            <Chip key={c} label={c} tone="bg-emerald-400/15 text-emerald-300" />
          ))}
        </motion.div>
      </Frost>
    ),
  },
  {
    key: 'first',
    title: 'Your first hour',
    desc: 'Start at the top and work down. Chippi hands you a short call-now list, the deals where a call right now moves the needle.',
    mockup: (
      <Frost title="Today" badge="Call now">
        <Row icon={Phone} title="Sarah Chen" meta="92 · pre-approved, wants tour" tone="text-[#ff9a6e]" active right={<Chip label="Hot" tone="bg-[#ff7a45]/15 text-[#ff9a6e]" />} />
        <Row icon={Phone} title="Marcus Lee" meta="78 · comparing two listings" right={<Chip label="Warm" tone="bg-amber-400/15 text-amber-300" />} />
        <Row icon={Phone} title="Dana Brooks" meta="64 · early, browsing downtown" right={<Chip label="Warm" tone="bg-white/10 text-white/60" />} />
      </Frost>
    ),
  },
];

export function ChippiDecidesShowcase() {
  return (
    <FeatureShowcase
      eyebrow="Knows what matters"
      headline={
        <>
          It tells you
          <br className="hidden sm:block" /> who to call first.
        </>
      }
      product={{
        name: 'Prioritized',
        icon: Target,
        desc: 'Every lead scored against your live pipeline and ranked by intent, so your first hour goes to the deal most likely to close.',
        cta: { label: 'See it work', href: '/demo' },
      }}
      topFeatures={DECIDES_TOP}
      steps={DECIDES_STEPS}
      image="/marketing/chippi-2.jpg"
      imageSide="left"
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 3) ACTS, metaphor = proposed action card + approval gate + log.
 * ═══════════════════════════════════════════════════════════════════════════ */

const ACTS_TOP = [
  { icon: PenLine, title: 'It proposes', desc: 'Drafts and bookings ready to go.' },
  { icon: ShieldCheck, title: 'You approve', desc: 'Approve, edit, or skip in a tap.' },
  { icon: ScrollText, title: 'Logged in plain words', desc: 'Every action you can audit.' },
];

/** A pill-style action button row, the approval gate. */
const ActionBtn = ({ icon: Icon, label, focused }: { icon: React.ElementType; label: string; focused?: boolean }) => (
  <span
    className={
      'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[12px] font-medium ' +
      (focused
        ? 'bg-gradient-to-r from-[#ff7a45] to-[#ff5fa2] text-black shadow-lg shadow-[#ff7a45]/20'
        : 'border border-white/[0.1] bg-white/[0.04] text-white/65')
    }
  >
    <Icon className="h-3.5 w-3.5" />
    {label}
  </span>
);

/** A timestamped activity log line. */
const LogLine = ({ time, label }: { time: string; label: string }) => (
  <motion.div variants={rowV} className="flex items-start gap-3 px-1 py-1.5">
    <span className="mt-1 flex flex-col items-center">
      <span className="h-1.5 w-1.5 rounded-full bg-[#ff9a6e]" />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-[12px] text-white/75">{label}</span>
      <span className="block text-[10.5px] text-white/40">{time}</span>
    </span>
  </motion.div>
);

const ACTS_STEPS: ShowcaseStep[] = [
  {
    key: 'propose',
    title: 'Chippi proposes',
    desc: 'Chippi drafts the reply and books the tour in your voice, ready to send, so the work is done before you even open it.',
    mockup: (
      <Frost title="Proposed">
        <motion.div variants={rowV} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-[#ff9a6e]">
            <PenLine className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-medium text-white">Reply to Sarah Chen</span>
            <span className="block text-[11px] text-white/45">email · drafted in your voice</span>
          </span>
          <Chip label="Draft" tone="bg-white/10 text-white/60" />
        </motion.div>
        <motion.div variants={rowV} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-[12px] leading-relaxed text-white/65">
          {'"Happy to set up two downtown showings this Saturday, does 2:00 work?"'}
        </motion.div>
      </Frost>
    ),
  },
  {
    key: 'approve',
    title: 'You approve',
    desc: 'Nothing leaves without your nod. Approve to send, edit a word, or skip it, your call, every time.',
    mockup: (
      <Frost title="Your call">
        <motion.div variants={rowV} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#ff7a45] to-[#ff5fa2] text-black">
            <CalendarDays className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-medium text-white">Book tour, Sat 2:00</span>
            <span className="block text-[11px] text-white/45">88 Pine St · Sarah Chen</span>
          </span>
        </motion.div>
        <motion.div variants={rowV} className="flex gap-2 px-1 pt-1">
          <ActionBtn icon={Check} label="Approve" focused />
          <ActionBtn icon={Pencil} label="Edit" />
          <ActionBtn icon={X} label="Skip" />
        </motion.div>
      </Frost>
    ),
  },
  {
    key: 'execute',
    title: 'It executes',
    desc: 'The second you approve, Chippi sends the reply and books the tour, then sends the invite, no copy-paste, no follow-through forgotten.',
    mockup: (
      <Frost title="Done" badge="Sent">
        <StatusLine icon={Send} label="Reply sent to Sarah Chen" />
        <StatusLine icon={CalendarDays} label="Tour booked, Sat 2:00" />
        <StatusLine icon={CheckCircle2} label="Calendar invite sent" />
      </Frost>
    ),
  },
  {
    key: 'log',
    title: 'Logged in plain language',
    desc: 'Every move lands on the activity log in words you can read at a glance, so the whole thread stays honest and auditable.',
    mockup: (
      <Frost title="Activity" badge="Today">
        <LogLine time="2:14 PM · email" label="Replied to Sarah Chen" />
        <LogLine time="2:15 PM · calendar" label="Tour booked, Sat 2:00" />
        <LogLine time="2:15 PM · email" label="Invite sent to Sarah Chen" />
      </Frost>
    ),
  },
];

export function ChippiActsShowcase() {
  return (
    <FeatureShowcase
      eyebrow="Acts, with your nod"
      headline={
        <>
          It does the work.
          <br className="hidden sm:block" /> You make the calls.
        </>
      }
      product={{
        name: 'Approval-First',
        icon: ShieldCheck,
        desc: 'Chippi drafts, books, and updates, then waits for your tap. Approve, edit, or skip, and every move lands on the log.',
        cta: { label: 'See it work', href: '/demo' },
      }}
      topFeatures={ACTS_TOP}
      steps={ACTS_STEPS}
      image="/marketing/chippi-3.jpg"
      imageSide="right"
    />
  );
}
