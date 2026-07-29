/**
 * Research Workspace is an additive, customer-visible vertical slice. It is
 * deliberately dark unless BOTH server and client flags are set at deploy
 * time; a local branch must never create a cloud browser by accident.
 */
export function isResearchWorkspaceEnabled(): boolean {
  return process.env.CHIPPI_RESEARCH_WORKSPACE_ENABLED === 'true';
}

/** Default deny: a global switch alone can never expose a canary feature to
 * every paying workspace. Comma-separated IDs are intentionally explicit. */
export function isResearchWorkspaceEnabledForSpace(spaceId: string): boolean {
  if (!isResearchWorkspaceEnabled() || !isResearchWorkspaceClientEnabled()) return false;
  const allowed = (process.env.CHIPPI_RESEARCH_WORKSPACE_SPACE_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return allowed.includes(spaceId);
}

export function isResearchWorkspaceClientEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CHIPPI_RESEARCH_WORKSPACE_ENABLED === 'true';
}
