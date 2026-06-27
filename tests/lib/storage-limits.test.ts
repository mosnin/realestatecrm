/**
 * validateUpload is the pure server-side gate on every uploaded file: mime
 * whitelist, per-category size cap, and a magic-byte check that catches a file
 * lying about its content-type (e.g. a script renamed .png). quotaForPlan maps
 * a plan to its storage cap (unknown -> free), formatBytes pretty-prints sizes.
 * Pin the accept/reject paths — a regression lets a spoofed or oversized file
 * through, or miscounts a space's quota.
 */

import { describe, it, expect } from 'vitest';
import {
  validateUpload,
  quotaForPlan,
  formatBytes,
  CATEGORY_MAX_BYTES,
  PLAN_QUOTAS,
} from '@/lib/storage/limits';

const MB = 1024 * 1024;
const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('validateUpload', () => {
  it('accepts a valid PNG within its size cap', () => {
    const r = validateUpload({ mimeType: 'image/png', sizeBytes: 2 * MB, header: pngHeader });
    expect(r).toEqual({ ok: true, category: 'image' });
  });

  it('rejects an unsupported mime type', () => {
    const r = validateUpload({ mimeType: 'application/x-msdownload', sizeBytes: 10, header: new Uint8Array() });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/unsupported file type/i);
  });

  it('rejects an empty file', () => {
    expect(validateUpload({ mimeType: 'image/png', sizeBytes: 0, header: pngHeader })).toMatchObject({
      ok: false,
      reason: 'Empty file',
    });
  });

  it('rejects a file over its category size cap', () => {
    const over = CATEGORY_MAX_BYTES.image + 1;
    const r = validateUpload({ mimeType: 'image/png', sizeBytes: over, header: pngHeader });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/exceeds .* image limit/i);
  });

  it('rejects a content-type spoof (declared png, wrong magic bytes)', () => {
    const fakeHeader = new Uint8Array([0x4d, 0x5a, 0x00, 0x00]); // MZ (a Windows exe)
    const r = validateUpload({ mimeType: 'image/png', sizeBytes: 1000, header: fakeHeader });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/does not match declared type/i);
  });

  it('rejects when the header is too short for the magic signature', () => {
    const r = validateUpload({ mimeType: 'image/png', sizeBytes: 1000, header: new Uint8Array([0x89]) });
    expect(r.ok).toBe(false);
  });
});

describe('quotaForPlan', () => {
  it('maps known plans and falls back to free for unknown/nullish', () => {
    expect(quotaForPlan('pro')).toBe(PLAN_QUOTAS.pro);
    expect(quotaForPlan('brokerage')).toBe(PLAN_QUOTAS.brokerage);
    expect(quotaForPlan('enterprise')).toBe(PLAN_QUOTAS.free);
    expect(quotaForPlan(null)).toBe(PLAN_QUOTAS.free);
    expect(quotaForPlan(undefined)).toBe(PLAN_QUOTAS.free);
  });
});

describe('formatBytes', () => {
  it('steps B/KB/MB/GB with the documented precision', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(2 * MB)).toBe('2.0 MB');
    expect(formatBytes(3 * 1024 * MB)).toBe('3.00 GB'); // GB uses 2 decimals
  });
});
