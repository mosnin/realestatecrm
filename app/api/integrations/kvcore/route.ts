/**
 * kvCORE / BoldTrail — native (non-Composio) connect endpoint.
 *
 *   GET    → { connected, label }            current connection status
 *   POST   { slug, apiKey } → { ok, label }  validate + store the API token
 *   DELETE { slug } → { ok }                 disconnect
 *
 * kvCORE authenticates with a user-generated API token over a Bearer header —
 * there is no OAuth and no Composio toolkit. We validate the token against
 * kvCORE's contacts endpoint, encrypt it at rest (AES-256-GCM), and persist it
 * on a normal IntegrationConnection row with a 'native:kvcore' sentinel in
 * place of a Composio connection id.
 *
 * Auth: requireSpaceOwner(slug) — only the workspace owner can wire their CRM.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { encrypt } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import { verifyApiKey } from '@/lib/integrations/kvcore';
import { findActive, insertConnection, setStatus } from '@/lib/integrations/connections';
import { withObservability } from '@/lib/with-observability';

export const runtime = 'nodejs';
export const maxDuration = 20;

const TOOLKIT = 'kvcore';
const NATIVE_SENTINEL = 'native:kvcore';

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug is required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { userId, space } = auth;

  const row = await findActive({ spaceId: space.id, userId, toolkit: TOOLKIT });
  return NextResponse.json({ connected: Boolean(row), label: row?.label ?? null });
}

async function POSTHandler(req: NextRequest) {
  let payload: { slug?: string; apiKey?: string };
  try {
    payload = (await req.json()) as { slug?: string; apiKey?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const slug = payload.slug?.trim();
  const apiKey = payload.apiKey?.trim();
  if (!slug) return NextResponse.json({ error: 'slug is required' }, { status: 400 });
  if (!apiKey) return NextResponse.json({ error: 'Enter your kvCORE API token.' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { userId, space } = auth;

  // Validate the token against kvCORE before we store anything — never persist
  // a credential we haven't proven authenticates.
  const verdict = await verifyApiKey(apiKey);
  if (!verdict.ok) {
    return NextResponse.json({ error: verdict.reason ?? 'That API token was rejected.' }, { status: 400 });
  }

  // Replace any prior active kvCORE connection (a re-paste of a new token). Use
  // setStatus, NOT revoke() — revoke() would call Composio for a sentinel id.
  const prior = await findActive({ spaceId: space.id, userId, toolkit: TOOLKIT });
  if (prior) await setStatus({ id: prior.id, status: 'revoked' });

  const inserted = await insertConnection({
    spaceId: space.id,
    userId,
    toolkit: TOOLKIT,
    composioConnectionId: NATIVE_SENTINEL,
    label: verdict.label ?? 'kvCORE',
    secretCiphertext: encrypt(apiKey),
  });

  if (!inserted) {
    logger.error('[kvcore] insertConnection returned null', { spaceId: space.id });
    return NextResponse.json({ error: 'Could not save the connection. Try again.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, label: inserted.label });
}

export const POST = withObservability(POSTHandler, 'api.integrations.kvcore');

export async function DELETE(req: NextRequest) {
  let payload: { slug?: string };
  try {
    payload = (await req.json()) as { slug?: string };
  } catch {
    payload = {};
  }
  const slug = payload.slug?.trim() || req.nextUrl.searchParams.get('slug') || '';
  if (!slug) return NextResponse.json({ error: 'slug is required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { userId, space } = auth;

  const row = await findActive({ spaceId: space.id, userId, toolkit: TOOLKIT });
  if (row) await setStatus({ id: row.id, status: 'revoked' });
  return NextResponse.json({ ok: true });
}
