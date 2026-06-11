/**
 * CloudCta — the reference's sky band, tailored to Chippi as a calm CTA
 * breaker. Soft gray rounded card, scattered white cloud blobs, a centered
 * two-tone headline, a black "View Demo" pill with a circular arrow, a
 * paper-plane illustration (Chippi sending the reply), and a quiet link row
 * along the bottom. Pure decoration + one CTA — it exists to break up space.
 */

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { TwoTone } from './two-tone';

const CLOUDS = [
  { top: '12%', left: '6%', w: 120 },
  { top: '8%', left: '70%', w: 150 },
  { top: '26%', left: '40%', w: 90 },
  { top: '20%', left: '88%', w: 80 },
  { top: '48%', left: '4%', w: 140 },
  { top: '40%', left: '82%', w: 130 },
  { top: '64%', left: '22%', w: 100 },
  { top: '70%', left: '66%', w: 110 },
];

const LINKS = [
  { label: 'Product', href: '/chippi' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Book a demo', href: '/demo' },
  { label: 'Company', href: '/company' },
  { label: 'Integrations', href: '/integrations' },
];

function Cloud({ w }: { w: number }) {
  return (
    <svg width={w} height={w * 0.42} viewBox="0 0 100 42" fill="#ffffff" aria-hidden>
      <path d="M20 38 a16 16 0 0 1 2 -31 a20 20 0 0 1 38 4 a14 14 0 0 1 20 13 a11 11 0 0 1 -3 14 H20 a8 8 0 0 1 0 -14 Z" />
    </svg>
  );
}

/** Paper plane — Chippi sending the reply. */
function PaperPlane() {
  return (
    <svg viewBox="0 0 240 160" className="h-auto w-full max-w-sm" aria-hidden>
      <path d="M18 84 L222 20 L150 150 L120 104 Z" fill="#ffffff" stroke="#0d0c0e" strokeWidth="3" strokeLinejoin="round" />
      <path d="M120 104 L222 20 L150 150 Z" fill="#f0f0f3" stroke="#0d0c0e" strokeWidth="3" strokeLinejoin="round" />
      <path d="M120 104 L222 20" stroke="#0d0c0e" strokeWidth="3" strokeLinecap="round" />
      <path d="M150 150 L138 120" stroke="#0d0c0e" strokeWidth="3" strokeLinecap="round" />
      <circle cx="222" cy="20" r="9" fill="#ff4b29" />
    </svg>
  );
}

export function CloudCta() {
  return (
    <section className="px-3 sm:px-4">
      <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-[#e3e4e9] px-5 pb-8 pt-16 dark:bg-[#1a1a1f] sm:rounded-[2.75rem] sm:px-10 sm:pb-10 sm:pt-20">
        {/* Cloud field */}
        {CLOUDS.map((c, i) => (
          <span
            key={i}
            aria-hidden
            className="pointer-events-none absolute opacity-90"
            style={{ top: c.top, left: c.left }}
          >
            <Cloud w={c.w} />
          </span>
        ))}

        {/* Centered headline + CTA */}
        <div className="relative z-10 flex flex-col items-center text-center">
          <span aria-hidden className="text-2xl leading-none text-[#ff4b29]">✦</span>
          <h2 className="mt-5 max-w-2xl text-4xl font-semibold leading-[1.05] sm:text-5xl">
            <TwoTone
              parts={[
                { t: 'Connect your inbox,' },
                { t: 'Chippi', dim: true },
                { t: 'works the' },
                { t: 'rest.', dim: true },
              ]}
            />
          </h2>
          <Link
            href="/demo"
            className="group mt-7 inline-flex items-center gap-3 rounded-full bg-[#0d0c0e] py-2 pl-6 pr-2 text-[15px] font-semibold text-white transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
          >
            View Demo
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#0d0c0e] transition-transform group-hover:translate-x-0.5">
              <ChevronRight className="h-4 w-4" />
            </span>
          </Link>
        </div>

        {/* Paper plane */}
        <div className="relative z-10 mt-10 flex justify-center">
          <PaperPlane />
        </div>

        {/* Quiet link row */}
        <div className="relative z-10 mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-black/5 pt-6 dark:border-white/10">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-zinc-700 transition-colors hover:text-zinc-950 dark:text-white/70 dark:hover:text-white"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
