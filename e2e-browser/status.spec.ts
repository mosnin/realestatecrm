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
    const row = page.locator('li', { hasText: label });
    await expect(row).toBeVisible();
    await expect(row).toContainText(state);
  }

  expect(errors).toEqual([]);
});
