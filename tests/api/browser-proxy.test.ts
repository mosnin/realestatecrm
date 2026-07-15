/**
 * Behavioral tests for the Browser tab's read-only proxy:
 *   - lib/browser-proxy.ts — the SSRF guard and the HTML rewriter
 *   - GET /api/browser/proxy — auth, rate-limit, redirect re-validation,
 *     HTML rewriting, and the styled error pages.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let signedInUser: string | null = 'user_1';
let rateAllowed = true;

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: signedInUser })),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: rateAllowed })),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { isPrivateAddress, rewriteHtml } from '@/lib/browser-proxy';
import { GET } from '@/app/api/browser/proxy/route';

// ── SSRF guard ──────────────────────────────────────────────────────────────

describe('isPrivateAddress', () => {
  it('flags every non-routable range', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.9',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254', // cloud metadata
      '100.64.0.1', // CGNAT
      '0.0.0.0',
      '::1',
      '::',
      'fc00::1',
      'fd12::1',
      'fe80::1',
      '::ffff:192.168.0.1', // v4-mapped
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it('passes public addresses', () => {
    for (const ip of ['142.250.72.14', '1.1.1.1', '2607:f8b0::1', '::ffff:8.8.8.8']) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });
});

// ── HTML rewriter ───────────────────────────────────────────────────────────

describe('rewriteHtml', () => {
  const PAGE = 'https://example.com/dir/page';
  const PROXY = '/api/browser/proxy';

  it('strips scripts and inline handlers, keeps content', () => {
    const out = rewriteHtml(
      `<head></head><body onload="evil()"><script>steal()</script><p onclick='x()'>Hi</p><a href="javascript:void(0)">j</a></body>`,
      PAGE,
      PROXY,
    );
    expect(out).not.toContain('<script');
    expect(out).not.toContain('steal()');
    expect(out).not.toContain('onload=');
    expect(out).not.toContain('onclick=');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('<p>Hi</p>');
  });

  it('injects <base> so images/CSS resolve against the origin site', () => {
    const out = rewriteHtml('<head><base href="https://attacker.example/"></head><img src="logo.png">', PAGE, PROXY);
    expect(out).toContain(`<base href="${PAGE}">`);
    expect(out).not.toContain('attacker.example');
  });

  it('rewrites relative and absolute links into the proxy, leaves anchors alone', () => {
    const out = rewriteHtml(
      `<head></head><a href="/next">n</a><a href="https://other.com/x">o</a><a href="#top">t</a>`,
      PAGE,
      PROXY,
    );
    expect(out).toContain(`href="${PROXY}?url=${encodeURIComponent('https://example.com/next')}"`);
    expect(out).toContain(`href="${PROXY}?url=${encodeURIComponent('https://other.com/x')}"`);
    expect(out).toContain('href="#top"');
  });

  it('rewrites GET forms to the proxy with the target riding as a hidden field', () => {
    const out = rewriteHtml(`<head></head><form action="/search"><input name="q"></form>`, PAGE, PROXY);
    expect(out).toContain(`action="${PROXY}"`);
    expect(out).toContain(`<input type="hidden" name="url" value="https://example.com/search">`);
  });

  it('leaves POST forms alone (read-only viewer)', () => {
    const src = `<head></head><form method="post" action="/buy"><input name="qty"></form>`;
    const out = rewriteHtml(src, PAGE, PROXY);
    expect(out).toContain('action="/buy"');
    expect(out).not.toContain('name="url"');
  });
});

// ── Route ───────────────────────────────────────────────────────────────────

function req(url: string, extra?: Record<string, string>) {
  const u = new URL('http://app.test/api/browser/proxy');
  u.searchParams.set('url', url);
  for (const [k, v] of Object.entries(extra ?? {})) u.searchParams.set(k, v);
  return { nextUrl: u } as unknown as import('next/server').NextRequest;
}

const realFetch = globalThis.fetch;
const fetchMock = vi.fn();

beforeEach(() => {
  signedInUser = 'user_1';
  rateAllowed = true;
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.stubGlobal('fetch', realFetch);
  vi.unstubAllGlobals();
});

function htmlResponse(body: string, status = 200, headers: Record<string, string> = {}) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', ...headers },
  });
}

describe('GET /api/browser/proxy', () => {
  it('401s signed-out callers with an HTML page, never fetching', async () => {
    signedInUser = null;
    const res = await GET(req('https://example.com'));
    expect(res.status).toBe(401);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses private/localhost targets before any fetch (SSRF)', async () => {
    for (const target of ['http://127.0.0.1:8080/admin', 'http://localhost/x', 'http://169.254.169.254/latest']) {
      const res = await GET(req(target));
      expect(res.status, target).toBe(403);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses non-http schemes', async () => {
    const res = await GET(req('file:///etc/passwd'));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rate-limits with a calm HTML page', async () => {
    rateAllowed = false;
    const res = await GET(req('https://example.com'));
    expect(res.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches by IP-literal public host, rewrites HTML, and serves no-script CSP', async () => {
    // 1.1.1.1 is public — skips DNS so the test needs no network.
    fetchMock.mockResolvedValueOnce(
      htmlResponse('<head></head><body><script>x()</script><a href="/a">a</a></body>'),
    );
    const res = await GET(req('https://1.1.1.1/page'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toContain("script-src 'none'");
    const body = await res.text();
    expect(body).not.toContain('<script');
    expect(body).toContain('/api/browser/proxy?url=');
    expect(body).toContain('<base href="https://1.1.1.1/page');
  });

  it('forwards extra query params (form fields) onto the target URL', async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse('<head></head>ok'));
    await GET(req('https://1.1.1.1/search', { q: 'chippi crm' }));
    const fetched = fetchMock.mock.calls[0][0] as string;
    expect(fetched).toContain('https://1.1.1.1/search');
    expect(fetched).toContain('q=chippi+crm');
  });

  it('re-validates redirect hops — a public host bouncing to metadata is refused', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest' } }),
    );
    const res = await GET(req('https://1.1.1.1/redir'));
    expect(res.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('turns a connection failure into a styled error page, not a broken frame', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const res = await GET(req('https://1.1.1.1/down'));
    expect(res.status).toBe(502);
    const body = await res.text();
    expect(body).toContain("couldn't load");
    expect(body).toContain('Open in a new tab');
  });
});
