import { test, expect } from '@playwright/test';
import { blockExternalRequests, collectUnexpectedErrors } from './helpers';

/**
 * Marketing homepage — the front door. Real render + hydration + navigation:
 *   - the hero headline is actually painted (not a blank/errored shell),
 *   - hydration produces no console errors of severity error,
 *   - the header's primary CTA ("See a demo") really navigates.
 */
test('marketing home renders the hero and the primary CTA navigates', async ({ page }) => {
  await blockExternalRequests(page);
  const errors = collectUnexpectedErrors(page);

  const response = await page.goto('/');
  expect(response, 'homepage should respond').toBeTruthy();
  expect(response!.status()).toBe(200);

  // Hero headline (app/(marketing)/page.tsx → components/marketing/giga/hero.tsx).
  await expect(
    page.getByRole('heading', { name: /The operating system\s+for real estate\./i }),
  ).toBeVisible();

  // Primary CTA in the sticky header navigates to the demo scheduler.
  await page.getByRole('link', { name: 'See a demo' }).first().click();
  await page.waitForURL('**/demo');
  await expect(
    page.getByRole('heading', { name: /See Chippi run your floor\./i }),
  ).toBeVisible();

  expect(errors, 'no unexpected console/page errors on the money path').toEqual([]);
});
