/**
 * DocuSign eSignature REST wrapper.
 *
 * Auth is JWT grant (RS256): we sign a short-lived assertion with the
 * integration key's RSA private key and exchange it for an access token at the
 * DocuSign OAuth endpoint. The token is cached in-process until just before it
 * expires. All REST calls use the platform `fetch`; the JWT is built with
 * `jose`. No new npm dependencies.
 *
 * Gated on the full credential set. With any of the env vars missing every
 * exported function no-ops and returns `{ ok: false, reason: 'not_configured' }`
 * — the feature ships dark until a workspace wires DocuSign, and never throws a
 * 500 in the absence of credentials.
 *
 *   DOCUSIGN_INTEGRATION_KEY  the app's integration (client) key — JWT issuer
 *   DOCUSIGN_USER_ID          the impersonated DocuSign user (API username GUID)
 *   DOCUSIGN_ACCOUNT_ID       the DocuSign account GUID
 *   DOCUSIGN_PRIVATE_KEY      the RSA private key (PEM, PKCS#8)
 *   DOCUSIGN_BASE_URL         eSignature REST base, e.g. https://demo.docusign.net
 *   DOCUSIGN_AUTH_BASE_URL    optional OAuth host, default account-d.docusign.com
 */

import { SignJWT, importPKCS8 } from 'jose';
import { logger } from '@/lib/logger';

// ── Gating ───────────────────────────────────────────────────────────────────

export interface EsignNotConfigured {
  ok: false;
  reason: 'not_configured';
}

const NOT_CONFIGURED: EsignNotConfigured = { ok: false, reason: 'not_configured' };

interface EsignConfig {
  integrationKey: string;
  userId: string;
  accountId: string;
  privateKey: string;
  baseUrl: string;
  authBaseUrl: string;
}

/** Resolve config, or null when any required credential is missing. */
function getConfig(): EsignConfig | null {
  const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY;
  const userId = process.env.DOCUSIGN_USER_ID;
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID;
  const privateKey = process.env.DOCUSIGN_PRIVATE_KEY;
  const baseUrl = process.env.DOCUSIGN_BASE_URL;
  if (!integrationKey || !userId || !accountId || !privateKey || !baseUrl) {
    return null;
  }
  // The auth host is the account-d / account domain (NOT the REST base). The
  // PEM may arrive with literal "\n" sequences from a single-line env var.
  const authBaseUrl = (process.env.DOCUSIGN_AUTH_BASE_URL ?? 'account-d.docusign.com')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
  return {
    integrationKey,
    userId,
    accountId,
    privateKey: privateKey.replace(/\\n/g, '\n'),
    baseUrl: baseUrl.replace(/\/$/, ''),
    authBaseUrl,
  };
}

/** True when the full DocuSign credential set is present. */
export function isEsignConfigured(): boolean {
  return getConfig() !== null;
}

function isNotConfigured(v: unknown): v is EsignNotConfigured {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as { reason?: unknown }).reason === 'not_configured'
  );
}

// ── Access token (JWT grant, cached) ─────────────────────────────────────────

let cachedToken: { token: string; expiresAt: number } | null = null;

export interface AccessTokenOk {
  ok: true;
  accessToken: string;
}

export type AccessTokenResult = AccessTokenOk | EsignNotConfigured | { ok: false; reason: 'error'; error: string };

/**
 * Get a DocuSign access token via JWT grant. Cached in-process and reused until
 * 60s before expiry. Returns the no-op sentinel when DocuSign isn't configured.
 */
