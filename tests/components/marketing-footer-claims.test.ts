import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('marketing footer security claims', () => {
  it('does not present unverified compliance certifications', () => {
    const source = readFileSync('components/marketing/giga/footer.tsx', 'utf8');

    expect(source).not.toContain("'SOC 2'");
    expect(source).not.toContain("'ISO 27001'");
    expect(source).not.toContain("'GDPR'");
    expect(source).not.toMatch(/>\s*Compliant\s*</);
    expect(source).toContain('Security controls');
  });
});
