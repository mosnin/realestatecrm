/**
 * Hero — the promise.
 *
 * One idea, said once: "You close the deals. Chippi does the rest." The
 * headline is the serif Times the product uses for every page title, brought
 * to the front door so marketing and product feel like one company. Below it,
 * a single calm proof: a real draft, in the realtor's voice, waiting for a tap.
 * No ASCII field, no rotating word, no orange wash — the proof is the spectacle.
 */

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Reveal } from '../reveal';
import { TITLE_FONT } from '@/lib/typography';

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border/60 bg-background px-4 pt-32 pb-20 sm:px-6 sm:pt-36 sm:pb-28">
      <div className="mx-auto max-w-3xl text-center">
        <Reveal>
          <p className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <span aria-hidden className="inline-block size-1.5 rounded-full bg-brand" />
            The agentic OS for real estate
          </p>
        </Reveal>

        <Reveal delay={0.05}>
          <h1
            className="mt-6 text-[2.5rem] leading-[1.05] tracking-tight text-foreground sm:text-6xl"
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
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border/70 px-6 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-foreground/[0.04]"
            >
              Watch demo
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            7 days free, then $97/mo. Cancel anytime.
          </p>
        </Reveal>
      </div>

      {/* The proof, immediately: one real draft moment, paper-flat. */}
      <Reveal delay={0.2} className="mx-auto mt-16 max-w-xl">
        <DraftProof />
      </Reveal>
    </section>
  );
}

/** A single agent-draft card in the product's own vocabulary — the emotional
 *  core of the pitch shown once, calm. Mirrors the real review-row chrome. */
function DraftProof() {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-5 text-left">
      {/* incoming */}
      <div className="flex gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-foreground/10 text-[11px] font-medium text-foreground/70">
          MP
        </span>
        <div className="rounded-xl rounded-tl-sm border border-border/60 bg-muted/30 px-3.5 py-2.5 text-sm leading-relaxed text-foreground/80">
          Is 14 Oak still available? Could I see it this weekend?
        </div>
      </div>

      {/* Chippi draft */}
      <div className="mt-3 rounded-xl border border-border/70 bg-background px-4 py-3.5">
        <p className="text-sm leading-relaxed text-foreground/90">
          Hi Maya — thanks for reaching out about 14 Oak. It&rsquo;s still
          available, and I have Saturday at 2:00 open if you&rsquo;d like to see
          it in person.
        </p>
        <div className="mt-3.5 flex items-center justify-between border-t border-border/60 pt-3">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-brand">
            <span aria-hidden className="inline-block size-1.5 rounded-full bg-brand" />
            Chippi drafted · your voice
          </span>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground">
              Edit
            </span>
            <span className="rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background">
              Approve
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
