/**
 * Slack signal source — polled at gather() via Composio actions.
 *
 * Two signals only. Slack is the team's surface, not the client's:
 *   1. @-mention of the realtor in any channel, ≤18h → reply, urg 1, 0.88
 *   2. DM from a brokerage teammate, ≤18h            → reply, urg 2, 0.80
 *
 * Cross-walk: Slack users → Chippi User (NOT Contact). Realtor's own
 * slackUserId comes from SLACK_AUTH_TEST — mentions only count when
 * that id appears in the text. DMs only count from senders in users.list
 * (workspace teammates); Slack Connect strangers drop.
 *
 * 3s hard timeout per Composio call. No connection / timeout / error → [].
 */

import { supabase } from '@/lib/supabase';
import { executeToolForEntity, composioConfigured } from '@/lib/integrations/composio';
import type { Signal, SignalGatherer } from '../types';

const TIMEOUT_MS = 3_000;
const STALE_MS = 18 * 60 * 60 * 1000;
const MENTION_RE = /<@([A-Z0-9]+)>/g;

interface SlackChannel { id: string; name?: string; is_im?: boolean }
interface SlackMessage { ts?: string; user?: string; text?: string }
interface SlackUser {
  id: string;
  name?: string;
  real_name?: string;
  profile?: { real_name?: string; display_name?: string };
}

/** `<@USERID>` tokens only — bare `@name` is just text. */
export function extractMentions(text: string | undefined | null): string[] {
  if (!text) return [];
  return Array.from(text.matchAll(MENTION_RE), (m) => m[1]);
}

/** Does the message tag the realtor's own slackUserId? */
export function mentionsRealtor(text: string | undefined | null, realtorId: string | null): boolean {
  return !!realtorId && extractMentions(text).includes(realtorId);
}

/** In the realtor's workspace? Everyone in users.list is "team". */
export function isTeammate(senderId: string | undefined | null, teamIds: Set<string>): boolean {
  return !!senderId && teamIds.has(senderId);
}

function nameFor(u: SlackUser | undefined): string {
  return u?.profile?.display_name?.trim() || u?.profile?.real_name?.trim()
    || u?.real_name?.trim() || u?.name?.trim() || 'a teammate';
}

function localTime(ts: string): string {
  const s = Number.parseFloat(ts);
  if (!Number.isFinite(s)) return '';
  return new Date(s * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/** Composio shapes drift across toolkit versions; try flat + nested. */
function unwrap<T>(resp: unknown, key: string): T[] {
  if (!resp || typeof resp !== 'object') return [];
  const inner = ((resp as { data?: unknown }).data ?? {}) as Record<string, unknown>;
  const nested = (inner.data as Record<string, unknown> | undefined)?.[key];
  for (const v of [inner[key], nested, (resp as Record<string, unknown>)[key]]) {
    if (Array.isArray(v)) return v as T[];
  }
  return [];
}

/** 3s timeout wrapper. null on timeout / error. */
async function call(entityId: string, slug: string, args: Record<string, unknown>) {
  const t = new Promise<null>((r) => setTimeout(() => r(null), TIMEOUT_MS));
  try { return await Promise.race([executeToolForEntity({ entityId, slug, arguments: args }), t]); }
  catch { return null; }
}

export const slackSource: SignalGatherer = {
  source: 'slack',
  async gather(spaceId: string): Promise<Signal[]> {
    if (!composioConfigured()) return [];

    const { data: conn } = await supabase
      .from('IntegrationConnection')
      .select('userId')
      .eq('spaceId', spaceId)
      .eq('toolkit', 'slack')
      .eq('status', 'active')
      .maybeSingle();
    if (!conn) return [];
    const entityId = (conn as { userId: string }).userId;

    const oldest = ((Date.now() - STALE_MS) / 1000).toFixed(6);
    const [channelsResp, usersResp, authResp] = await Promise.all([
      call(entityId, 'SLACK_LIST_ALL_CHANNELS', {
        types: 'public_channel,private_channel,im',
        limit: 200,
        exclude_archived: true,
      }),
      call(entityId, 'SLACK_LIST_ALL_USERS', { limit: 200 }),
      call(entityId, 'SLACK_AUTH_TEST', {}),
    ]);
    if (!channelsResp || !usersResp) return [];

    const users = unwrap<SlackUser>(usersResp, 'members');
    const userById = new Map(users.map((u) => [u.id, u]));
    const teamIds = new Set(users.map((u) => u.id));
    const auth = (authResp ?? {}) as { data?: { user_id?: string; data?: { user_id?: string } } };
    const realtorId = auth.data?.user_id ?? auth.data?.data?.user_id ?? null;

    const signals: Signal[] = [];

    for (const ch of unwrap<SlackChannel>(channelsResp, 'channels')) {
      const history = await call(entityId, 'SLACK_FETCH_CONVERSATION_HISTORY', {
        channel: ch.id,
        oldest,
        limit: 20,
      });
      if (!history) continue;

      for (const msg of unwrap<SlackMessage>(history, 'messages')) {
        if (!msg.ts || !msg.user) continue;
        const ageMs = Date.now() - Number.parseFloat(msg.ts) * 1000;
        if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > STALE_MS) continue;
        if (realtorId && msg.user === realtorId) continue;

        if (ch.is_im && isTeammate(msg.user, teamIds)) {
          const name = nameFor(userById.get(msg.user));
          signals.push({
            source: 'slack', kind: 'reply', urgency: 2, confidence: 0.8,
            subject: { id: `slack-dm-${ch.id}`, name: `DM from ${name}`, href: '/chippi/today' },
            evidence: `DM from ${name} at ${localTime(msg.ts)}.`,
            draftedAction: { kind: 'open', href: '/chippi/today' },
          });
        } else if (!ch.is_im && mentionsRealtor(msg.text, realtorId)) {
          const name = nameFor(userById.get(msg.user));
          const where = ch.name ? `#${ch.name}` : 'a channel';
          const snippet = (msg.text ?? '').replace(MENTION_RE, '@you').trim().slice(0, 120);
          signals.push({
            source: 'slack', kind: 'reply', urgency: 1, confidence: 0.88,
            subject: { id: `slack-mention-${ch.id}-${msg.ts}`, name: `${name} in ${where}`, href: '/chippi/today' },
            evidence: snippet ? `${name} in ${where}: "${snippet}".` : `${name} mentioned you in ${where}.`,
            draftedAction: { kind: 'open', href: '/chippi/today' },
          });
        }
      }
    }
    return signals;
  },
};
