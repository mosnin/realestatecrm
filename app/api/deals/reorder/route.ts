import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSpaceForUser } from '@/lib/space';

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { dealId, newStageId, newPosition } = await req.json();

  const dealRows = await sql`SELECT * FROM "Deal" WHERE "id" = ${dealId}`;
  if (!dealRows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const deal = dealRows[0];

  const space = await getSpaceForUser(userId);
  if (!space || deal.spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const stageRows = await sql`SELECT * FROM "DealStage" WHERE "id" = ${newStageId}`;
  if (!stageRows.length || stageRows[0].spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Shift existing deals in target stage to make room
  await sql`
    UPDATE "Deal"
    SET "position" = "position" + 1
    WHERE "stageId" = ${newStageId} AND "position" >= ${newPosition}
  `;

  const updatedRows = await sql`
    UPDATE "Deal"
    SET "stageId" = ${newStageId}, "position" = ${newPosition}, "updatedAt" = NOW()
    WHERE "id" = ${dealId}
    RETURNING *
  `;

  return NextResponse.json(updatedRows[0]);
}
