'use client';

/**
 * Stats — the dark numbers band.
 *
 * Two-to-three big serif numbers with mono labels. Chippi-relevant, honest
 * placeholders the founder can refine. Thin hairline dividers between cells.
 */

import { BlurRise, Eyebrow, Serif, Band } from './primitives';

const STATS = [
  { value: '24/7', label: 'WORKING YOUR PIPELINE' },
  { value: '< 5 min', label: 'AVERAGE FIRST RESPONSE' },
  { value: '30+', label: 'LANGUAGES SPOKEN' },
];

export function Stats() {
  return (
    <Band className="py-20 sm:py-28">
      <BlurRise>
        <div className="flex flex-col items-center text-center">
          <Eyebrow>By the numbers</Eyebrow>
          <Serif className="mt-5 max-w-2xl text-[1.75rem] leading-[1.1] text-white/90 sm:text-[2.25rem]">
            The busywork runs itself. The hours go to closing.
          </Serif>
        </div>
      </BlurRise>

      <BlurRise delay={0.1}>
        <div className="mt-14 grid grid-cols-1 divide-y divide-white/[0.08] border-y border-white/[0.08] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {STATS.map((s) => (
            <div key={s.label} className="flex flex-col items-center px-6 py-10 text-center">
              <Serif className="text-[3rem] leading-none text-white sm:text-[4rem]">{s.value}</Serif>
              <p
                style={{ fontFamily: 'var(--font-mono-display)' }}
                className="mt-4 text-[11px] uppercase tracking-[0.18em] text-white/45"
              >
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </BlurRise>
    </Band>
  );
}
