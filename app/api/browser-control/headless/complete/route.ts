/** Worker completion bookkeeping for the feature-on cloud research browser. */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { finishHeadlessWorker } from '@/lib/browser-control/session';

const bodySchema = z.object({
  sessionId: z.string().max(200),
  workerLeaseToken: z.string().uuid(),
  error: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  const secret = process.env.CHIPPI_BROWSER_WORKER_SECRET;
  if (!secret) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  const finished = await finishHeadlessWorker({
    sessionId: parsed.data.sessionId,
    leaseToken: parsed.data.workerLeaseToken,
    error: parsed.data.error,
  });
  return NextResponse.json({ finished });
}
