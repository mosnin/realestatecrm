/**
 * Google Calendar helpers — token refresh + event mutation primitives.
 *
 * Lives outside the gcal/ route handler so the tour PATCH path can call
 * `deleteEvent` directly when a tour is cancelled, instead of inlining a
 * second copy of the access-token-refresh dance. The route still owns
 * the OAuth flow (`?action=...`); this module owns the API verbs.
 *
 * Every function is best-effort from the caller's perspective: GCal
 * failures should never block the realtor's primary action (cancelling
 * a tour). The route's job is to update the DB; this module's job is to
 * make a respectable attempt at keeping GCal in sync, and to log
 * loudly enough that ops can chase orphans manually if needed.
 */

import { supabase } from '@/lib/supabase';
import { decrypt, encrypt, decryptOrPassthrough } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import { after } from 'next/server';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';

export interface GoogleCalendarTokenRow {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  calendarId?: string | null;
}

/**
 * Return a valid access token for the space, refreshing if the cached
 * one is within 60s of expiry. Updates the token row on refresh so the
 * next caller hits the fast path. Throws on refresh failure — callers
 * should catch and log; the realtor's primary action must not depend
 * on Google being reachable.
 */
export async function getValidAccessToken(
  tokenRow: GoogleCalendarTokenRow,
  spaceId: string,
): Promise<string> {
  const expiresAt = new Date(tokenRow.expiresAt).getTime();
  if (Date.now() < expiresAt - 60_000) {
    // Soft-migration: legacy rows are plaintext, new rows are encrypted.
    // decryptOrPassthrough returns the raw value if decrypt fails — see
    // lib/crypto for why this is safe only for the migration window.
    return decryptOrPassthrough(tokenRow.accessToken);
  }

  // 8s timeout: callers catch a thrown refresh failure and degrade (GCal sync
  // is best-effort). A hung Google token endpoint must not pin the serverless
  // function open — on timeout fetch rejects with an AbortError that the
  // caller's try/catch treats like any other refresh failure.
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: decrypt(tokenRow.refreshToken),
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    logger.error('[gcal-helpers] token refresh failed', { spaceId, status: res.status, errText });
    throw new Error('Failed to refresh Google token');
  }
  const tokens = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!tokens.access_token) throw new Error('No access_token in Google refresh response');

  await supabase
    .from('GoogleCalendarToken')
    .update({
      accessToken: encrypt(tokens.access_token),
      expiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .eq('spaceId', spaceId);

  return tokens.access_token;
}

/**
 * Delete a Google Calendar event for a space. Returns `true` if the
 * event was removed (or was already gone — Google's DELETE returns 410
 * Gone for already-deleted events, which we treat as success).
 *
 * No-op + returns `true` if the space has no GCal token, or the event
 * id is empty — the caller's contract is "make sure this event doesn't
 * exist anymore", and if no token, we never could have created it.
 */
async function performDeleteGoogleEvent(args: {
  spaceId: string;
  googleEventId: string | null | undefined;
}): Promise<boolean> {
  if (!args.googleEventId) return true;

  const { data: tokenRow } = await supabase
    .from('GoogleCalendarToken')
    .select('accessToken, refreshToken, expiresAt, calendarId')
    .eq('spaceId', args.spaceId)
    .maybeSingle();
  if (!tokenRow) return true;

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(
      tokenRow as GoogleCalendarTokenRow,
      args.spaceId,
    );
  } catch (err) {
    logger.warn('[gcal-helpers] could not refresh token for delete', { spaceId: args.spaceId }, err);
    return false;
  }

  const calendarId =
    (tokenRow as { calendarId?: string | null }).calendarId || 'primary';

  // 8s timeout. This function's contract is "return true/false, never throw"
  // — callers fire it as `void deleteGoogleEvent(...).then(...)` with no catch.
  // A bare fetch that hangs (or whose AbortSignal fires) would otherwise
  // throw an unhandled rejection, so we catch the network/timeout error here
  // and degrade to `false` (orphaned event, logged for ops) — never crash.
  let res: Response;
  try {
    res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(args.googleEventId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(8000),
      },
    );
  } catch (err) {
    logger.warn('[gcal-helpers] delete event request failed (network/timeout)', {
      spaceId: args.spaceId,
      googleEventId: args.googleEventId,
    }, err);
    return false;
  }

  // 204 No Content = deleted. 410 Gone = already deleted (idempotent
  // success). 404 Not Found = same — the event was never on this
  // calendar, treat it as the desired terminal state.
  if (res.ok || res.status === 410 || res.status === 404) {
    return true;
  }

  const errText = await res.text().catch(() => '');
  logger.warn('[gcal-helpers] delete event failed', {
    spaceId: args.spaceId,
    googleEventId: args.googleEventId,
    status: res.status,
    errText,
  });
  return false;
}

/**
 * Create a Google Calendar event on the space's legacy-connected calendar.
 * Used when public /book has a GoogleCalendarToken but no Composio calendar.
 * Returns { ok:false } instead of throwing so the book route can roll back.
 */
export async function createGoogleEvent(args: {
  spaceId: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
}): Promise<{ ok: true; googleEventId: string } | { ok: false }> {
  const { data: tokenRow } = await supabase
    .from('GoogleCalendarToken')
    .select('accessToken, refreshToken, expiresAt, calendarId')
    .eq('spaceId', args.spaceId)
    .maybeSingle();
  if (!tokenRow) return { ok: false };

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(tokenRow as GoogleCalendarTokenRow, args.spaceId);
  } catch (err) {
    logger.warn('[gcal-helpers] could not refresh token for create', { spaceId: args.spaceId }, err);
    return { ok: false };
  }

  const calendarId = (tokenRow as { calendarId?: string | null }).calendarId || 'primary';
  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: args.title,
          description: args.description,
          start: { dateTime: args.startsAt, timeZone: 'UTC' },
          end: { dateTime: args.endsAt, timeZone: 'UTC' },
        }),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      logger.warn('[gcal-helpers] create event failed', {
        spaceId: args.spaceId,
        status: res.status,
        errText,
      });
      return { ok: false };
    }
    const created = (await res.json()) as { id?: string };
    if (!created.id) return { ok: false };
    return { ok: true, googleEventId: created.id };
  } catch (err) {
    logger.warn('[gcal-helpers] create event threw', { spaceId: args.spaceId }, err);
    return { ok: false };
  }
}

/**
 * Delete a mirrored Google Calendar event while retaining the exact in-flight
 * request through the end of a Next.js serverless invocation. Callers may keep
 * this best-effort cleanup off their response path without Vercel suspending it;
 * callers that await it preserve the same boolean result.
 */
export async function deleteGoogleEvent(args: {
  spaceId: string;
  googleEventId: string | null | undefined;
}): Promise<boolean> {
  const task = performDeleteGoogleEvent(args);
  try {
    after(() => task);
  } catch {
    // Workers and unit tests may run outside a Next.js request context.
  }
  return task;
}
