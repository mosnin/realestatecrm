import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOTS = ['app', 'components', 'lib'];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('production origin contract', () => {
  it('does not generate links to the discontinued app hostname', () => {
    const offenders = ROOTS.flatMap(sourceFiles).filter((file) =>
      readFileSync(file, 'utf8').includes('my.usechippi.com'),
    );

    expect(offenders).toEqual([]);
  });

  it('routes template management to a real workspace or broker page', () => {
    const picker = readFileSync('components/templates/template-picker.tsx', 'utf8');
    const palette = readFileSync('components/command-palette/command-palette.tsx', 'utf8');

    expect(picker).toContain('/settings/templates');
    expect(picker).toContain('/broker/templates');
    expect(picker).not.toContain('/settings?tab=apps');
    expect(palette).toContain('${base}/settings/templates');
    expect(palette).not.toContain('${base}/settings?tab=apps');
  });

  it('uses the supported public domain in generated marketing assets', () => {
    const openGraph = readFileSync('app/(marketing)/opengraph-image.tsx', 'utf8');
    const onboarding = readFileSync('components/onboarding/onboarding-steps.tsx', 'utf8');

    expect(openGraph).toContain('usechippi.com');
    expect(openGraph).not.toContain('chippi.app');
    expect(onboarding).toContain("urlPrefix = 'usechippi.com/'");
  });
});
