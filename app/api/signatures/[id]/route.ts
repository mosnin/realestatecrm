/**
 * A single signature request — GET / PATCH
 *
 *   GET   ?slug=<slug>            → { request }   status + a signed-doc download
 *                                                 URL when complete
 *   PATCH { slug, action:'void' } → { request }   void the DocuSign envelope
 *
 * Auth: requireSpaceOwner(slug). The request must belong to the caller's space.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { getSignedDownloadUrl } from '@/lib/storage';
import { isEsignConfigured, voidEnvelope } from '@/lib/esign';

export const runtime = 'nodejs';

const REQUEST_COLUMNS =
  'id, spaceId, dealId, documentId, envelopeId, subject, signerEmail, signerName, status, signedDocumentUrl, completedAt, createdAt, updatedAt';

async function loadRequest(slug: string, id: string) {
  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return { error: auth };
  const { space } = auth;

  const { data, error } = await supabase
    .from('SignatureRequest')
    .select(REQUEST_COLUMNS)
    .eq('id', id)
    .eq('spaceId', space.id)
    .maybeSingle();

  if (error) {
    logger.error('[signatures/id] lookup failed', { id, err: error.message });
    return { error: NextResponse.json({ error: 'Could not load the request.' }, { status: 500 }) };
  }
  if (!data) return { error: NextResponse.json({ error: 'Not found.' }, { status: 404 }) };
  return { request: data, spaceId: space.id };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug is required' }, { status: 400 });

  const result = await loadRequest(slug, id);
  if (result.error) return result.error;
  const { request } = result;

  // Mint a short-lived download URL for the signed PDF when we have one.
  let signedDownloadUrl: string | null = null;
  if (request.signedDocumentUrl) {
    try {
      signedDownloadUrl = await getSignedDownloadUrl(request.signedDocumentUrl as string, 60 * 5);
    } catch (err) {
      logger.warn('[signatures/id] signed url failed', { id }, err);
    }
  }

  return NextResponse.json({ request, signedDownloadUrl });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: { slug?: string; action?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const slug = body.slug?.trim();
  if (!slug) return NextResponse.json({ error: 'slug is required' }, { status: 400 });
  if (body.action !== 'void') {
    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
  }

  const result = await loadRequest(slug, id);
  if (result.error) return result.error;
  const { request, spaceId } = result;

  // Nothing to void in a terminal state.
  if (['completed', 'declined', 'voided'].includes(request.status as string)) {
    return NextResponse.json({ error: `Can't void a ${request.status} request.` }, { status: 409 });
  }

  if (!isEsignConfigured()) {
    return NextResponse.json(
      { error: 'E-signature is not set up for this workspace yet.', code: 'not_configured' },
      { status: 501 },
    );
  }

  if (request.envelopeId) {
    const voided = await voidEnvelope(request.envelopeId as string);
    if ('reason' in voided && voided.reason === 'not_configured') {
      return NextResponse.json(
        { error: 'E-signature is not set up for this workspace yet.', code: 'not_configured' },
        { status: 501 },
      );
    }
    if (!voided.ok) {
      logger.error('[signatures/id] void failed', { id, error: voided.error });
      return NextResponse.json({ error: 'DocuSign would not void this envelope.' }, { status: 502 });
    }
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from('SignatureRequest')
    .update({ status: 'voided', updatedAt: now })
    .eq('id', id)
    .eq('spaceId', spaceId)
    .select(REQUEST_COLUMNS)
    .single();

  if (updateError || !updated) {
    logger.error('[signatures/id] update after void failed', { id, err: updateError?.message });
    return NextResponse.json({ error: 'Voided at DocuSign, but could not update the record.' }, { status: 500 });
  }

  return NextResponse.json({ request: updated });
}
