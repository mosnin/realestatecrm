import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Reorder: move a deal to a new stage and position
  const { dealId, newStageId, newPosition } = await req.json();

  // Shift existing deals in target stage to make room
  await db.deal.updateMany({
    where: { stageId: newStageId, position: { gte: newPosition } },
    data: { position: { increment: 1 } }
  });

  const deal = await db.deal.update({
    where: { id: dealId },
    data: { stageId: newStageId, position: newPosition }
  });

  return NextResponse.json(deal);
}
