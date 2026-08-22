'use client';

/**
 * Stats, the numbers band (reference-matched).
 *
 * A short statement on the LEFT, then big SANS numbers on the RIGHT with small
 * uppercase mono labels above each and thin vertical hairline dividers between
 * them. No eyebrow, no centered headline, exactly the reference layout.
 */

import { BlurRise, Mono, Band } from './primitives';

const STATS = [
  { value: 'Sent', label: 'First intro when they apply' },
  { value: 'You', label: 'From your inbox when connected' },
  { value: '24/7', label: 'Later follow-ups drafted' },
];

export function Stats() {
  return (
    <Band className="py-20 sm:py-28">
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_auto] lg:gap-20">
        <BlurRise>
          <p className="max-w-lg text-2xl leading-snug text-white/85 sm:text-[2rem] sm:leading-[1.25]">
            The busywork runs itself, so your hours go to closing. Chippi goes
            live on your book in a day.
          </p>
        </BlurRise>

        <BlurRise delay={0.1}>
          <div className="grid grid-cols-3 divide-x divide-white/[0.1]">
            {STATS.map((s) => (
              <div key={s.label} className="px-5 first:pl-0 sm:px-10">
                <Mono className="text-[10px] text-white/40">{s.label}</Mono>
                <span
                  className="mt-3 block text-[2.75rem] font-light leading-none tracking-tight tabular-nums text-white sm:text-[3.5rem] lg:text-[4.25rem]"
                  style={{ fontFamily: 'var(--font-sans)' }}
                >
                  {s.value}
                </span>
              </div>
            ))}
          </div>
        </BlurRise>
      </div>
    </Band>
  );
}
