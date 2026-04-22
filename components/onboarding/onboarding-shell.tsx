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
 * The shared onboarding surface.
 *
 * Background follows the "radial at 50% 10%" pattern: a light canvas with an
 * orange edge glow fading from a near-white core at the top centre. Light
 * theme, so text uses neutral-900 and the primary button is dark.
 */
export function OnboardingShell({ stepIndex, totalSteps, stepKey, children, onBack }: OnboardingShellProps) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-white text-neutral-900">
      {/* Orange glow backdrop — single radial, white core at 50% 10% fading to
          orange at the edges. This is the "125% 125%" formula scaled to the
          viewport so the glow reaches every corner regardless of aspect. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            'radial-gradient(125% 125% at 50% 10%, #ffffff 40%, #f97316 100%)',
        }}
      />

      {/* Back button — top-left */}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="absolute left-5 top-5 z-20 inline-flex items-center gap-1.5 rounded-full border border-neutral-900/10 bg-white/60 px-3 py-1.5 text-xs font-medium text-neutral-700 backdrop-blur-sm transition-colors hover:border-neutral-900/30 hover:bg-white/80 hover:text-neutral-900"
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
                  'inline-block h-1.5 rounded-full',
                  active
                    ? 'bg-neutral-900'
                    : complete
                      ? 'bg-neutral-900/55'
                      : 'bg-neutral-900/20',
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
