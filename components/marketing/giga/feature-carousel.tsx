'use client';

/**
 * FeatureCarousel, the auto-advancing feature showcase (the signature
 * interaction, reference-matched). This is the FIRST feature block; the
 * additional feature sections use the static alternating large-card layout
 * (see FeatureSection).
 *
 * A tabbed showcase that AUTO-ADVANCES on a timer. Each tab carries a progress
 * bar that fills over its duration, then advances to the next tab. Layout:
 *  - Left: mono eyebrow + big serif heading + description + an "Explore" pill.
 *  - Top-right: the three feature blurbs (icon + title + desc) act as the tabs,
 *    each with its own progress bar.
 *  - Right (below): a large product/image panel that cross-fades per tab.
 *
 * Interaction:
 *  - Clicking a tab jumps to it and resets the timer.
 *  - Hovering the section pauses the auto-advance.
 *  - prefers-reduced-motion → no auto-advance, no cross-fade; tabs stay
 *    clickable and the panel swaps instantly.
 *
 * Implementation: a requestAnimationFrame loop drives a 0→1 `progress` value
 * for the active tab (smooth bar fill, precise pause/reset). When progress
 * reaches 1 the active index advances. Copy is Chippi/real-estate.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { MessagesSquare, Target, KanbanSquare, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';
import { ACCENT, BlurRise, Eyebrow, PillGhost, Serif, Band } from './primitives';

interface FeatureTab {
  icon: React.ElementType;
  tab: string;
  blurb: string;
  heading: React.ReactNode;
  description: string;
  /** TODO: replace placeholder image, per-feature product shot. */
  image: string;
  imageAlt: string;
}

const TABS: FeatureTab[] = [
  {
    icon: MessagesSquare,
    tab: 'Natural conversations',
    blurb: 'Replies written in your voice, waiting before you open the thread.',
    heading: (
      <>
        Every thread, answered
        <br className="hidden sm:block" /> the way you would.
      </>
    ),
    description:
      'Chippi reads each inbound against your live deals and sends the reply in your voice, the moment the lead lands.',
    image: '/marketing/product/realtors.jpg',
    imageAlt: 'Chippi drafting a reply in the agent inbox',
  },
  {
    icon: Target,
    tab: 'Smart insights',
    blurb: 'Every lead scored against your real pipeline, so you know who to call first.',
    heading: (
      <>
        Know exactly who
        <br className="hidden sm:block" /> to call first.
      </>
    ),
    description:
      'Leads are scored against your real pipeline and ranked by intent, so the next best move is always at the top of the list, not buried in a spreadsheet.',
    image: '/marketing/product/brokerages.jpg',
    imageAlt: 'Chippi ranking leads by intent',
  },
  {
    icon: KanbanSquare,
    tab: 'Pipeline automation',
    blurb: 'Tours booked, deals advanced, the log kept current, automatically.',
    heading: (
      <>
        A pipeline that
        <br className="hidden sm:block" /> keeps itself current.
      </>
    ),
    description:
      'Ask Chippi to book a time and the tour lands on the calendar, the confirmation goes back in the thread, and the deal advances, every action written down in plain language.',
    image: '/marketing/product/integrations.jpg',
    imageAlt: 'Chippi advancing a deal in the pipeline board',
  },
  {
    icon: Inbox,
    tab: 'Omnichannel inbox',
    blurb: 'Email and text in one worked queue; phone calling when Telnyx is configured.',
    heading: (
      <>
        Every channel, one
        <br className="hidden sm:block" /> queue that gets worked.
      </>
    ),
    description:
      'Email and text land in a single queue Chippi keeps moving. Phone calling joins that queue when Telnyx is configured, so follow-up never slips while you are out showing.',
    image: '/marketing/product/live-demo.jpg',
    imageAlt: 'Chippi working an omnichannel inbox',
  },
];

/** Per-tab dwell time before advancing (ms). */
const DURATION = 6000;

