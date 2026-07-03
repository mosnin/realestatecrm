'use client';

/**
 * Two extra integrations feature sections that complement integrations-showcase.tsx.
 * Where that one walks the connected surfaces (inbox / calendar / CRM / messaging /
 * e-sign), these two cover the bookends of the integration story:
 *
 *   1. IntegrationsSetupShowcase   - the OAuth / connect flow (app tiles flip from
 *      a "Connect" button to a green "Connected" chip after a one-click consent).
 *   2. IntegrationsAutomationShowcase - the trigger -> action "recipe" that runs on
 *      its own (stacked WHEN / THEN cards joined by a thin vertical connector).
 *
 * Grounded in the real apps Chippi connects through Composio. No invented brands:
 * app "logos" are neutral tiles with the app name as text plus a small lucide icon.
 */

import {
  Plug,
  MousePointerClick,
  ShieldCheck,
  Timer,
  Workflow,
  Webhook,
  Clock,
  Mail,
  Calendar,
  Database,
  FileSignature,
  Check,
  ArrowDown,
  CalendarCheck,
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
  FeatureShowcase,
  Frost,
  Row,
  rowV,
  type ShowcaseStep,
} from './feature-showcase';

/* ── shared little pieces ──────────────────────────────────────────────────── */

const Chip = ({ label, tone }: { label: string; tone: string }) => (
  <span className={'rounded-full px-2 py-0.5 text-[10px] font-medium ' + tone}>{label}</span>
);

/** Status line with a colored dot, for "what Chippi is doing now" lists. */
const StatusLine = ({ tone, label, meta }: { tone: string; label: string; meta?: string }) => (
  <motion.div variants={rowV} className="flex items-center gap-2.5 rounded-xl bg-white/[0.03] px-3 py-2">
    <span className={'h-1.5 w-1.5 flex-shrink-0 rounded-full ' + tone} />
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[12px] font-medium text-white">{label}</span>
      {meta ? <span className="block truncate text-[11px] text-white/45">{meta}</span> : null}
    </span>
  </motion.div>
);

/* ════════════════════════════════════════════════════════════════════════════
 * 1) SETUP / the OAuth connect flow with app tiles changing state
 * ════════════════════════════════════════════════════════════════════════════ */

type AppTile = { name: string; icon: React.ElementType };

const SETUP_APPS: AppTile[] = [
  { name: 'Gmail', icon: Mail },
  { name: 'Google Calendar', icon: Calendar },
  { name: 'HubSpot', icon: Database },
  { name: 'DocuSign', icon: FileSignature },
];

/** A single app tile in the connect grid: square glyph, app name, and a state pill. */
function Tile({ app, right }: { app: AppTile; right: React.ReactNode }) {
  const Icon = app.icon;
  return (
    <motion.div
      variants={rowV}
      className="flex flex-col gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3"
    >
      <span className="flex items-center gap-2">
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-white/55">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 truncate text-[12px] font-medium text-white">{app.name}</span>
      </span>
      {right}
    </motion.div>
  );
}

const ConnectBtn = (
  <span className="inline-flex items-center justify-center rounded-md border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[10.5px] font-medium text-white/70">
    Connect
  </span>
);

const ConnectedChip = (
  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-400/15 px-2 py-1 text-[10.5px] font-medium text-emerald-300">
    <Check className="h-3 w-3" /> Connected
  </span>
);

const SETUP_TOP_FEATURES = [
  { icon: MousePointerClick, title: 'One click', desc: 'OAuth, not API keys.' },
  { icon: ShieldCheck, title: 'Scoped and revocable', desc: 'You stay in control of access.' },
  { icon: Timer, title: 'About two minutes', desc: 'From connect to working.' },
];

