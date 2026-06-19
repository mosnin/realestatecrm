'use client';

/**
 * First-login welcome tour — a brand-new, fully-onboarded realtor's first look
 * at what Chippi does for them. Built on the shared cult-ui Onboarding
 * component (components/ui/onboarding.tsx) + Button.
 *
 * WHERE / WHY: This is ADDITIVE and complements — never replaces — the existing
 * /setup conversion funnel (OnboardingRealtorV2). That funnel already owns the
 * cinematic moment right after signup. The instant it completes it flips
 * `user.onboard` to true and drops the realtor on /s/<slug>/chippi. This tour is
 * the first thing they see there: a short, dismissible feature orientation. It
 * adds zero friction to the funnel because it lives entirely on the dashboard
 * side of the redirect.
 *
 * GATING (new-users-only; returning users excluded):
 *   - Server passes `isOnboarded` (the existing `user.onboard` signal). We only
 *     render for onboarded accounts — never unauthenticated/half-state users.
 *   - Client localStorage stamp (see welcome-tour.ts) is written on
 *     complete/dismiss, so the tour is shown exactly once per device and never
 *     again. Same idiom as HowChippiWorksTip / OnboardingChecklist.
 *
 * DISMISS / COMPLETE: a "Skip" affordance (top-right) and the final-step
 * "Start using Chippi" button both call onClose, which stamps localStorage and
 * unmounts the overlay, revealing the dashboard underneath.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Inbox,
  PencilLine,
  CalendarClock,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react';

import { Onboarding } from '@/components/ui/onboarding';
import { Button } from '@/components/ui/button';
import { BrandLogo } from '@/components/brand-logo';

interface WelcomeStep {
  icon: LucideIcon;
  title: string;
  description: string;
}

/**
 * The "here's what Chippi does" content. Kept intentionally short (4 beats) so
 * it orients without delaying the realtor from getting into the product. Copy
 * matches the product's own framing (autonomous sweep → drafts → approvals).
 */
const STEPS: readonly WelcomeStep[] = [
  {
    icon: Sparkles,
    title: 'Welcome to Chippi',
    description:
      'Your workspace is ready. Chippi is your AI teammate — it works your pipeline alongside you, around the clock. Here is the quick tour.',
  },
  {
    icon: Inbox,
    title: 'Chippi watches your pipeline',
    description:
      'Every few minutes Chippi sweeps your leads and deals, surfaces what needs attention, and leaves it in your inbox so nothing slips.',
  },
  {
    icon: PencilLine,
    title: 'It drafts, you approve',
    description:
      'Chippi writes first-touch replies and follow-ups in your voice. Nothing is ever sent without your name on it — you review and approve every draft.',
  },
  {
    icon: CalendarClock,
    title: 'Stay ahead of every follow-up',
    description:
      'Tours, reminders, and timely nudges are handled for you. Ask Chippi anything in chat — it replies in real time while the work happens in the background.',
  },
] as const;

const TOTAL = STEPS.length;

interface WelcomeTourProps {
  /** Called once the tour is completed or dismissed (stamps localStorage). */
  onClose: () => void;
}

export function WelcomeTour({ onClose }: WelcomeTourProps) {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(1); // 1-based to match the Onboarding API.

  // Lock body scroll while the overlay is up, restore on unmount.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Close on Escape, matching the dashboard's dismissible-overlay conventions.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleComplete = useCallback(() => {
    onClose();
  }, [onClose]);

  const active = STEPS[step - 1];

  return (
    <motion.div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      initial={reduce ? { opacity: 0 } : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Chippi"
    >
      <Onboarding
        totalSteps={TOTAL}
        value={step}
        onValueChange={setStep}
        onComplete={handleComplete}
        className="relative w-full max-w-md"
      >
        {/* Skip / dismiss — always available, top-right. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Skip welcome tour"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <X size={16} />
        </button>

        <div className="mb-6 flex justify-center pt-1">
          <BrandLogo className="h-5 opacity-80" alt="Chippi" />
        </div>

        {STEPS.map((s, i) => (
          <Onboarding.Step key={s.title} step={i + 1}>
            <div className="flex flex-col items-center gap-4 px-2 pb-2 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-500/10 text-orange-500">
                <s.icon size={22} />
              </span>
            </div>
          </Onboarding.Step>
        ))}

        {/* Header reads from the active step; re-keyed so the copy animates in. */}
        <motion.div
          key={active.title}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <Onboarding.Header title={active.title} description={active.description} />
        </motion.div>

        <Onboarding.StepIndicator className="my-6" />

        <Onboarding.Navigation
          backLabel="Back"
          nextLabel="Next"
          completeLabel="Start using Chippi"
        />
      </Onboarding>

      {/* Secondary, low-emphasis skip so it's reachable without the X too. */}
      <Button
        variant="link"
        size="sm"
        onClick={onClose}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 text-muted-foreground"
      >
        Skip for now
      </Button>
    </motion.div>
  );
}
