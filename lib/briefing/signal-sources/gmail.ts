/**
 * Gmail signal source — the silences the drafts source can't see.
 *   1. Realtor sent last, no reply in 4+ days (>100 char message)
 *   2. Same for HOT contacts at 2+ days
 *   3. Inbound from known contact ≤6h ago, no pending Gmail-triggered draft
 *
 * Signals 1+2 never overlap with drafts (realtor-sent messages don't fire
 * GMAIL_NEW_GMAIL_MESSAGE on us). Signal 3 explicitly gates on the
 * absence of any pending Gmail-triggered AgentDraft on the same contact.
 *
 * Skipped when no active gmail IntegrationConnection. 4s Composio timeout.
 */

import { supabase } from '@/lib/supabase';
import { HOT_LEAD_THRESHOLD } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { executeToolForEntity } from '@/lib/integrations/composio';
import type { Signal, SignalGatherer } from '../types';

const MS_PER_HOUR = 3600_000;
const MS_PER_DAY = MS_PER_HOUR * 24;
const QUIET_DAYS = 4;
const HOT_QUIET_DAYS = 2;
const FRESH_HOURS = 6;
const LOOKBACK_DAYS = 7;
const TIMEOUT_MS = 4000;
const MAX_MESSAGES = 100;

interface GmailMessage {
  threadId?: string; sender?: string; from?: string; to?: string | string[];
  messageText?: string; snippet?: string;
  messageTimestamp?: string; internalDate?: string; date?: string;
  labelIds?: string[];
}
export interface ThreadView {
  threadId: string; otherParties: Set<string>; lastAt: string;
  lastFromRealtor: boolean; lastBodyLen: number;
}
interface ContactRow { id: string; name: string; email: string | null; leadScore: number | null }

/** "Name <a@b>" or bare "a@b" → "a@b" (lowercased). */
export function extractEmail(s: string | null | undefined): string | null {
  if (!s) return null;
  const angle = s.match(/<([^>]+)>/);
  const raw = (angle ? angle[1] : s).trim().toLowerCase();
  return raw.includes('@') ? raw : null;
}

function parseTimestamp(m: GmailMessage): number | null {
  for (const c of [m.messageTimestamp, m.date, m.internalDate]) {
    if (!c) continue;
    const ms = /^\d+$/.test(c) ? Number(c) : Date.parse(c);
    if (!Number.isNaN(ms) && ms > 0) return ms;
  }
  return null;
}

/** Collapse messages → per-thread views. */
export function buildThreadViews(messages: GmailMessage[], realtorEmail: string | null): Map<string, ThreadView> {
  const me = realtorEmail?.toLowerCase() ?? null;
  const threads = new Map<string, ThreadView>();
  for (const m of messages) {
    if (!m.threadId) continue;
    const ts = parseTimestamp(m);
    if (ts == null) continue;
    const fromEmail = extractEmail(m.sender ?? m.from);
    const isSent = (m.labelIds ?? []).includes('SENT') || (me != null && fromEmail === me);
    const existing = threads.get(m.threadId);
    const otherParties = existing?.otherParties ?? new Set<string>();
    if (fromEmail && fromEmail !== me) otherParties.add(fromEmail);
    const toList = Array.isArray(m.to) ? m.to : m.to ? [m.to] : [];
    for (const addr of toList) { const e = extractEmail(addr); if (e && e !== me) otherParties.add(e); }
    if (!existing || ts > Date.parse(existing.lastAt)) {
      threads.set(m.threadId, {
        threadId: m.threadId, otherParties, lastAt: new Date(ts).toISOString(),
        lastFromRealtor: isSent, lastBodyLen: (m.messageText ?? m.snippet ?? '').length,
      });
    }
  }
  return threads;
}

export function dayWord(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'recently';
  return d.toLocaleDateString('en-US', { weekday: 'long' });
}

