/**
 * DocuSign Connect webhook — POST only, public (no Clerk).
 *
 * DocuSign Connect posts an envelope status update here as the envelope moves
 * through its lifecycle. We map the DocuSign status onto our SignatureRequest
 * row keyed by envelopeId. On `completed` we download the signed (combined) PDF
 * and store it in the same object store the documents use, then write the
 * storage path + completedAt onto the row.
 *
 * Verification: if DOCUSIGN_CONNECT_KEY is set we verify the HMAC the Connect
 * config signs each payload with (header X-DocuSign-Signature-1, base64
 * HMAC-SHA256 over the raw body). Without the key we accept — same gated posture
 * as the rest of the integration.
 *
 * This handler NEVER throws and ALWAYS returns 200: DocuSign retries non-2xx
 * responses aggressively, so we swallow every error, log it, and ack.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { downloadCompletedDocument } from '@/lib/esign';
import { uploadObject, buildKey } from '@/lib/storage';

export const runtime = 'nodejs';

const OK = NextResponse.json({ received: true });

// DocuSign envelope status → our SignatureRequest status. Anything we don't map
// (e.g. 'created') is left untouched.
const STATUS_MAP: Record<string, 'sent' | 'delivered' | 'completed' | 'declined' | 'voided'> = {
  sent: 'sent',
  delivered: 'delivered',
  completed: 'completed',
  declined: 'declined',
  voided: 'voided',
};

/** Verify the Connect HMAC when a key is configured. Returns true when there's
 *  no key (accept) or the signature matches. */
function verifyHmac(rawBody: string, header: string | null): boolean {
  const key = process.env.DOCUSIGN_CONNECT_KEY;
  if (!key) return true; // not configured → accept
  if (!header) return false;
  const computed = crypto.createHmac('sha256', key).update(rawBody, 'utf8').digest('base64');
  try {
    const a = Buffer.from(computed);
    const b = Buffer.from(header);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Pull envelopeId + status out of either the Connect JSON aggregate shape or
 *  the legacy flat shape. Returns null when neither is present. */
function parseEnvelope(body: unknown): { envelopeId: string; status: string } | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;

  // Connect "JSON" / REST aggregate: { data: { envelopeId, envelopeSummary: { status } } }
  const data = b.data as Record<string, unknown> | undefined;
  if (data) {
    const summary = data.envelopeSummary as Record<string, unknown> | undefined;
    const envelopeId = (data.envelopeId as string) ?? (summary?.envelopeId as string);
    const status = (summary?.status as string) ?? (data.status as string);
    if (envelopeId && status) return { envelopeId, status: String(status).toLowerCase() };
  }

  // Flat shape: { envelopeId, status }
  const flatId = b.envelopeId as string | undefined;
  const flatStatus = (b.status as string | undefined) ?? (b.envelopeStatus as string | undefined);
  if (flatId && flatStatus) return { envelopeId: flatId, status: String(flatStatus).toLowerCase() };

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();

    if (!verifyHmac(rawBody, req.headers.get('x-docusign-signature-1'))) {
      logger.warn('[docusign-webhook] HMAC verification failed');
      // Still 200 — a bad signature is an attacker or misconfig, not something
      // DocuSign should retry. We just don't act on it.
      return OK;
    }

    let parsed: ReturnType<typeof parseEnvelope> = null;
    try {
      parsed = parseEnvelope(JSON.parse(rawBody));
    } catch {
      logger.warn('[docusign-webhook] body was not JSON');
      return OK;
    }
    if (!parsed) {
      logger.warn('[docusign-webhook] no envelopeId/status in payload');
      return OK;
    }

    const mapped = STATUS_MAP[parsed.status];
    if (!mapped) {
      // A status we don't track (e.g. 'created'). Ack and move on.
      return OK;
    }

    // Resolve the request this envelope belongs to.
    const { data: request, error } = await supabase
      .from('SignatureRequest')
      .select('id, spaceId, status, signedDocumentUrl')
      .eq('envelopeId', parsed.envelopeId)
      .maybeSingle();

    if (error) {
      logger.error('[docusign-webhook] lookup failed', { envelopeId: parsed.envelopeId }, error);
      return OK;
    }
    if (!request) {
      logger.warn('[docusign-webhook] no matching request', { envelopeId: parsed.envelopeId });
      return OK;
    }

    // Terminal-state guard: once completed/voided/declined we don't downgrade.
    const TERMINAL = new Set(['completed', 'voided', 'declined']);
    if (TERMINAL.has(request.status) && request.status !== mapped) {
      return OK;
    }

    const now = new Date().toISOString();
    const update: Record<string, unknown> = { status: mapped, updatedAt: now };

    if (mapped === 'completed') {
      update.completedAt = now;
      // Download + store the signed PDF, unless we already have it.
      if (!request.signedDocumentUrl) {
        const dl = await downloadCompletedDocument(parsed.envelopeId);
        if (dl.ok) {
          const key = buildKey(
            'files',
            request.spaceId,
            'signatures',
            `${request.id}-signed.pdf`,
          );
          try {
            await uploadObject({
              key,
              body: dl.bytes,
              contentType: dl.contentType,
              isPublic: false,
            });
            update.signedDocumentUrl = key;
          } catch (uploadErr) {
            // Store the status anyway; the signed-doc fetch can be retried.
            logger.error('[docusign-webhook] signed doc upload failed', { id: request.id }, uploadErr as Error);
          }
        } else {
          logger.warn('[docusign-webhook] could not download signed doc', {
            id: request.id,
            reason: (dl as { reason?: string }).reason,
          });
        }
      }
    }

    const { error: updateError } = await supabase
      .from('SignatureRequest')
      .update(update)
      .eq('id', request.id);

    if (updateError) {
      logger.error('[docusign-webhook] update failed', { id: request.id }, updateError);
    }

    return OK;
  } catch (err) {
    // Absolute backstop — never let DocuSign see a non-200.
    logger.error('[docusign-webhook] handler threw', {}, err);
    return OK;
  }
}
