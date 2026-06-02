/**
 * Tests for the e-signature gating + the POST /api/signatures validation path.
 *
 * Two contracts:
 *
 *   1. lib/esign gates on the full DocuSign credential set. With env missing
 *      every exported function returns the `{ ok: false, reason: 'not_configured' }`
 *      no-op sentinel — never throws, never hits the network.
 *
 *   2. POST /api/signatures validates the body BEFORE doing any DocuSign work:
 *      missing slug → 400, missing document → 400, bad email → 400. And when
 *      DocuSign is not configured a well-formed request returns 501 (clean
 *      no-op) rather than a 500.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/api-auth', () => ({
  requireSpaceOwner: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

vi.mock('@/lib/storage', () => ({
  getSignedDownloadUrl: vi.fn(async () => 'https://signed.example/doc'),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { requireSpaceOwner } from '@/lib/api-auth';

const DOCUSIGN_ENV = [
  'DOCUSIGN_INTEGRATION_KEY',
  'DOCUSIGN_USER_ID',
  'DOCUSIGN_ACCOUNT_ID',
  'DOCUSIGN_PRIVATE_KEY',
  'DOCUSIGN_BASE_URL',
] as const;

function clearDocusignEnv() {
  for (const key of DOCUSIGN_ENV) delete process.env[key];
}

// ── lib/esign gating ──────────────────────────────────────────────────────────

describe('lib/esign — gating', () => {
  beforeEach(() => {
    vi.resetModules();
    clearDocusignEnv();
  });

  it('isEsignConfigured is false without env', async () => {
    const esign = await import('@/lib/esign');
    expect(esign.isEsignConfigured()).toBe(false);
  });

  it('getAccessToken no-ops without env', async () => {
    const esign = await import('@/lib/esign');
    const fetchSpy = vi.spyOn(global, 'fetch');
    const res = await esign.getAccessToken();
    expect(res).toEqual({ ok: false, reason: 'not_configured' });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('sendForSignature no-ops without env and never hits the network', async () => {
    const esign = await import('@/lib/esign');
    const fetchSpy = vi.spyOn(global, 'fetch');
    const res = await esign.sendForSignature({
      documentBase64: 'AAAA',
      documentName: 'x.pdf',
      signerEmail: 'a@b.com',
      subject: 'Sign',
    });
    expect(res).toEqual({ ok: false, reason: 'not_configured' });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('getEnvelope / downloadCompletedDocument / voidEnvelope all no-op without env', async () => {
    const esign = await import('@/lib/esign');
    expect(await esign.getEnvelope('env-1')).toEqual({ ok: false, reason: 'not_configured' });
    expect(await esign.downloadCompletedDocument('env-1')).toEqual({ ok: false, reason: 'not_configured' });
    expect(await esign.voidEnvelope('env-1')).toEqual({ ok: false, reason: 'not_configured' });
  });

  it('isEsignConfigured is true with the full credential set', async () => {
    process.env.DOCUSIGN_INTEGRATION_KEY = 'ik';
    process.env.DOCUSIGN_USER_ID = 'uid';
    process.env.DOCUSIGN_ACCOUNT_ID = 'acct';
    process.env.DOCUSIGN_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nxxx\n-----END PRIVATE KEY-----';
    process.env.DOCUSIGN_BASE_URL = 'https://demo.docusign.net';
    const esign = await import('@/lib/esign');
    expect(esign.isEsignConfigured()).toBe(true);
  });
});

// ── POST /api/signatures — validation ────────────────────────────────────────

describe('POST /api/signatures — validation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    clearDocusignEnv();
    (requireSpaceOwner as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      userId: 'user_1',
      space: { id: 'space_1', slug: 'acme' },
    });
  });

  async function post(body: unknown) {
    const { POST } = await import('@/app/api/signatures/route');
    const req = new NextRequest('http://localhost/api/signatures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return POST(req);
  }

  it('400 when slug is missing', async () => {
    const res = await post({ documentId: 'doc_1', signerEmail: 'a@b.com' });
    expect(res.status).toBe(400);
  });

  it('400 when documentId is missing', async () => {
    const res = await post({ slug: 'acme', signerEmail: 'a@b.com' });
    expect(res.status).toBe(400);
  });

  it('400 when signer email is missing', async () => {
    const res = await post({ slug: 'acme', documentId: 'doc_1' });
    expect(res.status).toBe(400);
  });

  it('400 when signer email is malformed', async () => {
    const res = await post({ slug: 'acme', documentId: 'doc_1', signerEmail: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('501 (clean no-op) when DocuSign is not configured', async () => {
    const res = await post({ slug: 'acme', documentId: 'doc_1', signerEmail: 'a@b.com' });
    expect(res.status).toBe(501);
    const json = (await res.json()) as { code?: string };
    expect(json.code).toBe('not_configured');
  });

  it('returns the auth NextResponse when the space gate rejects', async () => {
    (requireSpaceOwner as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );
    const res = await post({ slug: 'acme', documentId: 'doc_1', signerEmail: 'a@b.com' });
    expect(res.status).toBe(403);
  });
});