/** Pure scoring. */
export function scoreThread(thread: ThreadView, contact: ContactRow, now: number, hasGmailDraft: boolean): Signal | null {
  const href = `/contacts/${contact.id}`;
  const subject = { id: contact.id, name: contact.name, href };
  const isHot = (contact.leadScore ?? 0) >= HOT_LEAD_THRESHOLD;
  const elapsed = now - Date.parse(thread.lastAt);
  const days = Math.floor(elapsed / MS_PER_DAY);
  const hours = elapsed / MS_PER_HOUR;

  if (thread.lastFromRealtor) {
    if (isHot && days >= HOT_QUIET_DAYS) return {
      source: 'gmail', kind: 'reply', urgency: 1, confidence: 0.9, subject,
      evidence: `${contact.name} hasn't replied since ${dayWord(thread.lastAt)}. Hot tier.`,
      draftedAction: { kind: 'open', href },
    };
    if (days >= QUIET_DAYS && thread.lastBodyLen > 100) return {
      source: 'gmail', kind: 'reply', urgency: 2, confidence: 0.85, subject,
      evidence: `${contact.name} hasn't replied to your ${dayWord(thread.lastAt)} email.`,
      draftedAction: { kind: 'open', href },
    };
    return null;
  }

  if (hours <= FRESH_HOURS && !hasGmailDraft) {
    const at = new Date(thread.lastAt).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: false,
    });
    return {
      source: 'gmail', kind: 'reply', urgency: 1, confidence: 0.82, subject,
      evidence: `${contact.name} emailed at ${at} — Chippi didn't draft. Worth a look.`,
      draftedAction: { kind: 'open', href },
    };
  }
  return null;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`gmail.fetch ${ms}ms`)), ms))]);
}

export const gmailSource: SignalGatherer = {
  source: 'gmail',
  async gather(spaceId: string): Promise<Signal[]> {
    const { data: connRows } = await supabase
      .from('IntegrationConnection').select('userId, label')
      .eq('spaceId', spaceId).eq('toolkit', 'gmail').eq('status', 'active')
      .order('updatedAt', { ascending: false }).limit(1);
    const conn = (connRows ?? [])[0] as { userId: string; label: string | null } | undefined;
    if (!conn) return [];

    let messages: GmailMessage[] = [];
    try {
      const result = await withTimeout(
        executeToolForEntity({
          entityId: conn.userId, slug: 'GMAIL_FETCH_EMAILS',
          arguments: { query: `newer_than:${LOOKBACK_DAYS}d`, max_results: MAX_MESSAGES, verbose: true },
        }),
        TIMEOUT_MS,
      );
      messages = (result as { data?: { messages?: GmailMessage[] } }).data?.messages ?? [];
    } catch (err) {
      logger.warn('[briefing.gmail] fetch failed — skipping', {
        spaceId, err: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
    if (messages.length === 0) return [];

    const threads = buildThreadViews(messages, extractEmail(conn.label));

    const { data: contactRows } = await supabase
      .from('Contact').select('id, name, email, leadScore')
      .eq('spaceId', spaceId).not('email', 'is', null);
    const contactsByEmail = new Map<string, ContactRow>();
    for (const c of (contactRows ?? []) as ContactRow[]) {
      const e = c.email?.toLowerCase();
      if (e) contactsByEmail.set(e, c);
    }

    // Signal 3 overlap gate — drafts source already shows any contact
    // with a pending Gmail-triggered draft in the same lookback.
    const sinceIso = new Date(Date.now() - FRESH_HOURS * MS_PER_HOUR).toISOString();
    const { data: draftRows } = await supabase
      .from('AgentDraft').select('contactId, triggerSource')
      .eq('spaceId', spaceId).gte('createdAt', sinceIso);
    const contactsWithDraft = new Set<string>();
    for (const r of (draftRows ?? []) as Array<{ contactId: string | null; triggerSource: { slug?: string } | null }>) {
      if (r.contactId && r.triggerSource?.slug === 'GMAIL_NEW_GMAIL_MESSAGE') contactsWithDraft.add(r.contactId);
    }

    const signals: Signal[] = [];
    const seen = new Set<string>();
    const now = Date.now();
    for (const thread of threads.values()) {
      let contact: ContactRow | undefined;
      for (const addr of thread.otherParties) {
        const hit = contactsByEmail.get(addr);
        if (hit) { contact = hit; break; }
      }
      if (!contact || seen.has(contact.id)) continue;
      seen.add(contact.id);
      const signal = scoreThread(thread, contact, now, contactsWithDraft.has(contact.id));
      if (signal) signals.push(signal);
    }
    return signals;
  },
};

export const __internals = { extractEmail, buildThreadViews, dayWord, scoreThread };
