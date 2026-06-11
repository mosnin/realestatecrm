'use client';

/**
 * LeadOrbit — the reference's animated acquisition orbit, tailored to Chippi
 * lead qualification. A saturated brand-gradient card: headline top-left with
 * an italic-serif accent, a dashed orbit with the Chippi hub at the top and
 * lead avatars rotating around it (counter-rotated to stay upright), and a
 * center stack of step cards that CYCLES upward — showing each lead move
 * through the loop (received → scored → drafted → booked), the top card lit
 * and the ones below fading. A header card carries a progress bar that fills
 * with the active step. Request-a-demo pill bottom-left, honest blurb right.
 *
 * Reduced motion: orbit parks and the step stack rests on the first state.
 * The source's "reduce time-to-hire by 80%" metric claim is NOT carried over.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, CalendarCheck, FileText, Flame, PenLine, Rocket } from 'lucide-react';
import { Accent } from '@/components/marketing/site/section';

const AVATARS = [
  'https://hoirqrkdgbmvpwutwuwj-all.supabase.co/storage/v1/object/public/assets/assets/4c9aa348-4474-47a8-8f1e-3fe52ac8d2b9_320w.webp',
  'https://hoirqrkdgbmvpwutwuwj-all.supabase.co/storage/v1/object/public/assets/assets/ca687bcc-f3d6-4ed6-9efe-e0fd4cbe69a9_320w.webp',
  'https://hoirqrkdgbmvpwutwuwj-all.supabase.co/storage/v1/object/public/assets/assets/39e15168-9f77-4837-9a4b-89c74b8bc38b_320w.webp',
  'https://hoirqrkdgbmvpwutwuwj-all.supabase.co/storage/v1/object/public/assets/assets/a7a0f0f5-9a19-4888-87bf-ff8780ff8008_320w.jpg',
];

/* Lower-hemisphere + sides; the hub sits at top (270°). [cos, sin] at r=50%. */
const POS = [
  { x: 1, y: 0 }, // right
  { x: -1, y: 0 }, // left
  { x: 0.5, y: 0.866 }, // lower-right
  { x: -0.5, y: 0.866 }, // lower-left
];

const STEPS = [
  { id: 'received', icon: FileText, label: 'Application received' },
  { id: 'scored', icon: Flame, label: 'Scored — Hot · 82' },
  { id: 'drafted', icon: PenLine, label: 'Reply drafted · your voice' },
  { id: 'booked', icon: CalendarCheck, label: 'Tour booked · Sat 2:00' },
];

const VISIBLE = 3; // step cards shown in the conveyor
const ROW_H = 56; // px per step card slot
const SPIN = 34; // seconds per avatar revolution

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

        <div className="relative grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
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
          </div>

          {/* Orbit */}
          <div className="relative mx-auto aspect-square w-full max-w-[520px]">
            {/* dashed ring */}
            <div className="absolute inset-[10%] rounded-full border border-dashed border-white/45" />
            {/* node dots on the ring */}
            {POS.map((p, idx) => (
              <span
                key={`dot-${idx}`}
                aria-hidden
                className="absolute h-2 w-2 rounded-full bg-white/70"
                style={{ left: `calc(50% + ${p.x * 40}% )`, top: `calc(50% + ${p.y * 40}% )`, transform: 'translate(-50%,-50%)' }}
              />
            ))}

            {/* Chippi hub at top */}
            <div className="absolute left-1/2 top-[10%] z-20 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl bg-[#28203a] shadow-lg">
              <span aria-hidden className="text-xl text-[#ff8a5c]">✦</span>
            </div>

            {/* rotating avatar layer */}
            <motion.div
              className="absolute inset-[10%]"
              animate={reduce ? undefined : { rotate: 360 }}
              transition={{ duration: SPIN, ease: 'linear', repeat: Infinity }}
            >
              {POS.map((p, idx) => (
                <div
                  key={idx}
                  className="absolute h-14 w-14"
                  style={{ left: `calc(50% + ${p.x * 50}% )`, top: `calc(50% + ${p.y * 50}% )`, transform: 'translate(-50%, -50%)' }}
                >
                  <motion.div
                    className="h-14 w-14 overflow-hidden rounded-full bg-white p-[3px] shadow-lg ring-1 ring-white/60"
                    animate={reduce ? undefined : { rotate: -360 }}
                    transition={{ duration: SPIN, ease: 'linear', repeat: Infinity }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={AVATARS[idx]} alt="" className="h-full w-full rounded-full object-cover" />
                  </motion.div>
                </div>
              ))}
            </motion.div>

            {/* Center dialog stack */}
            <div className="absolute left-1/2 top-1/2 z-10 w-[80%] max-w-[320px] -translate-x-1/2 -translate-y-1/2 space-y-3">
              {/* header card with progress */}
              <div className="rounded-2xl bg-white p-4 text-zinc-950 shadow-[0_18px_50px_-18px_rgba(20,10,5,0.5)]">
                <div className="mb-3 flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#ff4b29]/10 text-[#ff4b29]">
                    <Rocket className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-semibold">Lead qualification</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {STEPS.map((_, seg) => (
                    <motion.span
                      key={seg}
                      className="h-2 flex-1 rounded-full"
                      animate={{ backgroundColor: seg <= active ? '#ff4b29' : '#ececf0' }}
                      transition={{ duration: 0.4 }}
                    />
                  ))}
                </div>
              </div>

              {/* cycling step conveyor */}
              <div className="relative overflow-hidden" style={{ height: VISIBLE * ROW_H }}>
                {STEPS.map((step) => {
                  // slot = position relative to the active step (0 = top/lit)
                  const slot = (STEPS.indexOf(step) - active + STEPS.length) % STEPS.length;
                  const StepIcon = step.icon;
                  const hidden = slot >= VISIBLE;
                  const opacity = hidden ? 0 : [1, 0.6, 0.35][slot];
                  return (
                    <motion.div
                      key={step.id}
                      className="absolute inset-x-0"
                      animate={{ y: slot * ROW_H, opacity }}
                      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                      style={{ pointerEvents: 'none' }}
                    >
                      <div
                        className={`flex items-center gap-2.5 rounded-2xl p-3.5 ${
                          slot === 0
                            ? 'bg-white text-zinc-950 shadow-[0_18px_50px_-18px_rgba(20,10,5,0.5)] ring-1 ring-[#ff4b29]/30'
                            : 'bg-white/80 text-zinc-700'
                        }`}
                      >
                        <span
                          className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                            slot === 0 ? 'bg-[#ff4b29]/10 text-[#ff4b29]' : 'bg-black/[0.04] text-zinc-500'
                          }`}
                        >
                          <StepIcon className="h-4 w-4" />
                        </span>
                        <span className="text-sm font-medium">{step.label}</span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Honest blurb */}
        <p className="relative mt-10 max-w-md text-sm leading-relaxed text-white/85 lg:absolute lg:bottom-12 lg:right-12 lg:mt-0 lg:text-right">
          Chippi scores every lead the moment it lands and drafts the first reply
          in your voice — approval-first, so the decision stays{' '}
          <Accent className="text-white">yours.</Accent>
        </p>
      </div>
    </section>
  );
}
