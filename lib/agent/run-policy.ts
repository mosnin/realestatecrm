import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const RUN_POLICY_HEADER = 'x-chippy-run-policy';
export const RUN_POLICY_AUDIENCE = 'chippy-internal-actions';

export const RUN_MODES = ['interactive', 'unattended', 'voice_control', 'sandbox'] as const;
export type RunMode = (typeof RUN_MODES)[number];

export const RUN_CAPABILITIES = [
  'integration:read',
  'integration:write',
  'team_message:send',
  'task:create_child',
  'task:manage',
  'proposal:decide',
  'sandbox:execute',
] as const;
export type RunCapability = (typeof RUN_CAPABILITIES)[number];

const claimsSchema = z.object({
  v: z.literal(1),
  iss: z.literal('chippy'),
  aud: z.literal(RUN_POLICY_AUDIENCE),
  runId: z.string().uuid(),
  spaceId: z.string().min(1),
  subject: z.string().min(1),
  mode: z.enum(RUN_MODES),
  capabilities: z.array(z.enum(RUN_CAPABILITIES)).max(16),
  parentRunId: z.string().uuid().optional(),
  depth: z.number().int().min(0).max(8).default(0),
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
  nonce: z.string().min(16).max(160),
});

export type RunPolicyClaims = z.infer<typeof claimsSchema>;

export type RunPolicyVerification =
  | { ok: true; claims: RunPolicyClaims }
  | { ok: false; reason: 'missing' | 'misconfigured' | 'invalid' | 'expired' | 'scope_mismatch' };

export type RunPolicyEnforcementMode = 'shadow' | 'enforce';

/**
 * Backward-compatible rollout control. Existing customer flows remain in
 * shadow mode until every trusted caller carries a signed grant. Production
 * enablement must explicitly set `AGENT_RUN_POLICY_MODE=enforce`.
 */
export function runPolicyEnforcementMode(): RunPolicyEnforcementMode {
  const value = process.env.AGENT_RUN_POLICY_MODE;
  if (!value || value === 'shadow') return 'shadow';
  if (value === 'enforce') return 'enforce';
  throw new Error(`Invalid AGENT_RUN_POLICY_MODE: ${value}`);
}

function policySecret(): string | null {
  const secret = process.env.AGENT_RUN_POLICY_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}

function signPayload(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest();
}

export function signRunPolicy(
  input: Omit<RunPolicyClaims, 'v' | 'iss' | 'aud' | 'iat' | 'exp'> & { ttlSeconds?: number },
): string {
  const secret = policySecret();
  if (!secret) throw new Error('AGENT_RUN_POLICY_SECRET is not configured');

  const now = Math.floor(Date.now() / 1000);
  const claims = claimsSchema.parse({
    ...input,
    v: 1,
    iss: 'chippy',
    aud: RUN_POLICY_AUDIENCE,
    iat: now,
    exp: now + Math.max(30, Math.min(input.ttlSeconds ?? 300, 900)),
  });
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${payload}.${signPayload(payload, secret).toString('base64url')}`;
}

export function verifyRunPolicy(
  token: string | null,
  expected: { spaceId: string; requiredCapability?: RunCapability },
): RunPolicyVerification {
  if (!token) return { ok: false, reason: 'missing' };
  const secret = policySecret();
  if (!secret) return { ok: false, reason: 'misconfigured' };

  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return { ok: false, reason: 'invalid' };

  let provided: Buffer;
  try {
    provided = Buffer.from(signature, 'base64url');
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  const expectedSignature = signPayload(payload, secret);
  if (provided.length !== expectedSignature.length || !timingSafeEqual(provided, expectedSignature)) {
    return { ok: false, reason: 'invalid' };
  }

  let claims: RunPolicyClaims;
  try {
    claims = claimsSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
  } catch {
    return { ok: false, reason: 'invalid' };
  }

  if (claims.exp <= Math.floor(Date.now() / 1000)) return { ok: false, reason: 'expired' };
  if (claims.spaceId !== expected.spaceId) return { ok: false, reason: 'scope_mismatch' };
  if (
    expected.requiredCapability &&
    !claims.capabilities.includes(expected.requiredCapability)
  ) {
    return { ok: false, reason: 'scope_mismatch' };
  }
  return { ok: true, claims };
}

/**
 * An unattended run is never allowed to execute an integration action. It can
 * read from an explicit allowlist and must emit an AgentActionProposal for
 * everything else. Interactive/voice runs still need an explicit capability.
 */
export function mayExecuteIntegrationAction(
  claims: RunPolicyClaims,
  actionClass: 'read' | 'write',
): boolean {
  if (actionClass === 'read') return claims.capabilities.includes('integration:read');
  return (
    (claims.mode === 'interactive' ||
      (claims.mode === 'voice_control' && claims.capabilities.includes('proposal:decide'))) &&
    claims.capabilities.includes('integration:write')
  );
}
