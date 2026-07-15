/**
 * Server-side page fetcher for the chat side panel's Browser tab.
 *
 * Most of the real web (Google included) forbids iframe embedding via
 * X-Frame-Options / CSP frame-ancestors — the browser enforces it and no
 * client code can override it. So when a site blocks embedding, the panel
 * falls back to THIS: the server fetches the page and serves a rewritten,
 * script-free copy from our own origin, which the iframe can always render.
 * Read-only by design — no JS runs (double-enforced: scripts are stripped
 * here AND the iframe omits `allow-scripts`), links and GET forms are
 * rewritten to stay inside the proxy, and all other subresources (images,
 * CSS) load directly from the origin site via <base>.
 *
 * SECURITY — this endpoint fetches arbitrary URLs on behalf of the user, so
 * it is an SSRF surface. Every navigation (including each redirect hop) must
 * pass `assertPublicHttpUrl`, which rejects non-http(s) schemes and any
 * hostname that resolves to a private, loopback, link-local, CGNAT, or
 * metadata address. Responses are size-capped and time-capped.
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export const MAX_BYTES = 3_000_000;
export const FETCH_TIMEOUT_MS = 12_000;
export const MAX_REDIRECTS = 5;

// ── SSRF guard ──────────────────────────────────────────────────────────────

function ipv4ToInt(ip: string): number {
  const [a, b, c, d] = ip.split('.').map(Number);
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

function inCidr4(ip: number, base: string, maskBits: number): boolean {
  const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;
  return (ip & mask) === (ipv4ToInt(base) & mask);
}

/** True when the ADDRESS is not publicly routable (SSRF-dangerous). */
export function isPrivateAddress(addr: string): boolean {
  const family = isIP(addr);
  if (family === 4) {
    const ip = ipv4ToInt(addr);
    return (
      inCidr4(ip, '0.0.0.0', 8) ||
      inCidr4(ip, '10.0.0.0', 8) ||
      inCidr4(ip, '100.64.0.0', 10) || // CGNAT
      inCidr4(ip, '127.0.0.0', 8) ||
      inCidr4(ip, '169.254.0.0', 16) || // link-local / cloud metadata
      inCidr4(ip, '172.16.0.0', 12) ||
      inCidr4(ip, '192.168.0.0', 16) ||
      inCidr4(ip, '224.0.0.0', 4) || // multicast
      inCidr4(ip, '240.0.0.0', 4) // reserved
    );
  }
  if (family === 6) {
    const lower = addr.toLowerCase();
    // Normalize the IPv4-mapped form (::ffff:1.2.3.4) back through the v4 check.
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return (
      lower === '::' ||
      lower === '::1' ||
      lower.startsWith('fc') || // fc00::/7 unique local
      lower.startsWith('fd') ||
      lower.startsWith('fe8') || // fe80::/10 link-local
      lower.startsWith('fe9') ||
      lower.startsWith('fea') ||
      lower.startsWith('feb')
    );
  }
  // Not an IP literal — caller resolves via DNS first.
  return true;
}

/**
 * Throws unless `raw` is an http(s) URL whose host resolves ONLY to public
 * addresses. Called on the initial URL and again on every redirect hop —
 * a public host redirecting to 169.254.169.254 must be caught too.
 */
export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ProxyError(400, 'That address is not a valid URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ProxyError(400, 'Only http(s) pages can be viewed.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw new ProxyError(403, 'That address is not reachable from here.');
  }
  if (isIP(host)) {
    if (isPrivateAddress(host)) {
      throw new ProxyError(403, 'That address is not reachable from here.');
    }
    return url;
  }
  let addrs: Array<{ address: string }>;
  try {
    addrs = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new ProxyError(502, `Couldn't find ${host}. Check the address and try again.`);
  }
  if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) {
    throw new ProxyError(403, 'That address is not reachable from here.');
  }
  return url;
}

export class ProxyError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ── HTML rewriting ──────────────────────────────────────────────────────────

/** Resolve `href` against the page URL; return null when it isn't a web URL. */
function resolveHttp(href: string, pageUrl: string): string | null {
  try {
    const abs = new URL(href, pageUrl);
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return null;
    return abs.href;
  } catch {
    return null;
  }
}

/**
 * Rewrite a fetched HTML document for safe, navigable display inside the
 * panel's sandboxed iframe:
 *
 *   - strip <script> blocks, inline on* handlers, and javascript: URLs
 *     (defense in depth — the iframe also runs with no `allow-scripts`),
 *   - inject <base href> so images/CSS load from the origin site,
 *   - rewrite <a href> and GET <form action> to stay inside the proxy so
 *     clicking a link keeps working instead of hard-navigating a frame the
 *     site would refuse.
 */
export function rewriteHtml(html: string, pageUrl: string, proxyPath: string): string {
  let out = html;

  // Scripts + inline handlers. The sandbox already blocks execution; this
  // keeps the payload inert even if it's ever viewed outside the sandbox.
  out = out.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '');
  out = out.replace(/<script\b[^>]*\/?>/gi, '');
  out = out.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  out = out.replace(/(\shref\s*=\s*)(["']?)\s*javascript:[^"'>\s]*\2/gi, '$1$2#$2');

  // <base> so relative subresources (img/css) resolve against the real site.
  // Remove any existing base first, then inject ours right after <head>.
  out = out.replace(/<base\b[^>]*\/?>/gi, '');
  const baseTag = `<base href="${pageUrl.replace(/"/g, '&quot;')}">`;
  if (/<head\b[^>]*>/i.test(out)) {
    out = out.replace(/<head\b[^>]*>/i, (m) => `${m}${baseTag}`);
  } else {
    out = `${baseTag}${out}`;
  }

  // Keep navigation inside the proxy: links…
  out = out.replace(
    /(<a\b[^>]*\shref\s*=\s*)("([^"]*)"|'([^']*)')/gi,
    (m, prefix: string, _q: string, dq?: string, sq?: string) => {
      const href = dq ?? sq ?? '';
      if (href.startsWith('#')) return m; // in-page anchors stay
      const abs = resolveHttp(href, pageUrl);
      if (!abs) return m;
      return `${prefix}"${proxyPath}?url=${encodeURIComponent(abs)}"`;
    },
  );
  // …and GET forms (search boxes). POST forms are left alone — a read-only
  // viewer shouldn't submit state-changing requests through our origin.
  //
  // A GET submit DISCARDS the action's query string and rebuilds it from the
  // form's fields — so the target can't ride in `action="…?url=…"`. Instead
  // the action points at the bare proxy path and the target URL rides along
  // as a hidden `url` field; the route appends every OTHER submitted field to
  // the target's own query (that's what makes a proxied Google search work).
  out = out.replace(/<form\b[^>]*>/gi, (tag) => {
    if (/method\s*=\s*["']?post/i.test(tag)) return tag;
    const actionMatch = tag.match(/\saction\s*=\s*("([^"]*)"|'([^']*)')/i);
    const action = actionMatch ? (actionMatch[2] ?? actionMatch[3] ?? '') : '';
    const abs = resolveHttp(action || pageUrl, pageUrl);
    if (!abs) return tag;
    const hidden = `<input type="hidden" name="url" value="${abs.replace(/"/g, '&quot;')}">`;
    const rewritten = actionMatch
      ? tag.replace(actionMatch[0], ` action="${proxyPath}"`)
      : tag.replace(/<form\b/i, `<form action="${proxyPath}"`);
    return `${rewritten}${hidden}`;
  });

  return out;
}
