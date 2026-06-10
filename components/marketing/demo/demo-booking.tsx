/**
 * DemoBooking — the /demo body on the calm site system. One focal element: the
 * scheduler, in a browser frame.
 *
 * Swapping in the real Calendly is one line: paste the inline-embed URL into
 * CALENDLY_URL. Empty → a calm placeholder; set → a responsive iframe. We do
 * NOT load Calendly's external widget.js — no new dependency, the swap stays a
 * one-liner.
 */

import Link from 'next/link';
import { PageHero } from '@/components/marketing/site/page-hero';
import { Reveal } from '@/components/marketing/site/reveal';
import { BrowserFrame, ImagePlaceholder } from '@/components/marketing/site/frame';

// TODO: paste the Calendly inline-embed URL here
// e.g. 'https://calendly.com/your-org/chippi-walkthrough'
const CALENDLY_URL = '';

export function DemoBooking() {
  return (
    <>
      <PageHero
        eyebrow="Book a demo"
        title="See Chippi run your floor."
        sub="For brokerages and teams sizing up Chippi. Pick a time and we’ll walk your floor through it live — the inbox, the drafts, the deals it keeps current — then answer how it fits your book."
      />

      <section className="bg-background px-4 py-20 sm:px-6 sm:py-24">
        <Reveal className="mx-auto max-w-3xl">
          <BrowserFrame url="calendly.com/chippi">
            {CALENDLY_URL ? (
              <iframe
                src={CALENDLY_URL}
                title="Book a demo with Chippi"
                className="min-h-[680px] w-full border-0 bg-background"
                loading="lazy"
              />
            ) : (
              <ImagePlaceholder
                label="Scheduler"
                sublabel="Paste CALENDLY_URL to go live"
                ratio="aspect-[4/3]"
              />
            )}
          </BrowserFrame>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            Prefer to start now?{' '}
            <Link
              href="/login/realtor?intent=signup"
              className="font-medium text-foreground underline-offset-4 transition-colors hover:underline"
            >
              Start your free trial
            </Link>
            .
          </p>
        </Reveal>
      </section>
    </>
  );
}
