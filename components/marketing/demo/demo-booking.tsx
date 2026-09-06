/**
 * DemoBooking, the /demo scheduler on the bold-canvas system. One focal
 * element: the scheduler, in a white soft-shadow card. The page opener
 * (PageHero) lives in `app/(marketing)/demo/page.tsx`.
 *
 * Swapping in the real Calendly is one line: paste the inline-embed URL into
 * CALENDLY_URL. Empty → a calm placeholder; set → a responsive iframe. We do
 * NOT load Calendly's external widget.js, no new dependency, the swap stays a
 * one-liner.
 */

import Link from 'next/link';
import { CalendarRange } from 'lucide-react';
import { Reveal } from '@/components/marketing/site/reveal';

// Live Calendly inline-embed URL. Empty on purpose until a real booking
// page exists — do not invent a calendar. Team / Team Plus still go through
// this page; Solo/Pro can start the trial without a call.
const CALENDLY_URL = '';

export function DemoBooking() {
  return (
    <section className="px-4 pb-24 pt-2 sm:px-6 sm:pb-32">
      <Reveal className="mx-auto max-w-3xl">
        <div className="overflow-hidden rounded-3xl bg-white p-3 shadow-[0_18px_60px_-24px_rgba(20,20,40,0.12)] ring-1 ring-black/5 sm:p-4">
          {CALENDLY_URL ? (
            <iframe
              src={CALENDLY_URL}
              title="Book a demo with Chippi"
              className="min-h-[680px] w-full rounded-2xl border-0 bg-white"
              loading="lazy"
            />
          ) : (
            <div className="flex aspect-[4/3] flex-col items-center justify-center rounded-2xl bg-gradient-to-b from-white via-[#f8fafc] to-[#eef3fb] text-center ring-1 ring-inset ring-black/5">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#ff4b29] ring-1 ring-black/5">
                <CalendarRange className="h-5 w-5" />
              </span>
              <p className="mt-3 text-sm font-semibold tracking-tight text-zinc-950">
                Live booking is not set up yet
              </p>
              <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-neutral-500">
                There is no calendar behind this card. Start a Solo or Pro trial,
                or email us about Team.
              </p>
            </div>
          )}
        </div>

        <p className="mt-8 text-center text-sm text-neutral-600">
          Prefer to start now?{' '}
          <Link
            href="/sign-up"
            className="font-semibold text-[#ff4b29] transition-colors hover:text-[#e84418]"
          >
            Start your free trial
          </Link>
          .
        </p>
      </Reveal>
    </section>
  );
}
