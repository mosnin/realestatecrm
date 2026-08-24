'use client';

/**
 * HeroChat — the marketing homepage hero's Chippi input.
 *
 * An interactive Ask Chippi box in the hero's dark, glassy vocabulary.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp } from 'lucide-react';
import { HOME_DICTS } from '@/lib/i18n/dictionaries/home';
import type { Lang } from '@/lib/i18n/markets';

const DEMO = '/demo';

export function HeroChat({ lang = 'en' }: { lang?: Lang }) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const t = HOME_DICTS[lang].chat;
  const start = () => router.push(DEMO);

  return (
    <div className="mx-auto w-full max-w-[600px]">
      <div className="rounded-2xl border border-white/12 bg-white/[0.06] p-3.5 text-left shadow-2xl shadow-black/30 backdrop-blur-xl">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              start();
            }
          }}
          rows={2}
          placeholder={t.placeholder}
          className="w-full resize-none border-none bg-transparent px-1.5 pt-1 text-[15px] leading-relaxed text-white outline-none placeholder:text-white/45"
        />
        <div className="mt-2 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-1.5 text-[12px] text-white/70">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/favicon.png" alt="Chippi" width={16} height={16} className="h-4 w-4 rounded" />
            Chippi
          </span>
          <button
            type="button"
            aria-label={t.askLabel}
            onClick={start}
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-white text-black transition-transform duration-150 hover:scale-105 active:scale-95"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
        {t.examples.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => setValue(example)}
            className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-2 text-[13px] text-white/80 backdrop-blur-sm transition-colors hover:border-white/25 hover:bg-white/[0.1] hover:text-white"
          >
            {example}
          </button>
        ))}
      </div>

      <a
        href={DEMO}
        className="mx-auto mt-5 block text-center text-[12px] text-white/50 transition-colors hover:text-white/80"
      >
        {t.demo}
      </a>
    </div>
  );
}
