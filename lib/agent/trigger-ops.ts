export function triggerOpsEnabled(): boolean {
  const v = process.env.AGENT_TRIGGER_OPS_ENABLED;
  if (!v) return true;
  const norm = v.trim().toLowerCase();
  return norm === '1' || norm === 'true' || norm === 'yes' || norm === 'on';
}


export function triggerOpsAuthorized(req: Request): boolean {
  const required = process.env.AGENT_TRIGGER_OPS_SECRET?.trim();
  if (!required) return true;
  const got = req.headers.get('x-agent-ops-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return got === required;
}
