import { test, expect } from '@playwright/test';
import { blockExternalRequests } from './helpers';

/**
 * Garbage routes get the designed 404 page (app/not-found.tsx) with a real
 * 404 status — not a crash, not a soft-200.
 */
test('garbage route renders the 404 page with a 404 status', async ({ page }) => {
  await blockExternalRequests(page);

  const response = await page.goto('/this-route-does-not-exist-e2e-xyz');
  expect(response!.status()).toBe(404);

  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByText('404', { exact: true })).toBeVisible();
});

/**
 * Route-segment-config regression guard: a dynamic route with a loading.tsx
 * sibling gets an implicit Suspense boundary around its page.tsx, which
 * flushes a 200 status + the loading fallback before an async notFound()
 * inside that page resolves. See e2e-browser/intake.spec.ts for the
 * dedicated /apply/[slug] coverage — this is the general class of bug, kept
 * here since not-found behavior across the app is this file's job.
 */
test('a dynamic segment with a loading.tsx still 404s honestly on an unknown param', async ({ page }) => {
  await blockExternalRequests(page);

  const response = await page.goto('/apply/this-slug-does-not-exist-either');
  expect(response!.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});
