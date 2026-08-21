/**
 * Busy-time lookup for public tour availability.
 *
 * Same connection the write path uses:
 *   1. Active Composio calendar (IntegrationConnection) via events list.
 *   2. Legacy GoogleCalendarToken freeBusy — only when Composio is not
 *      connected, so existing OAuth rows keep blocking slots.
 *
 * A lookup failure returns [] (same as today's silent degrade) so a
 * flaky calendar never blanks the booking page. The write path is
 * strict; this path is optimistic.
 */

import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { logger } from '@/lib/logger';
import { executeToolForEntity } from '@/lib/integrations/composio';
import { decrypt, decryptOrPassthrough, encrypt } from '@/lib/crypto';
import {
  PROVIDER_TOOL_SLUGS,
  findCalendarConnection,
} from '@/lib/calendar/mirror';

export interface BusySlot {
  start: number;
  end: number;
}

interface ListedEvent {
  start?: { dateTime?: string | null; date?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null } | null;
  status?: string | null;
}

function eventToBusy(raw: ListedEvent): BusySlot | null {
  if (raw.status === 'cancelled') return null;
  const startIso = raw.start?.dateTime ?? raw.start?.date ?? null;
  const endIso = raw.end?.dateTime ?? raw.end?.date ?? null;
  if (!startIso || !endIso) return null;
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { start, end };
}

function extractEventList(resp: { data?: unknown; items?: unknown }): unknown[] {
  const data = resp.data as { items?: unknown; events?: unknown } | undefined;
  if (data && Array.isArray(data.items)) return data.items;
  if (data && Array.isArray(data.events)) return data.events;
  if (Array.isArray(resp.items)) return resp.items;
  return [];
}

async function fetchComposioBusy(
  spaceId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<BusySlot[] | null> {
  const connection = await findCalendarConnection(spaceId);
  if (!connection) return null;

  const slugs = PROVIDER_TOOL_SLUGS[connection.toolkit];
  try {
    const resp = await executeToolForEntity({
      entityId: connection.userId,
      slug: slugs.list,
      arguments: {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 250,
      },
    });
    if (!resp.successful) {
      logger.warn('[calendar.busy] composio list failed', {
        spaceId,
        provider: connection.toolkit,
        err: resp.error ?? null,
      });
      return [];
    }
    const slots: BusySlot[] = [];
    for (const raw of extractEventList(resp as { data?: unknown; items?: unknown })) {
      const slot = eventToBusy(raw as ListedEvent);
      if (slot) slots.push(slot);
    }
    return slots;
  } catch (err) {
    logger.warn('[calendar.busy] composio list threw', { spaceId }, err);
    return [];
  }
}

async function fetchLegacyGoogleBusy(
  spaceId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<BusySlot[]> {
  const { data: tokenRow } = await tenantTable(supabase, 'GoogleCalendarToken', { spaceId })
    .select('accessToken, refreshToken, expiresAt, calendarId')
    .maybeSingle();
  if (!tokenRow) return [];

  try {
    const accessToken = await getLegacyAccessToken(
      tokenRow as {
        accessToken: string;
        refreshToken: string;
        expiresAt: string;
        calendarId?: string | null;
      },
      spaceId,
    );
    const calendarId = (tokenRow as { calendarId?: string | null }).calendarId || 'primary';
    const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: [{ id: calendarId }],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      logger.warn('[calendar.busy] legacy freeBusy failed', { spaceId, status: res.status });
      return [];
    }
    const data = (await res.json()) as {
      calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>;
    };
    const busyPeriods = data.calendars?.[calendarId]?.busy ?? [];
    return busyPeriods
      .map((b) => ({
        start: new Date(b.start).getTime(),
        end: new Date(b.end).getTime(),
      }))
      .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end) && b.end > b.start);
  } catch (err) {
    logger.warn('[calendar.busy] legacy freeBusy threw', { spaceId }, err);
    return [];
  }
}

async function getLegacyAccessToken(
  tokenRow: { accessToken: string; refreshToken: string; expiresAt: string },
  spaceId: string,
): Promise<string> {
  const expiresAt = new Date(tokenRow.expiresAt).getTime();
  if (Date.now() < expiresAt - 60_000) {
    return decryptOrPassthrough(tokenRow.accessToken);
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      refresh_token: decrypt(tokenRow.refreshToken),
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error('Failed to refresh Google token');
  const tokens = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!tokens.access_token) throw new Error('No access_token in Google refresh response');
  await tenantTable(supabase, 'GoogleCalendarToken', { spaceId }).update({
    accessToken: encrypt(tokens.access_token),
    expiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return tokens.access_token;
}

/**
 * Busy intervals on the realtor's calendar for [timeMin, timeMax].
 * Prefers the Composio connection (same as writes). Falls back to the
 * legacy token only when that connection is absent.
 */
export async function fetchCalendarBusySlots(
  spaceId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<BusySlot[]> {
  const composio = await fetchComposioBusy(spaceId, timeMin, timeMax);
  if (composio !== null) return composio;
  return fetchLegacyGoogleBusy(spaceId, timeMin, timeMax);
}
