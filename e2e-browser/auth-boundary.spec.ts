import { test, expect } from '@playwright/test';
import { blockExternalRequests } from './helpers';

/**
 * Auth boundary — proves clerkMiddleware actually protects workspace routes
 * in a real browser (tenant scoping starts here: no session, no /s/*).
 *
 * No real Clerk login is attempted (stub keys, third-party requests blocked);
 * the contract under test is the middleware redirect itself, including the
 * safe redirect_url propagation for dashboard paths (middleware.ts).
 */
test('unauthenticated visit to /s/[slug] redirects to sign-in with redirect_url', async ({
  page,
}) => {
  await blockExternalRequests(page);

  const response = await page.goto('/s/some-slug');
  // The sign-in page itself must load (Clerk's widget won't mount against the
  // blocked CDN — the page shell and the redirect are what we verify).
  expect(response!.status()).toBe(200);

  const url = new URL(page.url());
  expect(url.pathname).toBe('/login/realtor');
  expect(url.searchParams.get('redirect_url')).toBe('/s/some-slug');
});

test('unauthenticated visit to /setup redirects to sign-in without redirect_url', async ({
  page,
}) => {
  await blockExternalRequests(page);

  await page.goto('/setup');

  const url = new URL(page.url());
  expect(url.pathname).toBe('/login/realtor');
  // /setup is NOT a safe post-login destination — middleware must not
  // propagate it (it would skip the proper post-signup flow).
  expect(url.searchParams.get('redirect_url')).toBeNull();
});
