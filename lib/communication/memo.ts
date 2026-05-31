/**
 * Tiny shared memo for the communication feed.
 *
 * Lives outside `app/api/communication/route.ts` because Next App Router
 * rejects non-handler exports from a route file. The route writes to
 * this map after a successful fetch; the send + per-thread routes call
 * `invalidateCommunicationMemo(spaceId)` so the next feed read picks up
 * the new message from the source of truth instead of stale cache.
 */

export interface FeedItem {
  id: string;
  channel: 'email' | 'whatsapp';
  fromName: string;
  fromAddress: string;
  subject: string | null;
  snippet: string;
  lastAt: string;
  unread: boolean;
}

export interface ConnectedPayload {
  connected: true;
  email: boolean;
  whatsapp: boolean;
  items: FeedItem[];
  noteOutlookReadPending?: boolean;
}

interface CacheEntry {
  expiresAt: number;
  payload: ConnectedPayload;
}

const memo = new Map<string, CacheEntry>();
const TTL_MS = 60_000;

export function getCommunicationMemo(spaceId: string): ConnectedPayload | null {
  const cached = memo.get(spaceId);
  if (cached && cached.expiresAt > Date.now()) return cached.payload;
  return null;
}

export function setCommunicationMemo(
  spaceId: string,
  payload: ConnectedPayload,
): void {
  memo.set(spaceId, { expiresAt: Date.now() + TTL_MS, payload });
}

export function invalidateCommunicationMemo(spaceId: string): void {
  memo.delete(spaceId);
}
