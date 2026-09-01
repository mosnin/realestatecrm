/**
 * Behavioral tests for POST /api/upload/onboarding — branding uploads that
 * run before a Space exists (Clerk userId is the storage prefix).
 *
 * Gates under test:
 *   - unauthenticated 401 before rate-limit / storage
 *   - type, declared MIME, 2MB size, and magic-byte sniff before upload
 *   - a successful write is public and keyed under onboarding/{clerkUserId}
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { auth, checkRateLimit, uploadObject } = vi.hoisted(() => ({
  auth: vi.fn(async () => ({ userId: 'clerk_new' })),
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  uploadObject: vi.fn(async () => undefined),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit }));

vi.mock('@/lib/storage', () => ({
  uploadObject: (...a: unknown[]) => uploadObject(...a),
  buildKey: (prefix: string, ...segments: string[]) => {
    const prefixes: Record<string, string> = { onboarding: 'onboarding' };
    return [prefixes[prefix] ?? prefix, ...segments].join('/');
  },
  getPublicUrl: (key: string) => `https://cdn.test/${key}`,
}));

import { POST } from '@/app/api/upload/onboarding/route';

function jpegBytes(): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
}

function pngBytes(): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
}

function webpBytes(): Uint8Array {
  const b = new Uint8Array(12);
  b.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  b.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  return b;
}

const HTML_BYTES = new TextEncoder().encode('<!DOCTYPE html><html></html>');

function makeReq(form: FormData): NextRequest {
  return new NextRequest('http://localhost/api/upload/onboarding', { method: 'POST', body: form });
}

function formWith(file: File, type: string): FormData {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('type', type);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ userId: 'clerk_new' });
  checkRateLimit.mockResolvedValue({ allowed: true });
  uploadObject.mockResolvedValue(undefined);
});

describe('POST /api/upload/onboarding', () => {
  it('401s when Clerk has no user and never rate-limits or uploads', async () => {
    auth.mockResolvedValue({ userId: null });

    const res = await POST(
      makeReq(formWith(new File([jpegBytes()], 'a.jpg', { type: 'image/jpeg' }), 'logo')),
    );
    expect(res.status).toBe(401);
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it('429s after auth and never uploads', async () => {
    checkRateLimit.mockResolvedValue({ allowed: false });

    const res = await POST(
      makeReq(formWith(new File([jpegBytes()], 'a.jpg', { type: 'image/jpeg' }), 'logo')),
    );
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith('upload:clerk_new', 10, 60);
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it('400s on a missing file before upload', async () => {
    const fd = new FormData();
    fd.append('type', 'logo');
    const res = await POST(makeReq(fd));
    expect(res.status).toBe(400);
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it('400s on an unknown type (favicon is not allowed here)', async () => {
    const res = await POST(
      makeReq(formWith(new File([jpegBytes()], 'a.jpg', { type: 'image/jpeg' }), 'favicon')),
    );
    expect(res.status).toBe(400);
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it('400s on a declared MIME that is not PNG/JPEG/WebP before reading bytes', async () => {
    const res = await POST(
      makeReq(formWith(new File([pngBytes()], 'a.gif', { type: 'image/gif' }), 'logo')),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringMatching(/PNG, JPEG, and WebP/i),
    });
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it('400s when the file is over 2MB', async () => {
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    big.set(jpegBytes());
    const res = await POST(makeReq(formWith(new File([big], 'a.jpg', { type: 'image/jpeg' }), 'photo')));
    expect(res.status).toBe(400);
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it('rejects HTML spoofing image/png before any upload', async () => {
    const res = await POST(
      makeReq(formWith(new File([HTML_BYTES], 'logo.png', { type: 'image/png' }), 'logo')),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringMatching(/does not match a valid image format/i),
    });
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it('stores a JPEG under onboarding/{clerkUserId} as public', async () => {
    const res = await POST(
      makeReq(formWith(new File([jpegBytes()], 'me.jpg', { type: 'image/jpeg' }), 'photo')),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    expect(body.url).toMatch(/^https:\/\/cdn\.test\/onboarding\/clerk_new\/photo-/);
    expect(body.url).toMatch(/\.jpg$/);

    expect(uploadObject).toHaveBeenCalledTimes(1);
    expect(uploadObject.mock.calls[0]![0]).toMatchObject({
      contentType: 'image/jpeg',
      isPublic: true,
    });
    expect((uploadObject.mock.calls[0]![0] as { key: string }).key.startsWith('onboarding/clerk_new/photo-')).toBe(
      true,
    );
  });

  it('accepts a real WebP broker_logo', async () => {
    const res = await POST(
      makeReq(formWith(new File([webpBytes()], 'b.webp', { type: 'image/webp' }), 'broker_logo')),
    );
    expect(res.status).toBe(200);
    const uploaded = uploadObject.mock.calls[0]![0] as { key: string };
    expect(uploaded.key).toMatch(/^onboarding\/clerk_new\/broker_logo-.*\.webp$/);
  });

  it('returns 500 when storage fails and does not invent a URL', async () => {
    uploadObject.mockRejectedValueOnce(new Error('wasabi down'));

    const res = await POST(
      makeReq(formWith(new File([jpegBytes()], 'a.jpg', { type: 'image/jpeg' }), 'logo')),
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as { url?: string; error: string };
    expect(body.url).toBeUndefined();
    expect(body.error).toBe('wasabi down');
  });
});
