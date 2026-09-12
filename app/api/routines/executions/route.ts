import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { callFollowUpCoordinator } from '@/lib/convex/follow-up-pilot';
export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const space = await getSpaceForUser(auth.userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!process.env.CONVEX_FOLLOW_UP_ROUTINE_ID) return NextResponse.json({ enabled: false, executions: [] });
  try { return NextResponse.json({ enabled: true, executions: await callFollowUpCoordinator('list', { spaceId: space.id }) }); }
  catch { return NextResponse.json({ error: 'Follow-up execution status unavailable' }, { status: 503 }); }
}
