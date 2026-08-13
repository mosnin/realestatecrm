import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  const state = {
    session: { id: 'session-1', status: 'awaiting_approval', workspaceRunId: null } as Record<string, unknown> | null,
    lookupError: null as Error | null,
    updateError: null as Error | null,
    updateWon: true,
  };
  const selectChain = (): any => ({
    eq: () => selectChain(),
    maybeSingle: async () => ({ data: state.lookupError ? null : state.session, error: state.lookupError }),
  });
  const updateChain = (): any => ({
    eq: () => updateChain(),
    select: () => updateChain(),
    maybeSingle: async () => ({
      data: state.updateWon && !state.updateError ? { id: 'session-1' } : null,
      error: state.updateError,
    }),
  });
  return {
    state,
    supabase: {
      from: vi.fn(() => ({
        select: () => selectChain(),
        update: () => updateChain(),
      })),
      rpc: vi.fn(),
    },
    kickPlan: vi.fn(),
    kickExecute: vi.fn(),
  };
});

vi.mock('@/lib/supabase', () => ({ supabase: mocks.supabase }));
vi.mock('@/lib/api-auth', () => ({ requireSpaceOwner: vi.fn(async () => ({ space: { id: 'space-1' } })) }));
vi.mock('@/lib/work-sessions/kick', () => ({ kickPlan: mocks.kickPlan, kickExecute: mocks.kickExecute }));

import { GET, PATCH } from '@/app/api/work-sessions/[id]/route';

const context = { params: Promise.resolve({ id: 'session-1' }) };
function request(method: 'GET' | 'PATCH', body?: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/work-sessions/session-1?slug=demo', {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}),
  });
}

beforeEach(() => {
  mocks.state.session = { id: 'session-1', status: 'awaiting_approval', workspaceRunId: null };
  mocks.state.lookupError = null;
  mocks.state.updateError = null;
  mocks.state.updateWon = true;
  mocks.kickPlan.mockReset();
  mocks.kickExecute.mockReset();
});

describe('WorkSession control reliability', () => {
  it('reports a database read failure instead of a false 404', async () => {
    mocks.state.lookupError = new Error('database unavailable');
    expect((await GET(request('GET'), context)).status).toBe(500);
  });

  it('does not dispatch approve when its guarded transition errors', async () => {
    mocks.state.updateError = new Error('database unavailable');
    const response = await PATCH(request('PATCH', { action: 'approve' }), context);
    expect(response.status).toBe(500);
    expect(mocks.kickExecute).not.toHaveBeenCalled();
  });

  it('does not dispatch approve when a concurrent transition already won', async () => {
    mocks.state.updateWon = false;
    const response = await PATCH(request('PATCH', { action: 'approve' }), context);
    expect(response.status).toBe(409);
    expect(mocks.kickExecute).not.toHaveBeenCalled();
  });

  it('dispatches only after the guarded approve transition is durable', async () => {
    const response = await PATCH(request('PATCH', { action: 'approve' }), context);
    expect(response.status).toBe(200);
    expect(mocks.kickExecute).toHaveBeenCalledWith('session-1');
  });

  it('applies the same guarded transition contract to answers', async () => {
    mocks.state.session = { id: 'session-1', status: 'awaiting_input', workspaceRunId: null };
    mocks.state.updateWon = false;
    const response = await PATCH(request('PATCH', { action: 'answer', answer: 'Use 12 Oak Street.' }), context);
    expect(response.status).toBe(409);
    expect(mocks.kickPlan).not.toHaveBeenCalled();
  });
});
