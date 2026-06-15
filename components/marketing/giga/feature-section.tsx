'use client';

/**
 * FeatureSection — the signature ALTERNATING feature block (reference-matched).
 *
 * Layout (per the reference):
 *  - A mono + dot eyebrow label.
 *  - A huge, thin, two-line SERIF heading on one side, with THREE small feature
 *    blurbs in a row (small line-icon + bold title + 1–2 line muted desc) near
 *    the top of the other side.
 *  - Below: a LARGE rounded dark card split into a TEXT column (small colored
 *    icon + colored title + muted paragraph + a ghost rounded-full "Explore X"
 *    button) and a BIG image panel.
 *
 * The big image panel ALTERNATES side per section via the `imageSide` prop, so
 * a page can lay these out image-right, image-left, image-right, …
 *
 * Everything is dark, hairline-bordered, generously spaced. Copy is supplied by
 * the caller (Chippi / real-estate). Entrances use the BlurRise primitive.
 */

import { cn } from '@/lib/utils';
import { BlurRise, Eyebrow, PillGhost, Serif } from './primitives';

export interface FeatureBlurb {
  icon: React.ElementType;
  title: string;
  desc: string;
}

export interface FeatureSectionProps {
  eyebrow: string;
  /** Two-line serif heading (pass a fragment with a <br /> for the break). */
  heading: React.ReactNode;
  /** The three small blurbs in a row across the top of the opposite side. */
  blurbs: [FeatureBlurb, FeatureBlurb, FeatureBlurb];
  /** Large-card text column. */
  card: {
    icon: React.ElementType;
    title: string;
    body: string;
    cta: { label: string; href: string };
  };
  /** Big image panel (placeholder). */
  image: { src: string; alt: string };
  /** Which side the big image sits on (alternates per section). */
  imageSide: 'left' | 'right';
  /** Optional id for in-page anchors. */
  id?: string;
}

export function FeatureSection({
  eyebrow,
  heading,
  blurbs,
  card,
  image,
  imageSide,
  id,
}: FeatureSectionProps) {
  const Icon = card.icon;
  const imageLeft = imageSide === 'left';

  return (
    <section id={id} className="px-5 py-24 sm:px-8 sm:py-32">
      <div className="mx-auto w-full max-w-6xl">
        {/* Top row: heading on one side, three blurbs on the other.
            When the big image is on the LEFT, the heading sits on the RIGHT so
            the section reads as a true mirror of the alternate layout. */}
        <div
          className={cn(
            'grid items-start gap-12 lg:grid-cols-2 lg:gap-16',
            imageLeft && 'lg:[&>*:first-child]:order-2',
          )}
        >
          <BlurRise>
            <div>
              <Eyebrow>{eyebrow}</Eyebrow>
              <Serif className="mt-5 text-[2.25rem] leading-[1.06] text-white sm:text-[3rem]">
                {heading}
              </Serif>
            </div>
          </BlurRise>

          <BlurRise delay={0.08}>
            <div className="grid grid-cols-1 gap-7 sm:grid-cols-3 lg:pt-2">
              {blurbs.map((b) => {
                const BIcon = b.icon;
                return (
                  <div key={b.title}>
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/70">
                      <BIcon className="h-[18px] w-[18px]" />
                    </span>
                    <h3 className="mt-4 text-[14px] font-semibold text-white">{b.title}</h3>
                    <p className="mt-1.5 text-[13px] leading-snug text-white/50">{b.desc}</p>
                  </div>
                );
              })}
            </div>
          </BlurRise>
        </div>

        {/* Large rounded dark card: text column + big image panel (alternating). */}
        <BlurRise delay={0.12}>
          <div className="mt-14 overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.02]">
            <div
              className={cn(
                'grid lg:grid-cols-2',
                imageLeft && 'lg:[&>*:first-child]:order-2',
              )}
            >
              {/* Text column */}
              <div className="flex flex-col justify-center p-8 sm:p-12">
                <span
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#ff7a45]/30 bg-[#ff7a45]/10"
                  style={{ color: '#ff9a6e' }}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <h3
                  className="mt-6 text-[20px] font-semibold sm:text-[22px]"
                  style={{ color: '#ff9a6e' }}
                >
                  {card.title}
                </h3>
                <p className="mt-3 max-w-md text-[15px] leading-relaxed text-white/60">
                  {card.body}
                </p>
                <div className="mt-7">
                  <PillGhost href={card.cta.href} withArrow>
                    {card.cta.label}
                  </PillGhost>
                </div>
              </div>

              {/* Big image panel */}
              <div className="relative min-h-[280px] overflow-hidden border-t border-white/[0.08] bg-black/40 lg:min-h-[440px] lg:border-t-0">
                <div
                  className={cn(
                    'absolute inset-0',
                    imageLeft ? 'lg:border-r' : 'lg:border-l',
                    'border-white/[0.08]',
                  )}
                >
                  {/* TODO: replace placeholder image */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.src}
                    alt={image.alt}
                    className="h-full w-full object-cover"
                  />
                  {/* Subtle inward scrim so the card edge stays soft. */}
                  <div
                    aria-hidden
                    className="absolute inset-0"
                    style={{
                      background: imageLeft
                        ? `linear-gradient(90deg, transparent 60%, rgba(10,10,10,0.55) 100%)`
                        : `linear-gradient(270deg, transparent 60%, rgba(10,10,10,0.55) 100%)`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </BlurRise>
      </div>
    </section>
  );
}
