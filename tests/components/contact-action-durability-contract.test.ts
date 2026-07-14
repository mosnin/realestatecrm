import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  'components/contacts/contact-action-pills.tsx',
  'utf8',
);

describe('contact quick-draft durability contract', () => {
  it('persists compose intent across a streamed client-island remount', () => {
    expect(source).toContain("const QUICK_DRAFT_QUERY_KEY = 'quickDraft'");
    expect(source).toContain('useSearchParams()');
    expect(source).toContain('next.set(QUICK_DRAFT_QUERY_KEY, intent)');
    expect(source).toContain(
      "router.replace(`${pathname}${query ? `?${query}` : ''}`",
    );
    expect(source).toContain('onSent={() => setDurableIntent(null)}');
    expect(source).toContain('onCancel={() => setDurableIntent(null)}');
  });
});
