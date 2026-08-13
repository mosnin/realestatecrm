import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  recoveryEnabled: false,
  spaceEnabled: false,
  receiptError: null as Error | null,
  eventError: null as Error | null,
  tables: [] as string[],
}));

function chain(result: { data: unknown; error: Error | null }): any {
  const query: any = {
    eq: () => query,
    in: () => query,
    order: () => query,
    limit: () => query,
    maybeSingle: async () => result,
    single: async () => result,
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      mocks.tables.push(table);
      const result = table === 'WorkspaceRun'
        ? { data: { id: 'run-1', status: 'launching', goal: 'Prepare a packet' }, error: null }
        : table === 'WorkspaceRunEvent'
          ? { data: [], error: mocks.eventError }
          : table === 'WorkspaceRunLaunchReceipt'
            ? { data: [], error: mocks.receiptError }
            : { data: [], error: null };
      return { select: () => chain(result) };
    },
  },
}));
vi.mock('@/lib/chippi/workspace-run-flag', () => ({
  isWorkspaceRunRecoveryEnabled: () => mocks.recoveryEnabled,
  isWorkspaceRunsEnabledForSpace: () => mocks.spaceEnabled,
}));
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn() } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('@/lib/storage', () => ({ getObjectText: vi.fn() }));
vi.mock('@/lib/llm', () => ({ getLLMClient: vi.fn() }));

import { getWorkspaceRun } from '@/lib/workspace-runs/server';

describe('Workspace Run launch-receipt reads', () => {
  beforeEach(() => {
    mocks.recoveryEnabled = false;
    mocks.spaceEnabled = false;
    mocks.receiptError = null;
    mocks.eventError = null;
    mocks.tables = [];
  });

  it('does not query the rollout table while durable recovery is feature-off', async () => {
    await expect(getWorkspaceRun('run-1', 'space-1')).resolves.toMatchObject({
      id: 'run-1',
      launchReceipts: [],
    });
    expect(mocks.tables).not.toContain('WorkspaceRunLaunchReceipt');
  });

  it('does not expose receipts outside the explicit space allowlist', async () => {
    mocks.recoveryEnabled = true;
    mocks.spaceEnabled = false;
    await expect(getWorkspaceRun('run-1', 'space-disabled')).resolves.toMatchObject({
      launchReceipts: [],
    });
    expect(mocks.tables).not.toContain('WorkspaceRunLaunchReceipt');
  });

  it('surfaces receipt and existing dependency failures instead of empty-state masking', async () => {
    mocks.recoveryEnabled = true;
    mocks.spaceEnabled = true;
    mocks.receiptError = new Error('launch receipt migration unavailable');
    await expect(getWorkspaceRun('run-1', 'space-1')).rejects.toThrow(
      'launch receipt migration unavailable',
    );

    mocks.receiptError = null;
    mocks.eventError = new Error('workspace event query failed');
    await expect(getWorkspaceRun('run-1', 'space-1')).rejects.toThrow(
      'workspace event query failed',
    );
  });
});
