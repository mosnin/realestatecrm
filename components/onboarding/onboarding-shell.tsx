'use client';

import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { OnboardingBrandMark } from './onboarding-brand-mark';

interface OnboardingShellProps {
  /** Zero-based index of the active step. */
  stepIndex: number;
  /** Total step count across the current path. */
  totalSteps: number;
  /** Must change per step to trigger AnimatePresence exit/enter. */
  stepKey: string;
  /** The rendered step content. */
  children: React.ReactNode;
  /** Optional back handler — rendered as a subtle top-left affordance. */
  onBack?: () => void;
}

/**
 * The shared onboarding surface:
 *   - Deep neutral canvas
 *   - Warm orange radial gradient bleeding up from the bottom, with a gentle
 *     hint of amber from the top corners for vertical symmetry
 *   - Centered brand mark + step content
 *   - Progress dots pinned to the bottom — the active one stretches into a pill
 *
 * The shell owns transitions so each step just returns static JSX.
 */
export function OnboardingShell({ stepIndex, totalSteps, stepKey, children, onBack }: OnboardingShellProps) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-neutral-950 text-white">
      {/* Gradient backdrop */}
      <div className="pointer-events-none absolute inset-0 z-0">
        {/* Main plume from the bottom */}
        <div
          className="absolute left-1/2 -bottom-[55%] h-[120vh] w-[160vw] -translate-x-1/2 rounded-full blur-3xl"
          style={{
            background:
              'radial-gradient(circle at 50% 50%, rgba(255, 140, 60, 0.95) 0%, rgba(255, 94, 44, 0.75) 25%, rgba(224, 65, 25, 0.35) 45%, rgba(120, 30, 10, 0) 70%)',
          }}
        />
        {/* Subtle top-corner warmth for visual balance */}
        <div
          className="absolute -top-[25%] -left-[15%] h-[60vh] w-[60vw] rounded-full blur-3xl opacity-55"
          style={{
            background:
              'radial-gradient(circle at 50% 50%, rgba(255, 170, 90, 0.65) 0%, rgba(240, 110, 45, 0.25) 40%, rgba(200, 60, 30, 0) 70%)',
          }}
        />
        <div
          className="absolute -top-[25%] -right-[15%] h-[60vh] w-[60vw] rounded-full blur-3xl opacity-55"
          style={{
            background:
              'radial-gradient(circle at 50% 50%, rgba(255, 170, 90, 0.65) 0%, rgba(240, 110, 45, 0.25) 40%, rgba(200, 60, 30, 0) 70%)',
          }}
        />
        {/* Grain / darkening overlay so text stays legible */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(10,10,10,0.65)_70%)]" />
      </div>

      {/* Back button — top-left */}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="absolute left-5 top-5 z-20 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 backdrop-blur-sm transition-colors hover:border-white/30 hover:bg-white/10 hover:text-white"
        >
          ← Back
        </button>
      )}

      {/* Content */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-20">
        <OnboardingBrandMark />

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={stepKey}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="mt-7 w-full max-w-3xl"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Progress dots */}
      {totalSteps > 1 && (
        <div className="absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5">
          {Array.from({ length: totalSteps }).map((_, i) => {
            const complete = i < stepIndex;
            const active = i === stepIndex;
            return (
              <motion.span
                key={i}
                aria-hidden
                className={cn(
                  'h-1.5 rounded-full',
                  active ? 'bg-white' : complete ? 'bg-white/60' : 'bg-white/25',
                )}
                animate={{ width: active ? 28 : 6 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
