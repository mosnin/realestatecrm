/**
 * Onboarding routing contract:
 * - Canonical completion signal: user has an attached workspace (space).
 * - `onboardingCompletedAt` is metadata and may be backfilled for legacy rows.
 * - If completion timestamp exists without a space, onboarding is incomplete.
 */
type OnboardingUser = {
  onboardingCompletedAt?: Date | null;
  space?: { id?: string } | null;
} | null;

export function getOnboardingStatus(user: OnboardingUser) {
  const hasSpace = !!user?.space;

  return {
    hasUser: !!user,
    hasSpace,
    isOnboarded: hasSpace,
    hasCompletionTimestamp: !!user?.onboardingCompletedAt
  };
}

export function shouldBackfillOnboardingCompletion(user: OnboardingUser) {
  const status = getOnboardingStatus(user);
  return status.hasUser && status.hasSpace && !status.hasCompletionTimestamp;
}

export function shouldResetOrphanedCompletion(user: OnboardingUser) {
  const status = getOnboardingStatus(user);
  return status.hasUser && !status.hasSpace && status.hasCompletionTimestamp;
}
