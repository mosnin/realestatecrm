'use client';

/**
 * LeadOrbit — animated lead-qualification orbit (reference-matched), tailored
 * to Chippi. Brand-gradient card: lead headshots ring the dashed orbit
 * (counter-rotated to stay upright), the Chippi hub sits at the top, and the
 * center step stack CYCLES upward through the real loop (received → scored →
 * drafted → booked) with a progress bar that fills per step.
 *
 * Headshots are pravatar portraits (reliable public CDN, real faces). The
 * card stack is narrower than the ring so it sits cleanly inside it. Reduced
 * motion parks the orbit and rests the stack. The source's "80%" metric claim
 * is NOT carried over.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, CalendarCheck, FileText, Flame, PenLine, Rocket } from 'lucide-react';
import { Accent } from '@/components/marketing/site/section';

const AVATARS = [
  'https://i.pravatar.cc/160?img=12',
  'https://i.pravatar.cc/160?img=5',
  'https://i.pravatar.cc/160?img=13',
  'https://i.pravatar.cc/160?img=32',
];

/* On-ring positions [cos, sin] at full radius. Hub holds the top (270°);
 * avatars take the sides + bottom so they never sit under the center cards. */
const POS = [
  { x: 1, y: 0.05 }, // right
  { x: -1, y: 0.05 }, // left
  { x: 0.5, y: 0.86 }, // lower-right
  { x: -0.5, y: 0.86 }, // lower-left
];

const STEPS = [
  { id: 'received', icon: FileText, label: 'Application received' },
  { id: 'scored', icon: Flame, label: 'Scored — Hot · 82' },
  { id: 'drafted', icon: PenLine, label: 'Reply drafted · your voice' },
  { id: 'booked', icon: CalendarCheck, label: 'Tour booked · Sat 2:00' },
];

const VISIBLE = 3;
const ROW_H = 54;
const SPIN = 36;

export function LeadOrbit() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setActive((n) => (n + 1) % STEPS.length), 2400);
    return () => clearInterval(t);
  }, [reduce]);

  return (
    <section className="px-3 sm:px-4">
      <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#ff5a2c] via-[#ff7a47] to-[#ffb38a] px-6 py-12 text-white sm:rounded-[2.75rem] sm:px-12 sm:py-16">
        {/* faint grid */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }}
        />

        <div className="relative grid items-center gap-12 lg:grid-cols-2">
          {/* Headline */}
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/80">Chippi</p>
            <h2 className="mt-4 text-4xl font-semibold leading-[1.02] tracking-tight sm:text-5xl">
              Lead qualification.
              <span className="block">
                Run by a <Accent className="text-white">teammate.</Accent>
              </span>
            </h2>
            <Link
              href="/demo"
              className="group mt-8 inline-flex items-center gap-2 rounded-full bg-[#0d0c0e] py-2.5 pl-6 pr-2.5 text-[15px] font-semibold text-white transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
            >
              Request a demo
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#0d0c0e] transition-transform group-hover:translate-x-0.5">
                <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
            <p className="mt-8 max-w-sm text-sm leading-relaxed text-white/85">
              Chippi scores every lead the moment it lands and drafts the first
              reply in your voice — approval-first, so the decision stays{' '}
              <Accent className="text-white">yours.</Accent>
            </p>
          </div>

          {/* Orbit */}
          <div className="relative mx-auto aspect-square w-full max-w-[460px]">
            {/* dashed ring */}
            <div className="absolute inset-[3%] rounded-full border border-dashed border-white/45" />

            {/* Chippi hub at top */}
            <div className="absolute left-1/2 top-[3%] z-30 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl bg-[#28203a] shadow-lg">
              <span aria-hidden className="text-xl text-[#ff8a5c]">✦</span>
            </div>

            {/* rotating avatar layer */}
            <motion.div
              className="absolute inset-[3%]"
              animate={reduce ? undefined : { rotate: 360 }}
              transition={{ duration: SPIN, ease: 'linear', repeat: Infinity }}
            >
              {POS.map((p, idx) => (
                <div
                  key={idx}
                  className="absolute h-[52px] w-[52px]"
                  style={{ left: `calc(50% + ${p.x * 50}%)`, top: `calc(50% + ${p.y * 50}%)`, transform: 'translate(-50%, -50%)' }}
                >
                  <motion.div
                    className="h-[52px] w-[52px] overflow-hidden rounded-full bg-white p-[3px] shadow-lg ring-1 ring-black/5"
                    animate={reduce ? undefined : { rotate: -360 }}
                    transition={{ duration: SPIN, ease: 'linear', repeat: Infinity }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={AVATARS[idx]} alt="" className="h-full w-full rounded-full object-cover" loading="lazy" />
                  </motion.div>
                </div>
              ))}
            </motion.div>

            {/* Center step stack — narrower than the ring */}
            <div className="absolute left-1/2 top-1/2 z-20 w-[64%] max-w-[260px] -translate-x-1/2 -translate-y-1/2 space-y-3">
              {/* header card with progress */}
              <div className="rounded-2xl bg-white p-3.5 text-zinc-950 shadow-[0_18px_50px_-18px_rgba(20,10,5,0.5)]">
                <div className="mb-2.5 flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#ff4b29]/10 text-[#ff4b29]">
                    <Rocket className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-[13px] font-semibold">Lead qualification</span>
                </div>
                <div className="flex items-center gap-1">
                  {STEPS.map((_, seg) => (
                    <motion.span
                      key={seg}
                      className="h-1.5 flex-1 rounded-full"
                      animate={{ backgroundColor: seg <= active ? '#ff4b29' : '#ececf0' }}
                      transition={{ duration: 0.4 }}
                    />
                  ))}
                </div>
              </div>

              {/* cycling step conveyor */}
              <div className="relative overflow-hidden" style={{ height: VISIBLE * ROW_H }}>
                {STEPS.map((step) => {
                  const slot = (STEPS.indexOf(step) - active + STEPS.length) % STEPS.length;
                  const StepIcon = step.icon;
                  const hidden = slot >= VISIBLE;
                  const opacity = hidden ? 0 : [1, 0.62, 0.34][slot];
                  return (
                    <motion.div
                      key={step.id}
                      className="absolute inset-x-0"
                      animate={{ y: slot * ROW_H, opacity }}
                      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                      style={{ pointerEvents: 'none' }}
                    >
                      <div
                        className={`flex items-center gap-2 rounded-2xl p-3 ${
                          slot === 0
                            ? 'bg-white text-zinc-950 shadow-[0_18px_50px_-18px_rgba(20,10,5,0.5)] ring-1 ring-[#ff4b29]/30'
                            : 'bg-white/85 text-zinc-700'
                        }`}
                      >
                        <span
                          className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${
                            slot === 0 ? 'bg-[#ff4b29]/10 text-[#ff4b29]' : 'bg-black/[0.04] text-zinc-500'
                          }`}
                        >
                          <StepIcon className="h-3.5 w-3.5" />
                        </span>
                        <span className="truncate text-[13px] font-medium">{step.label}</span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
