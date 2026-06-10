/**
 * CTA — the ask.
 *
 * A framed closing panel with a faint grid backdrop and a warm brand wash —
 * enough depth to feel like a deliberate close, not a plain box. Honest trial
 * copy: free for 7 days, then $97/mo (a card is required up front, so we never
 * claim otherwise). There is no free plan.
 */

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Reveal } from '../reveal';
import { GridBackdrop } from '../frame';
import { TITLE_FONT } from '@/lib/typography';

export function CTA() {
  return (
    <section className="bg-background px-4 py-24 sm:px-6 sm:py-32">
      <Reveal className="mx-auto max-w-5xl">
        <div className="relative overflow-hidden rounded-marketing-3xl border border-border/70 bg-card px-6 py-20 text-center sm:px-10 sm:py-24">
          <GridBackdrop />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-2/3 bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,var(--brand-subtle),transparent_70%)]"
          />
          <div className="relative">
            <h2
              className="mx-auto max-w-xl text-3xl leading-tight tracking-tight text-foreground sm:text-[2.75rem]"
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
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-foreground px-7 text-sm font-medium text-background transition-all duration-150 hover:bg-foreground/90 active:scale-[0.98]"
              >
                Start free trial
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/demo"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-border/70 bg-background px-7 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-foreground/[0.04]"
              >
                Book a demo
              </Link>
            </div>
            <p className="mt-5 text-xs text-muted-foreground">
              7 days free, then $97/mo. Cancel anytime.
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
