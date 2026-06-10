/**
 * CTA — the ask.
 *
 * The old closing card was a charcoal ASCII-field panel with an orange wash
 * and a "Seven days free, no credit card" line that the business model
 * doesn't honor. This is calm and honest: the trial is free for 7 days, then
 * it's $97/mo (a card is required up front, so we never claim otherwise).
 */

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Reveal } from '../reveal';
import { TITLE_FONT } from '@/lib/typography';

export function CTA() {
  return (
    <section className="bg-background px-4 py-24 sm:px-6 sm:py-32">
      <Reveal className="mx-auto max-w-3xl">
        <div className="rounded-xl border border-border/70 bg-muted/20 px-6 py-16 text-center sm:px-10">
          <h2
            className="mx-auto max-w-xl text-3xl leading-tight tracking-tight text-foreground sm:text-[2.5rem]"
            style={TITLE_FONT}
          >
            Bring your inbox. Chippi does the rest.
          </h2>
          <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
            Connect your email and watch the busywork start running itself.
          </p>
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
              Book a demo
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            7 days free, then $97/mo. Cancel anytime.
          </p>
        </div>
      </Reveal>
    </section>
  );
}
