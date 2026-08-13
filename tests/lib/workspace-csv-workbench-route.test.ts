import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  enabled: vi.fn(),
  rate: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  signed: vi.fn(),
  workbenchEnabled: true,
  followUpsEnabled: true,
}));
vi.mock('@/lib/api-auth', () => ({ requireSpaceOwner: mocks.auth }));
vi.mock('@/lib/agent/kill-switch', () => ({ assertSpaceEnabled: mocks.enabled }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mocks.rate }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock('@/lib/storage', () => ({ getSignedDownloadUrl: mocks.signed }));
vi.mock('@/lib/chippi/workbench-flag', () => ({ isWorkbenchEnabled: () => mocks.workbenchEnabled }));
vi.mock('@/lib/chippi/workspace-run-flag', () => ({ isWorkspaceRunFollowUpsEnabledForSpace: () => mocks.followUpsEnabled }));

import { POST } from '@/app/api/workspace-runs/[id]/files/[fileId]/workbench/route';

const csv = Buffer.from('address,list_price\n1 Main St,900000\n');
type Scenario = {
  run: Record<string, unknown> | null;
  root: Record<string, unknown> | null;
  taskFile: Record<string, unknown> | null;
  task: Record<string, unknown> | null;
  file: Record<string, unknown> | null;
  mapping: Record<string, unknown> | null;
  artifact: Record<string, unknown> | null;
  version: Record<string, unknown> | null;
};
let scenario: Scenario;
let filters: Array<{ table: string; column: string; value: unknown }>;
let errorTable: string | null;

function installDb() {
  mocks.from.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn((column: string, value: unknown) => {
      filters.push({ table, column, value });
      return chain;
    });
    chain.maybeSingle = vi.fn(async () => ({
      data: table === 'WorkspaceRun' ? scenario.run
        : table === 'WorkspaceRunFile' ? scenario.root
        : table === 'WorkspaceRunTaskFile' ? scenario.taskFile
        : table === 'WorkspaceRunTask' ? scenario.task
        : table === 'File' ? scenario.file
        : table === 'WorkspaceWorkbookSource' ? scenario.mapping
        : table === 'Artifact' ? scenario.artifact
        : table === 'ArtifactVersion' ? scenario.version
        : null,
      error: errorTable === table ? { message: 'database unavailable' } : null,
    }));
    return chain;
  });
}

const request = (sourceKind: string = 'root') => new NextRequest(`http://localhost/api/workspace-runs/run-1/files/membership-1/workbench?slug=alpha&sourceKind=${sourceKind}`, { method: 'POST' });
const params = { params: Promise.resolve({ id: 'run-1', fileId: 'membership-1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  filters = [];
  errorTable = null;
  mocks.workbenchEnabled = true;
  mocks.followUpsEnabled = true;
  mocks.auth.mockResolvedValue({ userId: 'user-1', space: { id: 'space-1' } });
  mocks.enabled.mockResolvedValue(undefined);
  mocks.rate.mockResolvedValue({ allowed: true });
  mocks.signed.mockResolvedValue('https://signed.example/private.csv');
  mocks.rpc.mockResolvedValue({ data: [{ artifact_id: 'artifact-1', version_number: 1, created: true }], error: null });
  scenario = {
    run: { id: 'run-1', status: 'completed' },
    root: { id: 'membership-1', fileId: 'file-1', name: 'comps.csv', mimeType: 'text/csv', sizeBytes: csv.length },
    taskFile: null,
    task: null,
    file: { id: 'file-1', name: 'comps.csv', mimeType: 'text/csv', sizeBytes: csv.length, storageKey: 'files/space-1/private.csv' },
    mapping: null,
    artifact: null,
    version: null,
  };
  installDb();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(csv)));
});

