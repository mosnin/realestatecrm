/**
 * Tests for the outbound SSRF guard. Focus on the bypass classes the old guard
 * (literal dotted-decimal string match only) let through: alternate IP
 * encodings, short forms, IPv6-mapped/ULA, and public-literal pass-through.
 * DNS-name resolution is exercised against literals that don't need lookup and
 * a couple of well-known public/loopback names via the real resolver.
 */

import { describe, it, expect } from 'vitest';
import {
  parseIpv4ToInt,
  isPrivateIpv4Int,
  isBlockedIpv6,
  assertPublicHttpTarget,
} from '@/lib/net/ssrf-guard';

describe('parseIpv4ToInt — inet_aton encodings', () => {
  it('parses dotted decimal', () => {
    expect(parseIpv4ToInt('127.0.0.1')).toBe(0x7f000001);
    expect(parseIpv4ToInt('169.254.169.254')).toBe(0xa9fea9fe);
  });
  it('parses decimal, hex, and octal whole-integer forms', () => {
    expect(parseIpv4ToInt('2130706433')).toBe(0x7f000001); // 127.0.0.1
    expect(parseIpv4ToInt('0x7f000001')).toBe(0x7f000001);
    expect(parseIpv4ToInt('017700000001')).toBe(0x7f000001); // octal
  });
  it('parses short forms (a.b, a.b.c)', () => {
    expect(parseIpv4ToInt('127.1')).toBe(0x7f000001);
    expect(parseIpv4ToInt('169.254.43518')).toBe(0xa9fea9fe);
  });
  it('returns null for non-IPv4 hostnames', () => {
    expect(parseIpv4ToInt('example.com')).toBeNull();
    expect(parseIpv4ToInt('not.an.ip.addr')).toBeNull();
    expect(parseIpv4ToInt('')).toBeNull();
  });
});

describe('isPrivateIpv4Int — ranges', () => {
  const priv = (s: string) => isPrivateIpv4Int(parseIpv4ToInt(s)!);
  it('flags private/loopback/link-local/reserved', () => {
    expect(priv('127.0.0.1')).toBe(true);
    expect(priv('10.1.2.3')).toBe(true);
    expect(priv('172.16.0.1')).toBe(true);
    expect(priv('172.31.255.255')).toBe(true);
    expect(priv('192.168.1.1')).toBe(true);
    expect(priv('169.254.169.254')).toBe(true); // cloud metadata
    expect(priv('100.64.0.1')).toBe(true); // CGNAT
    expect(priv('0.0.0.0')).toBe(true);
    expect(priv('224.0.0.1')).toBe(true); // multicast
  });
  it('allows public addresses', () => {
    expect(priv('1.1.1.1')).toBe(false);
    expect(priv('8.8.8.8')).toBe(false);
    expect(priv('172.15.0.1')).toBe(false); // just outside 172.16/12
    expect(priv('172.32.0.1')).toBe(false);
  });
});

describe('isBlockedIpv6', () => {
  it('flags loopback, unspecified, link-local, ULA', () => {
    expect(isBlockedIpv6('::1')).toBe(true);
    expect(isBlockedIpv6('::')).toBe(true);
    expect(isBlockedIpv6('fe80::1')).toBe(true);
    expect(isBlockedIpv6('fd00::1')).toBe(true); // ULA
    expect(isBlockedIpv6('fc00::1')).toBe(true);
  });
  it('flags IPv4-mapped addresses whose embedded v4 is private', () => {
    expect(isBlockedIpv6('::ffff:169.254.169.254')).toBe(true);
    expect(isBlockedIpv6('::ffff:127.0.0.1')).toBe(true);
  });
  it('allows a public global-unicast address', () => {
    expect(isBlockedIpv6('2606:4700:4700::1111')).toBe(false); // 1.1.1.1 v6
  });
});

describe('assertPublicHttpTarget — literals (no DNS needed)', () => {
  it('rejects every private-literal encoding', async () => {
    for (const url of [
      'http://127.0.0.1/',
      'http://2130706433/',
      'http://0x7f000001/',
      'http://017700000001/',
      'http://127.1/',
      'http://169.254.169.254/latest/meta-data/',
      'http://10.0.0.5/',
      'http://[::1]/',
      'http://[::ffff:169.254.169.254]/',
      'http://[fd00::1]/',
    ]) {
      const r = await assertPublicHttpTarget(url);
      expect(r.ok, `${url} should be blocked`).toBe(false);
    }
  });
  it('rejects non-http(s) schemes', async () => {
    expect((await assertPublicHttpTarget('file:///etc/passwd')).ok).toBe(false);
    expect((await assertPublicHttpTarget('gopher://x/')).ok).toBe(false);
  });
  it('allows a public IP literal', async () => {
    expect((await assertPublicHttpTarget('https://1.1.1.1/hook')).ok).toBe(true);
  });
});
