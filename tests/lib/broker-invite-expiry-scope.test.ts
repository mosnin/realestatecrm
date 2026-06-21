import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const singleRoute = readFileSync(path.join(process.cwd(), 'app/api/broker/invite/route.ts'), 'utf8');
const bulkRoute = readFileSync(path.join(process.cwd(), 'app/api/broker/invite/bulk/route.ts'), 'utf8');

describe('broker invite pending expiry scoping', () => {
  it('ignores expired pending invites for single invite idempotency', () => {
    const inviteLookupIndex = singleRoute.indexOf(".from('Invitation')\n    .select('*')");
    const brokerageScopeIndex = singleRoute.indexOf(".eq('brokerageId', brokerage.id)", inviteLookupIndex);
    const statusIndex = singleRoute.indexOf(".eq('status', 'pending')", brokerageScopeIndex);
    const expiryIndex = singleRoute.indexOf(".gt('expiresAt', new Date().toISOString())", statusIndex);

    expect(inviteLookupIndex).toBeGreaterThan(-1);
    expect(brokerageScopeIndex).toBeGreaterThan(inviteLookupIndex);
    expect(statusIndex).toBeGreaterThan(brokerageScopeIndex);
    expect(expiryIndex).toBeGreaterThan(statusIndex);
  });

  it('ignores expired pending invites for bulk precheck and per-row duplicate checks', () => {
    const bulkPrecheckIndex = bulkRoute.indexOf(".from('Invitation')\n        .select('email')");
    const precheckStatusIndex = bulkRoute.indexOf(".eq('status', 'pending')", bulkPrecheckIndex);
    const precheckExpiryIndex = bulkRoute.indexOf(".gt('expiresAt', new Date().toISOString())", precheckStatusIndex);

    const rowLookupIndex = bulkRoute.indexOf(".from('Invitation')\n      .select('id')");
    const rowStatusIndex = bulkRoute.indexOf(".eq('status', 'pending')", rowLookupIndex);
    const rowExpiryIndex = bulkRoute.indexOf(".gt('expiresAt', new Date().toISOString())", rowStatusIndex);

    expect(precheckExpiryIndex).toBeGreaterThan(precheckStatusIndex);
    expect(rowLookupIndex).toBeGreaterThan(precheckExpiryIndex);
    expect(rowExpiryIndex).toBeGreaterThan(rowStatusIndex);
  });
});
