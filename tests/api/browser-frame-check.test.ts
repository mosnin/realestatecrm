/**
 * Behavioral tests for GET /api/browser/frame-check — the in-panel browser's
 * pre-flight. Contract: auth-gated, SSRF-guarded (https + named public hosts
 * only), and the verdict derives from the FINAL response's X-Frame-Options /
 * CSP frame-ancestors headers so the iframe never navigates into Chrome's
 * sad-face page.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

let signedInUser: string | null = 'user_1';
let rateAllowed = true;

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: signedInUser })),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: rateAllowed })),
}));

import { GET } from '@/app/api/browser/frame-check/route';

function req(url: string): NextRequest {
  return new NextRequest(`http://t.test/api/browser/frame-check?url=${encodeURIComponent(url)}`);
}

function upstream(headers: Record<string, string>) {
  return new Response('', { status: 200, headers });
}

const fetchMock = vi.fn(async () => upstream({}));

beforeEach(() => {
  signedInUser = 'user_1';
  rateAllowed = true;
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(upstream({}));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('GET /api/browser/frame-check', () => {
  it('401s unauthenticated callers before any outbound fetch', async () => {
    signedInUser = null;
    const res = await GET(req('https://example.com'));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects non-https, credentialed, IP-literal, and localhost URLs (SSRF guard)', async () => {
    for (const bad of [
      'http://example.com',
      'https://user:pw@example.com',
      'https://127.0.0.1/latest',
      'https://169.254.169.254/metadata',
      'https://localhost:3000',
      'https://internal.local',
      'not a url',
    ]) {
      const res = await GET(req(bad));
      expect(res.status, bad).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports blocked for X-Frame-Options and restrictive frame-ancestors', async () => {
    fetchMock.mockResolvedValueOnce(upstream({ 'x-frame-options': 'SAMEORIGIN' }));
    let res = await GET(req('https://google.com'));
    expect((await res.json()).embeddable).toBe(false);

    fetchMock.mockResolvedValueOnce(
      upstream({ 'content-security-policy': "default-src 'self'; frame-ancestors 'self'" }),
    );
    res = await GET(req('https://blocked.example'));
    expect((await res.json()).embeddable).toBe(false);
  });

  it('reports embeddable for permissive responses', async () => {
    fetchMock.mockResolvedValueOnce(upstream({}));
    let res = await GET(req('https://friendly.example'));
    expect((await res.json()).embeddable).toBe(true);

    fetchMock.mockResolvedValueOnce(
      upstream({ 'content-security-policy': 'frame-ancestors *' }),
    );
    res = await GET(req('https://wildcard.example'));
    expect((await res.json()).embeddable).toBe(true);
  });

  it('falls open (embeddable, unverified) when the site is unreachable', async () => {
    fetchMock.mockRejectedValueOnce(new Error('timeout'));
    const res = await GET(req('https://slow.example'));
    const body = await res.json();
    expect(body.embeddable).toBe(true);
    expect(body.unverified).toBe(true);
  });
});
