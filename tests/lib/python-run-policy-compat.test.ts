import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { verifyRunPolicy } from '@/lib/agent/run-policy';

const SECRET = 'python-ts-run-policy-compatibility-secret-32-bytes';
const RUN_ID = 'fd73b2c4-afbd-4822-bb81-e01e04c5bcce';

function issueWithPython(): string {
  const script = [
    'import sys',
    "sys.path.insert(0, 'agent')",
    'from security.run_policy import issue_run_policy',
    `print(issue_run_policy(run_id='${RUN_ID}', space_id='space-1', subject='user-1', mode='interactive', capabilities=['integration:read']))`,
  ].join('; ');
  return execFileSync('python3', ['-c', script], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH ?? '',
      NODE_ENV: process.env.NODE_ENV ?? 'test',
      AGENT_RUN_POLICY_SECRET: SECRET,
    },
    encoding: 'utf8',
  }).trim();
}

beforeEach(() => vi.stubEnv('AGENT_RUN_POLICY_SECRET', SECRET));
afterEach(() => vi.unstubAllEnvs());

describe('Python-to-TypeScript run-policy compatibility', () => {
  it('accepts a Python-minted narrow grant at the TypeScript verifier', () => {
    const token = issueWithPython();
    const [payload, signature] = token.split('.');
    expect(payload).toBeTruthy();
    expect(signature).toBeTruthy();
    expect(createHmac('sha256', SECRET).update(payload!).digest('base64url')).toBe(signature);
    const verified = verifyRunPolicy(token, {
      spaceId: 'space-1',
      requiredCapability: 'integration:read',
    });

    expect(verified).toMatchObject({
      ok: true,
      claims: {
        runId: RUN_ID,
        subject: 'user-1',
        mode: 'interactive',
        capabilities: ['integration:read'],
      },
    });
  });
});
