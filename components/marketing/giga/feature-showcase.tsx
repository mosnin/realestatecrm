'use client';

/**
 * FeatureShowcase — the reusable animated feature section (reference-matched).
 *
 * One config-driven component used for multiple sections (e.g. "Real Estate OS"
 * and the realtor-dashboard tour). Layout:
 *   - eyebrow + big serif headline (left) and three plain-icon mini-features
 *     (right);
 *   - below, a big rounded card split into a text column (gradient product name
 *     + blurb + ghost pill + an auto-advancing STEPPED LIST) and a fixed scenic
 *     background with a FROSTED translucent product-UI card composited over it.
 *
 * The card swaps per step (rows stagger in), auto-advances on a progress bar,
 * pauses on hover, and is reduced-motion aware. `imageSide` mirrors the card so
 * sections can alternate image-right / image-left down the page.
 *
 * Also exports the frosted mockup kit (Frost / Row / Dot / rowV) so each
 * section can declare its own detailed panels.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';
import { BlurRise, Eyebrow, PillGhost, Serif, Band } from './primitives';

/** Per-step dwell time before auto-advancing (ms). */
const DURATION = 6500;

export interface ShowcaseStep {
  key: string;
  title: string;
  desc: string;
  /** The frosted mockup panel rendered for this step. */
  mockup: React.ReactNode;
}

export interface ShowcaseTopFeature {
  icon: React.ElementType;
  title: string;
  desc: string;
}

export interface FeatureShowcaseProps {
  eyebrow: string;
  headline: React.ReactNode;
  product: {
    name: string;
    icon: React.ElementType;
    desc: string;
    cta: { label: string; href: string };
  };
  topFeatures: ShowcaseTopFeature[];
  steps: ShowcaseStep[];
  /** Full-bleed scenic background photo behind the frosted mockup. */
  image: string;
  /** Which side the image/mockup sits on (alternates per section). */
  imageSide?: 'left' | 'right';
  className?: string;
}

