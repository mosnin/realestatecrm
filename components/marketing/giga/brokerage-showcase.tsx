'use client';

/**
 * BrokerageShowcase, the brokerage-dashboard feature section (image on the
 * RIGHT, alternating after the realtor section). Same animated/frosted pattern,
 * focused on what a broker/team lead runs: lead routing, the live floor, team
 * performance, roles & approvals, and seats & billing.
 */

import {
  Building2,
  ArrowRightLeft,
  Waypoints,
  Activity,
  ShieldCheck,
  CheckCircle2,
  Users,
  TrendingUp,
  CreditCard,
  UserPlus,
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
  FeatureShowcase,
  Frost,
  Row,
  rowV,
  type ShowcaseStep,
} from './feature-showcase';

const TOP_FEATURES = [
  { icon: Waypoints, title: 'Routing on arrival', desc: 'Leads land with the right agent, every time.' },
  { icon: Activity, title: 'The floor, live', desc: "See every agent's pipeline in real time." },
  { icon: ShieldCheck, title: 'Approval-first', desc: 'Every send reviewed, every action logged.' },
];

const Chip = ({ label, tone }: { label: string; tone: string }) => (
  <span className={'rounded-full px-2 py-0.5 text-[10px] font-medium ' + tone}>{label}</span>
);

