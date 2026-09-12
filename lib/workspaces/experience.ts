/** Human collaboration is optional; it never gates the personal AI workforce. */
export function workspaceExperience(workspaceCount: number, directoryUnavailable = false) {
  return { canSwitch: workspaceCount > 1 || directoryUnavailable };
}

/** Honor the requested job without changing the person's account or memberships. */
export function accountLanding({ intent, personalSlug, hasBrokerAccess, brokerOnly }: {
  intent?: string; personalSlug?: string | null; hasBrokerAccess: boolean; brokerOnly: boolean;
}): string {
  if (intent === 'broker') return hasBrokerAccess || brokerOnly ? '/broker' : '/brokerage';
  if (personalSlug) return `/s/${encodeURIComponent(personalSlug)}/chippi/brief`;
  if (hasBrokerAccess || brokerOnly) return '/broker';
  return '/setup';
}
