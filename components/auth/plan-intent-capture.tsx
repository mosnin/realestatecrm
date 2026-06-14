'use client';

/**
 * Invisible capture for the `?plan=` hint that rides in on the marketing
 * signup CTAs (e.g. /login/realtor?intent=signup&plan=pro). It runs once on
 * mount, stashes the plan in sessionStorage (see lib/signup-plan.ts), and
 * renders nothing — purely plumbing, no UI/layout footprint. Onboarding later
 * reads it and persists it on Space.plan, the durable carrier that /subscribe
 * reads back. Mounted on the auth entry pages where the buyer first lands.
 */
import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { rememberSignupPlan } from '@/lib/signup-plan';

export function PlanIntentCapture() {
  const searchParams = useSearchParams();
  useEffect(() => {
    rememberSignupPlan(searchParams.get('plan'));
  }, [searchParams]);
  return null;
}
