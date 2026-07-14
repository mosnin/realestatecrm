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
