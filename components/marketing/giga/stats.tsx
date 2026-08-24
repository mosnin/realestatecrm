'use client';

/**
 * Stats, the numbers band (reference-matched).
 *
 * A short statement on the LEFT, then big SANS numbers on the RIGHT with small
 * uppercase mono labels above each and thin vertical hairline dividers between
 * them. No eyebrow, no centered headline, exactly the reference layout.
 */

import { BlurRise, Mono, Band } from './primitives';
import { HOME_DICTS } from '@/lib/i18n/dictionaries/home';
import type { Lang } from '@/lib/i18n/markets';

export function Stats({ lang = 'en' }: { lang?: Lang }) {
  const t = HOME_DICTS[lang].proof;
  return (
    <Band className="py-20 sm:py-28">
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_auto] lg:gap-20">
        <BlurRise>
          <p className="max-w-lg text-2xl leading-snug text-white/85 sm:text-[2rem] sm:leading-[1.25]">
            {t.intro}
          </p>
        </BlurRise>

        <BlurRise delay={0.1}>
          <div
            data-testid="homepage-proof-band"
            className="grid divide-y divide-white/[0.1] md:grid-cols-3 md:divide-x md:divide-y-0"
          >
            {t.items.map((s) => (
              <div
                key={s.label}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-6 py-6 first:pt-0 last:pb-0 md:block md:px-6 md:py-0 md:first:pl-0 md:last:pr-0 xl:px-10"
              >
                <Mono className="max-w-[12rem] text-[10px] leading-relaxed text-white/40">
                  {s.label}
                </Mono>
                <span
                  className={lang === 'en'
                    ? 'block whitespace-nowrap text-[2.5rem] font-light leading-none tracking-tight text-white md:mt-3 md:text-[clamp(2rem,5vw,3.5rem)] xl:text-[clamp(3.5rem,4.8vw,4.25rem)]'
                    : 'block whitespace-nowrap text-[clamp(1.2rem,7vw,2.25rem)] font-light leading-none tracking-tight text-white md:mt-3 md:text-[clamp(1.2rem,3vw,2.75rem)]'}
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
