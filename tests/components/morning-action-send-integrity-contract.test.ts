import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(
  path.join(process.cwd(), 'components/chippi/morning-action-sheet.tsx'),
  'utf8',
);

describe('morning action send-integrity contract', () => {
  it('sends a stable request UUID and handles duplicate/failure outcomes without celebration', () => {
    expect(source).toContain('useState(() => crypto.randomUUID())');
    expect(source).toContain('idempotencyKey: sendRequestId');
    expect(source).toContain("failure?.error === 'already_processed'");
    expect(source).toContain("failure.status === 'sent'");
    expect(source).toContain("failure?.error === 'delivery_failed'");
    expect(source.indexOf("if (!res.ok)")).toBeLessThan(
      source.indexOf("setPhase('celebrating')"),
    );
  });
});
