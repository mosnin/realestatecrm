import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function tsxFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.isFile() && path.endsWith('.tsx') ? [path] : [];
  });
}

describe('interactive control semantics', () => {
  it('does not nest Button controls and links', () => {
    const violations = tsxFiles('app')
      .concat(tsxFiles('components'))
      .filter((path) => {
        const source = readFileSync(path, 'utf8');
        return (
          /<(?:a|Link)\b[^>]*>\s*<Button\b/.test(source) ||
          /<Button\b(?![^>]*\basChild\b)[^>]*>\s*<(?:a|Link)\b/.test(source)
        );
      });

    expect(violations).toEqual([]);
  });
});
