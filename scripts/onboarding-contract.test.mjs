import test from 'node:test';
import assert from 'node:assert/strict';

function resolveOnboardingPageAccess(state) {
  if (state.isOnboarded) return 'redirect_dashboard';
  return 'show_onboarding';
}

function resolveDashboardEntry(state) {
  if (!state.isOnboarded) return 'redirect_onboarding';
  if (state.hasSpace) return 'redirect_workspace';
  return 'repair_and_redirect_onboarding';
}

test('onboard=true user visiting onboarding is redirected away', () => {
  const result = resolveOnboardingPageAccess({ isOnboarded: true, hasSpace: true });
  assert.equal(result, 'redirect_dashboard');
});

test('onboard=true user entering dashboard resolves to workspace', () => {
  const result = resolveDashboardEntry({ isOnboarded: true, hasSpace: true });
  assert.equal(result, 'redirect_workspace');
});

test('onboard=false user enters onboarding flow', () => {
  const onboardingPage = resolveOnboardingPageAccess({ isOnboarded: false, hasSpace: false });
  const dashboard = resolveDashboardEntry({ isOnboarded: false, hasSpace: false });
  assert.equal(onboardingPage, 'show_onboarding');
  assert.equal(dashboard, 'redirect_onboarding');
});

test('completion transition flips route behavior immediately', () => {
  const before = resolveDashboardEntry({ isOnboarded: false, hasSpace: true });
  const after = resolveDashboardEntry({ isOnboarded: true, hasSpace: true });
  assert.equal(before, 'redirect_onboarding');
  assert.equal(after, 'redirect_workspace');
});

test('refresh after completion remains out of onboarding', () => {
  const first = resolveOnboardingPageAccess({ isOnboarded: true, hasSpace: true });
  const refresh = resolveOnboardingPageAccess({ isOnboarded: true, hasSpace: true });
  assert.equal(first, 'redirect_dashboard');
  assert.equal(refresh, 'redirect_dashboard');
});
