import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { syncDeal, deleteDealVector } from '@/lib/vectorize';
import { getSpaceForUser } from '@/lib/space';
import type { Deal, DealStage } from '@/lib/types';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const existingRows = await sql`SELECT * FROM "Deal" WHERE "id" = ${id}`;
  if (!existingRows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const existing = existingRows[0];

  const space = await getSpaceForUser(userId);
  if (!space || existing.spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const valueVal = body.value != null ? parseFloat(body.value) : null;
  const closeDateVal = body.closeDate ? new Date(body.closeDate) : null;

  // Handle dealContacts replacement
  if (body.contactIds) {
    await sql`DELETE FROM "DealContact" WHERE "dealId" = ${id}`;
    for (const cId of body.contactIds) {
      await sql`
        INSERT INTO "DealContact" ("dealId", "contactId")
        VALUES (${id}, ${cId})
      `;
    }
  }

  const dealRows = await sql`
    UPDATE "Deal"
    SET
      "title" = ${body.title},
      "description" = ${body.description ?? null},
      "value" = ${valueVal},
      "address" = ${body.address ?? null},
      "priority" = ${body.priority},
      "closeDate" = ${closeDateVal},
      "stageId" = ${body.stageId},
      "position" = ${body.position},
      "updatedAt" = NOW()
    WHERE "id" = ${id}
    RETURNING *
  `;

  // Get stage for the include
  const stageRows = await sql`
    SELECT * FROM "DealStage" WHERE "id" = ${body.stageId}
  `;

  const deal = {
    ...dealRows[0],
    stage: stageRows[0] || null
  } as Deal & { stage: DealStage | null };

  syncDeal(deal).catch(console.error);

  return NextResponse.json(deal);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const dealRows = await sql`SELECT * FROM "Deal" WHERE "id" = ${id}`;
  if (!dealRows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const deal = dealRows[0];

  const space = await getSpaceForUser(userId);
  if (!space || deal.spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await sql`DELETE FROM "Deal" WHERE "id" = ${id}`;
  deleteDealVector(deal.spaceId, id).catch(console.error);

  return NextResponse.json({ success: true });
}
