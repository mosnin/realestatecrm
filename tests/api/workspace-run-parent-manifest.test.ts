import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { state, supabase, uploadObject } = vi.hoisted(() => {
  const state = {
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  };
  const run = {
    id: 'run-1',
    workSessionId: 'session-1',
    status: 'running',
    launchToken: 'token-1',
    cancellationRequestedAt: null,
  };
  const chain = (result: unknown): any => ({
    eq: () => chain(result),
    maybeSingle: async () => result,
  });
  const supabase: any = {
    from(table: string) {
      if (table === 'WorkspaceRun') {
        return { select: () => chain({ data: run, error: null }) };
      }
      if (table === 'Space') {
        return { select: () => chain({ data: { ownerId: 'user-1' }, error: null }) };
      }
      if (table === 'User') {
        return { select: () => chain({ data: { clerkId: 'clerk-1' }, error: null }) };
      }
      throw new Error(`Unexpected table ${table}`);
    },
    async rpc(name: string, args: Record<string, unknown>) {
      state.rpcCalls.push({ name, args });
      return { data: true, error: null };
    },
  };
  return {
    state,
    supabase,
    uploadObject: vi.fn(async (_input: {
      key: string;
      body: Buffer;
      contentType: string;
      isPublic: boolean;
    }) => undefined),
  };
});

vi.mock('@/lib/supabase', () => ({ supabase }));
vi.mock('@/lib/storage', () => ({
  buildKey: (_category: string, _spaceId: string, name: string) => `private/${name}`,
  uploadObject,
}));

import { POST } from '@/app/api/internal/workspace-runs/callback/route';

const secret = 'parent-manifest-test-secret';
const expectedNames = ['brief.md', 'launch-checklist.md', 'comps.csv', 'handoff.md'] as const;

type ManifestFile = { name: string; content: string; mimeType?: string };

function validManifest(): ManifestFile[] {
  return [
    { name: 'brief.md', content: Buffer.from('# Listing brief\n').toString('base64') },
    { name: 'launch-checklist.md', content: Buffer.from('# Launch checklist\n').toString('base64') },
    { name: 'comps.csv', content: Buffer.from('address,list_price\n1 Main,700000\n').toString('base64') },
    { name: 'handoff.md', content: Buffer.from('# Handoff\n').toString('base64') },
  ];
}

function request(files: ManifestFile[]) {
  const raw = JSON.stringify({
    run_id: 'run-1',
    space_id: 'space-1',
    launch_token: 'token-1',
    sequence: 9,
    type: 'completed',
    message: 'ready',
    files,
  });
  const signature = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return new NextRequest('http://localhost/api/internal/workspace-runs/callback', {
    method: 'POST',
    body: raw,
    headers: {
      'content-type': 'application/json',
      'x-chippy-workspace-signature': signature,
    },
  });
}

describe('parent WorkspaceRun completion manifest', () => {
  beforeEach(() => {
    process.env.CHIPPI_WORKSPACE_CALLBACK_SECRET = secret;
    state.rpcCalls = [];
    uploadObject.mockClear();
  });
  afterEach(() => {
    delete process.env.CHIPPI_WORKSPACE_CALLBACK_SECRET;
  });

  it('accepts exactly the four runtime files and derives their MIME types', async () => {
    const response = await POST(request(validManifest()));

    expect(response.status).toBe(200);
    expect(uploadObject).toHaveBeenCalledTimes(4);
    expect(uploadObject.mock.calls.map(([input]) => input.contentType)).toEqual([
      'text/markdown; charset=utf-8',
      'text/markdown; charset=utf-8',
      'text/csv; charset=utf-8',
      'text/markdown; charset=utf-8',
    ]);
    const finish = state.rpcCalls.find(({ name }) => name === 'finish_workspace_run_and_session');
    expect(finish?.args).toMatchObject({
      p_outcome: 'completed',
      p_files: expectedNames.map((name) => ({
        name,
        mimeType: name === 'comps.csv' ? 'text/csv' : 'text/markdown',
      })),
    });
  });

  it.each([
    ['malformed base64', () => validManifest().map((file, index) => index === 3 ? { ...file, content: '%%%' } : file)],
    ['empty content', () => validManifest().map((file, index) => index === 3 ? { ...file, content: '' } : file)],
    ['noncanonical padding', () => validManifest().map((file, index) => index === 3 ? { ...file, content: 'YR==' } : file)],
    ['invalid UTF-8', () => validManifest().map((file, index) => index === 3 ? { ...file, content: Buffer.from([0xc3, 0x28]).toString('base64') } : file)],
    ['duplicate name', () => [...validManifest().slice(0, 3), validManifest()[0]]],
    ['missing file', () => validManifest().slice(0, 3)],
    ['extra file', () => [...validManifest(), { name: 'extra.md', content: Buffer.from('extra').toString('base64') }]],
    ['oversize content', () => validManifest().map((file, index) => index === 3 ? { ...file, content: Buffer.alloc(32_001, 0x61).toString('base64') } : file)],
    ['wrong declared MIME', () => validManifest().map((file, index) => index === 2 ? { ...file, mimeType: 'text/markdown' } : file)],
  ])('rejects %s before uploading any object', async (_label, buildFiles) => {
    const response = await POST(request(buildFiles()));

    expect(response.status).toBe(409);
    expect(uploadObject).not.toHaveBeenCalled();
    expect(state.rpcCalls).toContainEqual(expect.objectContaining({
      name: 'finish_workspace_run_and_session',
      args: expect.objectContaining({ p_outcome: 'failed', p_launch_token: 'token-1' }),
    }));
  });
});
