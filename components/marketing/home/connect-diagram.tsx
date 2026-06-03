'use client';

/**
 * ConnectDiagram — the payoff. The realtor's whole world — inbox, calendar,
 * and the surfaces they hand to clients (intake link, tours page, public
 * page) — all wiring into one agent at the center (ref: Stripe orchestration
 * board). Dark canvas, dotted connectors that draw in on scroll, nodes that
 * settle in sequence. This is the "it all flows through Chippi" moment.
 *
 * Built as one viewBox SVG so lines and nodes stay perfectly aligned at any
 * width. Reduced-motion lands every element in its end state.
 */

import { motion, useReducedMotion } from 'motion/react';
import { Reveal, Eyebrow } from './home-kit';

const HUB = { x: 500, y: 285 };

// Nodes around the hub. Top = systems Chippi plugs into; bottom = the
// client-facing surfaces the realtor owns.
const NODES = [
  { id: 'gmail', label: 'Gmail', x: 170, y: 80 },
  { id: 'outlook', label: 'Outlook', x: 500, y: 60 },
  { id: 'calendar', label: 'Calendar', x: 830, y: 80 },
  { id: 'intake', label: 'Intake link', x: 180, y: 500 },
  { id: 'tours', label: 'Tours page', x: 500, y: 520 },
  { id: 'public', label: 'Public page', x: 820, y: 500 },
] as const;

const NODE_W = 168;
const NODE_H = 56;

export function ConnectDiagram() {
  const reduce = useReducedMotion();

  return (
    <section className="relative overflow-hidden bg-[#0a0e27] py-24 md:py-32">
      {/* dot grid */}
      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.5]">
        <defs>
          <pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1.5" fill="rgba(255,255,255,0.06)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dots)" />
      </svg>

      <div className="relative mx-auto max-w-7xl px-6 md:px-8">
        <Reveal className="mx-auto max-w-3xl text-center">
          <Eyebrow tone="onDark">One agent, everything connected</Eyebrow>
          <h2 className="mt-5 text-[clamp(2rem,5vw,3.75rem)] font-bold leading-[1.02] tracking-[-0.025em] text-white">
            Your whole world, wired into one agent.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-white/55">
            Your inbox and calendar feed Chippi. Your intake link, tours page,
            and public page route straight back to it. Every lead, every reply,
            every booking — one current, flowing through the center.
          </p>
        </Reveal>

        <div className="mx-auto mt-14 max-w-4xl">
          <svg viewBox="0 0 1000 580" className="h-auto w-full" role="img" aria-label="Diagram: the realtor's tools and client-facing pages connecting to Chippi at the center">
            {/* connectors */}
            {NODES.map((n, i) => (
              <motion.line
                key={`l-${n.id}`}
                x1={n.x}
                y1={n.y}
                x2={HUB.x}
                y2={HUB.y}
                stroke="rgba(255,150,79,0.55)"
                strokeWidth="1.5"
                strokeDasharray="2 7"
                strokeLinecap="round"
                initial={reduce ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
                whileInView={{ pathLength: 1, opacity: 1 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.5 + i * 0.1 }}
              />
            ))}

            {/* outer nodes */}
            {NODES.map((n, i) => (
              <motion.g
                key={`n-${n.id}`}
                initial={reduce ? { opacity: 1 } : { opacity: 0, y: n.y < HUB.y ? -10 : 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: i * 0.08 }}
              >
                <rect
                  x={n.x - NODE_W / 2}
                  y={n.y - NODE_H / 2}
                  width={NODE_W}
                  height={NODE_H}
                  rx="14"
                  fill="#11163a"
                  stroke="rgba(255,255,255,0.1)"
                />
                <text
                  x={n.x}
                  y={n.y + 5}
                  textAnchor="middle"
                  className="fill-white/85"
                  style={{ fontSize: 18, fontWeight: 500 }}
                >
                  {n.label}
                </text>
              </motion.g>
            ))}

            {/* hub */}
            <motion.g
              initial={reduce ? { opacity: 1 } : { opacity: 0, scale: 0.85 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.25 }}
              style={{ transformOrigin: `${HUB.x}px ${HUB.y}px` }}
            >
              <rect
                x={HUB.x - 92}
                y={HUB.y - 62}
                width={184}
                height={124}
                rx="26"
                fill="#ff964f"
              />
              <text
                x={HUB.x}
                y={HUB.y + 12}
                textAnchor="middle"
                className="fill-[#2a1402]"
                style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.02em' }}
              >
                Chippi
              </text>
            </motion.g>
          </svg>
        </div>
      </div>
    </section>
  );
}
