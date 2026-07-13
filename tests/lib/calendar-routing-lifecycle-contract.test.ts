import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('serverless calendar and routing lifecycle contracts', () => {
  it('retains Google Calendar cleanup after a caller returns', () => {
    const source = readFileSync('lib/gcal-helpers.ts', 'utf8');

    expect(source).toContain('const task = performDeleteGoogleEvent(args)');
    expect(source).toContain('after(() => task)');
    expect(source).toContain('return task');
  });

  it('retains brokerage routing cursor writes after a caller returns', () => {
    const source = readFileSync('lib/brokerage-routing.ts', 'utf8');

    expect(source).toContain('const task = persistCursor(brokerageId, newCursorUserId)');
    expect(source).toContain('after(() => task)');
    expect(source).toContain('await task');
  });
});
