import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSpaceForUser } from '@/lib/space';

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { dealId, newStageId, newPosition } = await req.json();

  const deal = await db.deal.findUnique({ where: { id: dealId } });
  if (!deal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const space = await getSpaceForUser(userId);
  if (!space || deal.spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const stage = await db.dealStage.findUnique({ where: { id: newStageId } });
  if (!stage || stage.spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Shift existing deals in target stage to make room
  await db.deal.updateMany({
    where: { stageId: newStageId, position: { gte: newPosition } },
    data: { position: { increment: 1 } }
  });

  const updated = await db.deal.update({
    where: { id: dealId },
    data: { stageId: newStageId, position: newPosition }
  });

  return NextResponse.json(updated);
}
