/**
 * Google Calendar signal source — Phase D2. Sibling of `calendar.ts`
 * (Chippi-native Tours); reads everything else via Composio's
 * GOOGLECALENDAR_EVENTS_LIST. Three signals:
 *   - reply / urg 1 / 0.88 — today, attendee declined < 24h ago
 *   - prep  / urg 1 / 0.92 — today within next 4h
 *   - prep  / urg 2 / 0.82 — tomorrow, no recent thread (>14d since contact)
 * Cuts: no-attendee, no-Contact-match, recurring series > 60d old,
 * no-summary rows, events already mirrored as a Chippi Tour. Skip path:
 * no active `googlecalendar` IntegrationConnection → []. 3s timeout → [].
 */

import { supabase } from '@/lib/supabase';
import { executeToolForEntity, composioConfigured } from '@/lib/integrations/composio';
import type { Signal, SignalGatherer } from '../types';

const MS_H = 1000 * 60 * 60;
const MS_D = MS_H * 24;
const TIMEOUT_MS = 3000;
const LOOKAHEAD_H = 36;
const RECENT_THREAD_D = 14;
const STALE_RECURRING_D = 60;

interface RawAttendee { email?: string; responseStatus?: string; self?: boolean; organizer?: boolean; resource?: boolean }
interface RawEvent { id?: string; summary?: string; start?: { dateTime?: string; date?: string }; attendees?: RawAttendee[]; recurringEventId?: string; originalStartTime?: { dateTime?: string; date?: string }; status?: string }
interface ContactLite { id: string; name: string; email: string; lastContactedAt: string | null }

export interface ClassifyInput { id: string; summary: string; start: Date; contact: ContactLite; declined: boolean; hasRecentThread: boolean }

// ─── Pure helpers (exported for tests) ───────────────────────────────────────

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const t = email.trim().toLowerCase();
  return t.length > 0 ? t : null;
}

