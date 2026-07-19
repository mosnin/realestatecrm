import { test, expect } from '@playwright/test';
import { blockExternalRequests, collectUnexpectedErrors } from './helpers';

/**
 * Public intake surface (/apply/[slug]).
 *
 * The page is SERVER-rendered from Supabase (getSpaceFromSlug → SpaceSetting /
 * User / ProfilePage reads), so browser-side route interception can't mock it.
 * Instead the harness points the app at e2e-browser/stub-supabase.mjs, which
 * seeds exactly one Space (slug "e2e-demo", name "E2E Demo Realty") and
 * returns empty rows for everything else — the page renders the real intake
 * shell with its fallback copy, exactly as a fresh workspace would.
 *
 * What still needs a real seeded environment (documented in README.md):
 * customized form configs, brokerage-templated forms, photo/signed-URL
 * resolution, and actually submitting the intake chat (LLM-backed).
 */
test('seeded slug renders the real intake surface', async ({ page }) => {
  await blockExternalRequests(page);
  const errors = collectUnexpectedErrors(page);

  const response = await page.goto('/apply/e2e-demo');
  expect(response!.status()).toBe(200);

  // Business identity from the seeded Space row, rendered by IntakeChatShell.
  await expect(page.getByText('E2E Demo Realty').first()).toBeVisible();

  expect(errors).toEqual([]);
});

test('unknown slug is an honest 404, not an error page', async ({ page }) => {
  await blockExternalRequests(page);

  const response = await page.goto('/apply/definitely-not-a-real-slug');
  // Regression guard: /apply/[slug] has a loading.tsx, which makes Next.js
  // wrap the page in an implicit Suspense boundary. Without the slug
  // existence check hoisted into layout.tsx (which runs OUTSIDE that
  // boundary), the loading skeleton's 200 status ships before the page's
  // own notFound() resolves — a 200-then-404-content bug that looks fine
  // visually but is dishonest over HTTP (bots, monitors, and anything that
  // trusts the status code see success).
  expect(response!.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});

test('unknown slug 404s across the whole /apply/[slug] route tree, not just the index page', async ({ page }) => {
  await blockExternalRequests(page);

  // The slug gate lives in app/apply/[slug]/layout.tsx, which wraps every
  // nested route under this segment (privacy, status, chat) — not just
  // page.tsx. Spot-check a nested route to prove the fix isn't scoped to
  // the index page alone.
  const response = await page.goto('/apply/definitely-not-a-real-slug/privacy');
  expect(response!.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});
