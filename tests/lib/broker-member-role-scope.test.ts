import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'app/api/broker/members/[id]/role/route.ts'), 'utf8');

describe('broker member role scoping', () => {
  it('guards role updates against target role races', () => {
    expect(source).toContain(".eq('id', membershipId)\n    .eq('brokerageId', ctx.brokerage.id)\n    .eq('role', membership.role)");
    expect(source).toContain(".select('id')\n    .maybeSingle()");
    expect(source).toContain("Member role changed. Refresh and try again.");
  });
});