export function eventStart(ev: RawEvent): Date | null {
  const iso = ev.start?.dateTime ?? ev.start?.date;
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

export function isStaleRecurring(ev: RawEvent, now: Date): boolean {
  if (!ev.recurringEventId) return false;
  const s = ev.originalStartTime?.dateTime ?? ev.originalStartTime?.date;
  if (!s) return false;
  const d = new Date(s);
  return !isNaN(d.getTime()) && now.getTime() - d.getTime() > STALE_RECURRING_D * MS_D;
}

export function findMatchedAttendee(ev: RawEvent, byEmail: Map<string, ContactLite>): { contact: ContactLite; status: string } | null {
  if (!Array.isArray(ev.attendees)) return null;
  for (const a of ev.attendees) {
    if (a.self || a.organizer || a.resource) continue;
    const email = normalizeEmail(a.email);
    const contact = email ? byEmail.get(email) : null;
    if (contact) return { contact, status: a.responseStatus ?? 'needsAction' };
  }
  return null;
}

export function classifyEvent(ev: ClassifyInput, now: Date, attendeeFiredAt: Date | null): Signal | null {
  const hoursAway = (ev.start.getTime() - now.getTime()) / MS_H;
  if (hoursAway < -0.5) return null;
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const isToday = sameDay(ev.start, now);
  const isTomorrow = sameDay(ev.start, tomorrow);
  const href = `/contacts/${ev.contact.id}`;
  const time = formatTime(ev.start);
  const subject = { id: ev.contact.id, name: ev.contact.name, href };
  const title = trimSummary(ev.summary);
  const draftedAction = { kind: 'open' as const, href };
  const base = { source: 'calendar_google' as const, subject, draftedAction };

  if (isToday && ev.declined && attendeeFiredAt && now.getTime() - attendeeFiredAt.getTime() < MS_D) {
    return { ...base, kind: 'reply', urgency: 1, confidence: 0.88, evidence: `${ev.contact.name} declined ${title} at ${time}.` };
  }
  if (isToday && hoursAway >= 0 && hoursAway <= 4) {
    return { ...base, kind: 'prep', urgency: 1, confidence: 0.92, evidence: `${title} with ${ev.contact.name} at ${time}.` };
  }
  if (isTomorrow && !ev.hasRecentThread) {
    return { ...base, kind: 'prep', urgency: 2, confidence: 0.82, evidence: `${title} with ${ev.contact.name} tomorrow ${time}. No recent thread.` };
  }
  return null;
}

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const formatTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
const trimSummary = (s: string) => { const t = s.trim(); return t.length > 60 ? `${t.slice(0, 57)}…` : t; };

// ─── Source ──────────────────────────────────────────────────────────────────

export const calendarGoogleSource: SignalGatherer = {
  source: 'calendar_google',
  async gather(spaceId: string): Promise<Signal[]> {
    if (!composioConfigured()) return [];
    const conn = await findActiveConnection(spaceId);
    if (!conn) return [];

    const now = new Date();
    const timeMax = new Date(now.getTime() + LOOKAHEAD_H * MS_H);

    let events: RawEvent[];
    try {
      const res = await withTimeout(
        executeToolForEntity({
          entityId: conn.userId,
          slug: 'GOOGLECALENDAR_EVENTS_LIST',
          arguments: { calendarId: 'primary', timeMin: now.toISOString(), timeMax: timeMax.toISOString(), singleEvents: true, orderBy: 'startTime', maxResults: 50 },
        }),
        TIMEOUT_MS,
      );
      events = extractEvents(res);
    } catch {
      return [];
    }
    if (events.length === 0) return [];

    const [contacts, tourIds, firedAt] = await Promise.all([
      loadContacts(spaceId),
      loadTourEventIds(spaceId),
      loadAttendeeFiredAt(conn.id),
    ]);
    const byEmail = new Map(contacts.map((c) => [c.email, c]));

    const signals: Signal[] = [];
    for (const ev of events) {
      if (!ev.id || tourIds.has(ev.id)) continue;
      if (!ev.summary?.trim()) continue;
      if (ev.status === 'cancelled') continue;
      if (isStaleRecurring(ev, now)) continue;
      const start = eventStart(ev);
      if (!start) continue;
      const matched = findMatchedAttendee(ev, byEmail);
      if (!matched) continue;

      const lc = matched.contact.lastContactedAt ? new Date(matched.contact.lastContactedAt) : null;
      const hasRecentThread = lc !== null && !isNaN(lc.getTime()) && now.getTime() - lc.getTime() < RECENT_THREAD_D * MS_D;

      const sig = classifyEvent(
        { id: ev.id, summary: ev.summary, start, contact: matched.contact, declined: matched.status === 'declined', hasRecentThread },
        now,
        firedAt,
      );
      if (sig) signals.push(sig);
    }
    return signals;
  },
};

// ─── DB / Composio ───────────────────────────────────────────────────────────

async function findActiveConnection(spaceId: string): Promise<{ id: string; userId: string } | null> {
  const { data } = await supabase.from('IntegrationConnection').select('id, userId').eq('spaceId', spaceId).eq('toolkit', 'googlecalendar').eq('status', 'active').limit(1).maybeSingle();
  return (data ?? null) as { id: string; userId: string } | null;
}

async function loadContacts(spaceId: string): Promise<ContactLite[]> {
  const { data } = await supabase.from('Contact').select('id, name, email, lastContactedAt').eq('spaceId', spaceId).not('email', 'is', null);
  const out: ContactLite[] = [];
  for (const r of (data ?? []) as Array<{ id: string; name: string; email: string | null; lastContactedAt: string | null }>) {
    const e = normalizeEmail(r.email);
    if (e) out.push({ id: r.id, name: r.name, email: e, lastContactedAt: r.lastContactedAt });
  }
  return out;
}

async function loadTourEventIds(spaceId: string): Promise<Set<string>> {
  const { data } = await supabase.from('Tour').select('googleEventId').eq('spaceId', spaceId).not('googleEventId', 'is', null);
  const ids = new Set<string>();
  for (const r of (data ?? []) as Array<{ googleEventId: string | null }>) if (r.googleEventId) ids.add(r.googleEventId);
  return ids;
}

async function loadAttendeeFiredAt(connectionId: string): Promise<Date | null> {
  const { data } = await supabase.from('IntegrationTrigger').select('lastFiredAt').eq('connectionId', connectionId).eq('triggerSlug', 'GOOGLECALENDAR_ATTENDEE_RESPONSE_CHANGED_TRIGGER').maybeSingle();
  const iso = (data as { lastFiredAt?: string | null } | null)?.lastFiredAt ?? null;
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function extractEvents(res: unknown): RawEvent[] {
  const obj = res as Record<string, unknown> | null;
  if (!obj) return [];
  const data = (obj.data ?? obj) as Record<string, unknown>;
  for (const c of [data.items, data.events, data.response, data]) if (Array.isArray(c)) return c as RawEvent[];
  return [];
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
