import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import {
  assertPublicHttpUrl,
  rewriteHtml,
  ProxyError,
  MAX_BYTES,
  FETCH_TIMEOUT_MS,
  MAX_REDIRECTS,
} from '@/lib/browser-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROXY_PATH = '/api/browser/proxy';

/**
 * GET /api/browser/proxy?url=<page>
 *
 * The side panel's read-only web view. When a site refuses iframe embedding
 * (X-Frame-Options / frame-ancestors — most of the real web), the panel loads
 * the page THROUGH this route instead: we fetch it server-side, strip scripts,
 * rewrite navigation to stay in the proxy, and serve it from our origin so the
 * iframe can always render it. See lib/browser-proxy.ts for the rewriter and
 * the SSRF guard (every hop must resolve to a public address).
 *
 * Extra query params (beyond `url`) are appended to the TARGET's query — GET
 * forms are rewritten to submit here with the target in a hidden `url` field,
 * so a search box's `q=…` must be forwarded to the site, not swallowed.
 *
 * Errors return small styled HTML (not JSON) — the iframe renders whatever
 * comes back, so failures read as a calm page instead of a broken frame.
 */
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return errorPage(401, 'Sign in to browse.', 'This viewer is part of your workspace.');

  // Subresources don't hit the proxy (they load direct via <base>), only
  // navigations do — 120 page loads / 5 min per user is generous.
  const { allowed } = await checkRateLimit(`browser:proxy:${userId}`, 120, 300);
  if (!allowed) {
    return errorPage(429, 'Slow down a moment.', 'Too many page loads — try again shortly.');
  }

  const params = req.nextUrl.searchParams;
  const raw = params.get('url') ?? '';

  try {
    let target = await assertPublicHttpUrl(raw);
    // Forward form fields (every param except `url`) onto the target.
    for (const [key, value] of params) {
      if (key !== 'url') target.searchParams.append(key, value);
    }

    // Manual redirect loop — each hop is re-validated so a public host can't
    // bounce us into a private address (open-redirect → SSRF).
    let res: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      res = await fetch(target.href, {
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc || hop === MAX_REDIRECTS) {
          throw new ProxyError(502, 'The site redirected too many times.');
        }
        target = await assertPublicHttpUrl(new URL(loc, target.href).href);
        continue;
      }
      break;
    }
    if (!res) throw new ProxyError(502, 'The site did not respond.');

    const contentType = res.headers.get('content-type') ?? 'application/octet-stream';

    // Size-capped read — a page, not a download service.
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BYTES) {
          void reader.cancel().catch(() => {});
          throw new ProxyError(502, 'That page is too large to preview here.');
        }
        chunks.push(value);
      }
    }
    const body = Buffer.concat(chunks);

    if (contentType.includes('text/html')) {
      const html = rewriteHtml(body.toString('utf8'), target.href, PROXY_PATH);
      return new NextResponse(html, {
        status: res.status,
        headers: htmlHeaders(),
      });
    }

    // Images / PDFs / plain text navigated to directly — pass bytes through
    // with a hard no-script CSP and no caching of someone else's content.
    return new NextResponse(body, {
      status: res.status,
      headers: {
        'Content-Type': contentType,
        'Content-Security-Policy': "script-src 'none'",
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex',
      },
    });
  } catch (err) {
    if (err instanceof ProxyError) {
      return errorPage(err.status, "This page couldn't load.", err.message, raw);
    }
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    if (!timedOut) logger.warn('[browser/proxy] fetch failed', { url: raw }, err);
    return errorPage(
      502,
      "This page couldn't load.",
      timedOut ? 'The site took too long to respond.' : 'The site refused the connection.',
      raw,
    );
  }
}

function htmlHeaders(): Record<string, string> {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    // Belt-and-braces with the sandboxed iframe: even served from our origin,
    // nothing in this document may execute or navigate the parent.
    'Content-Security-Policy': "script-src 'none'; frame-ancestors 'self'",
    'Cache-Control': 'private, no-store',
    'X-Robots-Tag': 'noindex',
  };
}

/** Calm, dark-theme-native error page — the iframe renders whatever we send. */
function errorPage(status: number, title: string, detail: string, url?: string): NextResponse {
  const openLink = url
    ? `<a href="${url.replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer">Open in a new tab instead</a>`
    : '';
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;display:grid;place-items:center;min-height:100vh;background:transparent;color:#8a8a8e;font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center}
  main{padding:2rem;max-width:26rem}
  h1{font-size:15px;font-weight:600;color:#c7c7cc;margin:0 0 .35rem}
  p{margin:0 0 1.1rem}
  a{color:#F25A00;text-decoration:none;font-weight:500}
</style>
<main><h1>${title}</h1><p>${detail}</p>${openLink}</main>`;
  return new NextResponse(html, { status, headers: htmlHeaders() });
}
