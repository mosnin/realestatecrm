/**
 * Signature requests (realtor-facing) — GET / POST
 *
 *   GET  ?slug=<slug>  → { requests: [...] }   the space's requests, newest first
 *   POST { slug, documentId, signerEmail, signerName?, subject?, dealId? }
 *        → { request }   send a stored document out for signature
 *
 * Auth: requireSpaceOwner(slug). POST loads the chosen DealDocument's bytes,
 * calls DocuSign, and records a SignatureRequest row. When DocuSign isn't
 * configured the send no-ops cleanly (501, never a 500) and no row is written.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireSpaceOwner } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { getSignedDownloadUrl } from '@/lib/storage';
import { isEsignConfigured, sendForSignature } from '@/lib/esign';

export const runtime = 'nodejs';

const SUBJECT_MAX = 200;
// Simple, deliberately strict email shape — full RFC validation is theater.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const REQUEST_COLUMNS =
  'id, spaceId, dealId, documentId, envelopeId, subject, signerEmail, signerName, status, signedDocumentUrl, completedAt, createdAt, updatedAt';

// ── GET — the space's requests ───────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug is required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const { data, error } = await supabase
    .from('SignatureRequest')
    .select(REQUEST_COLUMNS)
    .eq('spaceId', space.id)
    .order('createdAt', { ascending: false })
    .limit(100);

  if (error) {
    logger.error('[signatures] list failed', { spaceId: space.id, err: error.message });
    return NextResponse.json({ error: 'Could not load your requests.' }, { status: 500 });
  }

  return NextResponse.json({ requests: data ?? [] });
}

// ── POST — send a document for signature ─────────────────────────────────────

export async function POST(req: NextRequest) {
  let payload: {
    slug?: string;
    documentId?: string;
    signerEmail?: string;
    signerName?: string;
    subject?: string;
    dealId?: string;
  };
  try {
    payload = (await req.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const slug = payload.slug?.trim();
  if (!slug) return NextResponse.json({ error: 'slug is required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { userId, space } = auth;

  // Validate body before any DocuSign work.
  const documentId = payload.documentId?.trim();
  if (!documentId) return NextResponse.json({ error: 'Pick a document to send.' }, { status: 400 });

  const signerEmail = payload.signerEmail?.trim().toLowerCase() ?? '';
  if (!signerEmail) return NextResponse.json({ error: "Add the signer's email." }, { status: 400 });
  if (!EMAIL_RE.test(signerEmail)) {
    return NextResponse.json({ error: 'That email address looks off.' }, { status: 400 });
  }

  const signerName = payload.signerName?.trim().slice(0, 200) || null;
  const subject = (payload.subject?.trim() || 'Please sign this document').slice(0, SUBJECT_MAX);

  // Gate before touching DocuSign — a clean no-op, never a 500.
  if (!isEsignConfigured()) {
    return NextResponse.json(
      { error: 'E-signature is not set up for this workspace yet.', code: 'not_configured' },
      { status: 501 },
    );
  }

  // Rate limit — sending out envelopes is a billable, irreversible action.
  const { allowed } = await checkRateLimit(`signatures:send:${userId}`, 10, 60);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });
  }

  // Load the document — scoped to this space so a caller can't sign someone
  // else's file.
  const { data: doc, error: docError } = await supabase
    .from('DealDocument')
    .select('id, dealId, label, storagePath, contentType')
    .eq('id', documentId)
    .eq('spaceId', space.id)
    .maybeSingle();

  if (docError) {
    logger.error('[signatures] doc lookup failed', { documentId, err: docError.message });
    return NextResponse.json({ error: 'Could not load that document.' }, { status: 500 });
  }
  if (!doc) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });

  // Fetch the bytes via a short-lived signed URL — same store the documents
  // download path uses, no new storage primitive.
  let documentBase64: string;
  try {
    const url = await getSignedDownloadUrl(doc.storagePath, 60);
    const fileRes = await fetch(url);
    if (!fileRes.ok) throw new Error(`fetch ${fileRes.status}`);
    documentBase64 = Buffer.from(await fileRes.arrayBuffer()).toString('base64');
  } catch (err) {
    logger.error('[signatures] doc fetch failed', { documentId }, err);
    return NextResponse.json({ error: 'Could not read that document.' }, { status: 500 });
  }

  const documentName = (doc.label as string | null)?.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120) || 'document.pdf';

  const sent = await sendForSignature({
    documentBase64,
    documentName: documentName.includes('.') ? documentName : `${documentName}.pdf`,
    signerEmail,
    signerName,
    subject,
  });

  if ('reason' in sent && sent.reason === 'not_configured') {
    // Belt-and-suspenders: config changed mid-flight.
    return NextResponse.json(
      { error: 'E-signature is not set up for this workspace yet.', code: 'not_configured' },
      { status: 501 },
    );
  }
  if (!sent.ok) {
    logger.error('[signatures] send failed', { documentId, error: sent.error });
    return NextResponse.json({ error: 'DocuSign rejected the request. Try again.' }, { status: 502 });
  }

  const now = new Date().toISOString();
  const { data: inserted, error: insertError } = await supabase
    .from('SignatureRequest')
    .insert({
      id: crypto.randomUUID(),
      spaceId: space.id,
      dealId: payload.dealId?.trim() || (doc.dealId as string | null) || null,
      documentId: doc.id,
      envelopeId: sent.envelopeId,
      subject,
      signerEmail,
      signerName,
      status: sent.status === 'sent' ? 'sent' : 'created',
      createdAt: now,
      updatedAt: now,
    })
    .select(REQUEST_COLUMNS)
    .single();

  if (insertError || !inserted) {
    // The envelope is already out at DocuSign; the webhook will still fire, but
    // we couldn't record it. Surface the failure honestly.
    logger.error('[signatures] insert failed after send', { envelopeId: sent.envelopeId, err: insertError?.message });
    return NextResponse.json({ error: 'Sent, but could not save the record. Check DocuSign.' }, { status: 500 });
  }

  return NextResponse.json({ request: inserted }, { status: 201 });
}