export function FeatureShowcase({
  eyebrow,
  headline,
  product,
  topFeatures,
  steps,
  image,
  imageSide = 'right',
  className,
}: FeatureShowcaseProps) {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);

  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const progressRef = useRef(0);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const goTo = useCallback((i: number) => {
    setActive(i);
    setProgress(0);
    progressRef.current = 0;
    startRef.current = null;
  }, []);

  useEffect(() => {
    if (reduce) return;
    function tick(now: number) {
      if (pausedRef.current) {
        startRef.current = now - progressRef.current * DURATION;
      } else {
        if (startRef.current === null) startRef.current = now;
        const p = Math.min((now - startRef.current) / DURATION, 1);
        progressRef.current = p;
        setProgress(p);
        if (p >= 1) {
          startRef.current = null;
          progressRef.current = 0;
          setProgress(0);
          setActive((cur) => (cur + 1) % steps.length);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [reduce, active, steps.length]);

  const ProductIcon = product.icon;
  const imageLeft = imageSide === 'left';

  return (
    <Band className={cn('py-24 sm:py-32', className)}>
      {/* Header: eyebrow + serif headline (left), three mini-features (right) */}
      <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.3fr] lg:gap-16">
        <BlurRise>
          <div>
            <Eyebrow>{eyebrow}</Eyebrow>
            <Serif className="mt-5 text-[clamp(2.5rem,5vw,4.5rem)] leading-[1.02] text-white">
              {headline}
            </Serif>
          </div>
        </BlurRise>
        <BlurRise delay={0.08}>
          <div className="grid grid-cols-1 gap-y-7 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-white/[0.08] lg:pt-3">
            {topFeatures.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="sm:px-5 sm:first:pl-0 sm:last:pr-0">
                  <Icon className="h-[18px] w-[18px] text-white/55" />
                  <h3 className="mt-3.5 text-[13.5px] font-medium text-white">{f.title}</h3>
                  <p className="mt-1.5 text-[12.5px] leading-snug text-white/45">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </BlurRise>
      </div>

      {/* The big animated card */}
      <BlurRise delay={0.12}>
        <div className="mt-12 overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.02] p-2.5 sm:p-3">
          <div
            className={cn(
              'grid gap-2.5 sm:gap-3',
              imageLeft ? 'lg:grid-cols-[1.34fr_0.66fr]' : 'lg:grid-cols-[0.66fr_1.34fr]',
            )}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocusCapture={() => setPaused(true)}
            onBlurCapture={() => setPaused(false)}
          >
            {/* TEXT column */}
            <div className={cn('flex flex-col p-6 sm:p-9', imageLeft && 'lg:order-2')}>
              <span className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#ff7a45] to-[#ff5fa2] text-black">
                  <ProductIcon className="h-[18px] w-[18px]" />
                </span>
                <span
                  className="bg-gradient-to-r from-[#ff7a45] via-[#ff7e6b] to-[#ff5fa2] bg-clip-text text-[22px] font-semibold tracking-tight text-transparent"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  {product.name}
                </span>
              </span>
              <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/60">{product.desc}</p>
              <div className="mt-6">
                <PillGhost href={product.cta.href}>{product.cta.label}</PillGhost>
              </div>

              {/* Stepped list */}
              <div className="mt-9 flex flex-col">
                {steps.map((s, i) => {
                  const isActive = i === active;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => goTo(i)}
                      aria-current={isActive}
                      className="group relative w-full cursor-pointer py-4 text-left"
                    >
                      <span aria-hidden className="absolute inset-x-0 top-0 h-px overflow-hidden bg-white/[0.1]">
                        {isActive && (
                          <span
                            className="block h-full bg-white"
                            style={{
                              width: `${(reduce ? 1 : progress) * 100}%`,
                              transition: reduce ? 'width 0.3s ease' : 'none',
                            }}
                          />
                        )}
                      </span>
                      <span
                        className={cn(
                          'text-[15px] transition-colors',
                          isActive ? 'font-medium text-white' : 'text-white/55 group-hover:text-white/80',
                        )}
                      >
                        {s.title}
                      </span>
                      <AnimatePresence initial={false}>
                        {isActive && (
                          <motion.p
                            initial={reduce ? false : { height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={reduce ? undefined : { height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: EASE_OUT }}
                            className="overflow-hidden text-[13px] leading-snug text-white/50"
                          >
                            <span className="block pt-2">{s.desc}</span>
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* IMAGE column: scenic bg + composited frosted panel per step */}
            <div
              className={cn(
                'relative min-h-[480px] overflow-hidden rounded-2xl lg:min-h-[700px]',
                imageLeft && 'lg:order-1',
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image}
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full object-cover"
                style={{ filter: 'saturate(0.78) brightness(0.62) contrast(1.05)' }}
              />
              <div aria-hidden className="absolute inset-0 bg-black/35" />
              <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/5 to-black/25" />

              <div className="absolute inset-0 flex items-center justify-center p-6 sm:p-10">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={active}
                    initial={reduce ? false : { opacity: 0, y: 14, filter: 'blur(10px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={reduce ? undefined : { opacity: 0, y: -10, filter: 'blur(10px)' }}
                    transition={{ duration: 0.5, ease: EASE_OUT }}
                    className="w-full max-w-xl"
                  >
                    {steps[active].mockup}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </BlurRise>
    </Band>
  );
}

/* ── Frosted mockup kit ─────────────────────────────────────────────────────
 * Translucent dark "glass" panels (the landscape shows through, blurred), with
 * rows that stagger in each time the panel swaps. Frost reads reduced-motion
 * itself, so section configs can declare mockups as plain JSX. */

export const rowV = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT } },
};

export function Frost({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <div className="overflow-hidden rounded-2xl border border-white/12 bg-[#0b0b0d]/55 shadow-2xl shadow-black/60 backdrop-blur-2xl">
      <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
        <span className="flex items-center gap-2">
          <span className="h-4 w-4 rounded-full bg-gradient-to-br from-[#ff7a45] to-[#ff5fa2]" />
          <span className="text-[13px] font-medium text-white">{title}</span>
        </span>
        {badge ? (
          <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] font-medium text-white/60">{badge}</span>
        ) : (
          <span className="flex gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
            <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
            <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
          </span>
        )}
      </div>
      <motion.div
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } } }}
        initial={reduce ? false : 'hidden'}
        animate="show"
        className="space-y-1.5 p-3"
      >
        {children}
      </motion.div>
    </div>
  );
}

export function Row({
  icon: Icon,
  title,
  meta,
  tone,
  active,
  right,
}: {
  icon: React.ElementType;
  title: string;
  meta?: string;
  tone?: string;
  active?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <motion.div
      variants={rowV}
      className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5', active ? 'bg-white/[0.06]' : '')}
    >
      <span
        className={cn(
          'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]',
          tone ?? 'text-white/55',
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium text-white">{title}</span>
        {meta ? <span className="block truncate text-[11px] text-white/45">{meta}</span> : null}
      </span>
      {right}
    </motion.div>
  );
}

export function Dot({ tone }: { tone: string }) {
  return <span className={cn('h-1.5 w-1.5 rounded-full', tone)} />;
}
