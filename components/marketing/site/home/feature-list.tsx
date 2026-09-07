/**
 * FeatureList, the reference's interactive pill-row list, tailored to
 * Chippi. Two-tone headline, three pastel tag pills, then five rounded-full
 * rows: title · middle label · right description · chevron. One row is the
 * highlighted vermillion state; the rest light up on hover (CSS only, no JS).
 * Each row links into the relevant product page.
 */

import Link from 'next/link';
import { CheckCheck, ChevronRight } from 'lucide-react';
import { TwoTone } from './two-tone';

const TAGS = [
  { label: 'Drafting', tone: 'bg-[#fff0e8] text-[#ff4b29] ring-[#ffd9c9]' },
  { label: 'Scheduling', tone: 'bg-[#eef0ff] text-indigo-600 ring-indigo-200' },
  { label: 'Pipeline', tone: 'bg-[#eafaf0] text-emerald-600 ring-emerald-200' },
];

interface Row {
  title: string;
  label: string;
  desc: string;
  href: string;
  highlight?: boolean;
}

const ROWS: Row[] = [
  {
    title: 'Replies in your voice',
    label: 'Drafted on arrival',
    desc: 'Every inbound gets a reply learned from how you actually write.',
    href: '/realtors',
  },
  {
    title: 'Tours on your calendar',
    label: 'Booked & confirmed',
    desc: 'Times proposed against your real availability, invite sent for you.',
    href: '/deals',
    highlight: true,
  },
  {
    title: "A pipeline that's current",
    label: 'Auto-advanced',
    desc: 'Deals move themselves as things happen, the board shows today.',
    href: '/deals',
  },
  {
    title: 'Connected to your stack',
    label: 'Gmail · Outlook · CRM',
    desc: 'Inbox, calendar, CRM — connect in about two minutes, no migration.',
    href: '/integrations',
  },
  {
    title: 'Accountable by design',
    label: 'On the record',
    desc: 'Every send in your voice, every action on the record.',
    href: '/chippi',
  },
];

export function FeatureList() {
  return (
    <section className="mx-auto max-w-5xl px-4 sm:px-6">
      {/* Heading */}
      <div className="text-center">
        <h2 className="text-4xl font-semibold leading-[1.05] sm:text-5xl">
          <TwoTone
            parts={[
              { t: 'Everything' },
              { t: 'Chippi', dim: true },
              { t: 'runs for' },
              { t: 'your book', dim: true },
            ]}
          />
        </h2>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {TAGS.map((tag) => (
            <span
              key={tag.label}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 ${tag.tone}`}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {tag.label}
            </span>
          ))}
        </div>
      </div>

      {/* Rows */}
      <div className="mt-12 space-y-3">
        {ROWS.map((row) => (
          <Link
            key={row.title}
            href={row.href}
            className={`group flex items-center gap-4 rounded-full px-6 py-5 ring-1 transition-colors duration-200 sm:gap-8 sm:px-8 ${
              row.highlight
                ? 'bg-[#0d0c0e] text-white ring-transparent'
                : 'bg-white text-zinc-950 ring-black/[0.07] hover:bg-[#0d0c0e] hover:text-white hover:ring-transparent'
            }`}
          >
            <CheckCheck
              className={`hidden h-5 w-5 flex-shrink-0 sm:block ${
                row.highlight ? 'text-[#ff8a5c]' : 'text-[#ff4b29] group-hover:text-[#ff8a5c]'
              }`}
            />
            <span className="w-[40%] flex-shrink-0 text-[15px] font-semibold tracking-tight sm:text-base">
              {row.title}
            </span>
            <span
              className={`hidden flex-1 text-sm md:block ${
                row.highlight ? 'text-white/70' : 'text-neutral-400 group-hover:text-white/70'
              }`}
            >
              {row.label}
            </span>
            <span
              className={`hidden flex-1 text-[13px] leading-snug lg:block ${
                row.highlight ? 'text-white/60' : 'text-neutral-500 group-hover:text-white/60'
              }`}
            >
              {row.desc}
            </span>
            <span
              className={`ml-auto flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
                row.highlight
                  ? 'bg-white text-[#0d0c0e]'
                  : 'bg-black/[0.04] text-zinc-950 group-hover:bg-white group-hover:text-[#0d0c0e]'
              }`}
            >
              <ChevronRight className="h-4 w-4" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
