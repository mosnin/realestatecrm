/**
 * `/capture` — intake forms that feed the loop, on the white + pastel system.
 *
 * Arc: PageHero opener → open light split (copy beside a pastel-framed
 * glass card: intake form → scored lead with drafted-reply chips) → white
 * shadow trio (Instant scoring / Your voice / Approval-first) → pastel CTA
 * card. One idea: a lead lands, gets scored, a reply drafts itself, tour
 * times are proposed — you just approve.
 */

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowDown,
  ArrowRight,
  MessageSquare,
  PenLine,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { FadeUp, Stagger, StaggerItem } from '@/components/marketing/site/section';
import { PageHero } from '@/components/marketing/site/page-hero';

export const metadata = {
  title: 'Capture leads · Chippi',
  description:
    'Intake forms that feed the loop — every lead lands in Chippi scored, with a reply drafted in your voice and tour times ready to book. Nothing sends without your approval.',
};

const TRIO: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Zap,
    title: 'Instant scoring.',
    body: 'Hot, warm, or cold the second the form lands — with the reason attached, not just a number.',
  },
  {
    icon: PenLine,
    title: 'Your voice.',
    body: 'The first reply drafts itself from how you actually write. Leads hear you, not a template.',
  },
  {
    icon: ShieldCheck,
    title: 'Approval-first.',
    body: 'Nothing sends without your tap. Edit it, send it, or skip it — every thread stays yours.',
  },
];

