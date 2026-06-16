'use client';

/**
 * Brokerage feature showcases (plural), three focused animated sections that
 * each spotlight one brokerage capability with a distinct frosted mockup:
 *
 *   - BrokerageRoutingShowcase  : how a lead is routed on arrival (decision flow
 *                                 with per-agent load bars and an audit line).
 *   - BrokerageFloorShowcase    : the live floor (metric tiles + a leaderboard).
 *   - BrokerageApprovalsShowcase: approval-first sends (approval queue + a
 *                                 vertical audit timeline).
 *
 * All three reuse the FeatureShowcase shell and the Frost/Row mockup kit, and
 * borrow brokerage-showcase's visual vocabulary (tiles, chips, bars) while
 * keeping every mockup visually distinct.
 */

import {
  Waypoints,
  Scale,
  ClipboardCheck,
  Check,
  Activity,
  Users,
  TrendingUp,
  ShieldCheck,
  UserCog,
  ScrollText,
  Pencil,
  Send,
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
  FeatureShowcase,
  Frost,
  rowV,
  type ShowcaseStep,
} from './feature-showcase';

/* ── Shared local helpers ──────────────────────────────────────────────────── */

const Chip = ({ label, tone }: { label: string; tone: string }) => (
  <span className={'rounded-full px-2 py-0.5 text-[10px] font-medium ' + tone}>{label}</span>
);

/** Avatar with initials, sized like brokerage-showcase's lead card avatar. */
const Avatar = ({ initials, accent }: { initials: string; accent?: boolean }) => (
  <span
    className={
      'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ' +
      (accent
        ? 'bg-gradient-to-br from-[#ff7a45] to-[#ff5fa2] text-black'
        : 'border border-white/10 bg-white/[0.05] text-white/70')
    }
  >
    {initials}
  </span>
);

/** A thin horizontal capacity/volume bar. */
const Bar = ({ pct, muted }: { pct: number; muted?: boolean }) => (
  <span className="block h-1.5 w-full overflow-hidden rounded-full bg-white/10">
    <span
      className={
        'block h-full rounded-full ' +
        (muted ? 'bg-white/25' : 'bg-gradient-to-r from-[#ff7a45] to-[#ff5fa2]')
      }
      style={{ width: pct + '%' }}
    />
  </span>
);

/* ── 1) Routing ────────────────────────────────────────────────────────────── */

const ROUTING_STEPS: ShowcaseStep[] = [
  {
    key: 'arrive',
    title: 'A lead arrives',
    desc: 'A new inquiry lands and enters routing instantly, no one has to triage the inbox first.',
    mockup: (
      <Frost title="Routing" badge="Auto">
        <motion.div
          variants={rowV}
          className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3"
        >
          <Avatar initials="SC" accent />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium text-white">Sarah Chen</span>
            <span className="block text-[11px] text-white/45">Downtown buyer · $650k</span>
          </span>
          <Chip label="New" tone="bg-white/10 text-white/60" />
        </motion.div>
        <motion.div variants={rowV} className="px-1 pt-1 text-[11px] text-white/45">
          Finding the right desk on the floor.
        </motion.div>
      </Frost>
    ),
  },
  {
    key: 'weigh',
    title: 'Chippi weighs the floor',
    desc: 'Candidate agents are scored by territory fit and current load, so the lead goes to the right desk with room to work it.',
    mockup: (
      <Frost title="Candidates">
        {[
          { initials: 'AR', name: 'Alex Rivera', meta: '12 active', pct: 60 },
          { initials: 'JK', name: 'Jordan Kim', meta: '9 active', pct: 42 },
          { initials: 'SP', name: 'Sam Patel', meta: '14 active', pct: 78 },
        ].map((a) => (
          <motion.div
            key={a.initials}
            variants={rowV}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5"
          >
            <Avatar initials={a.initials} />
            <span className="min-w-0 flex-1">
              <span className="mb-1.5 flex items-center justify-between gap-2">
                <span className="truncate text-[12.5px] font-medium text-white">{a.name}</span>
                <span className="flex-shrink-0 text-[11px] text-white/45">{a.meta}</span>
              </span>
              <Bar pct={a.pct} muted />
            </span>
          </motion.div>
        ))}
      </Frost>
    ),
  },
  {
    key: 'assign',
    title: 'Assigned, with the reason',
    desc: 'The best match is chosen and the reasoning is attached, territory matched, lowest load, so the call is never a black box.',
    mockup: (
      <Frost title="Assigned">
        <motion.div
          variants={rowV}
          className="flex items-center gap-3 rounded-xl border border-[#ff7a45]/40 bg-[#ff7a45]/[0.08] p-3 ring-1 ring-[#ff7a45]/30"
        >
          <Avatar initials="AR" accent />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium text-white">Alex Rivera</span>
            <span className="block text-[11px] text-white/55">Chosen agent</span>
          </span>
          <Chip label="Assigned" tone="bg-[#ff7a45]/15 text-[#ff9a6e]" />
        </motion.div>
        <motion.div variants={rowV} className="flex flex-wrap gap-1.5 px-1 pt-1.5">
          <Chip label="Downtown territory" tone="bg-emerald-400/15 text-emerald-300" />
          <Chip label="Lowest load" tone="bg-emerald-400/15 text-emerald-300" />
        </motion.div>
      </Frost>
    ),
  },
  {
    key: 'log',
    title: 'Logged for the record',
    desc: 'The assignment is written to the audit log with its reason and timestamp, so the whole floor can trace how the lead landed.',
    mockup: (
      <Frost title="Audit">
        <motion.div
          variants={rowV}
          className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"
        >
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
            <Check className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-medium text-white">Assigned to Alex Rivera</span>
            <span className="block text-[11px] text-white/45">reason logged · 2:14 PM</span>
          </span>
        </motion.div>
      </Frost>
    ),
  },
];

