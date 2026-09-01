/**
 * Behavioral tests for POST /api/upload — workspace branding / property photos.
 *
 * The route is the public-image write path for /apply and property packets.
 * These tests lock the gates that keep a spoofed file or a foreign space out
 * of Wasabi and SpaceSetting:
 *
 *   - auth / rate-limit / no-space before form parse
 *   - type + size caps before any storage write
 *   - magic-byte sniff (real sniffImageFormat) rejects HTML/MP4 before upload
 *   - logo/photo/favicon upsert SpaceSetting in the caller space and delete
 *     the previous object; link-thumb / property-photo do not write settings
 *   - HEIC transcode failure is 422 and never stores the raw HEIC
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const {
  requireAuth,
  getSpaceForUser,
  checkRateLimit,
  uploadObject,
  deleteObject,
  heicConvert,
  upserts,
  settingsRows,
} = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getSpaceForUser: vi.fn(),
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  uploadObject: vi.fn(async () => undefined),
  deleteObject: vi.fn(async () => undefined),
  heicConvert: vi.fn(async () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0])),
  upserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
  settingsRows: [] as Array<{ data?: unknown; error?: unknown }>,
}));

vi.mock('@/lib/api-auth', () => ({ requireAuth }));
vi.mock('@/lib/space', () => ({ getSpaceForUser }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit }));
vi.mock('heic-convert', () => ({ default: (...a: unknown[]) => heicConvert(...a) }));

vi.mock('@/lib/storage', () => ({
  uploadObject: (...a: unknown[]) => uploadObject(...a),
  deleteObject: (...a: unknown[]) => deleteObject(...a),
  buildKey: (prefix: string, ...segments: string[]) => {
    const prefixes: Record<string, string> = {
      propertyPhotos: 'property-photos',
      onboarding: 'onboarding',
    };
    return [prefixes[prefix] ?? prefix, ...segments].join('/');
  },
  getPublicUrl: (key: string) => `https://cdn.test/${key}`,
  publicUrlToKey: (url: string) =>
    typeof url === 'string' && url.startsWith('https://cdn.test/')
      ? url.slice('https://cdn.test/'.length)
      : null,
}));

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(() =>
      Promise.resolve(settingsRows.shift() ?? { data: null, error: null }),
    );
    chain.upsert = vi.fn((values: Record<string, unknown>) => {
      upserts.push({ table, values });
      return Promise.resolve({ data: values, error: null });
    });
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import { POST } from '@/app/api/upload/route';

const SPACE = { id: 'space_1', slug: 'acme', name: 'Acme', ownerId: 'u1' };

function jpegBytes(): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
}

function heicBytes(): Uint8Array {
  const b = new Uint8Array(16);
  b.set([0x00, 0x00, 0x00, 0x18], 0);
  b.set([0x66, 0x74, 0x79, 0x70], 4); // ftyp
  b.set([0x68, 0x65, 0x69, 0x63], 8); // heic
  return b;
}

function mp4Bytes(): Uint8Array {
  const b = new Uint8Array(16);
  b.set([0x66, 0x74, 0x79, 0x70], 4); // ftyp
  b.set([0x69, 0x73, 0x6f, 0x6d], 8); // isom
  return b;
}

const HTML_BYTES = new TextEncoder().encode('<!DOCTYPE html><html></html>');

function makeReq(form: FormData): NextRequest {
  return new NextRequest('http://localhost/api/upload', { method: 'POST', body: form });
}

function formWith(file: File, type: string): FormData {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('type', type);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  upserts.length = 0;
  settingsRows.length = 0;
  requireAuth.mockResolvedValue({ userId: 'clerk_1' });
  getSpaceForUser.mockResolvedValue(SPACE);
  checkRateLimit.mockResolvedValue({ allowed: true });
  uploadObject.mockResolvedValue(undefined);
  deleteObject.mockResolvedValue(undefined);
  heicConvert.mockResolvedValue(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]));
});

describe('POST /api/upload — gates before storage', () => {
  it('401s when unauthenticated and never rate-limits or uploads', async () => {
    requireAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

    const res = await POST(makeReq(formWith(new File([jpegBytes()], 'a.jpg', { type: 'image/jpeg' }), 'logo')));
    expect(res.status).toBe(401);
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(getSpaceForUser).not.toHaveBeenCalled();
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it('429s after auth and never looks up the space', async () => {
    checkRateLimit.mockResolvedValue({ allowed: false });

    const res = await POST(makeReq(formWith(new File([jpegBytes()], 'a.jpg', { type: 'image/jpeg' }), 'logo')));
    expect(res.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith('upload:clerk_1', 10, 60);
    expect(getSpaceForUser).not.toHaveBeenCalled();
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it('400s on a missing file before upload', async () => {
    const fd = new FormData();
    fd.append('type', 'logo');
    const res = await POST(makeReq(fd));
    expect(res.status).toBe(400);
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it('400s on an unknown upload type before upload', async () => {
    const res = await POST(
      makeReq(formWith(new File([jpegBytes()], 'a.jpg', { type: 'image/jpeg' }), 'avatar')),
    );
    expect(res.status).toBe(400);
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it('400s when a branding file is over 4MB', async () => {
    const big = new Uint8Array(4 * 1024 * 1024 + 1);
    big.set(jpegBytes());
    const res = await POST(makeReq(formWith(new File([big], 'a.jpg', { type: 'image/jpeg' }), 'logo')));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringMatching(/4MB/i) });
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it('rejects HTML spoofing image/jpeg before any upload', async () => {
    const res = await POST(
      makeReq(formWith(new File([HTML_BYTES], 'logo.jpg', { type: 'image/jpeg' }), 'logo')),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringMatching(/supported image/i),
    });
    expect(uploadObject).not.toHaveBeenCalled();
    expect(upserts).toHaveLength(0);
  });

  it('rejects an MP4 (ftyp isom) even when declared as image/jpeg', async () => {
    const res = await POST(
      makeReq(formWith(new File([mp4Bytes()], 'clip.jpg', { type: 'image/jpeg' }), 'photo')),
    );
    expect(res.status).toBe(400);
    expect(uploadObject).not.toHaveBeenCalled();
  });
});

describe('POST /api/upload — tenant write + previous-object cleanup', () => {
  it('stores a logo under onboarding/{spaceId} and upserts SpaceSetting in that space', async () => {
    settingsRows.push({ data: { logoUrl: null }, error: null });

    const res = await POST(
      makeReq(formWith(new File([jpegBytes()], 'brand.jpg', { type: 'image/jpeg' }), 'logo')),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    expect(body.url).toMatch(/^https:\/\/cdn\.test\/onboarding\/space_1\/logo-/);
    expect(body.url).toMatch(/\.jpg$/);

    expect(uploadObject).toHaveBeenCalledTimes(1);
    const uploaded = uploadObject.mock.calls[0]![0] as {
      key: string;
      contentType: string;
      isPublic: boolean;
    };
    expect(uploaded.key.startsWith('onboarding/space_1/logo-')).toBe(true);
    expect(uploaded.contentType).toBe('image/jpeg');
    expect(uploaded.isPublic).toBe(true);

    expect(upserts).toEqual([
      { table: 'SpaceSetting', values: { spaceId: 'space_1', logoUrl: body.url } },
    ]);
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('deletes the previous branding object when SpaceSetting already has a CDN URL', async () => {
    settingsRows.push({
      data: { realtorPhotoUrl: 'https://cdn.test/onboarding/space_1/photo-old.jpg' },
      error: null,
    });

    const res = await POST(
      makeReq(formWith(new File([jpegBytes()], 'me.jpg', { type: 'image/jpeg' }), 'photo')),
    );
    expect(res.status).toBe(200);
    expect(upserts[0]?.values).toMatchObject({ spaceId: 'space_1' });
    expect(deleteObject).toHaveBeenCalledWith('onboarding/space_1/photo-old.jpg');
  });

  it('does not write SpaceSetting for a property-photo and uses the property-photos prefix', async () => {
    const res = await POST(
      makeReq(formWith(new File([jpegBytes()], 'house.jpg', { type: 'image/jpeg' }), 'property-photo')),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    expect(body.url).toMatch(/^https:\/\/cdn\.test\/property-photos\/space_1\//);
    expect(uploadObject.mock.calls[0]![0]).toMatchObject({
      isPublic: true,
    });
    expect((uploadObject.mock.calls[0]![0] as { key: string }).key.startsWith('property-photos/space_1/')).toBe(
      true,
    );
    expect(upserts).toHaveLength(0);
  });

  it('accepts a 4MB+1 property-photo (10MB cap) and still rejects branding at 4MB', async () => {
    const justOverBrand = new Uint8Array(4 * 1024 * 1024 + 1);
    justOverBrand.set(jpegBytes());

    const property = await POST(
      makeReq(formWith(new File([justOverBrand], 'house.jpg', { type: 'image/jpeg' }), 'property-photo')),
    );
    expect(property.status).toBe(200);
    expect(uploadObject).toHaveBeenCalledTimes(1);
  });

  it('transcodes HEIC to JPEG before upload', async () => {
    settingsRows.push({ data: null, error: null });

    const res = await POST(
      makeReq(formWith(new File([heicBytes()], 'iphone.heic', { type: 'image/heic' }), 'logo')),
    );
    expect(res.status).toBe(200);
    expect(heicConvert).toHaveBeenCalledTimes(1);
    const uploaded = uploadObject.mock.calls[0]![0] as { key: string; contentType: string };
    expect(uploaded.contentType).toBe('image/jpeg');
    expect(uploaded.key).toMatch(/\.jpg$/);
  });

  it('returns 422 and does not store the file when HEIC transcode fails', async () => {
    heicConvert.mockRejectedValueOnce(new Error('bad heic'));

    const res = await POST(
      makeReq(formWith(new File([heicBytes()], 'iphone.heic', { type: 'image/heic' }), 'logo')),
    );
    expect(res.status).toBe(422);
    expect(uploadObject).not.toHaveBeenCalled();
    expect(upserts).toHaveLength(0);
  });

  it('returns a generic 500 when storage fails and does not upsert SpaceSetting', async () => {
    uploadObject.mockRejectedValueOnce(new Error('wasabi down'));

    const res = await POST(
      makeReq(formWith(new File([jpegBytes()], 'a.jpg', { type: 'image/jpeg' }), 'logo')),
    );
    expect(res.status).toBe(500);
    expect(upserts).toHaveLength(0);
  });
});
