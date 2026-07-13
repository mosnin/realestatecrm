import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const NOTIFICATION_ROUTES = [
  'app/api/applications/[id]/message/route.ts',
  'app/api/applications/[id]/status/route.ts',
  'app/api/applications/portal/message/route.ts',
  'app/api/applications/portal/tour-request/route.ts',
  'app/api/form-draft/route.ts',
];

describe('notification lifecycle contract', () => {
  it.each(NOTIFICATION_ROUTES)(
    '%s keeps post-response notifications alive in serverless',
    (file) => {
      const source = readFileSync(file, 'utf8');

      expect(source).toMatch(/import \{[^}]*\bafter\b[^}]*\} from 'next\/server';/);
      expect(source).toContain('after(() =>');
    },
  );
});
