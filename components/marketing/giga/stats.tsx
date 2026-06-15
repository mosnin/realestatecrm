'use client';

/**
 * Stats — the dark numbers band.
 *
 * Two-to-three big THIN serif numbers with small mono uppercase labels above
 * each, separated by thin vertical hairline dividers. Chippi-relevant, honest
 * placeholders the founder can refine.
 */

import { BlurRise, Eyebrow, Mono, Serif, Band } from './primitives';

const STATS = [
  { value: '94%', label: 'OF FOLLOW-UPS DRAFTED FOR YOU' },
  { value: '< 5 min', label: 'AVERAGE FIRST RESPONSE' },
  { value: '24/7', label: 'WORKING YOUR PIPELINE' },
];

export function Stats() {
  return (
    <Band className="py-20 sm:py-28">
      <BlurRise>
        <div className="flex flex-col items-center text-center">
          <Eyebrow>By the numbers</Eyebrow>
          <Serif className="mt-5 max-w-2xl text-[1.875rem] leading-[1.1] text-white/90 sm:text-[2.5rem]">
            The busywork runs itself. The hours go to closing.
          </Serif>
        </div>
      </BlurRise>

      <BlurRise delay={0.1}>
        <div className="mt-14 grid grid-cols-1 divide-y divide-white/[0.08] border-y border-white/[0.08] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {STATS.map((s) => (
            <div key={s.label} className="flex flex-col items-center px-6 py-10 text-center">
              <Mono className="text-[10px] text-white/40">{s.label}</Mono>
              <Serif className="mt-4 text-[3rem] leading-none text-white sm:text-[4rem]">
                {s.value}
              </Serif>
            </div>
          ))}
        </div>
      </BlurRise>
    </Band>
  );
}
