import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../..');

function source(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('Chippi Workbench product contract', () => {
  it('keeps the local editor versioned, honest, and separate from production data', () => {
    const workbench = source('components/chippi/live-workbench.tsx');
    expect(workbench).toContain('Save version');
    expect(workbench).toContain('The source remains unchanged.');
    expect(workbench).toContain('localStorage');
    expect(workbench).toContain('if (!artifact) return <EmptyState />');
    expect(workbench).not.toContain('artifact = DEMO_PIPELINE_ARTIFACT');
    expect(workbench).not.toContain('supabase');
  });

  it('ships a development-only preview for visual review', () => {
    const preview = source('app/dev/chippi-workbench/page.tsx');
    expect(preview).toContain("process.env.NODE_ENV === 'production'");
    expect(preview).toContain('artifact={DEMO_PIPELINE_ARTIFACT}');
  });
});
