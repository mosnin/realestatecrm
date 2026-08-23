'use client';

/**
 * AgentCanvas, the "Real Estate OS" feature section (image on the RIGHT).
 * Thin config over the shared <FeatureShowcase>; the frosted, detailed mockups
 * (search, pipeline, draft reply, automation feed, daily agenda) live here.
 */

import {
  LayoutGrid,
  Library,
  ScrollText,
  Search,
  Home,
  FileText,
  CalendarCheck,
  TrendingUp,
  Mail,
  MessageSquare,
  Phone,
  Send,
  CheckCircle2,
  RefreshCw,
  Inbox,
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
  FeatureShowcase,
  Frost,
  Row,
  Dot,
  rowV,
  type ShowcaseStep,
} from './feature-showcase';

const TOP_FEATURES = [
  { icon: Library, title: 'Trained on your book', desc: 'Grounded in your listings, your voice, and how you actually work.' },
  { icon: Send, title: 'Acts when you ask', desc: 'Sends messages and completes CRM work, then shows you exactly what changed.' },
  { icon: ScrollText, title: 'Audited end to end', desc: 'Every action written down in plain language you can review.' },
];

const STEPS: ShowcaseStep[] = [
  {
    key: 'data',
    title: 'Access data in seconds',
    desc: 'Ask in plain language and Chippi pulls the contact, deal, or document instantly, no digging through tabs.',
    mockup: (
      <Frost title="Ask Chippi" badge="0.4s">
        <motion.div
          variants={rowV}
          className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5"
        >
          <Search className="h-3.5 w-3.5 text-white/45" />
          <span className="text-[12.5px] text-white/85">Sarah Chen, last showings + budget</span>
          <span className="ml-auto h-3 w-px animate-pulse bg-white/40" />
        </motion.div>
        <Row icon={Home} title="Sarah Chen" meta="Buyer · pre-approved to $650k" tone="text-[#ff9a6e]" active />
        <Row icon={CalendarCheck} title="Toured 142 Oak St" meta="Sat 2:00pm · loved the kitchen" />
        <Row icon={CalendarCheck} title="Toured 88 Pine Ave" meta="last week · passed, too small" />
        <Row icon={FileText} title="Pre-approval letter.pdf" meta="uploaded Mar 3 · verified" />
      </Frost>
    ),
  },
  {
    key: 'leads',
    title: 'Stay on top of leads & deals',
    desc: 'Every lead scored and ranked, every deal moved forward, you always know the next best move.',
    mockup: (
      <Frost title="Pipeline" badge="Live">
        <motion.div variants={rowV} className="grid grid-cols-3 gap-2 px-1 pb-2">
          {[
            { n: '24', l: 'Active' },
            { n: '6', l: 'Hot' },
            { n: '3', l: 'Closing' },
          ].map((s) => (
            <div key={s.l} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-center">
              <span className="block text-[20px] font-semibold leading-none text-white">{s.n}</span>
              <span className="mt-1.5 block text-[10px] text-white/45">{s.l}</span>
            </div>
          ))}
        </motion.div>
        {[
          { t: 'Marcus Lee', m: 'Touring · replied 2×', s: '92', d: 'bg-[#ff7a45]' },
          { t: 'The Romeros', m: 'Offer out · awaiting', s: '88', d: 'bg-[#ff7a45]' },
          { t: 'Priya Patel', m: 'Nurture · opened email', s: '64', d: 'bg-amber-400' },
          { t: 'Devon Ray', m: 'New · web form', s: '41', d: 'bg-sky-400/70' },
        ].map((r) => (
          <Row
            key={r.t}
            icon={TrendingUp}
            title={r.t}
            meta={r.m}
            right={
              <span className="flex items-center gap-2">
                <Dot tone={r.d} />
                <span className="w-6 text-right text-[12px] font-medium tabular-nums text-white/80">{r.s}</span>
              </span>
            }
          />
        ))}
      </Frost>
    ),
  },
  {
    key: 'comms',
    title: 'Communicate with clients',
    desc: 'Replies written in your voice across email and WhatsApp, sent the moment they are ready.',
    mockup: (
      <Frost title="Draft reply" badge="In your voice">
        <motion.div variants={rowV} className="flex gap-1.5 px-1 pb-1">
          {[
            { icon: Mail, label: 'Email', on: true },
            { icon: Phone, label: 'WhatsApp', on: false },
          ].map((t) => {
            const TIcon = t.icon;
            return (
              <span
                key={t.label}
                className={
                  'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] ' +
                  (t.on ? 'bg-white/[0.1] text-white' : 'text-white/45')
                }
              >
                <TIcon className="h-3 w-3" />
                {t.label}
              </span>
            );
          })}
        </motion.div>
        <Row icon={Home} title="To: Sarah Chen" meta="re: 142 Oak St, still available?" tone="text-[#ff9a6e]" />
        <motion.div variants={rowV} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-[12px] leading-relaxed text-white/75">
            Hi Sarah, good news, 142 Oak St is still on the market. Want me to grab a Saturday
            slot so you can see it again before the open house?
          </p>
        </motion.div>
        <motion.div variants={rowV} className="flex items-center justify-between px-1 pt-1">
          <span className="text-[11px] text-white/40">Drafted from your last 40 emails</span>
          <span className="flex gap-2">
            <span className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-white/70">Edit</span>
            <span className="flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[11px] font-medium text-black">
              <Send className="h-3 w-3" /> Send
            </span>
          </span>
        </motion.div>
      </Frost>
    ),
  },
  {
    key: 'busywork',
    title: 'Offload the busywork',
    desc: 'Confirmations, follow-ups, data entry, scheduling, Chippi clears the grind in the background.',
    mockup: (
      <Frost title="Running for you" badge="Auto">
        <Row icon={CheckCircle2} title="Sent tour confirmation, Marcus" meta="Sat 2:00pm · added to calendar" tone="text-emerald-300/80" />
        <Row icon={CheckCircle2} title="Moved The Romeros → Offer" meta="stage advanced · note logged" tone="text-emerald-300/80" />
        <Row icon={CheckCircle2} title="Logged call notes, Priya" meta="3 min call · summarized" tone="text-emerald-300/80" />
        <Row icon={RefreshCw} title="Drafting 4 follow-ups…" meta="warm leads, no reply in 3 days" tone="text-[#ff9a6e]" active />
        <Row icon={Inbox} title="Sorted 12 inbound messages" meta="across email, text, and portals" />
      </Frost>
    ),
  },
  {
    key: 'plan',
    title: 'Plan your day',
    desc: 'A morning brief that lines up your tours, calls, and priorities so you start every day ahead.',
    mockup: (
      <Frost title="Today" badge="Tue · 8:00 AM">
        <motion.div variants={rowV} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-[12px] leading-relaxed text-white/75">
            3 tours, 2 calls, and 5 follow-ups due. Marcus is closest to closing, start there.
          </p>
        </motion.div>
        <Row icon={Phone} title="9:00, Call Marcus" meta="pre-approval expires Friday" tone="text-[#ff9a6e]" active />
        <Row icon={Home} title="11:30, Tour 142 Oak St" meta="with Sarah Chen" />
        <Row icon={Home} title="2:00, Tour 88 Pine Ave" meta="with the Romeros" />
        <Row icon={CalendarCheck} title="4:00, Follow up" meta="3 warm leads queued by Chippi" />
      </Frost>
    ),
  },
];

export function AgentCanvas() {
  return (
    <FeatureShowcase
      eyebrow="From inquiry to booked tour"
      headline={
        <>
          One teammate works
          <br className="hidden sm:block" /> the entire lead chase.
        </>
      }
      product={{
        name: 'Lead conversion teammate',
        icon: LayoutGrid,
        desc: 'Chippi reads every inquiry, ranks the next call, drafts in your voice, books the tour, and leaves a clear record of what changed.',
        cta: { label: 'See Chippi for agents', href: '/agents' },
      }}
      topFeatures={TOP_FEATURES}
      steps={STEPS}
      image="/marketing/feature-1.jpg"
      imageSide="right"
    />
  );
}
