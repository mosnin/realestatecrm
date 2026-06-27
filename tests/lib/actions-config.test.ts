/**
 * normalizeActionsConfig coerces the two shapes a tool can declare its action
 * buttons in (a bare Action[] or a full ActionsConfig) into one canonical
 * ActionsConfig, and infers a "ghost" variant for negatory actions (cancel /
 * dismiss / skip ...) so destructive-looking buttons don't render as primary.
 * Pin the shape coercion, the empty -> null collapse, the config passthrough,
 * and the variant inference (including that an explicit variant is respected).
 */

import { describe, it, expect } from 'vitest';
import { normalizeActionsConfig } from '@/components/tool-ui/shared/actions-config';

type Action = { id: string; label?: string; variant?: string };
const cast = (a: unknown) => a as Parameters<typeof normalizeActionsConfig>[0];

describe('normalizeActionsConfig', () => {
  it('returns null for missing or empty actions', () => {
    expect(normalizeActionsConfig()).toBeNull();
    expect(normalizeActionsConfig(cast([]))).toBeNull();
    expect(normalizeActionsConfig(cast({ items: [] }))).toBeNull();
  });

  it('wraps a bare Action[] into { items }', () => {
    const out = normalizeActionsConfig(cast([{ id: 'confirm', label: 'Confirm' }]));
    expect(out).toEqual({ items: [{ id: 'confirm', label: 'Confirm' }] });
  });

  it('infers a ghost variant for negatory action ids', () => {
    const out = normalizeActionsConfig(cast([{ id: 'cancel', label: 'Cancel' }, { id: 'confirm', label: 'Go' }]));
    const items = out!.items as Action[];
    expect(items.find((a) => a.id === 'cancel')?.variant).toBe('ghost');
    expect(items.find((a) => a.id === 'confirm')?.variant).toBeUndefined(); // affirmative untouched
  });

  it('respects an explicit variant over inference', () => {
    const out = normalizeActionsConfig(cast([{ id: 'cancel', label: 'Cancel', variant: 'primary' }]));
    expect((out!.items as Action[])[0].variant).toBe('primary');
  });

  it('passes through align + confirmTimeout from the config shape', () => {
    const out = normalizeActionsConfig(cast({
      items: [{ id: 'dismiss', label: 'Dismiss' }],
      align: 'end',
      confirmTimeout: 5000,
    }));
    expect(out).toMatchObject({ align: 'end', confirmTimeout: 5000 });
    expect((out!.items as Action[])[0].variant).toBe('ghost'); // dismiss -> ghost even via config shape
  });
});
