import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe("sidebar what's-new notice", () => {
  it('does not advertise a changelog route that does not exist', () => {
    const source = readFileSync('components/dashboard/sidebar-whats-new.tsx', 'utf8');

    expect(source).not.toContain('/changelog');
    expect(source).not.toContain('See changes');
  });
});
