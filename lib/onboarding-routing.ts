export type OnboardingRouteState = {
  isOnboarded: boolean;
  hasSpace: boolean;
};

export function resolveOnboardingPageAccess(state: OnboardingRouteState) {
  if (state.isOnboarded) return 'redirect_dashboard' as const;
  return 'show_onboarding' as const;
}

export function resolveDashboardEntry(state: OnboardingRouteState) {
  if (!state.isOnboarded) return 'redirect_onboarding' as const;
  if (state.hasSpace) return 'redirect_workspace' as const;
  return 'repair_and_redirect_onboarding' as const;
}
