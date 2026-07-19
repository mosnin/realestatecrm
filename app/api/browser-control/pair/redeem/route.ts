/**
 * POST /api/browser-control/pair/redeem — NO Clerk auth. The freshly-installed
 * Chippi extension calls this with the pairing code the realtor typed in, and
 * trades it for a long-lived bearer token (returned exactly once — only its
 * hash is ever persisted, see lib/browser-control/auth.ts). Also opens the
 * link's first control session so the extension can start polling
 * immediately. Rate-limited by IP since there is no authenticated caller yet
 * — this is the guard against pairing-code brute force.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, checkRateLimit } from '@/lib/rate-limit';
import { RedeemPairingBody } from '@/lib/browser-control/protocol';
import { redeemPairingCode } from '@/lib/browser-control/auth';
import { startSession } from '@/lib/browser-control/session';

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  // 20 attempts / 10 minutes per IP — pairing codes are 8 chars from a
  // 32-symbol alphabet (~2^40 space) so this isn't the primary defense, but it
  // slows a brute-force loop to noise and costs an attacker nothing to trip.
  const { allowed } = await checkRateLimit(`browser-control:pair-redeem:${ip}`, 20, 600);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = RedeemPairingBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid pairing code' }, { status: 400 });
  }

  const result = await redeemPairingCode(parsed.data.code, { deviceLabel: parsed.data.deviceLabel });
  if (!result.ok) {
    const status = result.error === 'expired_code' ? 410 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  const session = await startSession({
    spaceId: result.spaceId,
    userId: result.userId,
    linkId: result.linkId,
  });

  return NextResponse.json({
    token: result.token,
    tokenPrefix: result.tokenPrefix,
    sessionId: session.id,
  });
}
