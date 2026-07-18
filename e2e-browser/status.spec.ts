import { test, expect } from '@playwright/test';
import { blockExternalRequests, collectUnexpectedErrors } from './helpers';

/**
 * /status — the honest public status page (CLAUDE.md non-negotiable #5).
 *
 * In the stub environment the outcome is deterministic:
 *   - Database probe hits the stub PostgREST server and succeeds → Operational
 *   - Agent has no public non-billable probe → Unknown (by design)
 *   - Composio credentials are absent → integrations probe → Unknown
 *
 * The page must report exactly that — an honest "Most systems operational."
 * with per-subsystem states — and must NOT claim "All systems operational."
 * when it can't verify everything.
 */
test('status page reports honest per-subsystem states', async ({ page }) => {
  await blockExternalRequests(page);
  const errors = collectUnexpectedErrors(page);

  const response = await page.goto('/status');
  expect(response!.status()).toBe(200);

  await expect(page.getByText('Most systems operational.')).toBeVisible();
  // Honesty: unverifiable subsystems must never be painted green.
  await expect(page.getByText('All systems operational.')).toHaveCount(0);

  const rows: Array<[label: string, state: string]> = [
    ['Agent (Chippi)', 'Unknown'],
    ['Dashboard & database', 'Operational'],
    ['Integrations', 'Unknown'],
  ];
  for (const [label, state] of rows) {
    // Filter on label AND state together, not just label: the page footer
    // also has an "Integrations" nav link in an <li>, which a label-only
    // filter matches too (strict-mode violation). The footer link never
    // contains the health-state text, so requiring both disambiguates.
    const row = page.locator('li').filter({ hasText: label }).filter({ hasText: state });
    await expect(row).toBeVisible();
  }

  expect(errors).toEqual([]);
});
