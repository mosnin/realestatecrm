import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  const state = {
    task: {
      id: 'task-1',
      runId: 'run-1',
      sequence: 2,
      status: 'running',
      launchToken: 'token-current',
      modalAcceptedAt: '2026-08-12T12:00:00.000Z' as string | null,
      cancellationRequestedAt: null as string | null,
      executionPlan: {
        summary: 'Grounded continuation',
        title: 'Private review',
        evidence: [{ file: 'brief.md', quote: 'Seller prefers Thursday.' }],
        nextSteps: ['Review the report'],
      },
    },
    taskLookupError: null as Error | null,
    eventResult: 'recorded',
    finishResult: true,
    finishError: null as Error | null,
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    directEventInserts: 0,
  };
  const chain = (result: () => unknown): any => ({
    eq: () => chain(result),
    select: () => chain(result),
    maybeSingle: async () => result(),
  });
  const supabase = {
    from(table: string) {
      if (table === 'WorkspaceRunTask') {
        return {
          select: () => chain(() => ({
            data: state.taskLookupError ? null : { ...state.task },
            error: state.taskLookupError,
          })),
        };
      }
      if (table === 'WorkspaceRunTaskEvent') {
        return {
          insert: () => ({
            select: () => ({
              maybeSingle: async () => {
                state.directEventInserts += 1;
                return { data: { id: 'event-direct' }, error: null };
              },
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
    async rpc(name: string, args: Record<string, unknown>) {
      state.rpcCalls.push({ name, args });
      if (name === 'record_workspace_run_task_event') return { data: state.eventResult, error: null };
      if (name === 'finish_workspace_run_task') return { data: state.finishResult, error: state.finishError };
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
  return { state, supabase, uploadObject: vi.fn() };
});

vi.mock('@/lib/supabase', () => ({ supabase: mocks.supabase }));
vi.mock('@/lib/storage', () => ({
  buildKey: () => 'private/task-artifact',
  uploadObject: mocks.uploadObject,
}));

import { POST as callback } from '@/app/api/internal/workspace-runs/tasks/callback/route';

const secret = 'task-callback-test-secret';
function signedRequest(body: Record<string, unknown>) {
  const raw = JSON.stringify(body);
  const signature = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return new NextRequest('http://localhost/api/internal/workspace-runs/tasks/callback', {
    method: 'POST',
    body: raw,
    headers: {
      'content-type': 'application/json',
      'x-chippy-workspace-signature': signature,
    },
  });
}

const event = (overrides: Record<string, unknown> = {}) => ({
  task_id: 'task-1',
  space_id: 'space-1',
  launch_token: 'token-current',
  sequence: 1,
  type: 'command_started',
  message: 'Building the private report.',
  ...overrides,
});

describe('WorkspaceRunTask callback launch-token fence', () => {
  beforeEach(() => {
    process.env.CHIPPI_WORKSPACE_CALLBACK_SECRET = secret;
    mocks.state.task.status = 'running';
    mocks.state.task.launchToken = 'token-current';
    mocks.state.task.modalAcceptedAt = '2026-08-12T12:00:00.000Z';
    mocks.state.task.cancellationRequestedAt = null;
    mocks.state.taskLookupError = null;
    mocks.state.eventResult = 'recorded';
    mocks.state.finishResult = true;
    mocks.state.finishError = null;
    mocks.state.rpcCalls = [];
    mocks.state.directEventInserts = 0;
    mocks.uploadObject.mockReset();
    mocks.uploadObject.mockResolvedValue(undefined);
  });

  it('requires a launch token in every callback body', async () => {
    const response = await callback(signedRequest(event({ launch_token: undefined })));

    expect(response.status).toBe(400);
    expect(mocks.state.rpcCalls).toHaveLength(0);
    expect(mocks.state.directEventInserts).toBe(0);
  });

  it('stops a stale event token before callback persistence', async () => {
    const response = await callback(signedRequest(event({ launch_token: 'token-stale' })));

    expect(await response.json()).toMatchObject({
      ignored: 'stale_launch',
      cancellationRequested: true,
    });
    expect(mocks.state.rpcCalls).toHaveLength(0);
    expect(mocks.state.directEventInserts).toBe(0);
  });

  it('rejects callbacks before Modal has accepted the current launch', async () => {
    mocks.state.task.modalAcceptedAt = null;

    const response = await callback(signedRequest(event()));

    expect(response.status).toBe(409);
    expect(mocks.state.rpcCalls).toHaveLength(0);
    expect(mocks.state.directEventInserts).toBe(0);
  });

  it('persists a current event atomically through the token-fenced RPC', async () => {
    const response = await callback(signedRequest(event({ type: 'file_created' })));

    expect(response.status).toBe(200);
    expect(mocks.state.rpcCalls).toContainEqual({
      name: 'record_workspace_run_task_event',
      args: expect.objectContaining({
        p_task_id: 'task-1',
        p_space_id: 'space-1',
        p_launch_token: 'token-current',
        p_sequence: 1,
        p_type: 'file_created',
      }),
    });
    expect(mocks.state.directEventInserts).toBe(0);
  });

  it('treats a replay from the current token as an idempotent duplicate', async () => {
    mocks.state.eventResult = 'duplicate_event';

    const response = await callback(signedRequest(event()));

    expect(await response.json()).toMatchObject({ ok: true, ignored: 'duplicate_event' });
    expect(mocks.state.rpcCalls).toHaveLength(1);
  });

  it('honors an atomic stale-token result without a second persistence path', async () => {
    mocks.state.eventResult = 'stale_launch';

    const response = await callback(signedRequest(event()));

    expect(await response.json()).toMatchObject({
      ignored: 'stale_launch',
      cancellationRequested: true,
    });
    expect(mocks.state.directEventInserts).toBe(0);
  });

  it('does not upload or finish a completed callback from a stale token', async () => {
    const response = await callback(signedRequest(event({
      launch_token: 'token-stale',
      sequence: 9,
      type: 'completed',
      files: [{
        name: 'workspace-follow-up-2.md',
        content: Buffer.from('# Private report\n').toString('base64'),
      }],
    })));

    expect(await response.json()).toMatchObject({ ignored: 'stale_launch' });
    expect(mocks.uploadObject).not.toHaveBeenCalled();
    expect(mocks.state.rpcCalls).toHaveLength(0);
  });

  it('passes the current token into terminal file persistence', async () => {
    const response = await callback(signedRequest(event({
      sequence: 9,
      type: 'completed',
      output: 'Private report ready.',
      files: [{
        name: 'workspace-follow-up-2.md',
        content: Buffer.from('# Private report\n').toString('base64'),
      }],
    })));

    expect(response.status).toBe(200);
    expect(mocks.uploadObject).toHaveBeenCalledTimes(1);
    expect(mocks.state.rpcCalls).toContainEqual({
      name: 'finish_workspace_run_task',
      args: expect.objectContaining({
        p_task_id: 'task-1',
        p_space_id: 'space-1',
        p_launch_token: 'token-current',
        p_outcome: 'completed',
      }),
    });
  });

  it('returns a retryable error when terminal failure persistence is unavailable', async () => {
    mocks.state.finishError = new Error('database unavailable');
    const response = await callback(signedRequest(event({
      sequence: 9,
      type: 'completed',
      files: [],
    })));

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: 'Workspace continuation terminal update failed.' });
  });
});
