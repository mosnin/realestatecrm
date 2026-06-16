'use client';

/**
 * RealtorShowcase — the realtor-dashboard feature section (image on the LEFT).
 * Same animated/frosted pattern as <AgentCanvas>, mirrored, focused on the real
 * features an agent uses day to day: lead qualification, deal pipelines,
 * contact management, tours, and a public profile.
 */

import {
  Home,
  LayoutDashboard,
  Zap,
  Globe,
  CheckCircle2,
  Users,
  CalendarCheck,
  Star,
  Eye,
  BadgeCheck,
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
  { icon: LayoutDashboard, title: 'One workspace', desc: 'Lead to close in a single view, on any device.' },
  { icon: Zap, title: 'Fast by default', desc: 'Everything a tap away — no training required.' },
  { icon: Globe, title: 'Your brand, public', desc: 'A profile page that wins you the listing.' },
];

const Chip = ({ label, tone }: { label: string; tone: string }) => (
  <span className={'rounded-full px-2 py-0.5 text-[10px] font-medium ' + tone}>{label}</span>
);

const STEPS: ShowcaseStep[] = [
  {
    key: 'qualify',
    title: 'Lead qualification',
    desc: 'Chippi scores every lead against your real pipeline and shows the reasons, so you know who is ready to move now.',
    mockup: (
      <Frost title="Lead qualification" badge="Auto-scored">
        <motion.div
          variants={rowV}
          className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#ff7a45] to-[#ff5fa2] text-[12px] font-semibold text-black">
            SC
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium text-white">Sarah Chen</span>
            <span className="block text-[11px] text-white/45">Buyer · downtown · 2-bed</span>
          </span>
          <span className="text-right">
            <span className="block text-[22px] font-semibold leading-none text-white">92</span>
            <span className="text-[10px] font-medium tracking-wide text-[#ff9a6e]">HOT</span>
          </span>
        </motion.div>
        {[
          { t: 'Pre-approved to $650k', s: '+30' },
          { t: 'Replied in 5 min, twice', s: '+18' },
          { t: 'Toured two homes', s: '+22' },
          { t: 'Budget matches inventory', s: '+22' },
        ].map((r) => (
          <Row
            key={r.t}
            icon={CheckCircle2}
            title={r.t}
            tone="text-emerald-300/80"
            right={<span className="text-[12px] font-medium tabular-nums text-white/70">{r.s}</span>}
          />
        ))}
      </Frost>
    ),
  },
  {
    key: 'pipeline',
    title: 'Deal pipelines',
    desc: 'A drag-free board that moves with the work — every deal in the right stage, every next step in view.',
    mockup: (
      <Frost title="Deal pipeline" badge="6 active">
        <motion.div variants={rowV} className="grid grid-cols-4 gap-1.5 px-1 pb-2">
          {[
            { n: '3', l: 'New' },
            { n: '2', l: 'Touring' },
            { n: '1', l: 'Offer' },
            { n: '1', l: 'Closing' },
          ].map((s) => (
            <div key={s.l} className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-2 text-center">
              <span className="block text-[16px] font-semibold leading-none text-white">{s.n}</span>
              <span className="mt-1 block text-[9px] text-white/45">{s.l}</span>
            </div>
          ))}
        </motion.div>
        <Row icon={Home} title="142 Oak St" meta="Sarah Chen · $640k" right={<Chip label="Touring" tone="bg-[#ff7a45]/15 text-[#ff9a6e]" />} />
        <Row icon={Home} title="88 Pine Ave" meta="The Romeros · $720k" right={<Chip label="Offer" tone="bg-sky-400/15 text-sky-300" />} />
        <Row icon={Home} title="9 Birch Ln" meta="Marcus Lee · $510k" right={<Chip label="Closing" tone="bg-emerald-400/15 text-emerald-300" />} />
      </Frost>
    ),
  },
  {
    key: 'contacts',
    title: 'Contact management',
    desc: 'Every client, lead, and past sale in one place — tagged, deduped, and always up to date.',
    mockup: (
      <Frost title="Contacts" badge="1,204">
        <Row icon={Users} title="Marcus Lee" meta="texted 2 days ago" right={<Chip label="Buyer" tone="bg-[#ff7a45]/15 text-[#ff9a6e]" />} />
        <Row icon={Users} title="Priya Patel" meta="emailed 1 week ago" right={<Chip label="Seller" tone="bg-sky-400/15 text-sky-300" />} />
        <Row icon={Users} title="The Romeros" meta="called today" right={<Chip label="Buyer" tone="bg-[#ff7a45]/15 text-[#ff9a6e]" />} />
        <Row icon={Users} title="Devon Ray" meta="new — web form" right={<Chip label="Lead" tone="bg-white/10 text-white/60" />} />
        <Row icon={Users} title="Janet Cole" meta="past client · 2023" right={<Chip label="Sphere" tone="bg-emerald-400/15 text-emerald-300" />} />
      </Frost>
    ),
  },
  {
    key: 'tours',
    title: 'Tours',
    desc: 'Approve a time and the tour books itself — calendar, client, and deal all updated, confirmation sent.',
    mockup: (
      <Frost title="Tours" badge="This week">
        <Row icon={CalendarCheck} title="Sat 2:00 — 142 Oak St" meta="Sarah Chen" tone="text-[#ff9a6e]" right={<Chip label="Confirmed" tone="bg-emerald-400/15 text-emerald-300" />} active />
        <Row icon={CalendarCheck} title="Sun 11:00 — 88 Pine Ave" meta="The Romeros" right={<Chip label="Confirmed" tone="bg-emerald-400/15 text-emerald-300" />} />
        <Row icon={CalendarCheck} title="Mon 4:30 — 9 Birch Ln" meta="Marcus Lee" right={<Chip label="Pending" tone="bg-amber-400/15 text-amber-300" />} />
        <Row icon={CalendarCheck} title="Wed 1:00 — 12 Cedar Ct" meta="Devon Ray" right={<Chip label="Requested" tone="bg-white/10 text-white/60" />} />
      </Frost>
    ),
  },
  {
    key: 'profile',
    title: 'Public profile',
    desc: 'A polished, shareable profile that shows your listings, reviews, and track record — and wins you the next client.',
    mockup: (
      <Frost title="Public profile" badge="Live">
        <motion.div variants={rowV} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#ff7a45] to-[#ff5fa2] text-[14px] font-semibold text-black">
            AR
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-[13px] font-medium text-white">
              Alex Rivera
              <BadgeCheck className="h-3.5 w-3.5 text-[#ff9a6e]" />
            </span>
            <span className="block text-[11px] text-white/45">Realtor® · Downtown</span>
          </span>
          <span className="flex items-center gap-1 text-[12px] text-white/80">
            <Star className="h-3.5 w-3.5 fill-current text-amber-300" /> 4.9
          </span>
        </motion.div>
        <motion.div variants={rowV} className="grid grid-cols-3 gap-1.5">
          {[
            { n: '32', l: 'Listings' },
            { n: '128', l: 'Closed' },
            { n: '87', l: 'Reviews' },
          ].map((s) => (
            <div key={s.l} className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-2.5 text-center">
              <span className="block text-[17px] font-semibold leading-none text-white">{s.n}</span>
              <span className="mt-1 block text-[9px] text-white/45">{s.l}</span>
            </div>
          ))}
        </motion.div>
        <Row icon={Eye} title="chippi.com/alex-rivera" meta="1,240 views this month" right={<Chip label="Share" tone="bg-white/10 text-white/60" />} />
      </Frost>
    ),
  },
];

export function RealtorShowcase() {
  return (
    <FeatureShowcase
      eyebrow="Built for agents"
      headline={
        <>
          Run your whole desk,
          <br className="hidden sm:block" /> from one screen.
        </>
      }
      product={{
        name: 'Realtor Dashboard',
        icon: Home,
        desc: 'The home base for your business — qualify leads, move deals, manage every contact, book tours, and show off a public profile that wins you listings.',
        cta: { label: 'Explore the dashboard', href: '/agents' },
      }}
      topFeatures={TOP_FEATURES}
      steps={STEPS}
      image="/marketing/feature-2.jpg"
      imageSide="left"
    />
  );
}
