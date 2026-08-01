import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isWorkspaceRunRecoveryEnabled,
  isWorkspaceRunsEnabledForSpace,
  workspaceRunEnabledSpaceIds,
} from '@/lib/chippi/workspace-run-flag';

afterEach(() => vi.unstubAllEnvs());

describe('Workspace Run rollout flags', () => {
  it('returns a trimmed, deduplicated allowlist only when both product gates are on', () => {
    vi.stubEnv('CHIPPI_WORKSPACE_RUNS_ENABLED', 'true');
    vi.stubEnv('NEXT_PUBLIC_CHIPPI_WORKSPACE_RUNS_ENABLED', 'true');
    vi.stubEnv('CHIPPI_WORKSPACE_RUNS_SPACE_IDS', ' space-b,space-a,space-b,, ');

    expect(workspaceRunEnabledSpaceIds()).toEqual(['space-b', 'space-a']);
    expect(isWorkspaceRunsEnabledForSpace('space-a')).toBe(true);
    expect(isWorkspaceRunsEnabledForSpace('space-c')).toBe(false);

    vi.stubEnv('NEXT_PUBLIC_CHIPPI_WORKSPACE_RUNS_ENABLED', 'false');
    expect(workspaceRunEnabledSpaceIds()).toEqual([]);
  });

  it('keeps recovery off unless the server, client, and recovery gates are exact', () => {
    vi.stubEnv('CHIPPI_WORKSPACE_RUNS_ENABLED', 'true');
    vi.stubEnv('NEXT_PUBLIC_CHIPPI_WORKSPACE_RUNS_ENABLED', 'true');
    vi.stubEnv('CHIPPI_WORKSPACE_RUN_RECOVERY_ENABLED', 'true');
    expect(isWorkspaceRunRecoveryEnabled()).toBe(true);

    vi.stubEnv('NEXT_PUBLIC_CHIPPI_WORKSPACE_RUNS_ENABLED', 'false');
    expect(isWorkspaceRunRecoveryEnabled()).toBe(false);
  });
});
