'use client';

import { motion, useReducedMotion } from 'motion/react';

import { cn } from '@/lib/utils';

const EASE_APPLE: [number, number, number, number] = [0.22, 1, 0.36, 1];

// One calm intelligence at the center; the whole business orbits it.
// Concentric neutral rings, a soft grid, a few orbiting dots tethered to the
// core by faint lines. The core is the only orange in the frame.
const RINGS = [120, 196, 268] as const;

// Each orbiting node: which ring it rides, its starting angle (deg), and how
// long one full revolution takes. Slow, staggered, never in lockstep.
const NODES = [
  { ring: 0, angle: -40, period: 26 },
  { ring: 0, angle: 150, period: 26 },
  { ring: 1, angle: 60, period: 38 },
  { ring: 1, angle: 210, period: 38 },
  { ring: 2, angle: 18, period: 52 },
  { ring: 2, angle: 128, period: 52 },
  { ring: 2, angle: 256, period: 52 },
] as const;

const CX = 400;
const CY = 225;

function polar(radius: number, angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: CX + radius * Math.cos(a), y: CY + radius * Math.sin(a) };
}

export function HeroWorkspaceVisual({ className }: { className?: string }) {
  const reduce = useReducedMotion();

  return (
    <div className={cn('relative h-full w-full overflow-hidden', className)}>
      <svg
        viewBox="0 0 800 450"
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        role="img"
        aria-label="A calm orange core at the center of slowly orbiting neutral rings."
      >
        <defs>
          <radialGradient id="hwv-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.95" />
            <stop offset="55%" stopColor="var(--brand)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="hwv-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.22" />
            <stop offset="70%" stopColor="var(--brand)" stopOpacity="0.06" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="hwv-vignette" cx="50%" cy="50%" r="62%">
            <stop offset="60%" stopColor="var(--border)" stopOpacity="0" />
            <stop offset="100%" stopColor="var(--border)" stopOpacity="0.18" />
          </radialGradient>
        </defs>

        {/* Soft grid — the quiet substrate everything sits on. */}
        <g stroke="var(--border)" strokeOpacity="0.4" strokeWidth="1">
          {[160, 280, 400, 520, 640].map((x) => (
            <line key={`v${x}`} x1={x} y1="60" x2={x} y2="390" />
          ))}
          {[105, 165, 225, 285, 345].map((y) => (
            <line key={`h${y}`} x1="120" y1={y} x2="680" y2={y} />
          ))}
        </g>
        <rect x="0" y="0" width="800" height="450" fill="url(#hwv-vignette)" />

        {/* Concentric rings — the structure the business orbits within. */}
        {RINGS.map((r, i) => (
          <motion.circle
            key={`ring${r}`}
            cx={CX}
            cy={CY}
            r={r}
            fill="none"
            stroke="var(--border)"
            strokeOpacity={0.7 - i * 0.16}
            strokeWidth="1"
            initial={false}
            animate={reduce ? undefined : { scale: [1, 1.012, 1] }}
            transition={{
              duration: 9 + i * 1.5,
              ease: EASE_APPLE,
              repeat: Infinity,
              repeatType: 'mirror',
            }}
            style={{ transformOrigin: `${CX}px ${CY}px` }}
          />
        ))}

        {/* Tether lines from core to each orbiting node. */}
        {NODES.map((node, i) => {
          const r = RINGS[node.ring];
          const p = polar(r, node.angle);
          const line = (
            <line
              x1={CX}
              y1={CY}
              x2={p.x}
              y2={p.y}
              stroke="var(--border)"
              strokeOpacity="0.5"
              strokeWidth="1"
            />
          );
          if (reduce) return <g key={`tether${i}`}>{line}</g>;
          return (
            <motion.g
              key={`tether${i}`}
              animate={{ rotate: 360 }}
              transition={{
                duration: node.period,
                ease: 'linear',
                repeat: Infinity,
              }}
              style={{ transformOrigin: `${CX}px ${CY}px` }}
            >
              {line}
            </motion.g>
          );
        })}

        {/* Orbiting nodes — neutral dots riding the rings. */}
        {NODES.map((node, i) => {
          const r = RINGS[node.ring];
          const p = polar(r, node.angle);
          const dot = (
            <circle
              cx={p.x}
              cy={p.y}
              r={node.ring === 0 ? 4 : 3}
              fill="var(--muted-foreground)"
              fillOpacity={node.ring === 0 ? 0.7 : 0.5}
            />
          );
          if (reduce) return <g key={`node${i}`}>{dot}</g>;
          return (
            <motion.g
              key={`node${i}`}
              animate={{ rotate: 360 }}
              transition={{
                duration: node.period,
                ease: 'linear',
                repeat: Infinity,
              }}
              style={{ transformOrigin: `${CX}px ${CY}px` }}
            >
              {dot}
            </motion.g>
          );
        })}

        {/* The core — the single calm intelligence. The only orange. */}
        <circle cx={CX} cy={CY} r="150" fill="url(#hwv-halo)" />
        <motion.g
          initial={false}
          animate={reduce ? undefined : { scale: [1, 1.06, 1], opacity: [0.92, 1, 0.92] }}
          transition={{
            duration: 7.5,
            ease: EASE_APPLE,
            repeat: Infinity,
            repeatType: 'mirror',
          }}
          style={{ transformOrigin: `${CX}px ${CY}px` }}
        >
          <circle cx={CX} cy={CY} r="64" fill="url(#hwv-core)" />
          <circle cx={CX} cy={CY} r="22" fill="var(--brand)" fillOpacity="0.92" />
        </motion.g>
      </svg>
    </div>
  );
}
