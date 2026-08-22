/**
 * merge_persons must go through merge_contacts() — the hand-rolled path
 * deleted the duplicate after moving only activity/tours/deal links, and
 * Postgres cascaded the rest (docs, inbox, drip, drafts, application
 * messages). A failed mid-step also left a partial merge.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

type ContactRow = { id: string; name: string };
const contactsById: Record<string, ContactRow> = {};
let rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
let rpcResult: { data?: unknown; error?: { message: string } | null } = {
  data: { survivorId: 'keep_1', merged: ['merge_1'], repointed: { '"DealContact".contactId': 2 } },
  error: null,
};
const inserts: Array<{ table: string; values: unknown }> = [];
const deletes: Array<{ table: string }> = [];

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const eqs: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    chain.select = vi.fn(passthrough);
    chain.eq = vi.fn((col: string, val: unknown) => {
      eqs[col] = val;
      return chain;
    });
    chain.is = vi.fn(passthrough);
    chain.insert = vi.fn((values: unknown) => {
      inserts.push({ table, values });
      return chain;
    });
    chain.delete = vi.fn(() => {
      deletes.push({ table });
      return chain;
    });
    const resolveContact = () => {
      if (table !== 'Contact') return { data: null, error: null };
      const id = eqs.id as string | undefined;
      return { data: id ? (contactsById[id] ?? null) : null, error: null };
    };
    chain.maybeSingle = vi.fn(() => Promise.resolve(resolveContact()));
    chain.single = vi.fn(() => Promise.resolve(resolveContact()));
    chain.then = (r: (v: unknown) => unknown, e?: (e: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(r, e);
    return chain;
  }
  return {
    supabase: {
      from: vi.fn((table: string) => makeChain(table)),
      rpc: vi.fn((fn: string, args: Record<string, unknown>) => {
        rpcCalls.push({ fn, args });
        return Promise.resolve(rpcResult);
      }),
    },
  };
});

const { syncContactMock, deleteContactVectorMock } = vi.hoisted(() => ({
  syncContactMock: vi.fn(async () => undefined),
  deleteContactVectorMock: vi.fn(async () => undefined),
}));
vi.mock('@/lib/vectorize', () => ({
  syncContact: syncContactMock,
  deleteContactVector: deleteContactVectorMock,
  syncDeal: vi.fn(),
  deleteDealVector: vi.fn(),
}));

import { mergePersonsTool } from '@/lib/ai-tools/tools/merge-persons';
import type { ToolContext } from '@/lib/ai-tools/types';

function makeCtx(): ToolContext {
  return {
    userId: 'clerk_1',
    space: { id: 'space_1', slug: 'jane', name: 'Jane Realty', ownerId: 'u1' },
    signal: new AbortController().signal,
  };
}

beforeEach(() => {
  for (const k of Object.keys(contactsById)) delete contactsById[k];
  contactsById.keep_1 = { id: 'keep_1', name: 'Jane Chen' };
  contactsById.merge_1 = { id: 'merge_1', name: 'Sam Chen' };
  rpcCalls = [];
  rpcResult = {
    data: { survivorId: 'keep_1', merged: ['merge_1'], repointed: { '"DealContact".contactId': 2 } },
    error: null,
  };
  inserts.length = 0;
  deletes.length = 0;
  syncContactMock.mockClear();
  deleteContactVectorMock.mockClear();
});

describe('mergePersonsTool — transactional RPC', () => {
  it('merges via merge_contacts and never deletes Contact itself', async () => {
    const result = await mergePersonsTool.handler(
      { keepId: 'keep_1', mergeId: 'merge_1' },
      makeCtx(),
    );
    expect(result.display).toBe('success');
    expect(rpcCalls).toEqual([
      {
        fn: 'merge_contacts',
        args: {
          p_survivor_id: 'keep_1',
          p_duplicate_ids: ['merge_1'],
          p_space_id: 'space_1',
          p_actor_clerk_id: 'clerk_1',
        },
      },
    ]);
    expect(deletes).toEqual([]);
    expect(result.summary).toMatch(/Jane Chen/);
    expect(result.summary).toMatch(/Sam Chen/);
    expect(deleteContactVectorMock).toHaveBeenCalledWith('space_1', 'merge_1');
  });

  it('reports no changes when the RPC fails — does not hand-roll a delete', async () => {
    rpcResult = { data: null, error: { message: 'Survivor contact keep_1 is not in space space_1' } };
    const result = await mergePersonsTool.handler(
      { keepId: 'keep_1', mergeId: 'merge_1' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/no changes were made/i);
    expect(deletes).toEqual([]);
    expect(deleteContactVectorMock).not.toHaveBeenCalled();
  });

  it('does not call the RPC when the duplicate is missing', async () => {
    delete contactsById.merge_1;
    const result = await mergePersonsTool.handler(
      { keepId: 'keep_1', mergeId: 'merge_gone' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    expect(result.summary).toMatch(/No contact/);
    expect(rpcCalls).toEqual([]);
  });
});
