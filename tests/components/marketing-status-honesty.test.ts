import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('public status honesty', () => {
  it('uses verified Composio delivery readiness instead of credential presence', () => {
    const source = readFileSync('app/(marketing)/status/page.tsx', 'utf8');

    expect(source).toContain('getComposioReadinessStatus');
    expect(source).not.toContain('composioConfigured');
    expect(source).toContain("if (status === 'degraded') return 'degraded'");
    expect(source).toContain("return 'unknown'");
  });

  it('does not present agent configuration as live service health', () => {
    const source = readFileSync('app/(marketing)/status/page.tsx', 'utf8');
    const agentProbe = source.slice(
      source.indexOf('function checkAgent'),
      source.indexOf('/**\n * Integrations ride on Composio'),
    );

    expect(agentProbe).toContain("return 'unknown'");
    expect(agentProbe).not.toContain("return 'operational'");
    expect(source).not.toContain('hasLLMKey');
  });
});