export function BrokerageRoutingShowcase() {
  return (
    <FeatureShowcase
      eyebrow="Leads routed on arrival"
      headline={
        <>
          The right agent,
          <br className="hidden sm:block" /> the moment a lead lands.
        </>
      }
      product={{
        name: 'Smart Routing',
        icon: Waypoints,
        desc: 'New leads are auto-assigned by territory and load, or hand-picked with a brief. Every assignment is logged with the reason.',
        cta: { label: 'See it work', href: '/demo' },
      }}
      topFeatures={[
        { icon: Waypoints, title: 'By territory and load', desc: 'The right desk, every time.' },
        { icon: Scale, title: 'Balanced automatically', desc: 'No agent buried, none idle.' },
        { icon: ClipboardCheck, title: 'Logged with the reason', desc: 'Every assignment on the record.' },
      ]}
      steps={ROUTING_STEPS}
      image="/marketing/brokerages-1.jpg"
      imageSide="right"
    />
  );
}

/* ── 2) Floor ──────────────────────────────────────────────────────────────── */

const FLOOR_STEPS: ShowcaseStep[] = [
  {
    key: 'today',
    title: 'Today, at a glance',
    desc: 'Headcount, deals in flight, and what is due today, read live from the work so the floor is never a guess.',
    mockup: (
      <Frost title="The floor" badge="Live">
        <motion.div variants={rowV} className="grid grid-cols-3 gap-2 px-1 py-1">
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
      </Frost>
    ),
  },
  {
    key: 'top',
    title: 'Who is on top',
    desc: 'A live leaderboard by volume, so you see who is carrying the floor without waiting for a report.',
    mockup: (
      <Frost title="Leaderboard">
        {[
          { initials: 'AR', name: 'Alex Rivera', meta: '$1.6M', pct: 100, rank: '#1' },
          { initials: 'JK', name: 'Jordan Kim', meta: '$1.3M', pct: 80, rank: '#2' },
          { initials: 'SP', name: 'Sam Patel', meta: '$1.1M', pct: 68, rank: '#3' },
        ].map((a) => (
          <motion.div
            key={a.initials}
            variants={rowV}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5"
          >
            <Avatar initials={a.initials} />
            <span className="min-w-0 flex-1">
              <span className="mb-1.5 flex items-center justify-between gap-2">
                <span className="truncate text-[12.5px] font-medium text-white">{a.name}</span>
                <span className="flex-shrink-0 text-[11px] text-white/45">{a.meta}</span>
              </span>
              <Bar pct={a.pct} />
            </span>
            <span className="flex-shrink-0 text-[12px] font-medium text-white/70">{a.rank}</span>
          </motion.div>
        ))}
      </Frost>
    ),
  },
  {
    key: 'stuck',
    title: 'Where it is stuck',
    desc: 'Bottlenecks surface on their own, drafts piling up for review and deals that have gone quiet, so nothing stalls in silence.',
    mockup: (
      <Frost title="Attention">
        <motion.div
          variants={rowV}
          className="flex items-center gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.08] px-3 py-2.5"
        >
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-amber-400/20 bg-amber-400/10 text-amber-300">
            <ClipboardCheck className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1 text-[12.5px] font-medium text-white">8 drafts waiting on review</span>
          <Chip label="Review" tone="bg-amber-400/15 text-amber-300" />
        </motion.div>
        <motion.div
          variants={rowV}
          className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5"
        >
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/55">
            <Activity className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1 text-[12.5px] font-medium text-white">3 deals quiet 3+ days</span>
          <Chip label="Nudge" tone="bg-white/10 text-white/60" />
        </motion.div>
      </Frost>
    ),
  },
  {
    key: 'month',
    title: 'This month',
    desc: 'Volume, closings, and reply rate month to date, the numbers a broker actually runs the team on.',
    mockup: (
      <Frost title="Performance" badge="MTD">
        <motion.div variants={rowV} className="grid grid-cols-3 gap-2 px-1 py-1">
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
      </Frost>
    ),
  },
];

