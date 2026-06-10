/**
 * `/realtors` — Chippi for the solo realtor, on the calm site system.
 *
 * The extra teammate in the field: reachable on the phone, the web app, or the
 * office desktop; reads the inbox, drafts in your voice, scores the lead, books
 * the tour, keeps every deal current — and never sends without your tap.
 *
 * Rebuilt from the legacy studio-ASCII version onto the calm vocabulary
 * (PageHero, FeatureRow, framed screenshot slots). Auth-aware: signed-in
 * realtors bounce to their workspace.
 */

import Link from 'next/link';
import { ArrowRight, Smartphone, Globe, Building2 } from 'lucide-react';
import { PageHero } from '@/components/marketing/site/page-hero';
import { FeatureRow } from '@/components/marketing/site/feature-row';
import { Reveal } from '@/components/marketing/site/reveal';
import { TITLE_FONT } from '@/lib/typography';

export const metadata = {
  title: 'For solo realtors · Chippi',
  description:
    'Chippi is the extra teammate in the field — reachable on your phone, the web app, or the office desktop. It drafts in your voice, scores the lead, books the tour, and keeps every deal current.',
};

const surfaces = [
  { Icon: Smartphone, title: 'On your phone', body: 'A tap away between doors and showings — drafts, scores, and bookings in your pocket.' },
  { Icon: Globe, title: 'In the web app', body: 'Install it once. The full workspace, reachable from any browser, anywhere.' },
  { Icon: Building2, title: 'At the office', body: 'The same workspace opens wide on the desktop when you’re back at the desk.' },
];

const features = [
  {
    no: '01',
    eyebrow: 'The reply',
    title: 'Drafts you’d have written — in your voice.',
    sub: 'Chippi reads the thread, writes the reply the way you actually write, and stops. You read it, you press send. Or you don’t.',
    points: [
      'Trained on how you actually write',
      'Ready in your inbox before you open the thread',
      'Never sends without your tap',
    ],
    image: { label: 'Draft composer', sublabel: 'Screenshot · 1280 × 960' },
  },
  {
    no: '02',
    eyebrow: 'First call',
    title: 'Know who to call first.',
    sub: 'Every new inquiry comes in scored against your active deals — hot, warm, cold, at a glance, with the reason attached in plain language.',
    points: [
      'Multi-signal scoring on each lead',
      'The quiet hot ones surfaced before they go cold',
      'Priority order updates as deals move',
    ],
    image: { label: 'Lead scoring', sublabel: 'Screenshot · 1280 × 960' },
    flip: true,
  },
  {
    no: '03',
    eyebrow: 'Tours',
    title: 'Book the tour from the thread.',
    sub: 'Reply with a time. Chippi checks your availability, puts it on the calendar, sends the confirmation, and writes it back to the deal. No tab-switching.',
    points: [
      'Proposes times against your open hours',
      'Two-way Google and Outlook sync',
      'Confirmation goes back in the thread',
    ],
    image: { label: 'Calendar booking', sublabel: 'Screenshot · 1280 × 960' },
  },
  {
    no: '04',
    eyebrow: 'The inbox',
    title: 'Your inbox, read and triaged.',
    sub: 'Gmail and Outlook plug in. Chippi reads every inbound, weighs it against your live deals, and quietly lifts the one to look at first. It stays quiet when nothing’s worth surfacing.',
    points: [
      'Threads, not loose messages',
      'Scored against your active deals',
      'Reply from the address your contacts already know',
    ],
    image: { label: 'Inbox triage', sublabel: 'Screenshot · 1280 × 960' },
    flip: true,
  },
  {
    no: '05',
    eyebrow: 'The pipeline',
    title: 'A pipeline that doesn’t lie.',
    sub: 'Drag a card to the next stage and Chippi keeps the value, the dates, and the counterparty in sync. The board reflects reality, not yesterday.',
    points: [
      'Auto-updating fields as cards move',
      'Won/lost reasons logged in plain language',
      'Every change written to the deal timeline',
    ],
    image: { label: 'Pipeline board', sublabel: 'Screenshot · 1280 × 960' },
  },
];

export default function RealtorsPage() {
  return (
    <>
      <PageHero
        eyebrow="For solo realtors"
        title="Your extra teammate in the field."
        sub="You’re rarely at a desk. Chippi works alongside you — reading the inbox, drafting in your voice, scoring the lead, and booking the tour — so the hours go to closing."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'Watch demo', href: '/demo' }}
      />

      {/* Reachable everywhere */}
      <section className="bg-background px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <Reveal className="max-w-2xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              In the field
            </p>
            <h2 style={TITLE_FONT} className="mt-3 text-3xl tracking-tight text-foreground sm:text-[2.5rem]">
              Reachable wherever the work is.
            </h2>
          </Reveal>
          <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-marketing-2xl border border-border/60 bg-border/60 sm:grid-cols-3">
            {surfaces.map((s) => (
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
            <FeatureRow key={f.no} {...f} />
          ))}
        </div>
      </section>

      {/* The promise */}
      <section className="border-y border-border/60 bg-muted/20 px-4 py-24 sm:px-6 sm:py-28">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            One promise
          </p>
          <h2 style={TITLE_FONT} className="mx-auto mt-4 max-w-2xl text-3xl leading-tight tracking-tight text-foreground sm:text-[2.5rem]">
            You stay in the driver’s seat.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
            Chippi does the work; you make the call. Approval-first by default —
            and nothing leaves without your name on it.
          </p>
        </Reveal>
      </section>

      {/* Closing CTA */}
      <section className="bg-background px-4 py-24 sm:px-6 sm:py-32">
        <Reveal className="mx-auto max-w-3xl text-center">
          <h2 style={TITLE_FONT} className="mx-auto max-w-xl text-3xl leading-tight tracking-tight text-foreground sm:text-[2.5rem]">
            Your next deal is already in the inbox.
          </h2>
          <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
            Connect your email and let Chippi draft the first reply.
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
          <p className="mt-4 text-xs text-muted-foreground">7 days free, then $97/mo. Cancel anytime.</p>
        </Reveal>
      </section>
    </>
  );
}
