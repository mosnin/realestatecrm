/**
 * Behavioral tests for GET /api/browser/search — the Browser tab's real web
 * search (Tavily-backed), used because a server-side HTML proxy can't scrape
 * Google/DuckDuckGo (they bot-wall datacenter IPs). Returns styled HTML the
 * iframe renders; every result links THROUGH the proxy to stay in-panel.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let signedInUser: string | null = 'user_1';
let rateAllowed = true;
let configured = true;
let searchImpl: (q: string) => Promise<Array<{ url: string; title: string; snippet: string; query: string }>> = async () => [];

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: signedInUser })) }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(async () => ({ allowed: rateAllowed })) }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/research/tavily', () => ({
  tavilyConfigured: () => configured,
  searchWeb: (q: string) => searchImpl(q),
}));

import { GET } from '@/app/api/browser/search/route';

function req(q?: string) {
  const u = new URL('http://app.test/api/browser/search');
  if (q != null) u.searchParams.set('q', q);
  return { nextUrl: u } as unknown as import('next/server').NextRequest;
}

beforeEach(() => {
  signedInUser = 'user_1';
  rateAllowed = true;
  configured = true;
  searchImpl = async () => [];
});
afterEach(() => vi.clearAllMocks());

describe('GET /api/browser/search', () => {
  it('401s a signed-out caller', async () => {
    signedInUser = null;
    expect((await GET(req('crm'))).status).toBe(401);
  });

  it('400s an empty query', async () => {
    expect((await GET(req(''))).status).toBe(400);
  });

  it('renders real results, each linking through the proxy', async () => {
    searchImpl = async () => [
      { query: 'x', url: 'https://zillow.com/re', title: 'Zillow Real Estate', snippet: 'Homes for sale' },
      { query: 'x', url: 'https://www.redfin.com/', title: 'Redfin', snippet: 'Buy and sell' },
    ];
    const res = await GET(req('real estate crm'));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Zillow Real Estate');
    expect(html).toContain('Redfin');
    // links go through the proxy so a click stays in-panel
    expect(html).toContain(`/api/browser/proxy?url=${encodeURIComponent('https://zillow.com/re')}`);
    // host shown without www
    expect(html).toContain('redfin.com');
    // no executable script in what the iframe renders
    expect(res.headers.get('content-security-policy')).toContain("script-src 'none'");
  });

  it('shows an honest empty state (no fabricated hits) when Tavily returns nothing', async () => {
    searchImpl = async () => [];
    const html = await (await GET(req('asdfqwerzxcv'))).text();
    expect(html).toContain('No results');
  });

  it('degrades honestly (503 + Google escape hatch) when Tavily is not configured', async () => {
    configured = false;
    const res = await GET(req('crm'));
    expect(res.status).toBe(503);
    const html = await res.text();
    expect(html).toContain('google.com/search?q=crm');
  });

  it('502s with a fallback when the search call throws', async () => {
    searchImpl = async () => {
      throw new Error('tavily down');
    };
    const res = await GET(req('crm'));
    expect(res.status).toBe(502);
    expect(await res.text()).toContain('google.com/search');
  });

  it('escapes query text into the page (no HTML injection)', async () => {
    const res = await GET(req('<img src=x onerror=alert(1)>'));
    const html = await res.text();
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });

  it('rate-limits with a calm page', async () => {
    rateAllowed = false;
    expect((await GET(req('crm'))).status).toBe(429);
  });
});
