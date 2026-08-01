/**
 * planHistoryLoad — the chat surface's decision about whether (and how) to
 * (re)load a conversation's history.
 *
 * This is where two user-visible chat bugs lived:
 *
 *   1. Every completed turn re-fetched the thread that had just streamed, and
 *      blanked `messages` while the fetch was in flight. An empty transcript
 *      flips the surface back to the greeting hero, which FLIP-glides the
 *      composer up to centre and back down — "the input shoots up and then
 *      back down for a second".
 *   2. That same blank+refetch replaced the streamed transcript with whatever
 *      the database had. For a failed or empty turn the database has nothing,
 *      so the reply (or the error line explaining its absence) vanished and
 *      the realtor was left with their own message and silence.
 */

import { describe, it, expect } from 'vitest';
import { planHistoryLoad } from '@/components/chippi/chippi-workspace';

const base = {
  targetId: 'conv-1' as string | null,
  loadedConvId: 'conv-1' as string | null,
  initialConversationId: 'conv-1' as string | null,
  hasServerMessages: false,
  turnFinishedElsewhere: false,
};

describe('planHistoryLoad', () => {
  it('does nothing when the requested conversation is already on screen', () => {
    expect(planHistoryLoad(base)).toEqual({ action: 'idle' });
  });

  it('leaves the just-streamed thread alone when the turn finished on this surface', () => {
    // The turn ended here, so `turnFinishedElsewhere` is false even though the
    // runner had a finished-turn record. No fetch, no blank, no hero flash.
    expect(planHistoryLoad({ ...base, turnFinishedElsewhere: false })).toEqual({
      action: 'idle',
    });
  });

  it('re-fetches — without blanking — when a turn finished somewhere else', () => {
    const plan = planHistoryLoad({ ...base, turnFinishedElsewhere: true });
    expect(plan).toEqual({ action: 'fetch', clearFirst: false });
  });

  it('prefers server props over a round-trip for a first load', () => {
    const plan = planHistoryLoad({
      ...base,
      loadedConvId: null,
      hasServerMessages: true,
    });
    expect(plan).toEqual({ action: 'useServerProps', clearFirst: false });
  });

  it('never trusts server props once a background turn has landed', () => {
    const plan = planHistoryLoad({
      ...base,
      loadedConvId: null,
      hasServerMessages: true,
      turnFinishedElsewhere: true,
    });
    expect(plan).toEqual({ action: 'fetch', clearFirst: false });
  });

  it('blanks first only when switching to a different conversation', () => {
    const plan = planHistoryLoad({
      ...base,
      targetId: 'conv-2',
      loadedConvId: 'conv-1',
      initialConversationId: 'conv-1',
    });
    expect(plan).toEqual({ action: 'fetch', clearFirst: true });
  });

  it('fetches a conversation the server props do not cover', () => {
    const plan = planHistoryLoad({
      ...base,
      targetId: 'conv-9',
      loadedConvId: null,
      initialConversationId: 'conv-1',
      hasServerMessages: true,
    });
    expect(plan).toEqual({ action: 'fetch', clearFirst: false });
  });

  it('resets to the empty surface when no conversation is selected', () => {
    expect(planHistoryLoad({ ...base, targetId: null })).toEqual({ action: 'reset' });
  });

  it('does not reset twice when the surface is already empty', () => {
    expect(planHistoryLoad({ ...base, targetId: null, loadedConvId: '' })).toEqual({
      action: 'idle',
    });
  });
});
