/** Pins the direct-action expectation next to connected-app controls. */

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
  'settings',
  'page.tsx',
);

const ACTION_PHRASE =
  'Chippi uses your connected accounts to complete the actions you request and records each result.';

describe('settings connections — direct-action sentence', () => {
  it('states that connected apps execute requested actions', () => {
    const src = readFileSync(PAGE_PATH, 'utf8');
    expect(src.includes(ACTION_PHRASE)).toBe(true);
    expect(src).not.toContain('Chippi never sends without your tap.');
  });
});
