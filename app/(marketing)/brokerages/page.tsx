/**
 * `/brokerages` — Chippi for the brokerage and its floor, on the calm site
 * system.
 *
 * The one idea: give every agent an extra teammate, and give yourself the whole
 * room on one surface — leads routed, deals tracked, bottlenecks surfaced.
 *
 * Rebuilt from the legacy studio-ASCII version (BrokeragesContent) onto the calm
 * vocabulary (PageHero, FeatureRow, inverse band). Auth users bounce to their
 * workspace; brokers want a walkthrough, so "Book a demo" is prominent.
 */

import Link from 'next/link';
import { ArrowRight, Users, TimerReset, ShieldCheck } from 'lucide-react';
import { PageHero } from '@/components/marketing/site/page-hero';
import { FeatureRow } from '@/components/marketing/site/feature-row';
import { Reveal } from '@/components/marketing/site/reveal';
import { RoutingPanel, LeaderboardPanel, TeamChatPanel, MembersPanel } from '@/components/marketing/site/home/more-panels';
import { TITLE_FONT } from '@/lib/typography';

export const metadata = { title: 'For brokerages · Chippi' };

const empower = [
  {
    Icon: Users,
    title: 'Every agent, a teammate',
    body: 'Each realtor keeps their own Chippi workspace — it reads their inbox, drafts in their voice, and keeps every deal current. You add a team layer on top; you never take their workspace away.',
  },
  {
    Icon: TimerReset,
    title: 'Time, compressed',
    body: 'First touch, follow-ups, tour booking, deal updates — the repetitive work runs itself. The floor spends its hours on the conversations that close.',
  },
  {
    Icon: ShieldCheck,
    title: 'Nothing leaves without a name on it',
    body: 'Chippi drafts; the realtor approves. Every send goes through the person whose name is on it. The floor stays in the driver’s seat.',
  },
];

const signals = [
  { label: 'Stalled', body: 'Active deals nobody has touched in a week.' },
  { label: 'Overdue', body: 'Follow-ups the floor promised and missed.' },
  { label: 'Going cold', body: 'Hot leads with no recent contact.' },
];

const features = [
  {
    no: '01',
    eyebrow: 'Lead distribution',
    title: 'Every lead, the right realtor.',
    sub: 'Auto-assign by territory and load, or hand-pick the realtor and write the brief. Chippi can reassign to anyone on the floor with the reason logged to the activity trail.',
    points: [
      'Auto-assignment, weighted by who has room',
      'Hand-pick and reassign — always your override',
      'Every assignment logged, with the reason, per realtor',
    ],
    image: { label: 'Lead routing', sublabel: 'Screenshot · 1280 × 960' },
  },
  {
    no: '02',
    eyebrow: 'Performance',
    title: 'See what the floor is closing.',
    sub: 'Ask Chippi to roll up any realtor’s week: deals active, won, and lost; new and hot leads; drafts pending and their approval rate. The numbers come from the work, not a status meeting.',
    points: [
      'Per-realtor rollups across deals, leads, and drafts',
      'Response time and pipeline value, live',
      'A sortable leaderboard the floor can see',
    ],
    image: { label: 'Team leaderboard', sublabel: 'Screenshot · 1280 × 960' },
    flip: true,
  },
  {
    no: '03',
    eyebrow: 'Team chat',
    title: 'Talk shop, on the same page.',
    sub: 'Channels that live with the deal, not next to it. Mention @chippi in a channel and it answers in line — where the deal stands, a drafted reply, a number pulled from the record.',
    points: [
      'Per-deal channels, archived on close',
      'Mention @chippi to pull it into the thread',
      'Chippi stays out of general channels unless invited',
    ],
    image: { label: 'Team chat', sublabel: 'Screenshot · 1280 × 960' },
  },
  {
    no: '04',
    eyebrow: 'Members & roles',
    title: 'Who belongs, and what they see.',
    sub: 'Three roles, no permissions matrix. Owner runs the show, Admin manages the floor, Member is the realtor doing the work. Admins see the rollup; private drafts and notes stay private.',
    points: [
      'Owner, Admin, Member — three tiers, no more',
      'Invite by link with the role pre-set',
      'Aggregate metrics are team-visible; private surfaces stay private',
    ],
    image: { label: 'Members & roles', sublabel: 'Screenshot · 1280 × 960' },
    flip: true,
  },
];

