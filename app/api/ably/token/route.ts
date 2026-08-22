import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { createSpaceTokenRequest } from '@/lib/realtime/ably';

/**
 * GET /api/ably/token — mints a short-lived, capability-scoped Ably
 * TokenRequest so the browser can subscribe to its space's live activity
 * feed channel WITHOUT ever seeing the server-only ABLY_API_KEY.
 *
 * Flow: the client's Ably Realtime SDK calls this (authUrl) whenever it needs
 * to (re)authenticate. We authenticate the realtor (Clerk), resolve their
 * space, then hand back a TokenRequest scoped to `space:<id>:*` with
 * subscribe-only capability (see lib/realtime/ably.ts).
 *
 * Status shapes mirror the other authed routes:
 *   401 — not signed in (requireAuth)
 *   404 — signed in but no space (getSpaceForUser)
 *   503 — real-time not configured (ABLY_API_KEY unset). The client treats
 *         this as "live updates off" and keeps its DB-loaded feed.
 */
export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // createSpaceTokenRequest returns null only when ABLY_API_KEY is unset.
  const tokenRequest = await createSpaceTokenRequest(space.id, userId);
  if (!tokenRequest) {
    return NextResponse.json({ error: 'realtime-unavailable' }, { status: 503 });
  }

  // Ably's client SDK expects the raw TokenRequest JSON from the authUrl.
  return NextResponse.json(tokenRequest);
}
