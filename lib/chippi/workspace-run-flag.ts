export function isWorkspaceRunsEnabled(): boolean { return process.env.CHIPPI_WORKSPACE_RUNS_ENABLED === 'true'; }
export function isWorkspaceRunsClientEnabled(): boolean { return process.env.NEXT_PUBLIC_CHIPPI_WORKSPACE_RUNS_ENABLED === 'true'; }
export function isWorkspaceRunsEnabledForSpace(spaceId: string): boolean {
  if (!isWorkspaceRunsEnabled() || !isWorkspaceRunsClientEnabled()) return false;
  return (process.env.CHIPPI_WORKSPACE_RUNS_SPACE_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean).includes(spaceId);
}
