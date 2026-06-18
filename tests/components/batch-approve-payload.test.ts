/**
 * The inbox's bulk "Approve N selected" path builds its request body from a
 * pure helper so we can pin the bug it fixes without rendering the component.
 *
 * The bug: the inbox used to POST only { draftIds } to
 * /api/agent/drafts/batch-approve, so a realtor who edited a draft inline and
 * then bulk-approved it silently shipped the ORIGINAL stored draft. The
 * endpoint has supported a per-draft `edits` map since #394 — the client just
 * never sent it. buildBatchApprovePayload is the wiring; these tests pin it.
 *
 * The taste decisions worth pinning:
 *   - Only edits for ids IN this batch are carried. The lifted edits map is
 *     keyed by every row the realtor ever touched; a stale edit for an
 *     unselected draft must not leak into a batch it isn't part of.
 *   - The `edits` key is OMITTED entirely when nothing was edited, so the
 *     common "approve as-is" payload stays byte-identical to the old behavior
 *     (the endpoint treats a missing map and an empty map the same, but the
 *     smaller payload is the honest one).
 */

import { describe, it, expect } from 'vitest';
import { buildBatchApprovePayload } from '@/components/agent/agent-draft-inbox';

describe('buildBatchApprovePayload', () => {
  it('omits the edits key entirely when no draft was edited', () => {
    const payload = buildBatchApprovePayload(['a', 'b'], new Map());
    expect(payload).toEqual({ draftIds: ['a', 'b'] });
    expect('edits' in payload).toBe(false);
  });

  it('carries the realtor edit for an edited draft (the core fix)', () => {
    const edits = new Map([['a', 'edited body the realtor rewrote']]);
    const payload = buildBatchApprovePayload(['a', 'b'], edits);
    expect(payload).toEqual({
      draftIds: ['a', 'b'],
      edits: { a: 'edited body the realtor rewrote' },
    });
  });

  it('only includes edits for ids in the batch (no stale-edit leak)', () => {
    // The lifted map holds an edit for 'c', but 'c' isn't in this batch.
    const edits = new Map([
      ['a', 'edit for a'],
      ['c', 'edit for a draft that is not selected'],
    ]);
    const payload = buildBatchApprovePayload(['a', 'b'], edits);
    expect(payload.edits).toEqual({ a: 'edit for a' });
    expect(payload.edits && 'c' in payload.edits).toBe(false);
  });

  it('carries every edited id when all selected drafts were edited', () => {
    const edits = new Map([
      ['a', 'edit a'],
      ['b', 'edit b'],
    ]);
    const payload = buildBatchApprovePayload(['a', 'b'], edits);
    expect(payload).toEqual({
      draftIds: ['a', 'b'],
      edits: { a: 'edit a', b: 'edit b' },
    });
  });

  it('preserves the draftIds order the caller passed', () => {
    const payload = buildBatchApprovePayload(['z', 'm', 'a'], new Map());
    expect(payload.draftIds).toEqual(['z', 'm', 'a']);
  });
});
