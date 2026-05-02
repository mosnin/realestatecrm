/**
 * Snapshot the exact wording of the integrations-page trust sentence.
 *
 * The sentence is the answer to a realtor's actual fear ("am I handing
 * Chippi the keys to my inbox?"). Drive-by copy edits that soften it back
 * into corporate fluff would make this fix moot — so we read the page's
 * source and assert the verbatim string is present. Any change to that
 * sentence has to flip this test on purpose.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PAGE_PATH = resolve(
  __dirname,
  '..',
  '..',
  'app',
  's',
  '[slug]',
  'integrations',
  'page.tsx',
);

const TRUST_SENTENCE =
  'Chippi never sends without your tap. Connecting just means your\n' +
  '          approved drafts go through your account.';

describe('integrations page — trust sentence', () => {
  it('contains the exact realtor-facing consent line', () => {
    const src = readFileSync(PAGE_PATH, 'utf8');
    expect(src.includes(TRUST_SENTENCE)).toBe(true);
  });
});