export default function BrokeragesPage() {
  return (
    <>
      <PageHero
        eyebrow="For brokerages and teams"
        title="One agent for the whole floor."
        sub="Give every agent an extra teammate, and give yourself the whole room on one surface. Chippi routes the leads, tracks what the floor is closing, and surfaces where deals stall."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'Book a demo', href: '/demo' }}
      />

      {/* Empower the floor */}
      <section className="bg-background px-4 py-20 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <Reveal className="max-w-2xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Empower the floor
            </p>
            <h2 style={TITLE_FONT} className="mt-3 text-3xl tracking-tight text-foreground sm:text-[2.5rem]">
              Give every agent an extra teammate.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              A brokerage doesn’t fail on features — it fails when the realtors stop
              logging in. Chippi makes the floor faster first, and gives you the room
              as a byproduct.
            </p>
          </Reveal>
          <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-marketing-2xl border border-border/60 bg-border/60 md:grid-cols-3">
            {empower.map((s) => (
              <Reveal key={s.title}>
                <div className="h-full bg-background p-7">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-brand-subtle text-brand">
                    <s.Icon className="h-4 w-4" />
                  </span>
                  <h3 className="mt-4 text-[17px] font-semibold leading-snug text-foreground">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Feature sequence */}
      <section className="bg-background px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-5xl space-y-24 sm:space-y-32">
          {features.map((f) => (
            <FeatureRow
              key={f.no}
              {...f}
              panel={
                f.no === '01' ? (
                  <RoutingPanel />
                ) : f.no === '02' ? (
                  <LeaderboardPanel />
                ) : f.no === '03' ? (
                  <TeamChatPanel />
                ) : (
                  <MembersPanel />
                )
              }
            />
          ))}
        </div>
      </section>

      {/* Bottlenecks */}
      <section className="bg-background px-4 pb-8 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <Reveal className="max-w-2xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Productivity &amp; bottlenecks
            </p>
            <h2 style={TITLE_FONT} className="mt-3 text-3xl tracking-tight text-foreground sm:text-[2.5rem]">
              Find where deals stall. Then unblock them.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Ask Chippi how the floor is doing and it reads the real work, not a
              spreadsheet someone updated last week. The bottleneck surfaces; you
              decide the move.
            </p>
          </Reveal>
          <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-marketing-2xl border border-border/60 bg-border/60 sm:grid-cols-3">
            {signals.map((s) => (
              <Reveal key={s.label}>
                <div className="h-full bg-background p-7">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-brand">{s.label}</p>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/80">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* One place — inverse band */}
      <section className="bg-background px-4 py-20 sm:px-6">
        <Reveal className="mx-auto max-w-5xl">
          <div className="overflow-hidden rounded-marketing-3xl bg-[#111113] px-8 py-14 sm:px-12">
            <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
              <div className="max-w-xl">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/45">
                  One place, not six tools
                </p>
                <h2 style={TITLE_FONT} className="mt-3 text-3xl leading-tight tracking-tight text-white sm:text-[2.5rem]">
                  All the data, one surface.
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-white/55">
                  CRM, inbox, calendar, templates, files, team chat, and the floor
                  dashboard. One agent runs all of it, and they finally agree.
                </p>
              </div>
              <div className="shrink-0 text-right">
                <div style={TITLE_FONT} className="text-[clamp(3rem,8vw,5rem)] leading-none tracking-tight text-brand">
                  6 → 1
                </div>
                <p className="mt-2 text-[11px] font-medium uppercase tracking-wider text-white/45">
                  tools, replaced by one workspace
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Closing CTA */}
      <section className="bg-background px-4 pb-24 sm:px-6 sm:pb-32">
        <Reveal className="mx-auto max-w-3xl text-center">
          <h2 style={TITLE_FONT} className="mx-auto max-w-xl text-3xl leading-tight tracking-tight text-foreground sm:text-[2.5rem]">
            Bring your floor to Chippi.
          </h2>
          <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
            The realtors keep what they already do. The brokerage sees what it never
            could. We’ll help you move.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/login/realtor?intent=signup"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-medium text-background transition-all duration-150 hover:bg-foreground/90 active:scale-[0.98]"
            >
              Start free trial
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/demo"
              className="inline-flex h-11 items-center justify-center rounded-full border border-border/70 bg-background px-6 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-foreground/[0.04]"
            >
              Book a demo
            </Link>
          </div>
        </Reveal>
      </section>
    </>
  );
}
