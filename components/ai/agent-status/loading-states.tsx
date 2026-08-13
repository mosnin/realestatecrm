'use client';

import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from 'motion/react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import React from 'react';
import {
  DURATION_BASE,
  DURATION_FAST,
  EASE_OUT,
} from '@/lib/motion';
import { cn } from '@/lib/utils';

export interface ThinkingShimmerProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  children?: ReactNode;
  /** Seconds for one quiet sweep. */
  duration?: number;
}

/**
 * Chippi's existing muted-to-foreground text sweep, packaged as a focused
 * agent-status primitive. Reduced-motion users get the same readable label
 * without an animated gradient.
 */
export function ThinkingShimmer({
  children = 'Thinking…',
  duration = 2.4,
  className,
  style,
  ...props
}: ThinkingShimmerProps) {
  const reduceMotion = useReducedMotion() ?? false;

  return (
    <span
      className={cn(
        'text-muted-foreground',
        !reduceMotion && 'chippi-thinking-shimmer',
        className,
      )}
      style={{
        ...style,
        ...(!reduceMotion
          ? { animationDuration: `${Math.max(0.8, duration)}s` }
          : undefined),
      }}
      {...props}
    >
      {children}
    </span>
  );
}

export type ReasoningTextVariant = 'cascade' | 'swap' | 'scramble';

export interface ReasoningTextProps {
  /**
   * Caller-authored, safe status copy. This primitive never supplies a
   * rotating set of inferred actions.
   */
  phrases?: readonly string[];
  variant?: ReasoningTextVariant;
  interval?: number;
  shimmerDuration?: number;
  indicator?: ReactNode;
  /** Opt in only while the caller knows there is no grounded activity yet. */
  cycle?: boolean;
  className?: string;
}

export function normalizeReasoningPhrases(
  phrases: readonly string[] | undefined,
): string[] {
  const normalized = (phrases ?? ['Thinking…'])
    .map((phrase) => phrase.trim())
    .filter(Boolean);
  return [...new Set(normalized.length > 0 ? normalized : ['Thinking…'])];
}

function phraseMotion(variant: ReasoningTextVariant, reduceMotion: boolean) {
  if (reduceMotion) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
    };
  }

  if (variant === 'cascade') {
    return {
      initial: { opacity: 0, y: 4 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: -4 },
    };
  }

  if (variant === 'scramble') {
    return {
      initial: { opacity: 0, filter: 'blur(2px)' },
      animate: { opacity: 1, filter: 'blur(0px)' },
      exit: { opacity: 0, filter: 'blur(2px)' },
    };
  }

  return {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  };
}

/**
 * A pre-grounded reasoning label. Phrase rotation is deliberately opt-in:
 * once runtime receipts exist, callers should pass one grounded label to
 * ThinkingShimmer instead of narrating guessed work.
 */
export function ReasoningText({
  phrases,
  variant = 'cascade',
  interval = 1800,
  shimmerDuration = 2.2,
  indicator,
  cycle = false,
  className,
}: ReasoningTextProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const list = useMemo(() => normalizeReasoningPhrases(phrases), [phrases]);
  const [index, setIndex] = useState(0);

  useEffect(() => setIndex(0), [list]);

  useEffect(() => {
    if (!cycle || reduceMotion || list.length <= 1) return;
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % list.length),
      Math.max(600, interval),
    );
    return () => window.clearInterval(timer);
  }, [cycle, interval, list.length, reduceMotion]);

  const phrase = list[index % list.length] ?? 'Thinking…';
  const variants = phraseMotion(variant, reduceMotion);

  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      {indicator}
      <AnimatePresence initial={false} mode="wait">
        <motion.span
          key={phrase}
          initial={variants.initial}
          animate={variants.animate}
          exit={variants.exit}
          transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
          className="min-w-0"
        >
          <ThinkingShimmer duration={shimmerDuration}>{phrase}</ThinkingShimmer>
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export interface AgentProgressProps {
  label?: ReactNode;
  /** Controlled elapsed time in seconds. */
  elapsedSeconds?: number;
  /** Initial value for the internal wall-clock timer. */
  initialSeconds?: number;
  running?: boolean;
  /** Keep short work quiet; reveal elapsed time only after this threshold. */
  revealAfterSeconds?: number;
  className?: string;
}

function safeSeconds(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function formatAgentElapsed(seconds: number): string {
  const total = Math.floor(safeSeconds(seconds));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}m ${remainder.toString().padStart(2, '0')}s`;
}

/**
 * A non-announcing elapsed clock for long work. The surrounding surface owns
 * status announcements, preventing a screen reader update every second.
 */
export function AgentProgress({
  label,
  elapsedSeconds,
  initialSeconds = 0,
  running = true,
  revealAfterSeconds = 2.5,
  className,
}: AgentProgressProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const controlled = elapsedSeconds !== undefined;
  const [internalElapsed, setInternalElapsed] = useState(() =>
    safeSeconds(initialSeconds),
  );
  const elapsedRef = useRef(internalElapsed);

  useEffect(() => {
    const next = safeSeconds(initialSeconds);
    elapsedRef.current = next;
    setInternalElapsed(next);
  }, [initialSeconds]);

  useEffect(() => {
    if (controlled || !running) return;
    const startedAt = Date.now() - elapsedRef.current * 1000;
    const tick = () => {
      const next = (Date.now() - startedAt) / 1000;
      elapsedRef.current = next;
      setInternalElapsed(next);
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [controlled, running]);

  const elapsed = safeSeconds(
    controlled ? (elapsedSeconds ?? 0) : internalElapsed,
  );
  if (elapsed < Math.max(0, revealAfterSeconds)) return null;

  return (
    <motion.span
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION_FAST, ease: EASE_OUT }}
      className={cn(
        'inline-flex shrink-0 items-baseline gap-1 text-[11px] tabular-nums text-muted-foreground/55',
        className,
      )}
      aria-hidden="true"
      data-agent-progress="elapsed"
    >
      {label ? <span>{label}</span> : null}
      <span>{formatAgentElapsed(elapsed)}</span>
    </motion.span>
  );
}
