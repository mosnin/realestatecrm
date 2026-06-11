/**
 * FeaturesBento — the owner-provided 2×2 soft-card bento, exact.
 *
 * Four white rounded cards with very soft diffuse shadows: title with a
 * period, two-line gray sub, and a large soft visual area. The visual areas
 * are OWNER IMAGE SLOTS by explicit direction ("leave image placeholders so
 * I can provide my own") — swap each <ImageSlot/> for the provided asset:
 *
 *   <img src="..." alt="..." className="h-full w-full rounded-2xl object-cover" />
 */

import { ImagePlus } from 'lucide-react';

const CELLS = [
  {
    slot: 'drafts',
    title: 'Drafts in your voice.',
    sub: 'Every reply written and waiting\nbefore you even open the thread.',
  },
  {
    slot: 'scoring',
    title: 'Lead scoring that thinks.',
    sub: 'Hot, warm, cold — with the reason,\nthe moment a lead lands.',
  },
  {
    slot: 'pipeline',
    title: 'Your pipeline experience.',
    sub: 'The board advances itself and\nreflects today, not last week.',
  },
  {
    slot: 'approvals',
    title: 'Approval-first control.',
    sub: 'Nothing sends without your tap —\nguardrails and auditing built in.',
  },
];

function ImageSlot({ name }: { name: string }) {
  return (
    <div
      data-slot={name}
      className="mt-8 flex h-64 items-center justify-center rounded-2xl bg-gradient-to-b from-[#f6f6f8] to-white ring-1 ring-black/5 sm:h-72"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <ImagePlus className="h-5 w-5 text-neutral-300" />
        <p className="text-xs text-neutral-400">
          Image placeholder — <span className="font-medium text-neutral-500">{name}</span>
        </p>
      </div>
    </div>
  );
}

export function FeaturesBento() {
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6">
      <div className="grid gap-6 sm:grid-cols-2 sm:gap-8">
        {CELLS.map((cell) => (
          <div
            key={cell.slot}
            className="rounded-3xl bg-white p-7 shadow-[0_18px_60px_-24px_rgba(20,20,40,0.12)] ring-1 ring-black/5 sm:p-9"
          >
            <h3 className="text-xl font-semibold tracking-tight text-zinc-950 sm:text-2xl">
              {cell.title}
            </h3>
            <p className="mt-3 whitespace-pre-line text-base leading-relaxed text-neutral-500">
              {cell.sub}
            </p>
            <ImageSlot name={cell.slot} />
          </div>
        ))}
      </div>
    </section>
  );
}
