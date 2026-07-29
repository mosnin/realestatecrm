import crypto from 'node:crypto';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { state, supabase } = vi.hoisted(() => {
const state = { eventInsertCalls: 0, rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>, runStatus: 'launching' };
const chain = (result: unknown): any => ({
  eq: () => chain(result), in: () => chain(result), is: () => chain(result), order: () => chain(result), limit: () => chain(result),
  maybeSingle: async () => result, single: async () => result,
});
const supabase: any = {
  from(table: string) {
    if (table === 'WorkspaceRun') return {
      select: () => chain({ data: { id: 'run-1', workSessionId: 'session-1', status: state.runStatus, cancellationRequestedAt: null }, error: null }),
      update: () => chain({ data: null, error: null }),
    };
    if (table === 'WorkspaceRunEvent') return {
      insert: () => ({ select: () => ({ maybeSingle: async () => { state.eventInsertCalls += 1; return state.eventInsertCalls === 1 ? { data: { id: 'event-1' }, error: null } : { data: null, error: { code: '23505' } }; } }) }),
    };
    return { select: () => chain({ data: null, error: null }) };
  },
  rpc: async (name: string, args: Record<string, unknown>) => { state.rpcCalls.push({ name, args }); return { data: true, error: null }; },
};
return { state, supabase };
});

vi.mock('@/lib/supabase', () => ({ supabase }));
const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { send } }));
vi.mock('@/lib/api-auth', () => ({ requireSpaceOwner: async () => ({ space: { id: 'space-1' } }) }));
vi.mock('@/lib/storage', () => ({ buildKey: () => 'private/key', uploadObject: vi.fn(), getSignedDownloadUrl: vi.fn(async () => 'https://example.test/private') }));

import { POST as callback } from '@/app/api/internal/workspace-runs/callback/route';
import { POST as claimLaunch } from '@/app/api/internal/workspace-runs/launch-claim/route';
import { GET as download } from '@/app/api/workspace-runs/[id]/files/[fileId]/route';
import { scheduleWorkspaceLaunchRecovery } from '@/lib/workspace-runs/server';

const secret = 'workspace-test-secret';
function signedRequest(url: string, body: Record<string, unknown>) {
  const raw = JSON.stringify(body);
  const signature = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return new NextRequest(url, { method: 'POST', body: raw, headers: { 'content-type': 'application/json', 'x-chippy-workspace-signature': signature } });
}

describe('Workspace Run lifecycle behavior', () => {
  beforeEach(() => { process.env.CHIPPI_WORKSPACE_CALLBACK_SECRET = secret; state.eventInsertCalls = 0; state.rpcCalls = []; state.runStatus = 'launching'; send.mockReset(); });

  it('makes a duplicate intermediate callback a lifecycle no-op', async () => {
    const body = { run_id: 'run-1', space_id: 'space-1', sequence: 1, type: 'command_started', message: 'building' };
    expect((await callback(signedRequest('http://localhost/callback', body))).status).toBe(200);
    const duplicate = await callback(signedRequest('http://localhost/callback', body));
    expect(await duplicate.json()).toMatchObject({ ignored: 'duplicate_event' });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it('terminal-fails an invalid completed publication through the terminal RPC', async () => {
    const response = await callback(signedRequest('http://localhost/callback', { run_id: 'run-1', space_id: 'space-1', sequence: 9, type: 'completed', message: 'ready', files: [] }));
    expect(response.status).toBe(409);
    expect(state.rpcCalls).toContainEqual(expect.objectContaining({ name: 'finish_workspace_run_and_session', args: expect.objectContaining({ p_outcome: 'failed', p_sequence: 9 }) }));
  });

  it('returns no download before the parent run has completed', async () => {
    state.runStatus = 'running';
    const response = await download(new NextRequest('http://localhost/file?slug=demo'), { params: Promise.resolve({ id: 'run-1', fileId: 'file-1' }) });
    expect(response.status).toBe(404);
  });

  it('reports the launch-accept winner once and a duplicate thereafter', async () => {
    let winner = true;
    supabase.rpc = async (name: string, args: Record<string, unknown>) => { state.rpcCalls.push({ name, args }); const data = winner; winner = false; return { data, error: null }; };
    const body = { run_id: 'run-1', space_id: 'space-1', launch_token: 'token-1' };
    expect((await claimLaunch(signedRequest('http://localhost/claim', body))).status).toBe(202);
    expect(await (await claimLaunch(signedRequest('http://localhost/claim', body))).json()).toMatchObject({ accepted: true, won: false });
  });

  it('schedules a deduplicated execute recovery after the launch lease', async () => {
    await scheduleWorkspaceLaunchRecovery('session-1', 'run-1', 'token-1');
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ id: 'workspace-launch-recovery:run-1:token-1', name: 'work-session/execute', data: expect.objectContaining({ sessionId: 'session-1', reason: 'launch_lease_recovery' }) }));
    expect(new Date(send.mock.calls[0][0].ts).getTime()).toBeGreaterThan(Date.now() + 120_000);
  });
});
