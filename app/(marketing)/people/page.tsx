/**
 * `/people` — Contacts. PageHero ("Every contact, a living record.") → who
 * to call first (open split: scoring with the reason + the timeline of every
 * touch, with a skeleton contact-record illustration in the pastel frame) →
 * the three pillars (Scoring / Timeline / Segments white shadow cards) →
 * CTA. White canvas, Bricolage inherited, mt-24/32 air between every beat.
 */

import Link from 'next/link';
import {
  ArrowRight,
  CalendarCheck,
  FileText,
  Gauge,
  History,
  Mail,
  PenLine,
} from 'lucide-react';
import { PageHero } from '@/components/marketing/site/page-hero';
import { FadeUp, Stagger, StaggerItem } from '@/components/marketing/site/section';

export const metadata = {
  title: 'People · Chippi',
  description:
    'Every contact, a living record — scored with the reason the moment they land, every email, text, tour, and note on one timeline, and segments that stay current as the record changes.',
};

/* The three pillars — white shadow cards. */
const PILLARS = [
  {
    kicker: 'Scoring',
    title: 'A score with its reasons.',
    body: 'Hot, warm, cold — never a bare number. The why is attached, so you know it before you dial.',
  },
  {
    kicker: 'Timeline',
    title: 'The whole story, in order.',
    body: 'Every email, text, tour, and note files itself to the record. Walk into any conversation already caught up.',
  },
  {
    kicker: 'Segments',
    title: 'Lists that stay current.',
    body: 'Renters, buyers, past clients, gone quiet — segments built from the record, so they update themselves as it changes.',
  },
];

/* Skeleton timeline rows — every touch on one record. */
const TOUCHES = [
  { icon: Mail, tone: 'text-blue-600', text: 'Email — replied, wants a Saturday tour' },
  { icon: CalendarCheck, tone: 'text-emerald-600', text: 'Tour — proposed for Sat 2:00' },
  { icon: PenLine, tone: 'text-[#ff4b29]', text: 'Draft — follow-up waiting for your tap' },
  { icon: FileText, tone: 'text-neutral-500', text: 'Note — has a guarantor, March move' },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
      <span aria-hidden className="text-[13px] leading-none text-[#ff4b29]">
        ✦
      </span>
      {children}
    </p>
  );
}

