import { describe, it, expect, afterEach } from 'vitest';
import { isAllowedOAuthRedirect } from '@/lib/mcp/redirect-allowlist';

/**
 * The OAuth redirect allowlist is the gate that stops an authorization code (or
 * an access_denied + state) from being handed to an attacker-controlled origin.
 * These cases pin the invariant both legs of the flow depend on.
 */
describe('isAllowedOAuthRedirect', () => {
  const originalEnv = process.env.NODE_ENV;
  afterEach(() => {
    // Restore whatever the runner set; NODE_ENV is read inside the function.
    process.env.NODE_ENV = originalEnv;
  });

  it('allows the Claude callback hosts over https', () => {
    expect(isAllowedOAuthRedirect('https://claude.ai/api/mcp/callback')).toBe(true);
    expect(isAllowedOAuthRedirect('https://www.claude.ai/callback')).toBe(true);
  });

  it('rejects an arbitrary attacker host', () => {
    expect(isAllowedOAuthRedirect('https://evil.example.com/steal')).toBe(false);
  });

  it('rejects a look-alike subdomain and suffix tricks', () => {
    expect(isAllowedOAuthRedirect('https://claude.ai.evil.com/x')).toBe(false);
    expect(isAllowedOAuthRedirect('https://notclaude.ai/x')).toBe(false);
    expect(isAllowedOAuthRedirect('https://evilclaude.ai/x')).toBe(false);
  });

  it('rejects non-https schemes in production', () => {
    process.env.NODE_ENV = 'production';
    expect(isAllowedOAuthRedirect('http://claude.ai/callback')).toBe(false);
    expect(isAllowedOAuthRedirect('javascript:alert(1)')).toBe(false);
  });

  it('rejects malformed / non-URL input', () => {
    expect(isAllowedOAuthRedirect('not a url')).toBe(false);
    expect(isAllowedOAuthRedirect('')).toBe(false);
  });
});
