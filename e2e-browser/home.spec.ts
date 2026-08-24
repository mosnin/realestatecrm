import { test, expect } from '@playwright/test';
import { blockExternalRequests, collectUnexpectedErrors } from './helpers';

/**
 * Marketing homepage — the front door. Real render + hydration + navigation:
 *   - the hero headline is actually painted (not a blank/errored shell),
 *   - hydration produces no console errors of severity error,
 *   - the restored header CTA ("See a demo") really reaches the demo page.
 */
test('marketing home renders the hero and the primary CTA navigates', async ({ page }) => {
  await blockExternalRequests(page);
  const errors = collectUnexpectedErrors(page);

  const response = await page.goto('/');
  expect(response, 'homepage should respond').toBeTruthy();
  expect(response!.status()).toBe(200);

  // Hero headline (app/(marketing)/page.tsx → components/marketing/giga/hero.tsx).
  await expect(
    page.getByRole('heading', { name: /Turn more leads into\s+booked tours\./i }),
  ).toBeVisible();
  expect(errors, 'no unexpected console/page errors on the marketing homepage').toEqual([]);

  // Preserve the original sticky-header action and destination.
  await page.getByRole('link', { name: 'See a demo' }).first().click();
  await page.waitForURL('**/demo');
  expect(new URL(page.url()).pathname).toBe('/demo');
});

test('marketing sign in navigation keeps the auth provider mounted', async ({ page }) => {
  await blockExternalRequests(page);

  const response = await page.goto('/');
  expect(response, 'homepage should respond').toBeTruthy();
  await page.getByRole('link', { name: 'Sign in' }).first().click();
  await page.waitForURL('**/login/realtor');

  await expect(page.getByRole('heading', { name: 'Welcome back, real estate agent.' })).toBeVisible();
  await expect(page.getByText('Something broke.')).toHaveCount(0);
});