export default function CapturePage() {
  return (
    <div>
      <PageHero
        eyebrow="Capture leads"
        title="Forms that feed the loop."
        sub="A lead lands on your form, gets scored with the reason, a reply drafts itself in your voice, and tour times are proposed. You tap approve — that is the whole job."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'Book a demo', href: '/demo' }}
      />

      {/* Open light split — air after the hero */}
      <section className="mx-auto mt-12 max-w-7xl px-6 sm:mt-16">
        <div className="grid gap-12 lg:grid-cols-2">
          {/* Copy, hairline list, stats, quiet link */}
          <div>
            <h2 className="text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
              From form fill to booked tour.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-neutral-600">
              The form is the front door of the loop. Everything after it
              happens before you even open the thread.
            </p>

            <div className="mt-8 border-t border-neutral-200 pt-6">
              <div className="space-y-5">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#ff4b29]/10">
                    <Zap className="h-4 w-4 text-[#ff4b29]" />
                  </div>
                  <div>
                    <h3 className="font-semibold tracking-tight text-zinc-950">Scored on arrival</h3>
                    <p className="mt-1 text-sm text-neutral-600">
                      Hot, warm, or cold with the reason attached — the moment
                      the form lands, not at the end of the day.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#ff4b29]/10">
                    <MessageSquare className="h-4 w-4 text-[#ff4b29]" />
                  </div>
                  <div>
                    <h3 className="font-semibold tracking-tight text-zinc-950">Drafted, not sent</h3>
                    <p className="mt-1 text-sm text-neutral-600">
                      The first reply waits in your voice, tour times included.
                      Nothing leaves without your tap.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 border-t border-neutral-200 pt-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <span className="text-2xl font-semibold tracking-tight text-zinc-950">24/7</span>
                  <p className="mt-1 text-xs text-neutral-600">The loop runs while you are out showing</p>
                </div>
                <div>
                  <span className="text-2xl font-semibold tracking-tight text-zinc-950">100%</span>
                  <p className="mt-1 text-xs text-neutral-600">Approval-first — nothing sends without you</p>
                </div>
              </div>
            </div>

            <div className="mt-8 border-t border-neutral-200 pt-6">
              <Link
                href="/bio"
                className="inline-flex items-center gap-2 text-sm font-medium text-zinc-950 transition-colors hover:text-neutral-600"
              >
                Put the form on your public page
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* Pastel frame, white glass card, form → scored lead flow */}
          <div className="relative rounded-[36px] bg-gradient-to-br from-[#ffe3cf] via-[#ffd2b3] to-[#ffc4dd] p-5">
            <article
              className="relative overflow-hidden rounded-3xl shadow-xl backdrop-blur-xl"
              style={{
                background: 'rgba(255, 255, 255, 0.72)',
                border: '1px solid rgba(255, 255, 255, 0.65)',
              }}
            >
              <div className="p-6 sm:p-8">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <h3 className="text-2xl font-semibold tracking-tight text-zinc-950">The loop</h3>
                  <span className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-2.5 py-1 text-[10px] text-neutral-700 sm:text-xs">
                    <Zap className="h-4 w-4 text-[#ff4b29]" />
                    Live
                  </span>
                </div>

                {/* Form → scored lead */}
                <div className="rounded-2xl bg-gradient-to-b from-white to-[#fff1e6] p-4 ring-1 ring-inset ring-black/5 sm:p-5">
                  <div className="rounded-xl border border-black/5 bg-white/90 p-3 shadow-sm">
                    <div className="flex items-center justify-between border-b border-black/5 pb-2">
                      <span className="text-[10px] tracking-widest text-neutral-500">INTAKE FORM</span>
                      <span className="text-[10px] text-neutral-400">Your site · your page</span>
                    </div>
                    <div className="mt-2.5 space-y-2">
                      <div className="h-6 rounded-lg bg-neutral-100" />
                      <div className="h-6 rounded-lg bg-neutral-100" />
                      <div className="flex justify-end">
                        <span className="inline-flex h-6 items-center rounded-full bg-[#ff4b29] px-3 text-[9px] font-semibold text-white">
                          Request a tour
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="my-3 flex justify-center">
                    <ArrowDown className="h-4 w-4 text-neutral-400" />
                  </div>

                  <div className="rounded-xl border border-black/5 bg-white/90 p-3 shadow-sm">
                    <div className="flex items-center justify-between border-b border-black/5 pb-2">
                      <span className="text-[10px] tracking-widest text-neutral-500">NEW LEAD</span>
                      <span className="rounded-full bg-[#ff4b29]/10 px-2 py-0.5 text-[9px] font-semibold text-[#ff4b29]">
                        Hot · 86
                      </span>
                    </div>
                    <div className="mt-2.5 flex items-center gap-2.5">
                      <div className="h-6 w-6 flex-shrink-0 rounded-full bg-gradient-to-r from-[#ff7a47] to-[#ff4b29]" />
                      <div className="min-w-0 flex-1">
                        <div className="h-2 w-20 rounded bg-neutral-900" />
                        <div className="mt-1.5 h-2 w-28 rounded bg-neutral-200" />
                      </div>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-medium text-blue-700">
                        Reply drafted
                      </span>
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-medium text-emerald-700">
                        Tour times proposed
                      </span>
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-medium text-amber-700">
                        Awaiting your tap
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-[9px] text-neutral-400">
                    <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-black/5">Lands</span>
                    <span aria-hidden>→</span>
                    <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-black/5">Scored</span>
                    <span aria-hidden>→</span>
                    <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-black/5">Drafted</span>
                    <span aria-hidden>→</span>
                    <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-black/5">Booked</span>
                  </div>
                </div>

                {/* Two-up */}
                <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div>
                    <h4 className="text-lg font-semibold tracking-tight text-zinc-950">The reason, not a number</h4>
                    <p className="mt-2 text-sm text-neutral-500">
                      Every score explains itself — budget, timeline, intent —
                      so you can trust the queue.
                    </p>
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold tracking-tight text-zinc-950">Times from your calendar</h4>
                    <p className="mt-2 text-sm text-neutral-500">
                      Proposed slots come from your real availability, never a
                      guess.
                    </p>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* White shadow trio — big air above */}
      <section className="mx-auto mt-24 max-w-7xl px-4 sm:mt-32 sm:px-6">
        <FadeUp className="mx-auto max-w-2xl text-center">
          <p className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
            <span aria-hidden className="text-[#ff4b29]">✦</span>
            Why it converts
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
            Fast. Yours. Under your thumb.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
            Three guarantees on every lead the form brings in.
          </p>
        </FadeUp>
        <Stagger className="mt-12 grid gap-6 sm:gap-8 lg:grid-cols-3">
          {TRIO.map((item) => (
            <StaggerItem key={item.title} className="h-full">
              <div className="h-full rounded-3xl bg-white p-7 shadow-[0_18px_60px_-24px_rgba(20,20,40,0.12)] ring-1 ring-black/5 sm:p-9">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ff4b29]/10">
                  <item.icon className="h-4 w-4 text-[#ff4b29]" />
                </div>
                <h3 className="mt-5 text-xl font-semibold tracking-tight text-zinc-950 sm:text-2xl">
                  {item.title}
                </h3>
                <p className="mt-3 text-base leading-relaxed text-neutral-500">{item.body}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* Pastel CTA card */}
      <section className="mt-24 px-4 sm:mt-32">
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-gradient-to-b from-white via-[#fff7f1] to-[#ffeddd] shadow-[0_24px_70px_-30px_rgba(120,55,20,0.25)] ring-1 ring-black/5 sm:rounded-[2.75rem]">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#ffb054]/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-[#ff4b29]/15 blur-3xl" />
          <FadeUp className="relative mx-auto flex max-w-2xl flex-col items-center px-6 py-16 text-center sm:py-24">
            <h2 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
              Put the form to work tonight.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
              Drop it on your site, your public page, the open-house QR — every
              fill comes back scored and drafted.
            </p>
            <Link
              href="/login/realtor?intent=signup"
              className="mt-9 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#ff4b29] px-7 text-[15px] font-semibold text-white transition-all duration-150 hover:bg-[#e84418] active:scale-[0.98]"
            >
              Start free trial
              <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="mt-4 text-sm text-neutral-500">7 days free, then $97/mo. Cancel anytime.</p>
          </FadeUp>
        </div>
      </section>
    </div>
  );
}
