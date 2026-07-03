/**
 * SSRF guard for outbound, user-authored HTTP targets (today: the workflow
 * `webhook_post` action). The old guard only string-matched a literal
 * dotted-decimal IPv4 hostname, so every standard bypass sailed through:
 * decimal/octal/hex IP encodings (`http://2130706433`, `0x7f000001`, `0177…`),
 * short forms (`127.1`), IPv4-mapped IPv6 (`[::ffff:169.254.169.254]`),
 * IPv6 ULA (`fd00::`), and — worst — a DNS name that simply resolves to
 * `169.254.169.254` (cloud metadata) or `127.0.0.1`. Redirects were also
 * followed blindly, so a public URL could 302 into the metadata service.
 *
 * This module blocks a target when EITHER the literal host OR any DNS-resolved
 * address falls in a private / loopback / link-local / ULA / reserved range.
 * Callers should additionally fetch with `redirect: 'manual'` so a 3xx can't
 * hop past this check (a resolved public host that redirects to an internal one).
 *
 * NOTE on TOCTOU: we validate the resolved addresses, but undici does its own
 * resolution when it connects, so a sub-second DNS-rebinding flip is not fully
 * closed here — pinning the connection to the validated IP via a custom
 * dispatcher is the residual hardening. This still closes every static-encoding
 * bypass, DNS-name-to-private, and redirect vector, which is the exploitable
 * surface today.
 */

import { lookup } from 'node:dns/promises';
import { lookup as nodeLookup, type LookupOptions, type LookupAddress } from 'node:dns';
import { Agent } from 'undici';

/**
 * Parse an IPv4 literal in any inet_aton-accepted form to a 32-bit unsigned
 * integer, or null if it isn't one. Handles 1–4 dotted parts, each part in
 * decimal, octal (leading 0), or hex (0x). Mirrors how browsers/undici/glibc
 * coerce `http://<host>` so the guard sees the same address the socket will.
 */
export function parseIpv4ToInt(host: string): number | null {
  if (!host) return null;
  const parts = host.split('.');
  if (parts.length === 0 || parts.length > 4) return null;

  const nums: number[] = [];
  for (const part of parts) {
    if (part === '') return null;
    let value: number;
    if (/^0x[0-9a-f]+$/i.test(part)) {
      value = parseInt(part.slice(2), 16);
    } else if (/^0[0-7]+$/.test(part)) {
      value = parseInt(part, 8);
    } else if (/^0$/.test(part)) {
      value = 0;
    } else if (/^[1-9][0-9]*$/.test(part)) {
      value = parseInt(part, 10);
    } else {
      return null; // not a numeric part → it's a hostname, not an IPv4 literal
    }
    if (!Number.isFinite(value) || value < 0) return null;
    nums.push(value);
  }

  // inet_aton: the last part absorbs the remaining low-order bytes.
  const n = nums.length;
  let result: number;
  if (n === 1) {
    result = nums[0];
    if (result > 0xffffffff) return null;
  } else if (n === 2) {
    if (nums[0] > 0xff || nums[1] > 0xffffff) return null;
    result = (nums[0] << 24) | nums[1];
  } else if (n === 3) {
    if (nums[0] > 0xff || nums[1] > 0xff || nums[2] > 0xffff) return null;
    result = (nums[0] << 24) | (nums[1] << 16) | nums[2];
  } else {
    if (nums.some((x) => x > 0xff)) return null;
    result = (nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3];
  }
  return result >>> 0; // force unsigned
}

/** True when a 32-bit IPv4 value is in a private / loopback / reserved range. */
export function isPrivateIpv4Int(n: number): boolean {
  const a = (n >>> 24) & 0xff;
  const b = (n >>> 16) & 0xff;
  if (a === 0) return true; // 0.0.0.0/8 ("this network"), incl 0.0.0.0
  if (a === 10) return true; // 10/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  if (a === 192 && b === 0) return true; // 192.0.0/24 IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15 benchmarking
  if (a >= 224) return true; // multicast (224/4) + reserved (240/4) + 255.255.255.255
  return false;
}

/**
 * True when an IPv6 literal (brackets already stripped) is loopback,
 * unspecified, link-local, ULA, or an IPv4-mapped/compatible address whose
 * embedded IPv4 is private. Works on canonical resolver output too.
 */
