import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { executeConvexFollowUp } from '@/lib/convex/execute-follow-up';
export const runtime = 'nodejs';
export const maxDuration = 300;
const jobSchema = z.object({ jobId: z.string().min(1).max(200), spaceId: z.string().min(1).max(200), routineId: z.string().min(1).max(200), scheduledFor: z.string().datetime({ offset: true }) }).strict();
export async function POST(req: NextRequest) {
  const secret = process.env.CHIPPI_CALLBACK_SECRET;
  const supplied = Buffer.from(req.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret ?? ''}`);
  if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = jobSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid job reference' }, { status: 400 });
  try {
    const state = await executeConvexFollowUp(parsed.data);
    return NextResponse.json({ jobId: parsed.data.jobId, state });
  } catch {
    // The request may already have executed. The coordinator must not blindly replay it.
    return NextResponse.json({ jobId: parsed.data.jobId, state: 'uncertain' }, { status: 503 });
  }
}