export async function getAccessToken(): Promise<AccessTokenResult> {
  const cfg = getConfig();
  if (!cfg) return NOT_CONFIGURED;

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - 60_000 > now) {
    return { ok: true, accessToken: cachedToken.token };
  }

  try {
    const key = await importPKCS8(cfg.privateKey, 'RS256');
    // `aud` is the bare auth host (no scheme). Scope `signature impersonation`
    // is required for the JWT grant flow.
    const assertion = await new SignJWT({ scope: 'signature impersonation' })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(cfg.integrationKey)
      .setSubject(cfg.userId)
      .setAudience(cfg.authBaseUrl)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key);

    const res = await fetch(`https://${cfg.authBaseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error('[esign] token exchange failed', { status: res.status, body: text.slice(0, 300) });
      return { ok: false, reason: 'error', error: `token_exchange_${res.status}` };
    }

    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) {
      return { ok: false, reason: 'error', error: 'no_access_token' };
    }

    const ttlMs = (data.expires_in ?? 3600) * 1000;
    cachedToken = { token: data.access_token, expiresAt: now + ttlMs };
    return { ok: true, accessToken: data.access_token };
  } catch (err) {
    logger.error('[esign] token exchange threw', {}, err);
    return { ok: false, reason: 'error', error: err instanceof Error ? err.message : 'unknown' };
  }
}

// ── Send for signature ───────────────────────────────────────────────────────

export interface SendForSignatureParams {
  /** The document bytes, base64-encoded (no data-URL prefix). */
  documentBase64: string;
  /** File name shown in DocuSign, e.g. "purchase-agreement.pdf". */
  documentName: string;
  signerEmail: string;
  signerName?: string | null;
  subject: string;
}

export interface SendForSignatureOk {
  ok: true;
  envelopeId: string;
  status: string;
}

export type SendForSignatureResult =
  | SendForSignatureOk
  | EsignNotConfigured
  | { ok: false; reason: 'error'; error: string };

/** Lowercase file extension (default pdf) — drives DocuSign's `fileExtension`. */
function fileExtensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) return 'pdf';
  return name.slice(dot + 1).toLowerCase();
}

/**
 * Create and send a single-signer envelope from one document. The signer gets a
 * SignHere tab anchored to the literal text "Signature:" when present, else a
 * default position on page 1. Returns the envelope id + DocuSign status.
 */
export async function sendForSignature(
  params: SendForSignatureParams,
): Promise<SendForSignatureResult> {
  const cfg = getConfig();
  if (!cfg) return NOT_CONFIGURED;

  const token = await getAccessToken();
  if (isNotConfigured(token)) return NOT_CONFIGURED;
  if (!token.ok) return { ok: false, reason: 'error', error: token.error };

  const signerName = params.signerName?.trim() || params.signerEmail;
  const envelope = {
    emailSubject: params.subject,
    status: 'sent',
    documents: [
      {
        documentBase64: params.documentBase64,
        name: params.documentName,
        fileExtension: fileExtensionOf(params.documentName),
        documentId: '1',
      },
    ],
    recipients: {
      signers: [
        {
          email: params.signerEmail,
          name: signerName,
          recipientId: '1',
          routingOrder: '1',
          tabs: {
            signHereTabs: [
              {
                // Anchor to "Signature:" if the doc has it; otherwise DocuSign
                // ignores the anchor and we fall back to a fixed position tab.
                anchorString: 'Signature:',
                anchorUnits: 'pixels',
                anchorXOffset: '40',
                anchorYOffset: '0',
                documentId: '1',
                pageNumber: '1',
                recipientId: '1',
                xPosition: '100',
                yPosition: '100',
              },
            ],
          },
        },
      ],
    },
  };

  try {
    const res = await fetch(
      `${cfg.baseUrl}/restapi/v2.1/accounts/${cfg.accountId}/envelopes`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(envelope),
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error('[esign] envelope create failed', { status: res.status, body: text.slice(0, 300) });
      return { ok: false, reason: 'error', error: `envelope_create_${res.status}` };
    }

    const data = (await res.json()) as { envelopeId?: string; status?: string };
    if (!data.envelopeId) {
      return { ok: false, reason: 'error', error: 'no_envelope_id' };
    }
    return { ok: true, envelopeId: data.envelopeId, status: data.status ?? 'sent' };
  } catch (err) {
    logger.error('[esign] envelope create threw', {}, err);
    return { ok: false, reason: 'error', error: err instanceof Error ? err.message : 'unknown' };
  }
}

// ── Read / download / void ───────────────────────────────────────────────────

export interface GetEnvelopeOk {
  ok: true;
  envelopeId: string;
  status: string;
  /** ISO timestamp of completion, when DocuSign reports it. */
  completedDateTime?: string | null;
}

export type GetEnvelopeResult =
  | GetEnvelopeOk
  | EsignNotConfigured
  | { ok: false; reason: 'error'; error: string };

/** Fetch an envelope's current status from DocuSign. */
export async function getEnvelope(envelopeId: string): Promise<GetEnvelopeResult> {
  const cfg = getConfig();
  if (!cfg) return NOT_CONFIGURED;

  const token = await getAccessToken();
  if (isNotConfigured(token)) return NOT_CONFIGURED;
  if (!token.ok) return { ok: false, reason: 'error', error: token.error };

  try {
    const res = await fetch(
      `${cfg.baseUrl}/restapi/v2.1/accounts/${cfg.accountId}/envelopes/${encodeURIComponent(envelopeId)}`,
      { headers: { Authorization: `Bearer ${token.accessToken}` } },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error('[esign] get envelope failed', { status: res.status, body: text.slice(0, 300) });
      return { ok: false, reason: 'error', error: `get_envelope_${res.status}` };
    }
    const data = (await res.json()) as { status?: string; completedDateTime?: string | null };
    return {
      ok: true,
      envelopeId,
      status: data.status ?? 'unknown',
      completedDateTime: data.completedDateTime ?? null,
    };
  } catch (err) {
    logger.error('[esign] get envelope threw', {}, err);
    return { ok: false, reason: 'error', error: err instanceof Error ? err.message : 'unknown' };
  }
}

export interface DownloadCompletedOk {
  ok: true;
  /** The combined signed PDF bytes. */
  bytes: Buffer;
  contentType: string;
}

export type DownloadCompletedResult =
  | DownloadCompletedOk
  | EsignNotConfigured
  | { ok: false; reason: 'error'; error: string };

/**
 * Download the completed (combined) document for an envelope as PDF bytes. Use
 * the `combined` document id so a multi-doc envelope returns a single PDF.
 */
export async function downloadCompletedDocument(
  envelopeId: string,
): Promise<DownloadCompletedResult> {
  const cfg = getConfig();
  if (!cfg) return NOT_CONFIGURED;

  const token = await getAccessToken();
  if (isNotConfigured(token)) return NOT_CONFIGURED;
  if (!token.ok) return { ok: false, reason: 'error', error: token.error };

  try {
    const res = await fetch(
      `${cfg.baseUrl}/restapi/v2.1/accounts/${cfg.accountId}/envelopes/${encodeURIComponent(envelopeId)}/documents/combined`,
      {
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          Accept: 'application/pdf',
        },
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error('[esign] download failed', { status: res.status, body: text.slice(0, 300) });
      return { ok: false, reason: 'error', error: `download_${res.status}` };
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    return { ok: true, bytes, contentType: 'application/pdf' };
  } catch (err) {
    logger.error('[esign] download threw', {}, err);
    return { ok: false, reason: 'error', error: err instanceof Error ? err.message : 'unknown' };
  }
}

export type VoidEnvelopeResult =
  | { ok: true }
  | EsignNotConfigured
  | { ok: false; reason: 'error'; error: string };

/** Void an in-flight envelope. DocuSign requires a non-empty reason. */
export async function voidEnvelope(
  envelopeId: string,
  reason = 'Voided by realtor.',
): Promise<VoidEnvelopeResult> {
  const cfg = getConfig();
  if (!cfg) return NOT_CONFIGURED;

  const token = await getAccessToken();
  if (isNotConfigured(token)) return NOT_CONFIGURED;
  if (!token.ok) return { ok: false, reason: 'error', error: token.error };

  try {
    const res = await fetch(
      `${cfg.baseUrl}/restapi/v2.1/accounts/${cfg.accountId}/envelopes/${encodeURIComponent(envelopeId)}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'voided', voidedReason: reason.slice(0, 200) }),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error('[esign] void failed', { status: res.status, body: text.slice(0, 300) });
      return { ok: false, reason: 'error', error: `void_${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    logger.error('[esign] void threw', {}, err);
    return { ok: false, reason: 'error', error: err instanceof Error ? err.message : 'unknown' };
  }
}

/** Test-only: clear the cached access token between cases. */
export function __resetEsignCacheForTests(): void {
  cachedToken = null;
}
