import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { checkRateLimit } from '@/lib/rate-limit';

/**
 * GET /api/browser/frame-check?url=<https url>
 *
 * Pre-flight for the RightPanel in-panel browser. Most major sites send
 * X-Frame-Options / CSP frame-ancestors and will refuse to render inside an
 * iframe — and that refusal is NOT detectable from the client (the frame is
 * cross-origin and Chrome fires `load` even on its own error page, so the
 * user just sees Chrome's sad-face page). The ONLY reliable way to know is to
 * read the response headers server-side, before the iframe ever navigates.
 *
 * Returns { embeddable: boolean }. When false, the client renders an honest
 * "this site doesn't allow embedding — open in new tab" card and never
 * navigates the iframe, so the sad-face page can never appear.
 *
 * SSRF guard: https only, no credentials in the URL, and the hostname must
 * not be localhost / an IP-literal (public sites the realtor browses are
 * always named hosts; every internal/metadata endpoint is an IP or
 * localhost). DNS-rebind is out of scope — this endpoint only ever reports
 * booleans derived from headers, never response bodies.
 */

function isForbiddenHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) {
    return true;
  }
  // IPv4 literal (covers 127.x, 10.x, 169.254.x, 192.168.x, metadata IPs…)
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true;
  // IPv6 literal ([::1] etc.) — URL.hostname keeps the brackets off but may
  // contain ':' for v6.
  if (h.includes(':')) return true;
  return false;
}

/** Does this response allow OUR (cross-origin) page to frame it? */
function headersAllowFraming(headers: Headers): boolean {
  const xfo = (headers.get('x-frame-options') ?? '').trim().toLowerCase();
  if (xfo === 'deny' || xfo === 'sameorigin' || xfo.startsWith('allow-from')) return false;

  const csp = headers.get('content-security-policy') ?? '';
  const match = csp.match(/frame-ancestors([^;]*)/i);
  if (match) {
    const sources = match[1].trim().toLowerCase();
    // We are a cross-origin ancestor: only a wildcard (or an explicit https:
    // scheme source) admits us. 'self', 'none', or a host list → blocked.
    if (!sources.includes('*') && !sources.includes('https:')) return false;
  }
  return true;
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { allowed } = await checkRateLimit(`browser:frame-check:${userId}`, 60, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const raw = req.nextUrl.searchParams.get('url') ?? '';
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }
  if (target.protocol !== 'https:' || target.username || target.password || isForbiddenHost(target.hostname)) {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  try {
    // GET (not HEAD — some CDNs answer HEAD without the frame headers), but
    // we never read the body. Follow redirects so the FINAL response's
    // headers are what we judge — that's the document the iframe would show.
    const res = await fetch(target.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(6_000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ChippiPanel/1.0)' },
    });
    res.body?.cancel().catch(() => {});
    return NextResponse.json({ embeddable: headersAllowFraming(res.headers) });
  } catch {
    // Unreachable / timed out: let the iframe try anyway — the panel's
    // slow-load hint still covers the residual case.
    return NextResponse.json({ embeddable: true, unverified: true });
  }
}
