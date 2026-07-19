/**
 * Browser-control pairing + token auth.
 *
 * Mirrors app/api/mcp-keys/route.ts's key hygiene: the raw bearer token is
 * generated once, returned to the caller exactly once, and only its sha256
 * hash is ever persisted (BrowserLink.tokenHash). Pairing codes follow the
 * same shape at a shorter TTL (BrowserPairingCode.codeHash) and are single-use
 * — redeemed atomically via a conditional UPDATE ... WHERE "redeemedAt" IS
 * NULL, so two concurrent redeems of the same code can't both succeed.
 *
 * Token/code lookups are necessarily NOT spaceId-scoped (the token/code IS
 * the identity check that PRODUCES the scope) — each such query is annotated
 * with `unscoped(...)` per lib/supabase-guard.ts's documented escape hatch.
 */

import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { unscoped } from '@/lib/supabase-guard';
import { EXT_TOKEN_PREFIX, PAIRING_CODE_LENGTH, PAIRING_CODE_TTL_SECONDS } from './protocol';

export interface BrowserLinkRow {
  id: string;
  spaceId: string;
  userId: string;
  tokenPrefix: string;
  deviceLabel: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

// Unambiguous alphabet — no 0/O, 1/I/L confusion — since a human types this.
const PAIRING_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generatePairingCode(): string {
  const bytes = crypto.randomBytes(PAIRING_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < PAIRING_CODE_LENGTH; i++) {
    code += PAIRING_CODE_ALPHABET[bytes[i] % PAIRING_CODE_ALPHABET.length];
  }
  return code;
}

function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Mint a fresh extension bearer token. Mirrors mcp-keys' rawKey/keyHash/keyPrefix shape. */
export function mintExtToken(): { raw: string; hash: string; prefix: string } {
  const raw = `${EXT_TOKEN_PREFIX}${crypto.randomBytes(24).toString('hex')}`;
  const hash = sha256(raw);
  const prefix = raw.slice(0, EXT_TOKEN_PREFIX.length + 6) + '...';
  return { raw, hash, prefix };
}

/**
 * Issue a short-lived pairing code for the authenticated realtor. Caller must
 * have already resolved (spaceId, userId) from the authenticated Clerk
 * session — never from request body input.
 */
export async function issuePairingCode(opts: {
  spaceId: string;
  userId: string;
}): Promise<{ code: string; expiresAt: string }> {
  const code = generatePairingCode();
  const codeHash = sha256(normalizeCode(code));
  const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_SECONDS * 1000).toISOString();

  const { error } = await supabase.from('BrowserPairingCode').insert({
    id: crypto.randomUUID(),
    spaceId: opts.spaceId,
    userId: opts.userId,
    codeHash,
    expiresAt,
  });
  if (error) throw error;

  return { code, expiresAt };
}

export type RedeemPairingResult =
  | { ok: true; token: string; tokenPrefix: string; spaceId: string; userId: string; linkId: string }
  | { ok: false; error: 'invalid_code' | 'expired_code' };

/**
 * Redeem a pairing code (extension side, no Clerk session) for a long-lived
 * bearer token. Single-use: the claiming UPDATE only succeeds while
 * `redeemedAt IS NULL`, so a code can mint at most one BrowserLink even under
 * concurrent redeem attempts.
 */
export async function redeemPairingCode(
  code: string,
  opts: { deviceLabel?: string },
): Promise<RedeemPairingResult> {
  const codeHash = sha256(normalizeCode(code));

  const { data: row, error } = await unscoped(
    supabase
      .from('BrowserPairingCode')
      .select('id, spaceId, userId, expiresAt, redeemedAt'),
    'pairing code redeem — the code hash IS the identity check',
  )
    .eq('codeHash', codeHash)
    .maybeSingle();

  if (error || !row) return { ok: false, error: 'invalid_code' };
  const pairingRow = row as { id: string; spaceId: string; userId: string; expiresAt: string; redeemedAt: string | null };
  if (pairingRow.redeemedAt) return { ok: false, error: 'invalid_code' };
  if (new Date(pairingRow.expiresAt).getTime() < Date.now()) return { ok: false, error: 'expired_code' };

  // Atomic single-use claim: only succeeds for the first concurrent redeemer.
  const { data: claimed, error: claimErr } = await unscoped(
    supabase.from('BrowserPairingCode').update({ redeemedAt: new Date().toISOString() }),
    'pairing code redeem — single-use claim guarded by redeemedAt IS NULL',
  )
    .eq('id', pairingRow.id)
    .is('redeemedAt', null)
    .select('id')
    .maybeSingle();
  if (claimErr || !claimed) return { ok: false, error: 'invalid_code' };

  const { raw, hash, prefix } = mintExtToken();
  const deviceLabel = opts.deviceLabel?.trim().slice(0, 120) || null;
  const linkId = crypto.randomUUID();

  const { error: linkErr } = await supabase.from('BrowserLink').insert({
    id: linkId,
    spaceId: pairingRow.spaceId,
    userId: pairingRow.userId,
    tokenHash: hash,
    tokenPrefix: prefix,
    deviceLabel,
  });
  if (linkErr) return { ok: false, error: 'invalid_code' };

  return {
    ok: true,
    token: raw,
    tokenPrefix: prefix,
    spaceId: pairingRow.spaceId,
    userId: pairingRow.userId,
    linkId,
  };
}

/**
 * Resolve the extension's `Authorization: Bearer <token>` header to a
 * non-revoked BrowserLink. Updates lastUsedAt best-effort (never blocks or
 * fails the auth check on that write).
 */
export async function verifyExtToken(
  authHeader: string | null | undefined,
): Promise<{ link: BrowserLinkRow } | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const raw = authHeader.slice('Bearer '.length).trim();
  if (!raw.startsWith(EXT_TOKEN_PREFIX)) return null;
  const hash = sha256(raw);

  const { data, error } = await unscoped(
    supabase
      .from('BrowserLink')
      .select('id, spaceId, userId, tokenPrefix, deviceLabel, createdAt, lastUsedAt, revokedAt'),
    'extension bearer token lookup — the token hash IS the identity check',
  )
    .eq('tokenHash', hash)
    .maybeSingle();

  if (error || !data) return null;
  const link = data as BrowserLinkRow;
  if (link.revokedAt) return null;

  // Best-effort — an update failure here must never fail the auth check.
  void supabase
    .from('BrowserLink')
    .update({ lastUsedAt: new Date().toISOString() })
    .eq('id', link.id)
    .then(() => undefined, () => undefined);

  return { link };
}
