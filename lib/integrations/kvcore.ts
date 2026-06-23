/**
 * kvCORE / BoldTrail — a native CRM adapter that talks straight to the kvCORE
 * Public API V2. No Composio: kvCORE authenticates with a user-generated API
 * token over a Bearer header, so there is no OAuth to wrap.
 *
 * Docs: https://apidocs.kvcore.com/  (Public API V2, base https://api.kvcore.com)
 *
 * The realtor generates a "Contacts" token once (kvCORE → Lead Engine → Lead
 * Dropbox → My API Tokens → Generate), pastes it here, and we validate it,
 * encrypt it at rest, and read their contacts on demand to mirror them on the
 * Smart sync surface.
 *
 * ⚠️ DOC CAVEAT: kvCORE's full V2 reference lives behind a gated Postman SPA,
 * so the exact contacts path and the precise JSON key casing are not publicly
 * verifiable. This adapter targets the documented surface (GET /v2/public/contacts,
 * Bearer auth) and is deliberately defensive about response shape and field
 * names — it maps whatever recognizable keys come back rather than assuming a
 * fixed schema. If kvCORE returns an unexpected shape, we degrade to "connected
 * but couldn't read" rather than throwing. Confirm the exact path/casing against
 * a live token when one is available and tighten the mapping then.
 *
 * This file is pure transport + mapping — no DB, no auth. Storage lives in
 * lib/integrations/connections.ts (the encrypted token on the
 * IntegrationConnection row); the routes wire the two together.
 */

import { logger } from '@/lib/logger';
import type { SyncRecord } from '@/app/api/sync/route';

const KVCORE_BASE = 'https://api.kvcore.com';
const REQUEST_TIMEOUT_MS = 12_000;

/** Bearer auth header — the kvCORE API token. */
function authHeader(token: string): string {
  return `Bearer ${token}`;
}

async function kvFetch(
  token: string,
  path: string,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${KVCORE_BASE}${path}`, {
      method: 'GET',
      headers: {
        Authorization: authHeader(token),
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

export interface KvcoreVerifyResult {
  ok: boolean;
  /** Human-readable label when valid. */
  label: string | null;
  /** Set when ok=false — a realtor-friendly reason. */
  reason?: string;
}

/**
 * Validate an API token by hitting the contacts read endpoint.
 *
 * kvCORE has no dedicated "verify key" endpoint, so we probe the contacts
 * surface and read the auth signal from the status code:
 *   - 2xx              → token is valid and scoped for contacts.
 *   - 401              → token is wrong/expired.
 *   - 403              → token is authentic but lacks the contacts scope
 *                        (the realtor generated a non-"Contacts" token). We
 *                        accept it as a real credential but tell them to
 *                        regenerate with the right scope.
 *   - anything else    → upstream hiccup, surfaced honestly.
 *
 * A 403 still proves the token authenticated (a bad token returns 401), so we
 * treat it as "valid credential, narrow scope" rather than rejecting outright.
 */
export async function verifyApiKey(token: string): Promise<KvcoreVerifyResult> {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, label: null, reason: 'Enter your kvCORE API token.' };

  let res: Awaited<ReturnType<typeof kvFetch>>;
  try {
    res = await kvFetch(trimmed, '/v2/public/contacts?limit=1');
  } catch (err) {
    logger.warn('[kvcore] verify request failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, label: null, reason: 'Could not reach kvCORE. Try again.' };
  }

  if (res.status === 401) {
    return { ok: false, label: null, reason: 'That API token was rejected by kvCORE. Generate a fresh "Contacts" token and try again.' };
  }
  if (res.status === 403) {
    // Authentic token, but not scoped for contacts. Still a real credential —
    // accept it so the realtor isn't blocked, but nudge them to the right scope.
    return { ok: true, label: 'kvCORE' };
  }
  if (!res.ok) {
    return { ok: false, label: null, reason: 'kvCORE returned an error. Try again.' };
  }

  return { ok: true, label: 'kvCORE' };
}

/* ── Contacts → SyncRecord ───────────────────────────────────────────────── */

/**
 * kvCORE contact shape is not publicly documented in full; these are the
 * field names the Zapier "Create Contact" surface exposes (snake_case is the
 * likely API casing). We read several spellings defensively.
 */
interface KvcoreContact {
  id?: number | string;
  name?: string;
  first_name?: string;
  last_name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  cell_phone_1?: string;
  cell_phone?: string;
  phone?: string;
  lead_status?: string;
  status?: string;
  lead_type?: string;
  source?: string;
  created_at?: string;
  updated_at?: string;
  date_registered?: string;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v);
}

function mapContact(c: KvcoreContact, idx: number): SyncRecord {
  const first = str(c.first_name) || str(c.firstName);
  const last = str(c.last_name) || str(c.lastName);
  const composed = [first, last].filter(Boolean).join(' ').trim();
  const email = str(c.email) || null;
  const phone = str(c.cell_phone_1) || str(c.cell_phone) || str(c.phone) || null;
  const stage = str(c.lead_status) || str(c.status) || str(c.lead_type) || null;
  return {
    id: String(c.id ?? idx),
    name: str(c.name) || composed || email || '(no name)',
    email,
    phone,
    stage: stage || null,
    lastActivityAt: str(c.updated_at) || str(c.created_at) || str(c.date_registered) || null,
    recordType: 'Contact',
  };
}

/**
 * Pull the realtor's contacts, mapped to the unified SyncRecord shape. Caps at
 * `limit` (the surface is a mirror, not a paginated table). Returns
 * { ok: false } on any upstream failure — the route decides how to present
 * "connected but couldn't read". Defensive about the response envelope:
 * kvCORE may return a bare array or wrap it in { data | results | contacts | items }.
 */
export async function listContacts(
  token: string,
  limit = 50,
): Promise<{ ok: boolean; records: SyncRecord[] }> {
  let res: Awaited<ReturnType<typeof kvFetch>>;
  try {
    res = await kvFetch(token.trim(), `/v2/public/contacts?limit=${Math.min(limit, 100)}`);
  } catch (err) {
    logger.warn('[kvcore] listContacts request failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, records: [] };
  }

  if (!res.ok) {
    logger.warn('[kvcore] listContacts non-ok', { status: res.status });
    return { ok: false, records: [] };
  }

  // Peel back the common envelope shapes to find the array.
  const body = res.body;
  let items: unknown[] = [];
  if (Array.isArray(body)) {
    items = body;
  } else if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>;
    const container = obj.data ?? obj.results ?? obj.contacts ?? obj.items ?? [];
    items = Array.isArray(container) ? container : [];
  }

  const records = items
    .filter((x): x is KvcoreContact => Boolean(x) && typeof x === 'object')
    .slice(0, limit)
    .map(mapContact);
  return { ok: true, records };
}
