/**
 * Mailchimp Marketing API client (server-only).
 *
 * We sync Chippi users into a Mailchimp audience so marketing/lifecycle email
 * lives in one place. This module is the thin transport layer:
 *
 *   - mailchimpConfigured()  — is an API key present?
 *   - listAudiences()        — GET /lists (used to resolve / report audiences)
 *   - resolveAudienceId()    — env MAILCHIMP_AUDIENCE_ID, else the sole audience
 *   - upsertMember()         — idempotent PUT of one contact (add or update)
 *
 * Auth: Mailchimp uses HTTP Basic with any username and the API key as the
 * password. The API key carries its datacenter as a suffix (`...-us21`), which
 * is also the API host (`https://us21.api.mailchimp.com/3.0`). We parse it from
 * the key so only ONE env var is required.
 *
 * Env:
 *   MAILCHIMP_API_KEY       required, e.g. "abc123def456-us21"
 *   MAILCHIMP_AUDIENCE_ID   optional; auto-resolved when the account has one
 *                           audience. Required if the account has several.
 *
 * Everything is best-effort and never throws to its callers' hot paths unless
 * they opt in (the backfill endpoint wants the errors; the webhook does not).
 */

import { createHash } from 'crypto';
import { logger } from '@/lib/logger';

const API_KEY = process.env.MAILCHIMP_API_KEY ?? '';
const AUDIENCE_ENV = process.env.MAILCHIMP_AUDIENCE_ID ?? '';

export function mailchimpConfigured(): boolean {
  return Boolean(API_KEY && API_KEY.includes('-'));
}

/** The datacenter is the suffix after the final '-' in the API key. */
function datacenter(): string {
  const dc = API_KEY.split('-').pop() ?? '';
  return dc;
}

function apiBase(): string {
  return `https://${datacenter()}.api.mailchimp.com/3.0`;
}

function authHeader(): string {
  // Username is ignored by Mailchimp; "anystring:APIKEY".
  return 'Basic ' + Buffer.from(`anystring:${API_KEY}`).toString('base64');
}

/** Mailchimp keys a member by the MD5 of the lowercased email address. */
export function subscriberHash(email: string): string {
  return createHash('md5').update(email.trim().toLowerCase()).digest('hex');
}

async function mc<T = unknown>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    // Mailchimp is an external API; keep a sane ceiling.
    signal: AbortSignal.timeout(15_000),
  });
  let data: T | null = null;
  try {
    data = (await res.json()) as T;
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

export interface MailchimpAudience {
  id: string;
  name: string;
  memberCount: number;
}

/** List the account's audiences (lists). */
export async function listAudiences(): Promise<MailchimpAudience[]> {
  const { ok, data } = await mc<{
    lists?: { id: string; name: string; stats?: { member_count?: number } }[];
  }>('/lists?count=100&fields=lists.id,lists.name,lists.stats.member_count');
  if (!ok || !data?.lists) return [];
  return data.lists.map((l) => ({
    id: l.id,
    name: l.name,
    memberCount: l.stats?.member_count ?? 0,
  }));
}

/**
 * Resolve which audience to write to:
 *   1. MAILCHIMP_AUDIENCE_ID when set, or
 *   2. the sole audience on the account.
 * Returns null (with `audiences` populated) when it can't decide, so callers
 * can surface a helpful "pick one of these ids" message.
 */
export async function resolveAudienceId(): Promise<{
  id: string | null;
  audiences: MailchimpAudience[];
}> {
  if (AUDIENCE_ENV) return { id: AUDIENCE_ENV, audiences: [] };
  const audiences = await listAudiences();
  if (audiences.length === 1) return { id: audiences[0].id, audiences };
  return { id: null, audiences };
}

export type MemberStatus = 'subscribed' | 'transactional' | 'pending';

export interface UpsertMemberInput {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  /** status applied only when the member is NEW (never downgrades an existing,
   *  already-subscribed contact). Defaults to 'subscribed'. */
  status?: MemberStatus;
  tags?: string[];
  mergeFields?: Record<string, string>;
  audienceId?: string;
}

export interface UpsertResult {
  ok: boolean;
  status: number;
  /** Mailchimp's member status after the call ('subscribed' | 'cleaned' | …). */
  memberStatus?: string;
  error?: string;
}

/**
 * Add or update one contact (idempotent). Uses PUT .../members/{hash} with
 * `status_if_new` so re-running never clobbers an existing subscriber's state.
 */
export async function upsertMember(input: UpsertMemberInput): Promise<UpsertResult> {
  const email = input.email?.trim();
  if (!email || !email.includes('@')) {
    return { ok: false, status: 0, error: 'invalid_email' };
  }

  const audienceId = input.audienceId ?? AUDIENCE_ENV;
  if (!audienceId) {
    return { ok: false, status: 0, error: 'no_audience' };
  }

  const merge: Record<string, string> = { ...(input.mergeFields ?? {}) };
  if (input.firstName) merge.FNAME = input.firstName;
  if (input.lastName) merge.LNAME = input.lastName;

  const body: Record<string, unknown> = {
    email_address: email,
    status_if_new: input.status ?? 'subscribed',
  };
  if (Object.keys(merge).length) body.merge_fields = merge;
  if (input.tags?.length) body.tags = input.tags;

  const { ok, status, data } = await mc<{ status?: string; detail?: string; title?: string }>(
    `/lists/${audienceId}/members/${subscriberHash(email)}`,
    { method: 'PUT', body },
  );

  if (!ok) {
    const detail = data?.detail || data?.title || `http_${status}`;
    return { ok: false, status, error: detail };
  }
  return { ok: true, status, memberStatus: data?.status };
}

/** Split a single "name" field into first/last for FNAME/LNAME. */
export function splitName(name?: string | null): { firstName?: string; lastName?: string } {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return {};
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

/** Best-effort single-user sync used by the Clerk webhook. Never throws. */
export async function syncUserToMailchimp(input: {
  email: string;
  name?: string | null;
  tags?: string[];
}): Promise<UpsertResult> {
  if (!mailchimpConfigured()) return { ok: false, status: 0, error: 'not_configured' };
  try {
    const { id } = await resolveAudienceId();
    if (!id) return { ok: false, status: 0, error: 'no_audience' };
    const { firstName, lastName } = splitName(input.name);
    return await upsertMember({
      email: input.email,
      firstName,
      lastName,
      audienceId: id,
      tags: input.tags ?? ['chippi-user'],
    });
  } catch (err) {
    logger.warn('[mailchimp] syncUser failed', { email: input.email }, err);
    return { ok: false, status: 0, error: 'exception' };
  }
}