const SETUP_STEPS: ShowcaseStep[] = [
  {
    key: 'pick',
    title: 'Pick your tools',
    desc: 'Choose from 50+ apps connected through Composio, your inbox, calendar, CRM, e-sign, and more. Pick the ones you already use.',
    mockup: (
      <Frost title="Connect">
        <motion.div variants={rowV} className="px-1 pb-1 text-[11px] text-white/45">
          Choose the tools you already use
        </motion.div>
        <div className="grid grid-cols-2 gap-2">
          {SETUP_APPS.map((app) => (
            <Tile key={app.name} app={app} right={ConnectBtn} />
          ))}
        </div>
      </Frost>
    ),
  },
  {
    key: 'authorize',
    title: 'Authorize in a click',
    desc: 'Sign in with the account you already have. You grant a scoped set of permissions, and you can revoke them any time.',
    mockup: (
      <Frost title="Authorize">
        <motion.div
          variants={rowV}
          className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5"
        >
          <span className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-white/60">
              <Mail className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-white">Chippi wants to access Gmail</span>
              <span className="block text-[11px] text-white/45">via Composio</span>
            </span>
          </span>
          <div className="mt-3 space-y-1.5 border-t border-white/[0.08] pt-3">
            {['Read your messages', 'Send email on your behalf', 'Manage drafts and labels'].map((scope) => (
              <span key={scope} className="flex items-center gap-2 text-[11.5px] text-white/60">
                <Check className="h-3 w-3 flex-shrink-0 text-white/40" /> {scope}
              </span>
            ))}
          </div>
          <span className="mt-3.5 flex items-center justify-end gap-2">
            <span className="rounded-md px-2.5 py-1.5 text-[11px] font-medium text-white/50">Cancel</span>
            <span className="rounded-md bg-gradient-to-r from-[#ff7a45] to-[#ff9a6e] px-3.5 py-1.5 text-[11px] font-semibold text-black">
              Allow
            </span>
          </span>
        </motion.div>
      </Frost>
    ),
  },
  {
    key: 'connected',
    title: 'Connected',
    desc: 'Each tool flips to connected the moment you authorize it. No engineering, no spreadsheets, no copy-pasted keys.',
    mockup: (
      <Frost title="Connected" badge="Done">
        <div className="grid grid-cols-2 gap-2">
          {SETUP_APPS.map((app) => (
            <Tile key={app.name} app={app} right={ConnectedChip} />
          ))}
        </div>
      </Frost>
    ),
  },
  {
    key: 'working',
    title: 'Working already',
    desc: 'Chippi starts working inside your tools right away, reading what comes in and drafting what goes out, in your voice.',
    mockup: (
      <Frost title="Live" badge="Active">
        <StatusLine tone="bg-emerald-400" label="Reading new mail in Gmail" meta="sorted against your deals" />
        <StatusLine tone="bg-emerald-400" label="Sending replies in your voice" meta="the moment a lead lands" />
        <StatusLine tone="bg-sky-400" label="Watching Google Calendar" meta="availability ready for tours" />
      </Frost>
    ),
  },
];

export function IntegrationsSetupShowcase() {
  return (
    <FeatureShowcase
      eyebrow="Two-minute setup"
      headline={
        <>
          Connect once.
          <br className="hidden sm:block" /> Chippi takes it from there.
        </>
      }
      product={{
        name: 'Quick Connect',
        icon: Plug,
        desc: 'Connect the tools you already pay for with a click through Composio. No engineering, no spreadsheets. Chippi starts working inside them right away.',
        cta: { label: 'Browse integrations', href: '/integrations' },
      }}
      topFeatures={SETUP_TOP_FEATURES}
      steps={SETUP_STEPS}
      image="/marketing/integrations-2.jpg"
      imageSide="left"
    />
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 * 2) AUTOMATION / the trigger to action "recipe" (WHEN / THEN cards + connector)
 * ════════════════════════════════════════════════════════════════════════════ */

/** A small app badge used on recipe cards (neutral tile + app name, no fake logo). */
const AppBadge = ({ icon: Icon, name }: { icon: React.ElementType; name: string }) => (
  <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.05] px-2 py-1 text-[10.5px] font-medium text-white/70">
    <Icon className="h-3 w-3 flex-shrink-0 text-white/50" /> {name}
  </span>
);

/**
 * One card in the recipe. `kind` sets the WHEN / THEN label and accent. `faint`
 * dims an upstream card so the active one below reads as the current step.
 */
function RecipeCard({
  kind,
  badge,
  title,
  faint,
  right,
}: {
  kind: 'WHEN' | 'THEN';
  badge: React.ReactNode;
  title: string;
  faint?: boolean;
  right?: React.ReactNode;
}) {
  const isWhen = kind === 'WHEN';
  return (
    <motion.div
      variants={rowV}
      className={
        'rounded-xl border p-3 ' +
        (faint
          ? 'border-white/[0.06] bg-white/[0.02] opacity-50'
          : 'border-white/10 bg-white/[0.04]')
      }
    >
      <span className="flex items-center justify-between gap-2">
        <span
          className={
            'rounded px-1.5 py-0.5 text-[9.5px] font-semibold tracking-wide ' +
            (isWhen ? 'bg-[#ff7a45]/15 text-[#ff9a6e]' : 'bg-sky-400/15 text-sky-300')
          }
        >
          {kind}
        </span>
        {badge}
      </span>
      <span className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium text-white">{title}</span>
        {right}
      </span>
    </motion.div>
  );
}