/** Skeleton contact-record illustration — score with the reason + timeline. */
function ContactRecordSketch() {
  return (
    <div className="rounded-[36px] bg-gradient-to-br from-[#ffe3cf] via-[#ffd2b3] to-[#ffc4dd] p-5">
      <div
        className="overflow-hidden rounded-3xl shadow-xl backdrop-blur-xl"
        style={{
          background: 'rgba(255, 255, 255, 0.72)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.65)',
        }}
      >
        <div className="p-6 sm:p-8">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h3 className="text-2xl font-semibold tracking-tight text-zinc-950">
              Contact record
            </h3>
            <span className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-2.5 py-1 text-[10px] text-neutral-700 sm:text-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Live
            </span>
          </div>

          <div className="rounded-2xl bg-gradient-to-b from-white to-[#fff1e6] p-3 ring-1 ring-inset ring-black/5 sm:p-4">
            {/* The person — scored, with the reason */}
            <div className="rounded-2xl border border-black/5 bg-white/90 p-3 shadow-sm sm:p-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 flex-shrink-0 rounded-full bg-gradient-to-r from-[#ff7a47] to-[#ff4b29]" />
                <div className="min-w-0 flex-1">
                  <div className="h-2 w-24 rounded bg-neutral-900/80" />
                  <div className="mt-1.5 h-2 w-16 rounded bg-neutral-200/80" />
                </div>
                <span className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full bg-[#ff4b29]/10 px-2 py-0.5 text-[10px] font-medium text-[#ff4b29]">
                  <Gauge className="h-3 w-3" />
                  Hot
                </span>
              </div>
              <div className="mt-3 rounded-lg bg-black/[0.03] px-2.5 py-1.5 text-[10px] text-neutral-600 ring-1 ring-black/5 sm:text-xs">
                Why: pre-approved, touring this week, replies within the hour
              </div>
            </div>

            {/* The timeline — every touch */}
            <div className="mt-3 rounded-2xl border border-black/5 bg-white/90 shadow-sm">
              <div className="flex items-center justify-between border-b border-black/5 px-3 py-2">
                <span className="text-[10px] tracking-widest text-neutral-500">TIMELINE</span>
                <span className="text-[10px] text-neutral-400">every touch</span>
              </div>
              <div className="space-y-2.5 p-3">
                {TOUCHES.map((t) => (
                  <div key={t.text} className="flex items-center gap-2.5">
                    <t.icon className={`h-3.5 w-3.5 flex-shrink-0 ${t.tone}`} />
                    <span className="text-[10px] text-neutral-600 sm:text-xs">{t.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PeoplePage() {
  return (
    <>
      <PageHero
        eyebrow="People"
        title="Every contact, a living record."
        sub="Scored with the reason the moment they land. Every email, text, tour, and note on one timeline. The whole relationship, kept warm while you are in the field."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'Book a demo', href: '/demo' }}
      />

      {/* Who to call first — open split, skeleton contact record */}
      <section className="mx-auto max-w-7xl px-6">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <FadeUp>
            <Eyebrow>The record</Eyebrow>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              Who to call first — and why.
            </h2>

            <div className="mt-8 border-t border-neutral-200 pt-6">
              <div className="space-y-5">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#ff4b29]/10">
                    <Gauge className="h-4 w-4 text-[#ff4b29]" />
                  </div>
                  <div>
                    <h3 className="font-medium text-zinc-950">Scored with the reason</h3>
                    <p className="mt-1 text-sm text-neutral-600">
                      Hot, warm, cold the moment a lead lands — with the why spelled
                      out, so you can trust the number and act on it.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#ff4b29]/10">
                    <History className="h-4 w-4 text-[#ff4b29]" />
                  </div>
                  <div>
                    <h3 className="font-medium text-zinc-950">Every touch, one timeline</h3>
                    <p className="mt-1 text-sm text-neutral-600">
                      Emails, texts, tours, and notes land on the record
                      automatically. The full story, not fragments across five tools.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 border-t border-neutral-200 pt-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <span className="text-2xl font-semibold tracking-tight text-zinc-950">24/7</span>
                  <p className="mt-1 text-xs text-neutral-600">
                    Chippi watches the book around the clock
                  </p>
                </div>
                <div>
                  <span className="text-2xl font-semibold tracking-tight text-zinc-950">100%</span>
                  <p className="mt-1 text-xs text-neutral-600">
                    Approval-first — nothing sends without you
                  </p>
                </div>
              </div>
            </div>
          </FadeUp>

          <FadeUp delay={0.1}>
            <ContactRecordSketch />
          </FadeUp>
        </div>
      </section>

      {/* The three pillars — white shadow cards */}
      <section className="mt-24 sm:mt-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <FadeUp>
            <Eyebrow>The living record</Eyebrow>
            <h2 className="mt-4 max-w-xl text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              What every record carries.
            </h2>
          </FadeUp>
          <Stagger className="mt-10 grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-3">
            {PILLARS.map((p) => (
              <StaggerItem key={p.kicker} className="h-full">
                <div className="h-full rounded-3xl bg-white p-7 shadow-[0_18px_60px_-24px_rgba(20,20,40,0.12)] ring-1 ring-black/5 sm:p-9">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#ff4b29]">
                    {p.kicker}
                  </p>
                  <h3 className="mt-3 text-xl font-semibold tracking-tight text-zinc-950 sm:text-2xl">
                    {p.title}
                  </h3>
                  <p className="mt-3 text-base leading-relaxed text-neutral-500">{p.body}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* CTA */}
      <section className="mt-24 px-4 sm:mt-32 sm:px-6">
        <FadeUp className="mx-auto max-w-3xl text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
            Never let a good lead go cold.
          </h2>
          <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-neutral-600">
            Connect your inbox and Chippi starts scoring and drafting from day one.
          </p>
          <div className="mt-9 flex justify-center">
            <Link
              href="/login/realtor?intent=signup"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#ff4b29] px-7 text-[15px] font-semibold text-white transition-all duration-150 hover:bg-[#e84418] active:scale-[0.98]"
            >
              Start free trial
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <p className="mt-4 text-sm text-neutral-500">
            7 days free, then $97/mo. Cancel anytime.
          </p>
        </FadeUp>
      </section>
    </>
  );
}
