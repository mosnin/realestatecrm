import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const source = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');

const guardedBrokerMutations = [
  'app/api/broker/assign-lead/route.ts',
  'app/api/broker/lead-note/route.ts',
  'app/api/broker/routing-rules/route.ts',
  'app/api/broker/routing-rules/[id]/route.ts',
  'app/api/broker/invite/route.ts',
  'app/api/broker/invite/bulk/route.ts',
  'app/api/broker/members/[id]/role/route.ts',
  'app/api/broker/members/[id]/offboard/route.ts',
  'app/api/broker/unassign-lead/route.ts',
  'app/api/broker/create/route.ts',
  'app/api/broker/join/route.ts',
  'app/api/broker/profile/route.ts',
  'app/api/broker/properties/route.ts',
  'app/api/broker/properties/[id]/assign/route.ts',
  'app/api/broker/reviews/[id]/route.ts',
  'app/api/broker/reviews/[id]/comments/route.ts',
  'app/api/broker/commissions/ledger/[id]/route.ts',
  'app/api/broker/templates/route.ts',
  'app/api/broker/templates/[id]/route.ts',
  'app/api/broker/settings/route.ts',
  'app/api/broker/form-config/route.ts',
  'app/api/broker/form-config/push/route.ts',
];

describe('broker API commercial-readiness guards', () => {
  it.each(guardedBrokerMutations)('%s reads JSON through the shared body-size guard', (file) => {
    const body = source(file);
    expect(body).toContain("from '@/lib/validation';");
    expect(body).toMatch(/read(?:Optional)?JsonWithLimit\(req, /);
    expect(body).not.toContain('await req.json()');
  });
});
