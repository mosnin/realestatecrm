/**
 * Detect provider-auth failures across the error shapes emitted by different
 * Composio SDK/API versions. These are stale connections, not server faults.
 */
export function isComposioAuthError(err: unknown): boolean {
  const seen = new Set<object>();

  function matches(value: unknown, depth: number): boolean {
    if (!value || typeof value !== 'object' || depth > 4 || seen.has(value)) return false;
    seen.add(value);

    const e = value as Record<string, unknown>;
    if (e.name === 'ComposioConnectedAccountNotFoundError') return true;
    if (e.statusCode === 401 || e.statusCode === 403 || e.status === 401 || e.status === 403) return true;
    if (e.code === 1810) return true;
    if (typeof e.code === 'string' && e.code.startsWith('CONNECTED_ACCOUNT_')) return true;
    if (e.slug === 'ActionExecute_ConnectedAccountNotFound') return true;
    if (typeof e.message === 'string' && /no connected account found/i.test(e.message)) return true;

    return matches(e.cause, depth + 1) || matches(e.error, depth + 1);
  }

  return matches(err, 0);
}