export function FeatureCarousel() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);

  // rAF loop refs, kept outside React state so the loop reads fresh values.
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const progressRef = useRef(0);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const goTo = useCallback((i: number) => {
    setActive(i);
    setProgress(0);
    progressRef.current = 0;
    startRef.current = null; // restart the timer for the new tab
  }, []);

  useEffect(() => {
    // No auto-advance under reduced motion, the showcase stays static and
    // fully controllable by click.
    if (reduce) return;

    function tick(now: number) {
      if (pausedRef.current) {
        // While paused, rebase the clock each frame so elapsed stays frozen;
        // progress resumes exactly where it left off when hover ends.
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
          setActive((cur) => (cur + 1) % TABS.length);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // Re-create the loop whenever the active tab changes (resets the clock).
  }, [reduce, active]);

  const current = TABS[active];

  return (
    <Band className="py-24 sm:py-32">
      <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
        {/* Left: eyebrow + serif heading + description + Explore */}
        <div className="lg:sticky lg:top-28">
          <BlurRise>
            <Eyebrow>Built for the work</Eyebrow>
          </BlurRise>
          <BlurRise delay={0.05}>
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={reduce ? false : { opacity: 0, y: 10, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={reduce ? undefined : { opacity: 0, y: -10, filter: 'blur(8px)' }}
                transition={{ duration: 0.5, ease: EASE_OUT }}
              >
                <Serif className="mt-5 text-[2.25rem] leading-[1.06] text-white sm:text-[3rem]">
                  {current.heading}
                </Serif>
                <p className="mt-5 max-w-md text-base leading-relaxed text-white/60">
                  {current.description}
                </p>
              </motion.div>
            </AnimatePresence>
          </BlurRise>
          <BlurRise delay={0.1}>
            <div className="mt-8">
              <PillGhost href="/agents" withArrow>
                Explore the agent
              </PillGhost>
            </div>
          </BlurRise>
        </div>

        {/* Right: the tabs (top) + the image panel (below) */}
        <div
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocusCapture={() => setPaused(true)}
          onBlurCapture={() => setPaused(false)}
        >
          {/* Tabs: icon + title + desc, each with a progress bar */}
          <BlurRise delay={0.05}>
            <div className="flex flex-col divide-y divide-white/[0.08] border-y border-white/[0.08]">
              {TABS.map((t, i) => {
                const Icon = t.icon;
                const isActive = i === active;
                return (
                  <button
                    key={t.tab}
                    type="button"
                    onClick={() => goTo(i)}
                    aria-current={isActive}
                    className="group relative w-full cursor-pointer overflow-hidden py-4 text-left transition-colors"
                  >
                    {/* Progress bar (top edge of the active row) */}
                    <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-white/10">
                      <span
                        className="block h-full"
                        style={{
                          width: isActive ? `${(reduce ? 1 : progress) * 100}%` : '0%',
                          backgroundColor: ACCENT,
                          transition: isActive && !reduce ? 'none' : 'width 0.3s ease',
                        }}
                      />
                    </span>
                    <span className="flex items-start gap-3.5">
                      <span
                        className={cn(
                          'mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border transition-colors',
                          isActive
                            ? 'border-[#ff7a45]/40 bg-[#ff7a45]/10 text-[#ff9a6e]'
                            : 'border-white/10 bg-white/[0.03] text-white/45 group-hover:text-white/70',
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span
                          className={cn(
                            'block text-[15px] font-medium transition-colors',
                            isActive ? 'text-white' : 'text-white/70 group-hover:text-white',
                          )}
                        >
                          {t.tab}
                        </span>
                        <span
                          className={cn(
                            'mt-1 block text-[13px] leading-snug transition-colors',
                            isActive ? 'text-white/60' : 'text-white/40',
                          )}
                        >
                          {t.blurb}
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </BlurRise>

          {/* Large image panel, cross-fades per tab */}
          <BlurRise delay={0.1}>
            <div className="relative mt-6 aspect-[16/10] w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
              <AnimatePresence mode="popLayout">
                <motion.div
                  key={active}
                  initial={reduce ? false : { opacity: 0, scale: 1.02 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reduce ? undefined : { opacity: 0, scale: 0.99 }}
                  transition={{ duration: 0.6, ease: EASE_OUT }}
                  className="absolute inset-0"
                >
                  {/* TODO: replace placeholder image, per-feature product shot. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={current.image}
                    alt={current.imageAlt}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                </motion.div>
              </AnimatePresence>
            </div>
          </BlurRise>
        </div>
      </div>
    </Band>
  );
}
