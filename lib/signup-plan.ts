/**
 * Carries the plan a buyer picked on the marketing site through the signup →
 * onboarding → subscribe chain.
 *
 * Why sessionStorage and not the URL: the chosen plan starts as a `?plan=`
 * query param on the pricing CTA, but that param does NOT survive the trip —
 * Clerk's hosted sign-up/redirect flow and the several server redirects between
 * /login → /sign-up → /auth/redirect → /setup → /s/[slug] → /subscribe each
 * drop unknown query params. sessionStorage persists for the life of the tab
 * across all of those hops, so it's the only client-side carrier that reliably
 * reaches onboarding. The value is then PERSISTED on Space.plan at workspace
 * creation (the durable source of truth /subscribe reads back), making the
 * sessionStorage purely a transport that can be safely lost.
 *
 * The value is validated with resolveSelfServePlan at every read, so a stale or
 * tampered entry can never produce anything but 'solo' | 'pro'.
 */
import { resolveSelfServePlan, type SelfServePlanId } from '@/lib/plans';

const KEY = 'chippi:signup-plan';

/** Persist the buyer's chosen self-serve plan for the rest of the tab session. */
export function rememberSignupPlan(raw: unknown): void {
  if (typeof window === 'undefined') return;
  // Only store a recognized self-serve plan; ignore noise (and never store the
  // default, so an absent value stays absent rather than masking a later pick).
  if (raw !== 'solo' && raw !== 'pro') return;
  try {
    window.sessionStorage.setItem(KEY, raw);
  } catch {
    // sessionStorage can throw (private mode / quota) — non-fatal, the param
    // path and the Space.plan default still cover us.
  }
}

/** Read the remembered plan, or null if none was stored this session. */
export function readSignupPlan(): SelfServePlanId | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.sessionStorage.getItem(KEY);
    return v ? resolveSelfServePlan(v) : null;
  } catch {
    return null;
  }
}

/** Clear it once the choice has been committed (e.g. after checkout starts). */
export function clearSignupPlan(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // non-fatal
  }
}
