/**
 * `/research`, the research story — how Chippi was built on comprehensive
 * real-estate research. Server component (exports metadata). Same aesthetic as
 * the homepage / company / careers pages: a full-bleed photographic hero under
 * dark scrims, then a research index of downloadable reports, in a forced-dark
 * wrapper.
 *
 * The reports below are sample research write-ups; each links to a PDF served
 * from /public/research.
 */

import { ArrowUpRight, FileText } from 'lucide-react';
import {
  Band,
  BlurRise,
  Eyebrow,
  EyebrowPill,
  PillGhost,
  PillPrimary,
  Serif,
} from '@/components/marketing/giga/primitives';

export const metadata = {
  title: 'Research · Chippi',
  description:
    'How we built Chippi on comprehensive research into how real-estate agents actually work — time studies, speed-to-lead analysis, lead-scoring field notes, and trust research.',
};

/* Sample research reports. Each `href` points to a PDF in /public/research. */
const REPORTS = [
  {
    title: 'Speed to Lead: What 1,200 Inbound Inquiries Taught Us About the First Hour',
    summary:
      'The first-reply decay curve, segmented by channel. Inquiries answered within five minutes booked at more than three times the rate of those answered after an hour.',
    category: 'Conversion',
    date: 'March 2026',
    pages: '18 pages',
    href: '/research/speed-to-lead-2026.pdf',
  },
  {
    title: 'The Agent Day: A Time Study of Where the Hours Actually Go',
    summary:
      '540 shadowed hours across 36 agents. Roughly ten percent of the day is the work only an agent can do; the rest is attention management. A map of where software can give time back.',
    category: 'Field study',
    date: 'January 2026',
    pages: '24 pages',
    href: '/research/agent-day-time-study.pdf',
  },
  {
    title: 'Lead Scoring in the Wild: Why Most Models Bury Good Buyers',
    summary:
      'A common failure mode where brittle field matching scores every lead as cold, and the case for reading the substance of what a lead says against the agent’s live pipeline.',
    category: 'Methods',
    date: 'April 2026',
    pages: '15 pages',
    href: '/research/lead-scoring-field-notes.pdf',
  },
  {
    title: 'Trust by Design: How Agents Decide to Let Software Send',
    summary:
      'Interviews with 80 agents and brokers mapping the path from skepticism to delegated trust — and the product principles that earn it: approval-first defaults, one voice, a clean audit trail.',
    category: 'Trust',
    date: 'May 2026',
    pages: '20 pages',
    href: '/research/trust-and-approval-2026.pdf',
  },
];

export default function ResearchPage() {
  return (
    <div className="dark bg-[#0a0a0a] text-white">
      {/* Hero — full-bleed photo under dark scrims, matching the rest of the
          redesign. */}
      <section className="relative isolate overflow-hidden">
        <div aria-hidden className="absolute inset-0 -z-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marketing/research-hero.jpg" alt="" className="h-full w-full object-cover object-center" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/82 via-[#0a0a0a]/48 to-[#0a0a0a]" />
          <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_38%,transparent_35%,rgba(10,10,10,0.6)_100%)]" />
        </div>
        <Band className="pt-40 pb-24 text-center sm:pt-48 sm:pb-28">
          <BlurRise trigger="load">
            <EyebrowPill>Research</EyebrowPill>
          </BlurRise>
          <BlurRise trigger="load" delay={0.08}>
            <Serif as="h1" className="mx-auto mt-7 max-w-4xl text-[clamp(2.25rem,5vw,4rem)] leading-[1.05] text-white">
              How we built Chippi.
            </Serif>
          </BlurRise>
          <BlurRise trigger="load" delay={0.16}>
            <p className="mx-auto mt-7 max-w-xl text-[15px] leading-relaxed text-white/55">
              Hundreds of agent interviews, shadowed deals, and the workflows that shaped every
              feature. We publish the work that shapes the product — read the reports below.
            </p>
          </BlurRise>
          <BlurRise trigger="load" delay={0.24}>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <PillPrimary href="#reports" withArrow>
                Read the research
              </PillPrimary>
              <PillGhost href="/demo">See a demo</PillGhost>
            </div>
          </BlurRise>
        </Band>
      </section>

      {/* Research index — downloadable reports. */}
      <Band id="reports" className="scroll-mt-24 pb-28 pt-4 sm:pb-36">
        <BlurRise className="mx-auto max-w-2xl text-center">
          <Eyebrow className="justify-center">Reports</Eyebrow>
          <Serif className="mt-5 text-[clamp(1.75rem,3.4vw,2.75rem)] leading-[1.08] text-white">
            The work behind the product.
          </Serif>
          <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-white/55">
            Each report is a PDF you can read or download. New work is added as we publish it.
          </p>
        </BlurRise>

        <div className="mx-auto mt-14 max-w-4xl divide-y divide-white/[0.08] border-y border-white/[0.08]">
          {REPORTS.map((r, i) => (
            <BlurRise key={r.href} delay={i * 0.05}>
              <a
                href={r.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-5 py-7 transition-colors hover:bg-white/[0.015] sm:gap-7 sm:px-3"
              >
                <span className="mt-1 flex size-11 flex-shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-white/70 transition-colors group-hover:text-[#ff9a6e]">
                  <FileText className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span
                      style={{ fontFamily: 'var(--font-mono-display)' }}
                      className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#ff9a6e]"
                    >
                      {r.category}
                    </span>
                    <span className="text-[11px] text-white/40">
                      {r.date} · {r.pages}
                    </span>
                  </span>
                  <Serif as="h3" className="mt-2 text-[19px] leading-[1.25] text-white sm:text-[21px]">
                    {r.title}
                  </Serif>
                  <p className="mt-2.5 max-w-2xl text-[14px] leading-relaxed text-white/55">{r.summary}</p>
                  <span className="mt-3.5 inline-flex items-center gap-1.5 text-[13px] font-medium text-white transition-colors group-hover:text-[#ff9a6e]">
                    Read PDF
                    <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </span>
                </span>
              </a>
            </BlurRise>
          ))}
        </div>
      </Band>
    </div>
  );
}
