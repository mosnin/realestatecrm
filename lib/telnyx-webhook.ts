/**
 * Telnyx webhook signature verification.
 *
 * Telnyx signs every webhook with Ed25519 over `${timestamp}|${rawBody}` and
 * sends the signature + timestamp in the `telnyx-signature-ed25519` and
 * `telnyx-timestamp` headers. We verify against the account's public key
 * (TELNYX_PUBLIC_KEY, base64, from Mission Control).
 *
 * The official `telnyx` SDK already ships an Ed25519 verifier built on Node's
 * native WebCrypto (no tweetnacl, no extra deps) — we wrap it here so the route
 * gets a single boolean instead of try/catching the SDK's throw-on-failure API,
 * and so the public key is parsed once per process instead of per request.
 */
import { TelnyxWebhook } from 'telnyx/webhooks';
import { logger } from '@/lib/logger';

let verifier: TelnyxWebhook | null = null;
let verifierKey: string | undefined;

function getVerifier(): TelnyxWebhook | null {
  const key = process.env.TELNYX_PUBLIC_KEY;
  if (!key) return null;
  // Rebuild only if the key changed (effectively once per process).
  if (!verifier || verifierKey !== key) {
    try {
      verifier = new TelnyxWebhook(key);
      verifierKey = key;
    } catch (err) {
      logger.error('[telnyx-webhook] invalid TELNYX_PUBLIC_KEY', undefined, err);
      verifier = null;
      verifierKey = undefined;
      return null;
    }
  }
  return verifier;
}

export type TelnyxVerifyResult =
  | 'ok' // signature valid
  | 'unconfigured' // no public key set — caller decides whether to allow
  | 'invalid'; // missing/bad/stale signature — reject

/**
 * Verify a Telnyx webhook against the raw (unparsed) request body.
 *
 * @param rawBody The exact bytes of the request body, as a string. Must be the
 *   raw text — re-serializing parsed JSON will NOT match the signature.
 * @param headers The incoming request headers.
 */
export async function verifyTelnyxSignature(
  rawBody: string,
  headers: Headers,
): Promise<TelnyxVerifyResult> {
  const v = getVerifier();
  if (!v) return 'unconfigured';

  const signature = headers.get('telnyx-signature-ed25519');
  const timestamp = headers.get('telnyx-timestamp');
  if (!signature || !timestamp) return 'invalid';

  try {
    // SDK enforces the Ed25519 check AND a 5-minute timestamp tolerance
    // (replay protection); it throws on any failure.
    await v.verify(rawBody, {
      'telnyx-signature-ed25519': signature,
      'telnyx-timestamp': timestamp,
    });
    return 'ok';
  } catch (err) {
    logger.warn('[telnyx-webhook] signature verification failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return 'invalid';
  }
}