export function isBlockedIpv6(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === '::1' || h === '::') return true;
  // Embedded IPv4, dotted form (::ffff:a.b.c.d mapped, or ::a.b.c.d compatible).
  if (h.includes('.')) {
    const tail = h.slice(h.lastIndexOf(':') + 1);
    const v4 = parseIpv4ToInt(tail);
    if (v4 !== null && isPrivateIpv4Int(v4)) return true;
  }
  // Embedded IPv4, hex-hextet form — the WHATWG URL parser canonicalizes
  // ::ffff:169.254.169.254 to ::ffff:a9fe:a9fe, so match the trailing two
  // hextets of a mapped (::ffff:) or compatible (::) address and re-check.
  const hex = h.match(/^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const v4 = (((parseInt(hex[1], 16) << 16) | parseInt(hex[2], 16)) >>> 0);
    if (isPrivateIpv4Int(v4)) return true;
  }
  // fe80::/10 link-local, fec0::/10 site-local (deprecated), fc00::/7 ULA.
  if (h.startsWith('fe8') || h.startsWith('fe9') || h.startsWith('fea') || h.startsWith('feb')) return true;
  if (h.startsWith('fec') || h.startsWith('fed') || h.startsWith('fee') || h.startsWith('fef')) return true;
  if (h.startsWith('fc') || h.startsWith('fd')) return true;
  return false;
}

/**
 * A fetch dispatcher that re-validates the resolved address at CONNECT time.
 * The pre-flight assertPublicHttpTarget resolves + checks the host, but undici
 * re-resolves when it actually connects, so a sub-second DNS-rebinding flip
 * (public IP to the pre-check, private IP to the socket) would slip through.
 * Hooking the SAME lookup undici uses to connect closes that TOCTOU: a resolved
 * private/reserved address aborts the connection.
 *
 * Lazily built + cached. If undici is somehow unavailable the caller falls back
 * to pre-flight-only, which still blocks every static-encoding and
 * DNS-to-private vector — this dispatcher is strictly-additive hardening.
 */
let cachedDispatcher: Agent | null | undefined;
export function getSafeDispatcher(): Agent | undefined {
  if (cachedDispatcher !== undefined) return cachedDispatcher ?? undefined;
  try {
    cachedDispatcher = new Agent({
      connect: {
        // Matches undici's LookupFunction / node's dns.lookup shape.
        lookup: (
          hostname: string,
          options: LookupOptions,
          callback: (
            err: NodeJS.ErrnoException | null,
            address: string | LookupAddress[],
            family: number,
          ) => void,
        ) => {
          nodeLookup(hostname, options, (err, address, family) => {
            if (err) return callback(err, address as string | LookupAddress[], family);
            const list: Array<{ address: string }> = Array.isArray(address)
              ? (address as LookupAddress[])
              : [{ address: address as string }];
            for (const a of list) {
              if (a && typeof a.address === 'string' && isBlockedLiteral(a.address)) {
                return callback(
                  new Error('SSRF: host resolved to a private or reserved address'),
                  address as string | LookupAddress[],
                  family,
                );
              }
            }
            callback(null, address as string | LookupAddress[], family);
          });
        },
      },
    });
  } catch {
    cachedDispatcher = null;
  }
  return cachedDispatcher ?? undefined;
}

/** Classify a single host token (literal IP or resolved address). */
function isBlockedLiteral(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h.includes(':')) return isBlockedIpv6(h);
  const v4 = parseIpv4ToInt(h);
  if (v4 !== null) return isPrivateIpv4Int(v4);
  return false; // not an IP literal — caller resolves it
}

export type SsrfCheck = { ok: true } | { ok: false; reason: string };

/**
 * Validate an outbound URL target. Blocks non-http(s) schemes, IP literals in
 * any encoding that map to a private range, and DNS names that resolve to a
 * private address. Fails closed on an unresolvable host. Callers must still use
 * `redirect: 'manual'` so a later hop can't escape this check.
 */
export async function assertPublicHttpTarget(rawUrl: string): Promise<SsrfCheck> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'Malformed URL.' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: `Unsupported scheme "${parsed.protocol}".` };
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return { ok: false, reason: 'Missing host.' };

  // Literal IP (any encoding) → classify directly.
  const isLiteralIp = host.includes(':') || parseIpv4ToInt(host) !== null;
  if (isLiteralIp) {
    return isBlockedLiteral(host)
      ? { ok: false, reason: 'URL targets a private, loopback, or reserved address.' }
      : { ok: true };
  }

  // DNS name → resolve ALL addresses and reject if ANY is private (defeats a
  // name that points at 169.254.169.254 / 127.0.0.1, and rebinding's slow path).
  let addrs: Array<{ address: string; family: number }>;
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    return { ok: false, reason: 'Host did not resolve.' };
  }
  if (addrs.length === 0) return { ok: false, reason: 'Host did not resolve.' };
  for (const { address } of addrs) {
    if (isBlockedLiteral(address)) {
      return { ok: false, reason: 'URL resolves to a private, loopback, or reserved address.' };
    }
  }
  return { ok: true };
}
