'use client';

/**
 * HeroChat — the marketing homepage hero's Chippi input.
 *
 * Replaces the old video/testimonial card with an "ask Chippi" box in the
 * hero's dark, glassy vocabulary (frosted white-on-photo, not a flat panel).
 * The example chips prefill the box with real realtor asks; typing + Enter or
 * the send arrow starts the demo. Branded with the real Chippi mark — never a
 * third-party model name.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp } from 'lucide-react';

const DEMO = '/demo';

const EXAMPLES = ['Draft a follow-up', 'Prepare me for a tour', 'Find my best leads'];

export function HeroChat() {
  const router = useRouter();
  const [value, setValue] = useState('');

  const start = () => router.push(DEMO);

  return (
    <div className="mx-auto w-full max-w-[600px]">
      {/* Input — frosted glass on the photo, matching the hero's other cards. */}
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
          placeholder="Ask Chippi to draft a follow-up, prep a tour, or find your best leads…"
          className="w-full resize-none border-none bg-transparent px-1.5 pt-1 text-[15px] leading-relaxed text-white outline-none placeholder:text-white/45"
        />
        <div className="mt-2 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-1.5 text-[12px] text-white/70">
            {/* The real Chippi mark. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/favicon.png" alt="Chippi" width={16} height={16} className="h-4 w-4 rounded" />
            Chippi
          </span>
          <button
            type="button"
            aria-label="Ask Chippi"
            onClick={start}
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-white text-black transition-transform duration-150 hover:scale-105 active:scale-95"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Example asks — tap to prefill, so the box feels alive. */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => setValue(ex)}
            className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-2 text-[13px] text-white/80 backdrop-blur-sm transition-colors hover:border-white/25 hover:bg-white/[0.1] hover:text-white"
          >
            {ex}
          </button>
        ))}
      </div>

      {/* Keep the walkthrough the old card offered, quietly. */}
      <a
        href={DEMO}
        className="mx-auto mt-5 block text-center text-[12px] text-white/50 transition-colors hover:text-white/80"
      >
        or watch a 90-second demo →
      </a>
    </div>
  );
}