/** Thin vertical connector with a downward chevron, between recipe cards. */
const Connector = () => (
  <motion.div variants={rowV} className="flex justify-center py-0.5" aria-hidden>
    <span className="flex flex-col items-center">
      <span className="h-3 w-px bg-white/15" />
      <ArrowDown className="h-3 w-3 text-white/30" />
      <span className="h-3 w-px bg-white/15" />
    </span>
  </motion.div>
);

const AUTOMATION_TOP_FEATURES = [
  { icon: Workflow, title: 'Trigger to action', desc: 'It reacts the moment things change.' },
  { icon: Webhook, title: 'Across your stack', desc: 'One job spans inbox, calendar, CRM.' },
  { icon: Clock, title: 'Around the clock', desc: 'Nights and weekends covered.' },
];

const AUTOMATION_STEPS: ShowcaseStep[] = [
  {
    key: 'trigger',
    title: 'A new lead in Follow Up Boss',
    desc: 'Chippi watches your connected tools. The moment a new buyer lead lands in Follow Up Boss, the recipe fires.',
    mockup: (
      <Frost title="Recipe" badge="Live">
        <RecipeCard
          kind="WHEN"
          badge={<AppBadge icon={Database} name="Follow Up Boss" />}
          title="New buyer lead created"
          right={<Chip label="Trigger" tone="bg-[#ff7a45]/15 text-[#ff9a6e]" />}
        />
      </Frost>
    ),
  },
  {
    key: 'draft',
    title: 'Chippi drafts the reply',
    desc: 'It reads the lead and sends a first reply in your voice from your own Gmail.',
    mockup: (
      <Frost title="Recipe">
        <RecipeCard
          kind="WHEN"
          badge={<AppBadge icon={Database} name="Follow Up Boss" />}
          title="New buyer lead created"
          faint
        />
        <Connector />
        <RecipeCard
          kind="THEN"
          badge={<AppBadge icon={Mail} name="Gmail" />}
          title="Draft reply in your voice"
          right={<Chip label="Awaiting tap" tone="bg-white/10 text-white/60" />}
        />
      </Frost>
    ),
  },
  {
    key: 'book',
    title: 'Books on Google Calendar',
    desc: 'It finds a real open slot and sends the calendar invite, all against your actual availability.',
    mockup: (
      <Frost title="Recipe">
        <RecipeCard
          kind="THEN"
          badge={<AppBadge icon={Calendar} name="Google Calendar" />}
          title="Book Sat 2:00, send the invite"
          right={
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-sky-400/15 text-sky-300">
              <CalendarCheck className="h-3.5 w-3.5" />
            </span>
          }
        />
      </Frost>
    ),
  },
  {
    key: 'log',
    title: 'Logged back to the CRM',
    desc: 'Every step is written back, so the deal moves forward and your CRM stays the source of truth without any manual entry.',
    mockup: (
      <Frost title="Recipe">
        <RecipeCard
          kind="THEN"
          badge={<AppBadge icon={Database} name="Follow Up Boss" />}
          title="Update the deal, log every step"
          right={
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-400/15 px-2 py-1 text-[10.5px] font-medium text-emerald-300">
              <Check className="h-3 w-3" /> Done
            </span>
          }
        />
        <Connector />
        <StatusLine tone="bg-emerald-400" label="Deal stage advanced" meta="reply sent, tour booked, logged" />
      </Frost>
    ),
  },
];

export function IntegrationsAutomationShowcase() {
  return (
    <FeatureShowcase
      eyebrow="It runs while you sleep"
      headline={
        <>
          When something happens,
          <br className="hidden sm:block" /> Chippi acts.
        </>
      }
      product={{
        name: 'Always On',
        icon: Workflow,
        desc: 'Chippi watches your connected tools and acts on what matters, drafting, booking, and logging across them, around the clock.',
        cta: { label: 'Browse integrations', href: '/integrations' },
      }}
      topFeatures={AUTOMATION_TOP_FEATURES}
      steps={AUTOMATION_STEPS}
      image="/marketing/integrations-3.jpg"
      imageSide="right"
    />
  );
}