const STEPS: ShowcaseStep[] = [
  {
    key: 'routing',
    title: 'Lead routing',
    desc: 'New leads are auto-assigned to the right agent by territory and load, or hand-pick and write the brief. Every assignment is logged with the reason.',
    mockup: (
      <Frost title="Lead routing" badge="Auto">
        <motion.div variants={rowV} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#ff7a45] to-[#ff5fa2] text-[12px] font-semibold text-black">
            SC
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium text-white">Sarah Chen</span>
            <span className="block text-[11px] text-white/45">Downtown buyer · $650k</span>
          </span>
          <Chip label="New" tone="bg-white/10 text-white/60" />
        </motion.div>
        <Row icon={ArrowRightLeft} title="Assigned → Alex Rivera" meta="downtown territory · lowest load" tone="text-[#ff9a6e]" active />
        <Row icon={CheckCircle2} title="Matched territory: Downtown" tone="text-emerald-300/80" />
        <Row icon={CheckCircle2} title="Balanced by active load" tone="text-emerald-300/80" />
        <Row icon={CheckCircle2} title="Logged with reason" tone="text-emerald-300/80" />
      </Frost>
    ),
  },
  {
    key: 'floor',
    title: 'The floor, live',
    desc: 'Deals active, drafts pending, follow-ups due, per agent, read live from the work itself, not a Monday status meeting.',
    mockup: (
      <Frost title="The floor" badge="Live">
        <motion.div variants={rowV} className="grid grid-cols-3 gap-2 px-1 pb-2">
          {[
            { n: '35', l: 'Agents' },
            { n: '142', l: 'Deals' },
            { n: '28', l: 'Due today' },
          ].map((s) => (
            <div key={s.l} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-center">
              <span className="block text-[20px] font-semibold leading-none text-white">{s.n}</span>
              <span className="mt-1.5 block text-[10px] text-white/45">{s.l}</span>
            </div>
          ))}
        </motion.div>
        <Row icon={Users} title="Alex Rivera" meta="12 active · 3 drafts" right={<Chip label="5 due" tone="bg-amber-400/15 text-amber-300" />} />
        <Row icon={Users} title="Jordan Kim" meta="9 active · 1 draft" right={<Chip label="2 due" tone="bg-white/10 text-white/60" />} />
        <Row icon={Users} title="Sam Patel" meta="14 active · 4 drafts" right={<Chip label="8 due" tone="bg-[#ff7a45]/15 text-[#ff9a6e]" />} />
        <Row icon={Users} title="Mia Chen" meta="7 active · 0 drafts" right={<Chip label="clear" tone="bg-emerald-400/15 text-emerald-300" />} />
      </Frost>
    ),
  },
  {
    key: 'performance',
    title: 'Team performance',
    desc: 'Volume, closings, and response times across the whole team, surfaced automatically so you coach the right agents on the right things.',
    mockup: (
      <Frost title="Performance" badge="This month">
        <motion.div variants={rowV} className="grid grid-cols-3 gap-2 px-1 pb-2">
          {[
            { n: '$4.2M', l: 'Volume' },
            { n: '18', l: 'Closed' },
            { n: '94%', l: 'Reply rate' },
          ].map((s) => (
            <div key={s.l} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-center">
              <span className="block text-[18px] font-semibold leading-none text-white">{s.n}</span>
              <span className="mt-1.5 block text-[10px] text-white/45">{s.l}</span>
            </div>
          ))}
        </motion.div>
        <Row icon={TrendingUp} title="Alex Rivera" meta="7 closed · $1.6M" tone="text-[#ff9a6e]" right={<span className="text-[12px] font-medium text-white/70">#1</span>} active />
        <Row icon={TrendingUp} title="Jordan Kim" meta="6 closed · $1.3M" right={<span className="text-[12px] font-medium text-white/55">#2</span>} />
        <Row icon={TrendingUp} title="Sam Patel" meta="5 closed · $1.1M" right={<span className="text-[12px] font-medium text-white/55">#3</span>} />
      </Frost>
    ),
  },
  {
    key: 'roles',
    title: 'Roles & approvals',
    desc: 'Three roles, no permissions maze. Chippi drafts; every send goes through the right person, and the audit log keeps the whole floor honest.',
    mockup: (
      <Frost title="Approvals" badge="Audit on">
        <motion.div variants={rowV} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[12px] text-white/75">
          3 drafts awaiting your approval
        </motion.div>
        <Row icon={ShieldCheck} title="Alex → reply to Sarah Chen" meta="email · drafted in voice" tone="text-[#ff9a6e]" right={<Chip label="Review" tone="bg-[#ff7a45]/15 text-[#ff9a6e]" />} active />
        <Row icon={ShieldCheck} title="Jordan → price update, 88 Pine" meta="SMS to seller" right={<Chip label="Review" tone="bg-white/10 text-white/60" />} />
        <motion.div variants={rowV} className="flex gap-1.5 px-1 pt-1">
          {['Owner', 'Admin', 'Agent'].map((r, i) => (
            <Chip key={r} label={r} tone={i === 0 ? 'bg-white/[0.1] text-white' : 'bg-white/[0.04] text-white/50'} />
          ))}
        </motion.div>
        <Row icon={CheckCircle2} title="Every send logged" meta="1,204 audit entries" tone="text-emerald-300/80" />
      </Frost>
    ),
  },
  {
    key: 'seats',
    title: 'Seats & billing',
    desc: 'Per-seat plans that scale with the floor, add or reclaim seats in a click, with usage and billing always in view.',
    mockup: (
      <Frost title="Seats & billing" badge="Team plan">
        <motion.div variants={rowV} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-white/75">Seats used</span>
            <span className="font-medium text-white">18 / 20</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-[90%] rounded-full bg-gradient-to-r from-[#ff7a45] to-[#ff5fa2]" />
          </div>
        </motion.div>
        <Row icon={CreditCard} title="Team plan · per seat" meta="billed monthly · renews Apr 1" tone="text-[#ff9a6e]" />
        <Row icon={UserPlus} title="Added Mia Chen" meta="seat #18 · today" tone="text-emerald-300/80" />
        <Row icon={Users} title="Reclaimed inactive seat" meta="freed 1 seat last week" />
      </Frost>
    ),
  },
];

export function BrokerageShowcase() {
  return (
    <FeatureShowcase
      eyebrow="Built for brokerages"
      headline={
        <>
          One agent behind
          <br className="hidden sm:block" /> every desk.
        </>
      }
      product={{
        name: 'Brokerage Dashboard',
        icon: Building2,
        desc: 'Run the whole floor from one place, route leads, watch performance live, set roles and approvals, and manage seats, with every action on the audit log.',
        cta: { label: 'Explore brokerages', href: '/brokerages' },
      }}
      topFeatures={TOP_FEATURES}
      steps={STEPS}
      image="/marketing/feature-3.jpg"
      imageSide="right"
    />
  );
}