describe('completed workspace CSV to Workbench route', () => {
  it.each([
    ['Workbench', () => { mocks.workbenchEnabled = false; }],
    ['workspace follow-ups', () => { mocks.followUpsEnabled = false; }],
  ])('stays undiscoverable while %s are disabled', async (_label, disable) => {
    disable();
    const response = await POST(request(), params);
    expect(response.status).toBe(404);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('blocks a disabled authenticated space before lookup or egress', async () => {
    mocks.enabled.mockRejectedValueOnce(new Error('disabled'));
    const response = await POST(request(), params);
    expect(response.status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.signed).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rate limits before lookup or egress', async () => {
    mocks.rate.mockResolvedValueOnce({ allowed: false });
    const response = await POST(request(), params);
    expect(response.status).toBe(429);
    expect(mocks.enabled).not.toHaveBeenCalled();
    expect(mocks.signed).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('requires an explicit closed source kind', async () => {
    const response = await POST(request('ambiguous'), params);
    expect(response.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('rejects incomplete runs before looking up any membership', async () => {
    scenario.run = { id: 'run-1', status: 'running' };
    const response = await POST(request(), params);
    expect(response.status).toBe(404);
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it('requires exact tenant-scoped completed task membership', async () => {
    scenario.taskFile = { id: 'membership-1', fileId: 'file-1', taskId: 'task-1', name: 'workspace-comps-1.csv', mimeType: 'text/csv', sizeBytes: csv.length };
    scenario.task = null;
    const response = await POST(request('task'), params);
    expect(response.status).toBe(404);
    expect(filters).toEqual(expect.arrayContaining([
      { table: 'WorkspaceRun', column: 'spaceId', value: 'space-1' },
      { table: 'WorkspaceRunTaskFile', column: 'spaceId', value: 'space-1' },
      { table: 'WorkspaceRunTask', column: 'status', value: 'completed' },
    ]));
    expect(mocks.from).not.toHaveBeenCalledWith('WorkspaceRunFile');
    expect(mocks.signed).not.toHaveBeenCalled();
  });

  it('cannot select a colliding root membership when task was explicitly requested', async () => {
    scenario.root = { id: 'membership-1', fileId: 'wrong-file', name: 'wrong.csv', mimeType: 'text/csv', sizeBytes: csv.length };
    scenario.taskFile = { id: 'membership-1', fileId: 'file-1', taskId: 'task-1', name: 'workspace-comps-1.csv', mimeType: 'text/csv', sizeBytes: csv.length };
    scenario.task = { id: 'task-1' };
    scenario.file = { id: 'file-1', name: 'workspace-comps-1.csv', mimeType: 'text/csv', sizeBytes: csv.length, storageKey: 'files/space-1/task.csv' };
    const response = await POST(request('task'), params);
    expect(response.status).toBe(200);
    expect(mocks.from).not.toHaveBeenCalledWith('WorkspaceRunFile');
    expect(mocks.signed).toHaveBeenCalledWith('files/space-1/task.csv', 300);
  });

  it.each([
    ['text/plain', 'workspace-comps-1.csv'],
    ['text/csv', 'workspace-report-1.md'],
  ])('accepts CSV only, not %s %s', async (mimeType, name) => {
    scenario.root = { ...scenario.root, mimeType, name };
    const response = await POST(request(), params);
    expect(response.status).toBe(400);
    expect(mocks.signed).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('uses only server-resolved task identity and returns the atomic RPC artifact', async () => {
    scenario.taskFile = { id: 'membership-1', fileId: 'file-1', taskId: 'task-1', name: 'workspace-comps-1.csv', mimeType: 'text/csv', sizeBytes: csv.length };
    scenario.task = { id: 'task-1' };
    scenario.file = { id: 'file-1', name: 'workspace-comps-1.csv', mimeType: 'text/csv', sizeBytes: csv.length, storageKey: 'files/space-1/server-derived.csv' };
    const response = await POST(request('task'), params);
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('create_workspace_workbook_artifact', expect.objectContaining({
      p_space_id: 'space-1',
      p_run_id: 'run-1',
      p_workspace_run_file_id: null,
      p_workspace_run_task_file_id: 'membership-1',
      p_content: expect.stringContaining('"membershipKind":"task"'),
    }));
  });

  it('reuses an existing validated mapping without storage egress or parsing', async () => {
    scenario.mapping = { artifactId: 'existing-artifact', sourceFileId: 'file-1' };
    scenario.artifact = { id: 'existing-artifact', currentVersionId: 'version-3' };
    scenario.version = { versionNumber: 3 };
    const response = await POST(request(), params);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ artifactId: 'existing-artifact', versionNumber: 3, created: false });
    expect(mocks.signed).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('fails closed if File metadata does not match its completed membership', async () => {
    scenario.file = { ...scenario.file, name: 'different.csv' };
    const response = await POST(request(), params);
    expect(response.status).toBe(404);
    expect(mocks.signed).not.toHaveBeenCalled();
  });

  it.each([
    ['WorkspaceRun', 'root'],
    ['WorkspaceRunFile', 'root'],
    ['WorkspaceRunTaskFile', 'task'],
    ['WorkspaceRunTask', 'task'],
    ['File', 'root'],
    ['WorkspaceWorkbookSource', 'root'],
    ['Artifact', 'root'],
    ['ArtifactVersion', 'root'],
  ])('maps a %s query failure to generic 500 without egress', async (table, kind) => {
    if (kind === 'task') {
      scenario.taskFile = { id: 'membership-1', fileId: 'file-1', taskId: 'task-1', name: 'workspace-comps-1.csv', mimeType: 'text/csv', sizeBytes: csv.length };
      scenario.task = { id: 'task-1' };
      scenario.file = { id: 'file-1', name: 'workspace-comps-1.csv', mimeType: 'text/csv', sizeBytes: csv.length, storageKey: 'task.csv' };
    }
    if (table === 'Artifact' || table === 'ArtifactVersion') {
      scenario.mapping = { artifactId: 'existing-artifact', sourceFileId: 'file-1' };
      scenario.artifact = { id: 'existing-artifact', currentVersionId: 'version-1' };
      scenario.version = { versionNumber: 1 };
    }
    errorTable = table;
    const response = await POST(request(kind), params);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Could not validate the workspace file.' });
    expect(mocks.signed).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
