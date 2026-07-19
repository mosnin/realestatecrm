import { test, expect } from '@playwright/test';
import { blockExternalRequests } from './helpers';

/**
 * e2e coverage for the new-feature dashboard routes (browser control,
 * offers, drip) added in the browser-control / offers / drip / cma-narrative
 * hardening wave.
 *
 * Reachability audit (documented here so the next person doesn't have to
 * redo it): every one of these pages lives under `/s/[slug]/...`, which
 * `middleware.ts`'s `isProtectedRoute` matches via the blanket `/s/(.*)`
 * pattern — the redirect to `/login/realtor?redirect_url=...` fires in
 * middleware, before any page code (or the stub Supabase server) is ever
 * touched. That redirect is exactly what auth-boundary.spec.ts already
 * proves generically for `/s/some-slug`; the tests below pin the SAME
 * contract to these three specific new paths, so a future change that
 * accidentally carves one of them into `isFullyPublicRoute` (or otherwise
 * narrows `isProtectedRoute`) fails a test by name instead of silently
 * exposing tenant data.
 *
 * What is NOT covered here, and why:
 *   - Actually rendering the authenticated content (the browser-control
 *     settings page's "No browser connected yet." honest empty state, the
 *     offers board, the drip sequence list) needs a real signed-in session.
 *     This harness deliberately never attempts a real Clerk login (see
 *     README.md) — `storageState` only pre-seeds the anonymous "dev browser"
 *     cookie so navigation doesn't hairpin to the fake Clerk host, it does
 *     NOT authenticate anyone. See the SKIPPED spec below.
 *   - No new fully-public PAGE route was added by this feature set. The
 *     only unauthenticated endpoint among browser-control/offers/drip/
 *     cma-narrative is `POST /api/browser-control/pair/redeem` (intentionally
 *     no Clerk auth — the freshly-installed extension calls it before any
 *     session exists), which is an API contract for the browser extension,
 *     not a page this harness renders. `/cma/[token]` is already fully
 *     public per middleware, but it predates this feature wave (shipped
 *     with Property IQ, #481) and isn't part of the cma-narrative track's
 *     surface — cma-narrative only added the narrative field to the
 *     authenticated packet-download route — so it's out of scope for "new
 *     public route" here rather than silently claimed as new coverage.
 */

test('unauthenticated visit to /s/[slug]/settings/browser-control redirects to sign-in with redirect_url', async ({
  page,
}) => {
  await blockExternalRequests(page);

  const response = await page.goto('/s/some-slug/settings/browser-control');
  expect(response!.status()).toBe(200);

  const url = new URL(page.url());
  expect(url.pathname).toBe('/login/realtor');
  expect(url.searchParams.get('redirect_url')).toBe('/s/some-slug/settings/browser-control');
});

test('unauthenticated visit to /s/[slug]/offers redirects to sign-in with redirect_url', async ({
  page,
}) => {
  await blockExternalRequests(page);

  const response = await page.goto('/s/some-slug/offers');
  expect(response!.status()).toBe(200);

  const url = new URL(page.url());
  expect(url.pathname).toBe('/login/realtor');
  expect(url.searchParams.get('redirect_url')).toBe('/s/some-slug/offers');
});

test('unauthenticated visit to /s/[slug]/drip redirects to sign-in with redirect_url', async ({
  page,
}) => {
  await blockExternalRequests(page);

  const response = await page.goto('/s/some-slug/drip');
  expect(response!.status()).toBe(200);

  const url = new URL(page.url());
  expect(url.pathname).toBe('/login/realtor');
  expect(url.searchParams.get('redirect_url')).toBe('/s/some-slug/drip');
});

// TODO(e2e-browser): once a seeded staging environment exists (real Clerk
// test instance + disposable Supabase — see README.md "What needs a seeded
// environment"), replace this skip with a real assertion that
// /s/[slug]/settings/browser-control renders the honest "No browser
// connected yet." empty state (browser-control-client.tsx) for a signed-in
// user with no BrowserLink row, and that it flips to "connected" copy once
// one exists. Same follow-up applies to the offers board (empty-state vs.
// seeded offers) and the drip sequence list. Left skipped rather than faked
// or run against an unauthenticated redirect (which would silently assert
// the wrong page) per CLAUDE.md's honest-UI rule and this track's brief:
// "if the harness can't reach a surface, say so honestly."
test.skip(
  'authenticated /s/[slug]/settings/browser-control renders the "No browser connected yet." empty state',
  async () => {
    // Intentionally unimplemented — needs a real Clerk session, see TODO above.
  },
);
