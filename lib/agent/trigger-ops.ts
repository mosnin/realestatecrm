export function triggerOpsEnabled(): boolean {
  const v = process.env.AGENT_TRIGGER_OPS_ENABLED;
  if (!v) return true;
  const norm = v.trim().toLowerCase();
  return norm === '1' || norm === 'true' || norm === 'yes' || norm === 'on';
}


export function triggerOpsAuthorized(req: Request): boolean {
  const required = process.env.AGENT_TRIGGER_OPS_SECRET?.trim();
  // Fail closed — an unset secret means "ops not provisioned", which is
  // "deny", not "open to everyone". These endpoints clear and replay events.
  if (!required) return false;
  const got = req.headers.get('x-agent-ops-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return got === required;
}