export function BrokerageFloorShowcase() {
  return (
    <FeatureShowcase
      eyebrow="The floor, live"
      headline={
        <>
          The whole floor,
          <br className="hidden sm:block" /> in one glance.
        </>
      }
      product={{
        name: 'Floor View',
        icon: Activity,
        desc: 'Deals, drafts, follow-ups, and closings per agent, read live from the work itself, not a Monday status meeting.',
        cta: { label: 'See it work', href: '/demo' },
      }}
      topFeatures={[
        { icon: Activity, title: 'Live, not weekly', desc: 'Read straight from the work.' },
        { icon: Users, title: 'Per agent', desc: 'Pipeline and load for everyone.' },
        { icon: TrendingUp, title: 'Spot the bottleneck', desc: 'See where deals are stuck.' },
      ]}
      steps={FLOOR_STEPS}
      image="/marketing/brokerages-2.jpg"
      imageSide="left"
    />
  );
}

/* ── 3) Approvals ──────────────────────────────────────────────────────────── */

const ApproveBtn = () => (
  <span className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-[#ff7a45] to-[#ff5fa2] px-2 py-1 text-[10px] font-semibold text-black">
    <Check className="h-3 w-3" /> Approve
  </span>
);

const EditBtn = () => (
  <span className="flex items-center gap-1 rounded-lg border border-white/12 bg-white/[0.04] px-2 py-1 text-[10px] font-medium text-white/70">
    <Pencil className="h-3 w-3" /> Edit
  </span>
);

const APPROVALS_STEPS: ShowcaseStep[] = [
  {
    key: 'queue',
    title: 'Drafts awaiting review',
    desc: 'Every drafted send queues for the right approver, with who wrote it and what it does in one line.',
    mockup: (
      <Frost title="Approvals" badge="3 pending">
        {[
          { initials: 'AR', who: 'Alex', action: 'reply to Sarah Chen', meta: 'email · drafted in voice' },
          { initials: 'JK', who: 'Jordan', action: 'price update, 88 Pine', meta: 'SMS to seller' },
        ].map((q) => (
          <motion.div
            key={q.action}
            variants={rowV}
            className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
          >
            <div className="flex items-center gap-3">
              <Avatar initials={q.initials} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium text-white">
                  {q.who} → {q.action}
                </span>
                <span className="block truncate text-[11px] text-white/45">{q.meta}</span>
              </span>
            </div>
            <div className="mt-2.5 flex justify-end gap-1.5">
              <EditBtn />
              <ApproveBtn />
            </div>
          </motion.div>
        ))}
      </Frost>
    ),
  },
  {
    key: 'approve',
    title: 'Approve in a tap',
    desc: 'Open a draft, read it in full, and send it as-is or tweak first, no copy-paste, no leaving the queue.',
    mockup: (
      <Frost title="Review">
        <motion.div
          variants={rowV}
          className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
        >
          <div className="flex items-center gap-3">
            <Avatar initials="AR" />
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-medium text-white">Alex → reply to Sarah Chen</span>
              <span className="block text-[11px] text-white/45">email · drafted in voice</span>
            </span>
          </div>
          <p className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 text-[11.5px] leading-relaxed text-white/65">
            Hi Sarah, the Downtown loft you flagged just dropped to $650k. Want me to set up a
            walkthrough this weekend?
          </p>
          <div className="mt-3 flex justify-end">
            <span className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#ff7a45] to-[#ff5fa2] px-3 py-1.5 text-[11px] font-semibold text-black">
              <Send className="h-3 w-3" /> Approve &amp; send
            </span>
          </div>
        </motion.div>
      </Frost>
    ),
  },
  {
    key: 'roles',
    title: 'Roles, not a maze',
    desc: 'Three clear roles instead of a permissions matrix, so everyone knows exactly what they can approve.',
    mockup: (
      <Frost title="Access">
        <motion.div variants={rowV} className="flex flex-wrap gap-1.5 px-1 py-1">
          <Chip label="Owner" tone="bg-[#ff7a45]/15 text-[#ff9a6e]" />
          <Chip label="Admin" tone="bg-white/[0.08] text-white/70" />
          <Chip label="Agent" tone="bg-white/[0.04] text-white/50" />
        </motion.div>
        <motion.div
          variants={rowV}
          className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
        >
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-[#ff9a6e]">
            <UserCog className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1 text-[12px] text-white/75">
            Owners and admins approve sends, agents draft and request.
          </span>
        </motion.div>
      </Frost>
    ),
  },
  {
    key: 'audit',
    title: 'The audit log',
    desc: 'Every action is timestamped on one running log, so the whole floor stays honest and traceable.',
    mockup: (
      <Frost title="Audit log">
        <motion.div variants={rowV} className="relative pl-5">
          <span aria-hidden className="absolute left-[3px] top-1 bottom-1 w-px bg-white/12" />
          {[
            { action: 'Owner approved reply to Sarah Chen', meta: '2:14 PM', accent: true },
            { action: 'Alex drafted price update, 88 Pine', meta: '1:58 PM', accent: false },
            { action: 'Jordan requested approval', meta: '1:40 PM', accent: false },
            { action: 'Lead assigned to Alex Rivera', meta: '1:22 PM', accent: false },
          ].map((e, i) => (
            <span key={i} className="relative mb-3 block last:mb-0">
              <span
                aria-hidden
                className={
                  'absolute -left-[17px] top-1 h-2 w-2 rounded-full ring-2 ring-[#0b0b0d] ' +
                  (e.accent ? 'bg-gradient-to-br from-[#ff7a45] to-[#ff5fa2]' : 'bg-white/30')
                }
              />
              <span className="block text-[12px] font-medium text-white">{e.action}</span>
              <span className="mt-0.5 flex items-center gap-1 text-[11px] text-white/45">
                <ScrollText className="h-3 w-3" /> {e.meta}
              </span>
            </span>
          ))}
        </motion.div>
      </Frost>
    ),
  },
];

export function BrokerageApprovalsShowcase() {
  return (
    <FeatureShowcase
      eyebrow="Every send accountable"
      headline={
        <>
          Nothing leaves
          <br className="hidden sm:block" /> without a name on it.
        </>
      }
      product={{
        name: 'Approvals & Audit',
        icon: ShieldCheck,
        desc: 'Chippi drafts; every send routes to the right person to approve, and the audit log keeps the whole floor honest.',
        cta: { label: 'See it work', href: '/demo' },
      }}
      topFeatures={[
        { icon: ShieldCheck, title: 'Approval-first', desc: 'Every send reviewed before it goes.' },
        { icon: UserCog, title: 'Three clear roles', desc: 'Owner, admin, agent. No maze.' },
        { icon: ScrollText, title: 'Full audit log', desc: 'Every action, timestamped.' },
      ]}
      steps={APPROVALS_STEPS}
      image="/marketing/brokerages-3.jpg"
      imageSide="right"
    />
  );
}
