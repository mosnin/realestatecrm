/**
 * `/deals` — pipelines that run themselves. Hero → the live kanban board
 * (Chippi advancing a deal) → how-it-works (assist or fully autonomous) → CTA.
 */

import Link from 'next/link';
import { ArrowRight, MoveRight, CheckCircle2, Bot } from 'lucide-react';
import { PageHero } from '@/components/marketing/site/page-hero';
import { Reveal } from '@/components/marketing/site/reveal';
import { PipelineBoard } from '@/components/marketing/site/deals/pipeline-board';
import { TITLE_FONT } from '@/lib/typography';

export const metadata = {
  title: 'Deals · Chippi',
  description:
    'A pipeline that runs itself. Chippi advances deals as things happen, logs every won and lost reason, and — when you let it — runs the whole pipeline for you. The board reflects reality, not last week.',
};

const FEATURES = [
  { Icon: MoveRight, title: 'Deals advance themselves', body: 'Tour booked, offer in, lender cleared — Chippi moves the card and keeps the value, dates, and counterparty in sync. The board is never stale.' },
  { Icon: CheckCircle2, title: 'Every outcome logged', body: 'Won and lost reasons captured in plain language and written to the timeline, so your numbers come from the work — not a spreadsheet someone forgot to update.' },
  { Icon: Bot, title: 'Assist — or fully autonomous', body: 'Approve-first by default. Flip Chippi to autonomous and it runs the routine moves itself: nudges, follow-ups, stage changes — and tells you what it did.' },
];

export default function DealsPage() {
  return (
    <>
      <PageHero
        eyebrow="Deals"
        title="A pipeline that runs itself."
        sub="Chippi advances deals as things actually happen, logs every won and lost reason, and — when you let it — runs the routine moves for you. The board reflects reality, not last week."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'Watch demo', href: '/demo' }}
      />

      {/* The board */}
      <section className="bg-background px-4 pb-8 sm:px-6">
        <Reveal className="mx-auto max-w-4xl">
          <PipelineBoard />
        </Reveal>
      </section>

      {/* How it works */}
      <section className="bg-background px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-5xl">
          <Reveal className="max-w-2xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">How the pipeline runs</p>
            <h2 style={TITLE_FONT} className="mt-3 text-3xl tracking-tight text-foreground sm:text-[2.5rem]">
              You close. Chippi keeps the board honest.
            </h2>
          </Reveal>
          <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-marketing-2xl border border-border/60 bg-border/60 md:grid-cols-3">
            {FEATURES.map((f) => (
              <Reveal key={f.title}>
                <div className="h-full bg-background p-7">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-brand-subtle text-brand">
                    <f.Icon className="h-4 w-4" />
                  </span>
                  <h3 className="mt-4 text-[17px] font-semibold leading-snug text-foreground">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="border-t border-border/60 bg-muted/20 px-4 py-24 sm:px-6 sm:py-28">
        <Reveal className="mx-auto max-w-3xl text-center">
          <h2 style={TITLE_FONT} className="mx-auto max-w-xl text-3xl leading-tight tracking-tight text-foreground sm:text-[2.5rem]">
            Let the pipeline run itself.
          </h2>
          <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
            Connect your inbox and calendar — Chippi takes it from first touch to closing.
          </p>
          <div className="mt-8">
            <Link
              href="/login/realtor?intent=signup"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-medium text-background transition-all duration-150 hover:bg-foreground/90 active:scale-[0.98]"
            >
              Start free trial
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Reveal>
      </section>
    </>
  );
}
