'use client';

/**
 * CoreCards — the four things Chippi does, as an editorial bento. One warm
 * orange card carries the focal stat with ↗/↙ arrows in the corners (ref:
 * Soviet-TV red card). White cards on the light canvas, generous radius,
 * scroll-staggered in.
 */

import { Stagger, StaggerItem, Reveal, Placeholder, ArrowChip } from './home-kit';
import { Mail, CalendarCheck, Gauge } from 'lucide-react';

export function CoreCards() {
  return (
    <section className="relative mx-auto max-w-7xl px-6 py-24 md:px-8 md:py-32">
      <Reveal className="max-w-3xl">
        <h2 className="text-[clamp(2rem,4.5vw,3.5rem)] font-bold leading-[1.02] tracking-[-0.025em] text-foreground">
          The work that used to eat your day,
          <span className="text-foreground/40"> handled before you ask.</span>
        </h2>
      </Reveal>

      <Stagger className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-6 md:gap-5">
        {/* Reads your inbox — wide white card with media */}
        <StaggerItem className="md:col-span-4">
          <div className="flex h-full flex-col justify-between rounded-3xl bg-white p-7 ring-1 ring-black/[0.05] md:p-9">
            <div className="flex items-start justify-between gap-4">
              <div className="max-w-md">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-foreground/[0.05] text-foreground">
                  <Mail size={20} strokeWidth={1.75} />
                </span>
                <h3 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">
                  Reads your inbox, surfaces what matters.
                </h3>
                <p className="mt-3 text-[15px] leading-relaxed text-foreground/55">
                  Gmail and Outlook plug in. Chippi reads every inbound, scores
                  it against your live deals, and tells you who to call first.
                </p>
              </div>
            </div>
            <Placeholder label="Inbox triage" aspect="aspect-[16/7]" className="mt-7" />
          </div>
        </StaggerItem>

        {/* Drafts in your voice — orange focal stat card */}
        <StaggerItem className="md:col-span-2">
          <div className="relative flex h-full min-h-[340px] flex-col justify-between overflow-hidden rounded-3xl bg-[#ff964f] p-7 text-[#2a1402] md:p-8">
            <div className="flex items-start justify-between">
              <p className="max-w-[14rem] text-[15px] font-medium leading-snug">
                Every reply, drafted in your voice — before you open the thread.
              </p>
              <ArrowChip dir="up-right" className="text-[#2a1402]/70" />
            </div>
            <div>
              <div className="text-[clamp(3.5rem,9vw,5rem)] font-bold leading-none tracking-tight">
                100%
              </div>
              <p className="mt-2 text-[13px] font-medium text-[#2a1402]/70">
                of replies pre-written, waiting for your approval.
              </p>
            </div>
            <ArrowChip dir="down-left" className="absolute bottom-5 right-6 text-[#2a1402]/40" />
          </div>
        </StaggerItem>

        {/* Books tours */}
        <StaggerItem className="md:col-span-3">
          <div className="flex h-full flex-col justify-between rounded-3xl bg-white p-7 ring-1 ring-black/[0.05] md:p-9">
            <div>
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-foreground/[0.05] text-foreground">
                <CalendarCheck size={20} strokeWidth={1.75} />
              </span>
              <h3 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">
                Books the tour, right from the thread.
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-foreground/55">
                Reply with a time; Chippi puts it on every calendar and writes
                it back to the deal. No tab-switching, no double-booking.
              </p>
            </div>
            <Placeholder label="Tour booking" aspect="aspect-[16/8]" className="mt-7" />
          </div>
        </StaggerItem>

        {/* Pipeline current */}
        <StaggerItem className="md:col-span-3">
          <div className="flex h-full flex-col justify-between rounded-3xl bg-white p-7 ring-1 ring-black/[0.05] md:p-9">
            <div>
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-foreground/[0.05] text-foreground">
                <Gauge size={20} strokeWidth={1.75} />
              </span>
              <h3 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">
                Keeps the pipeline honest.
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-foreground/55">
                Move a card; Chippi keeps the value, the dates, and the
                counterparty in sync everywhere. The board reflects reality, not
                last week.
              </p>
            </div>
            <Placeholder label="Pipeline board" aspect="aspect-[16/8]" className="mt-7" />
          </div>
        </StaggerItem>
      </Stagger>
    </section>
  );
}
