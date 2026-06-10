/**
 * Hero — the promise, with a real product shot.
 *
 * The headline is the serif Times the product uses for every page title; the
 * one idea is said once. Beneath it sits a large framed workspace screenshot
 * (placeholder slot) over a faint dot-grid backdrop and a warm brand wash, so
 * the first thing a prospect sees is the product itself, framed like software
 * — not a centered card on an empty page.
 */

import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { Reveal } from '../reveal';
import { BrowserFrame, GridBackdrop } from '../frame';
import { HeroDemo } from './hero-demo';
import { TITLE_FONT } from '@/lib/typography';

const assurances = ['7-day free trial', 'No setup fees', 'Cancel anytime'];

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border/60 bg-background px-4 pt-32 pb-20 sm:px-6 sm:pt-36">
      <GridBackdrop />
      {/* warm wash at the top, behind the headline */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,var(--brand-subtle),transparent_70%)]"
      />

      <div className="relative mx-auto max-w-3xl text-center">
        <Reveal>
          <p className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground backdrop-blur-sm">
            <span aria-hidden className="inline-block size-1.5 rounded-full bg-brand" />
            The agentic OS for real estate
          </p>
        </Reveal>

        <Reveal delay={0.05}>
          <h1
            className="mt-7 text-[2.75rem] leading-[1.03] tracking-tight text-foreground sm:text-[4.25rem]"
            style={TITLE_FONT}
          >
            You close the deals.
            <br />
            Chippi does the rest.
          </h1>
        </Reveal>

        <Reveal delay={0.1}>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Chippi reads your inbox, drafts replies in your voice, books the
            tours, and keeps every deal current. The busywork runs itself, and
            nothing leaves without your name on it.
          </p>
        </Reveal>

        <Reveal delay={0.15}>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/login/realtor?intent=signup"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-medium text-background transition-all duration-150 hover:bg-foreground/90 active:scale-[0.98]"
            >
              Start free trial
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/demo"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border/70 bg-background px-6 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-foreground/[0.04]"
            >
              Watch demo
            </Link>
          </div>
        </Reveal>

        <Reveal delay={0.2}>
          <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {assurances.map((a) => (
              <li key={a} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Check className="h-3.5 w-3.5 text-brand" />
                {a}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>

      {/* The product, working — a live, looping demo of Chippi at work. */}
      <Reveal delay={0.15} className="relative mx-auto mt-16 max-w-2xl">
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-10 -top-10 bottom-0 bg-[radial-gradient(ellipse_50%_50%_at_50%_40%,rgba(255,150,79,0.12),transparent_70%)]"
        />
        <BrowserFrame className="relative" url="app.chippi.ai">
          <HeroDemo />
        </BrowserFrame>
      </Reveal>
    </section>
  );
}
