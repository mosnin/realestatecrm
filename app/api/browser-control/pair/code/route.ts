/**
 * POST /api/browser-control/pair/code — Clerk-authed. The realtor, inside the
 * app, requests a short-lived pairing code to type into the freshly-installed
 * Chippi extension. Rate-limited so a compromised session can't be used to
 * mint an unbounded stream of pairing codes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { getCurrentDbUser } from '@/lib/permissions';
import { checkRateLimit } from '@/lib/rate-limit';
import { issuePairingCode } from '@/lib/browser-control/auth';

export async function POST(_req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const [space, dbUser] = await Promise.all([getSpaceForUser(userId), getCurrentDbUser()]);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Max 10 pairing codes per 10 minutes — plenty for a realtor retrying a typo,
  // not enough to be useful for enumeration/brute force against /pair/redeem.
  const { allowed } = await checkRateLimit(`browser-control:pair-code:${userId}`, 10, 600);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many pairing attempts. Try again in a few minutes.' }, { status: 429 });
  }

  const { code, expiresAt } = await issuePairingCode({ spaceId: space.id, userId: dbUser.id });

  return NextResponse.json({ code, expiresAt });
}
