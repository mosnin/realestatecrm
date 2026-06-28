/**
 * Unit tests for `resolveLink` — the pure helper that turns a structured
 * `ActivityLink` hint (emitted by the slug-blind data layer) into a
 * slug-scoped href. Every link kind must map to the correct path, and any
 * missing/unknown/id-less case must return null so the UI renders no link
 * rather than a broken href.
 *
 * Pure: no DOM, no fetch — the helper is exported from the feed component but
 * imports nothing browser-specific at module level for this path.
 */

import { describe, it, expect } from 'vitest';
import { resolveLink } from '@/components/chippi/unified-activity-feed';
import type { ActivityLink } from '@/lib/activity/types';

const SLUG = 'acme';

describe('resolveLink', () => {
  it('contact → slug-scoped contact href', () => {
    expect(resolveLink({ kind: 'contact', id: 'c1' }, SLUG)).toBe(
      '/s/acme/contacts/c1',
    );
  });

  it('deal → slug-scoped deal href', () => {
    expect(resolveLink({ kind: 'deal', id: 'd1' }, SLUG)).toBe('/s/acme/deals/d1');
  });

  it('workflow with an id → deep-link to that workflow via hash anchor', () => {
    expect(resolveLink({ kind: 'workflow', id: 'w1' }, SLUG)).toBe(
      '/s/acme/workflows#workflow-w1',
    );
  });

  it('workflow without an id → workflows index (legacy run, no workflowId)', () => {
    expect(resolveLink({ kind: 'workflow' }, SLUG)).toBe('/s/acme/workflows');
  });

  it('inbox → chippi inbox', () => {
    expect(resolveLink({ kind: 'inbox' }, SLUG)).toBe('/s/acme/chippi/inbox');
  });

  it('integrations → chippi integrations', () => {
    expect(resolveLink({ kind: 'integrations' }, SLUG)).toBe(
      '/s/acme/chippi/integrations',
    );
  });

  it('routines with an id → deep-link to that routine via hash anchor', () => {
    expect(resolveLink({ kind: 'routines', id: 'r1' }, SLUG)).toBe(
      '/s/acme/routines#routine-r1',
    );
  });

  it('routines without an id → routines index', () => {
    expect(resolveLink({ kind: 'routines' }, SLUG)).toBe('/s/acme/routines');
  });

  it('contact without an id → null (no broken href)', () => {
    expect(resolveLink({ kind: 'contact' }, SLUG)).toBeNull();
  });

  it('deal without an id → null (no broken href)', () => {
    expect(resolveLink({ kind: 'deal' }, SLUG)).toBeNull();
  });

  it('undefined link → null', () => {
    expect(resolveLink(undefined, SLUG)).toBeNull();
  });

  it('empty slug → null (cannot build a scoped href)', () => {
    expect(resolveLink({ kind: 'contact', id: 'c1' }, '')).toBeNull();
  });

  it('unknown kind → null', () => {
    // Cast through unknown: exercises the default branch defensively even
    // though the type union forbids it at compile time.
    const bad = { kind: 'mystery', id: 'x' } as unknown as ActivityLink;
    expect(resolveLink(bad, SLUG)).toBeNull();
  });
});
