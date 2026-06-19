'use client';

/**
 * Client gate for the first-login WelcomeTour. Keeps all localStorage logic out
 * of the server component (app/s/[slug]/chippi/page.tsx), which only passes the
 * existing `isOnboarded` (= user.onboard) signal.
 *
 * Renders nothing during SSR / first paint (hidden) to avoid a hydration
 * mismatch and a flash, then decides on the client whether to show the tour —
 * the same approach as HowChippiWorksTip.
 */

import { useEffect, useState } from 'react';
import { AnimatePresence } from 'motion/react';

import {
  shouldShowWelcomeTour,
  markWelcomeTourComplete,
} from '@/components/onboarding/welcome-tour';
import { WelcomeTour } from '@/components/onboarding/welcome-tour-view';

interface WelcomeTourGateProps {
  /** The existing `user.onboard` signal, resolved server-side. */
  isOnboarded: boolean;
}

export function WelcomeTourGate({ isOnboarded }: WelcomeTourGateProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const storage =
      typeof window !== 'undefined' ? window.localStorage : null;
    if (shouldShowWelcomeTour(isOnboarded, storage)) setOpen(true);
  }, [isOnboarded]);

  function handleClose() {
    markWelcomeTourComplete(
      typeof window !== 'undefined' ? window.localStorage : null,
    );
    setOpen(false);
  }

  return (
    <AnimatePresence>
      {open && <WelcomeTour key="welcome-tour" onClose={handleClose} />}
    </AnimatePresence>
  );
}
