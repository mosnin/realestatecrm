'use client';

/**
 * HeroChat — the marketing homepage hero's Chippi input.
 *
 * A direct offer card in the hero's dark, glassy vocabulary. It gives the
 * visitor one self-serve action, one sales-assisted action, and the complete
 * trial terms before they click.
 */

import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { HOME_DICTS } from '@/lib/i18n/dictionaries/home';
import type { Lang } from '@/lib/i18n/markets';

const DEMO = '/demo';
const SIGNUP = '/sign-up';

export function HeroChat({ lang = 'en' }: { lang?: Lang }) {
  const t = HOME_DICTS[lang].offer;
  return (
    <div className="mx-auto w-full max-w-[600px]">
      <div className="rounded-2xl border border-white/12 bg-white/[0.07] p-4 text-left shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href={SIGNUP}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-5 text-[14px] font-semibold text-black transition-all hover:bg-white/90 active:scale-[0.98]"
          >
            {t.start}
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href={DEMO}
            className="inline-flex h-12 items-center justify-center rounded-full border border-white/20 bg-white/[0.03] px-5 text-[14px] font-medium text-white transition-colors hover:border-white/35 hover:bg-white/[0.08]"
          >
            {t.demo}
          </Link>
        </div>
        <p className="mt-3 text-center text-[11.5px] text-white/45">
          {t.terms}
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        {t.outcomes.map((outcome) => (
          <span key={outcome} className="inline-flex items-center gap-1.5 text-[12px] text-white/60">
            <Check className="h-3.5 w-3.5 text-[#ff9a6e]" />
            {outcome}
          </span>
        ))}
      </div>
    </div>
  );
}
