import { test, expect } from '@playwright/test';
import { blockExternalRequests, collectUnexpectedErrors } from './helpers';

/**
 * Marketing homepage — the front door. Real render + hydration + navigation:
 *   - the hero headline is actually painted (not a blank/errored shell),
 *   - hydration produces no console errors of severity error,
 *   - the header's primary CTA ("Start free") really reaches sign-up.
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

  // Primary CTA in the sticky header starts the self-serve conversion path.
  await page.getByRole('link', { name: 'Start free' }).first().click();
  await page.waitForURL('**/sign-up');
  await expect(
    page.getByRole('heading', { name: /Set up Chippi\./i }),
  ).toBeVisible();

  expect(errors, 'no unexpected console/page errors on the money path').toEqual([]);
});
