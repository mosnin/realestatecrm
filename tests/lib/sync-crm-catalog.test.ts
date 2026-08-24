import { describe, expect, it } from 'vitest';
import { COMING_SOON_TOOLKITS, findIntegration } from '@/lib/integrations/catalog';
import { CRM_ENTRIES } from '@/app/s/[slug]/sync/sync-view';

describe('smart-sync CRM catalog', () => {
  it('treats kvCORE and Follow Up Boss as native connects, not coming soon', () => {
    const fub = CRM_ENTRIES.find((e) => e.toolkit === 'follow_up_boss');
    const kv = CRM_ENTRIES.find((e) => e.toolkit === 'kvcore');
    expect(fub?.native).toBe(true);
    expect(fub?.comingSoon).toBeUndefined();
    expect(kv?.native).toBe(true);
    expect(kv?.comingSoon).toBeUndefined();
    expect(kv?.nativeRoute).toBe(findIntegration('kvcore')?.nativeAuth?.route);
    expect(COMING_SOON_TOOLKITS.has('kvcore')).toBe(false);
  });
});
