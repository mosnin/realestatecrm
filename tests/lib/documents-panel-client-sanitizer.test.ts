import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(process.cwd(), 'app/s/[slug]/documents/documents-panel.tsx'),
  'utf8',
);

describe('DocumentsPanel sanitizer runtime boundary', () => {
  it('loads the JSDOM-backed sanitizer only after the client component mounts', () => {
    expect(source).not.toMatch(/import DOMPurify from ['"]isomorphic-dompurify['"]/);
    expect(source).toContain("import('isomorphic-dompurify')");
    expect(source).toContain('useEffect(() =>');
  });
});
