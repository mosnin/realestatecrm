/**
 * StudioSection, the content-studio beat (audit gap #1: the site under-told
 * that Chippi generates marketing content, including VIDEO).
 *
 * Grounded in real tools: generate_studio_image (flux-schnell / flux-2 /
 * seedream-4), seedance-video, edit_studio_image (upscale, remove-bg,
 * restyle). Pastel-wash card, two-tone headline with serif accent, a 4-up
 * grid of LABELED media placeholders (real generated assets drop in later),
 * capability chips, CTA into /studio. Honest: drafts the caption + generates
 * the asset, "ready to post" (no auto-post claim).
 */

import Link from 'next/link';
import { ArrowRight, Clapperboard, ImagePlus, Mail, Wand2 } from 'lucide-react';
import { Accent, EyebrowChip, FadeUp, Stagger, StaggerItem } from '@/components/marketing/site/section';

const MEDIA = [
  { slot: 'studio-just-listed', label: 'Just-listed post', icon: ImagePlus, ratio: 'aspect-square' },
  { slot: 'studio-reel', label: 'Listing reel · video', icon: Clapperboard, ratio: 'aspect-square' },
  { slot: 'studio-story', label: 'Story graphic', icon: ImagePlus, ratio: 'aspect-square' },
  { slot: 'studio-email', label: 'Email banner', icon: Mail, ratio: 'aspect-square' },
];

const CHIPS = ['Image', 'Video', 'Edit & upscale', 'On-brand'];

export function StudioSection() {
  return (
    <section className="px-3 sm:px-4">
      <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-gradient-to-b from-white via-[#fff7f1] to-[#ffeddd] p-7 ring-1 ring-black/5 sm:rounded-[2.75rem] sm:p-12">
        <FadeUp className="mx-auto max-w-2xl text-center">
          <EyebrowChip className="justify-center">Content studio</EyebrowChip>
          <h2 className="mt-5 text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
            Your just-listed post, <Accent>written and rendered.</Accent>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
            Describe the listing and Chippi drafts the caption and generates the
            image or the reel, on brand and ready to post. Edit, upscale, or
            restyle without leaving the chat.
          </p>
        </FadeUp>

        <Stagger className="mt-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {MEDIA.map((m) => (
            <StaggerItem key={m.slot}>
              <div className="rounded-3xl bg-white p-3 shadow-[0_18px_60px_-24px_rgba(20,20,40,0.12)] ring-1 ring-black/5">
                <div
                  data-slot={m.slot}
                  className={`flex ${m.ratio} items-center justify-center rounded-2xl bg-gradient-to-b from-[#f6f6f8] to-white ring-1 ring-black/5`}
                >
                  <m.icon className="h-6 w-6 text-neutral-300" />
                </div>
                <p className="px-1 pb-1 pt-3 text-sm font-medium text-zinc-950">{m.label}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>

        <FadeUp delay={0.1} className="mt-8 flex flex-col items-center gap-5">
          <div className="flex flex-wrap justify-center gap-2">
            {CHIPS.map((c) => (
              <span
                key={c}
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-sm font-medium text-neutral-600 ring-1 ring-black/5"
              >
                {c === 'Edit & upscale' ? <Wand2 className="h-3.5 w-3.5 text-[#ff4b29]" /> : null}
                {c}
              </span>
            ))}
          </div>
          <Link
            href="/studio"
            className="inline-flex h-12 items-center gap-2 rounded-full bg-[#ff4b29] px-7 text-[15px] font-semibold text-white transition-all duration-150 hover:bg-[#e84418] active:scale-[0.98]"
          >
            See the studio
            <ArrowRight className="h-4 w-4" />
          </Link>
        </FadeUp>
      </div>
    </section>
  );
}
