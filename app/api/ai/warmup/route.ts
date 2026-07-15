import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * POST /api/ai/warmup — pre-boot the Modal chat container.
 *
 * The cold-start fix, attacked at the source: the realtor always spends a few
 * seconds reading the page before typing, so the chat surface fires this ping
 * on mount. Modal boots a container to serve ANY request (validation runs
 * after boot), so by the time the first real message is sent the sandbox is
 * already warm — the 5-6s first-message lag disappears instead of being
 * masked.
 *
 * Fire-and-forget: we never await Modal's answer (a cold boot can take
 * seconds — exactly the seconds we're pre-paying). The response here is an
 * immediate 204 either way. The payload carries `warmup: true` so the Python
 * side (agent/modal_app.py chat_turn) can early-return without building an
 * agent; until that redeploy lands, the request fails validation AFTER the
 * container booted — which is the entire point.
 *
 * Guards: signed-in users only (this spends compute), rate-limited per user,
 * and a silent no-op when MODAL_CHAT_URL isn't configured (dev/preview).
 */
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const modalChatUrl = process.env.MODAL_CHAT_URL;
  const secret = process.env.AGENT_INTERNAL_SECRET;
  if (!modalChatUrl || !secret) return new NextResponse(null, { status: 204 });

  // A mount fires one ping; allow a handful per user per 5 minutes so tab
  // hopping doesn't hammer Modal with boots it doesn't need.
  const { allowed } = await checkRateLimit(`ai:warmup:${userId}`, 6, 300);
  if (!allowed) return new NextResponse(null, { status: 204 });

  void fetch(modalChatUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, warmup: true }),
    signal: AbortSignal.timeout(15_000),
  }).catch((err) => {
    logger.warn('[ai/warmup] modal ping failed (non-fatal)', {}, err);
  });

  return new NextResponse(null, { status: 204 });
}
