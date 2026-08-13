import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isWorkspaceRunRecoveryEnabled,
  isWorkspaceRunTaskRecoveryEnabledForSpace,
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

  it('keeps periodic task repair independently default-off and allowlisted', () => {
    vi.stubEnv('CHIPPI_WORKSPACE_RUNS_ENABLED', 'true');
    vi.stubEnv('NEXT_PUBLIC_CHIPPI_WORKSPACE_RUNS_ENABLED', 'true');
    vi.stubEnv('CHIPPI_WORKSPACE_RUNS_SPACE_IDS', 'space-a,space-b');
    vi.stubEnv('CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_ENABLED', 'true');
    vi.stubEnv('NEXT_PUBLIC_CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_ENABLED', 'true');
    vi.stubEnv('CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_SPACE_IDS', 'space-b');

    expect(isWorkspaceRunTaskRecoveryEnabledForSpace('space-b')).toBe(false);
    vi.stubEnv('CHIPPI_WORKSPACE_RUN_TASK_RECOVERY_ENABLED', 'true');
    expect(isWorkspaceRunTaskRecoveryEnabledForSpace('space-b')).toBe(true);
    expect(isWorkspaceRunTaskRecoveryEnabledForSpace('space-a')).toBe(false);
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
