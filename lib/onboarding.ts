/**
 * Canonical onboarding contract:
 * - `user.onboard` is the single source of truth for onboarding completion.
 * - Workspace existence is used only for one-way legacy backfill to make
 *   `user.onboard` trustworthy over time.
 */
type OnboardingUser = {
  onboard?: boolean | null;
  space?: { id?: string } | null;
} | null;

export function getOnboardingStatus(user: OnboardingUser) {
  return {
    hasUser: !!user,
    hasSpace: !!user?.space,
    isOnboarded: !!user?.onboard,
  };
}

/**
 * Legacy-heal path: old accounts may have a workspace but onboard=false.
 * Backfill onboard=true once so every guard can rely on `user.onboard`.
 */
export function shouldBackfillOnboardFromSpace(user: OnboardingUser) {
  const status = getOnboardingStatus(user);
  return status.hasUser && status.hasSpace && !status.isOnboarded;
}
