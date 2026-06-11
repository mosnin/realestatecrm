/**
 * ResultsStat — the reference's stat + radial card, tailored and KEPT HONEST.
 *
 * The source's "20% / 84%" metric claims and fabricated customer logos
 * (Pratt & Whitney, Honeywell) are NOT carried over — no invented numbers,
 * no fake social proof. Instead: the concentric arcs are an illustrative
 * pipeline (New → Won, the outer ring vermillion), the focal stat is the
 * defensible "24/7", and the floating cards show Chippi's own events
 * (reply drafted, tour booked) rather than logos.
 */

import { CalendarCheck, PenLine } from 'lucide-react';
import { TwoTone } from './two-tone';

/* Five concentric top-arcs (semi-circles). Outer ring is the brand. */
const ARCS = [
  { r: 70, stroke: '#ece9f1', label: 'New' },
  { r: 96, stroke: '#e6e2ee', label: 'Contacted' },
  { r: 122, stroke: '#e0dbea', label: 'Touring' },
  { r: 148, stroke: '#d8d2e6', label: 'Offer' },
  { r: 174, stroke: '#ff4b29', label: 'Won' },
];

function Radial() {
  const cx = 200;
  const cy = 200;
  return (
    <svg viewBox="0 0 400 210" className="h-auto w-full" role="img" aria-label="Chippi moves deals from new lead to won">
      {ARCS.map((a) => (
        <path
          key={a.r}
          d={`M ${cx - a.r} ${cy} A ${a.r} ${a.r} 0 0 1 ${cx + a.r} ${cy}`}
          fill="none"
          stroke={a.stroke}
          strokeWidth={20}
          strokeLinecap="round"
        />
      ))}
      {/* Stage labels riding the right end of each arc */}
      {ARCS.map((a, i) => (
        <text
          key={a.label}
          x={cx + a.r}
          y={cy - 6}
          textAnchor="middle"
          className="fill-current text-[11px] font-medium"
          style={{ color: i === ARCS.length - 1 ? '#ffffff' : '#8b8694' }}
        >
          {a.label}
        </text>
      ))}
    </svg>
  );
}

/* A floating Chippi-event card — replaces the fabricated customer logos. */
function EventCard({
  icon,
  title,
  meta,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  meta: string;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_12px_36px_-12px_rgba(20,16,12,0.25)] ring-1 ring-black/5 ${className}`}
    >
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#ff4b29]/10 text-[#ff4b29]">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold text-zinc-950">{title}</span>
        <span className="block text-[11px] text-neutral-500">{meta}</span>
      </span>
    </div>
  );
}

export function ResultsStat() {
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6">
      <div className="relative overflow-hidden rounded-[2rem] bg-[#f4f4f6] p-7 ring-1 ring-black/5 dark:bg-[#151517] sm:rounded-[2.75rem] sm:p-12">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          {/* Copy + focal stat */}
          <div>
            <h2 className="flex items-start gap-3 text-3xl font-semibold leading-[1.08] sm:text-[2.6rem]">
              <span aria-hidden className="mt-1 text-2xl leading-none text-[#ff4b29] sm:text-3xl">✦</span>
              <TwoTone
                parts={[
                  { t: 'Chippi moves' },
                  { t: 'every deal', dim: true },
                  { t: 'from first' },
                  { t: 'reply', dim: true },
                  { t: 'to closed.' },
                ]}
              />
            </h2>

            <div className="mt-10">
              <p className="text-6xl font-bold tracking-tight text-zinc-950 dark:text-white sm:text-7xl">24/7</p>
              <p className="mt-2 max-w-xs text-base leading-snug text-neutral-600 dark:text-white/60">
                Chippi works your book around the clock — approval-first, always.
              </p>
            </div>
          </div>

          {/* Radial + floating event cards */}
          <div className="relative">
            <div className="mx-auto max-w-md pt-2">
              <Radial />
            </div>
            <EventCard
              icon={<PenLine className="h-4 w-4" />}
              title="Reply drafted — Maya"
              meta="in your voice · awaiting approval"
              className="absolute -top-2 right-0 w-60 max-w-[80%]"
            />
            <EventCard
              icon={<CalendarCheck className="h-4 w-4" />}
              title="Tour booked — 14 Oak St"
              meta="Saturday · 2:00 PM"
              className="absolute bottom-2 right-2 w-60 max-w-[80%]"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
