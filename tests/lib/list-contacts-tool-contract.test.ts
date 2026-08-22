import { describe, expect, it } from 'vitest';
import { listContactsTool } from '@/lib/ai-tools/tools/list-contacts';

describe('list_contacts input', () => {
  it('uses one explicit view instead of a bundle of optional filters', () => {
    expect(listContactsTool.parameters.safeParse({ view: 'all' }).success).toBe(true);
    expect(listContactsTool.parameters.safeParse({ view: 'hot' }).success).toBe(true);
    expect(listContactsTool.parameters.safeParse({}).success).toBe(false);
  });
});
