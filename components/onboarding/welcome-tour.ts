/**
 * First-login welcome tour — pure, framework-free helpers.
 *
 * The welcome tour is an ADDITIVE, first-run-only product orientation shown on
 * the realtor's first dashboard visit (see components/onboarding/welcome-tour.tsx
 * and where it is mounted in app/s/[slug]/chippi/page.tsx). It is deliberately
 * NOT part of the /setup conversion funnel — that funnel already owns the
 * immediately-after-signup cinematic. This is the "here's what Chippi does"
 * tour for someone who has *just* finished onboarding and landed in the app.
 *
 * Gating has two independent layers, mirroring the existing dashboard
 * affordances (HowChippiWorksTip, OnboardingChecklist):
 *   1. Server: only mounted for users whose `onboard === true` (a real, set-up
 *      account in their own workspace). Never shown to unauthenticated or
 *      half-onboarded users — that is the funnel's job.
 *   2. Client: a localStorage stamp recorded once the tour is completed or
 *      dismissed, so returning users never see it again. This is exactly how
 *      HowChippiWorksTip distinguishes a first load from a return visit.
 *
 * Splitting these tiny helpers into a plain `.ts` file (no JSX, no React) keeps
 * them trivially unit-testable without a DOM renderer.
 */

/** localStorage key holding the ISO timestamp of when the tour was finished. */
export const WELCOME_TOUR_STORAGE_KEY = 'chippi.welcome.completedAt';

/**
 * Whether the welcome tour should be shown on this device for this user.
 *
 * Returns false when the user is not a fully-onboarded account (the funnel
 * still owns them), when the tour has already been completed/dismissed, or when
 * storage is unavailable (private mode / SSR) — in which case we fail closed and
 * do NOT nag. `storage` is injectable so this is unit-testable.
 */
export function shouldShowWelcomeTour(
  isOnboarded: boolean,
  storage?: Pick<Storage, 'getItem'> | null,
): boolean {
  if (!isOnboarded) return false;
  // No storage (SSR / private mode): fail closed so we never replay on every
  // load for someone who can't persist the dismissal.
  if (!storage) return false;
  try {
    return !storage.getItem(WELCOME_TOUR_STORAGE_KEY);
  } catch {
    return false;
  }
}

/** Record that the user has finished or dismissed the tour. Best-effort. */
export function markWelcomeTourComplete(
  storage?: Pick<Storage, 'setItem'> | null,
  now: () => string = () => new Date().toISOString(),
): void {
  if (!storage) return;
  try {
    storage.setItem(WELCOME_TOUR_STORAGE_KEY, now());
  } catch {
    // no-op — best effort
  }
}
