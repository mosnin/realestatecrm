export function isWorkspaceRunsEnabled(): boolean { return process.env.CHIPPI_WORKSPACE_RUNS_ENABLED === 'true'; }
export function isWorkspaceRunsClientEnabled(): boolean { return process.env.NEXT_PUBLIC_CHIPPI_WORKSPACE_RUNS_ENABLED === 'true'; }
export function isWorkspaceRunsEnabledForSpace(spaceId: string): boolean {
  return workspaceRunEnabledSpaceIds().includes(spaceId);
}
export function workspaceRunEnabledSpaceIds(): string[] {
  if (!isWorkspaceRunsEnabled() || !isWorkspaceRunsClientEnabled()) return [];
  return [...new Set(
    (process.env.CHIPPI_WORKSPACE_RUNS_SPACE_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  )];
}

/** Server-only recovery rollout. This never broadens the per-space Workspace
 * allowlist; it only lets the durable sweeper inspect already-eligible runs. */
export function isWorkspaceRunRecoveryEnabled(): boolean {
  return process.env.CHIPPI_WORKSPACE_RUN_RECOVERY_ENABLED === 'true'
    && isWorkspaceRunsEnabled()
    && isWorkspaceRunsClientEnabled();
}

/** Follow-up terminal work is a second, narrower rollout on top of Workspace
 * Runs. Keeping its own server + public switches means a space can use the
 * established packet flow without being offered continuation work. */
export function isWorkspaceRunFollowUpsEnabledForSpace(spaceId: string): boolean {
  return workspaceRunFollowUpEnabledSpaceIds().includes(spaceId);
}

export function workspaceRunFollowUpEnabledSpaceIds(): string[] {
  if (process.env.CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_ENABLED !== 'true') return [];
  if (process.env.NEXT_PUBLIC_CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_ENABLED !== 'true') return [];
  const baseEnabled = new Set(workspaceRunEnabledSpaceIds());
  return [...new Set(
    (process.env.CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_SPACE_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0 && baseEnabled.has(id)),
  )];
}

/** Periodic task repair is a separate server-only rollout. Follow-up product
 * enablement alone does not authorize the scanner to wake committed work. */
export function workspaceRunTaskRecoveryEnabledSpaceIds(): string[] {
  if (process.env.CHIPPI_WORKSPACE_RUN_TASK_RECOVERY_ENABLED !== 'true') return [];
  return workspaceRunFollowUpEnabledSpaceIds();
}

export function isWorkspaceRunTaskRecoveryEnabledForSpace(spaceId: string): boolean {
  return workspaceRunTaskRecoveryEnabledSpaceIds().includes(spaceId);
}
