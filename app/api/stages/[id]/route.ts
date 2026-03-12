import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSpaceForUser } from '@/lib/space';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const existingRows = await sql`SELECT * FROM "DealStage" WHERE "id" = ${id}`;
  if (!existingRows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const existing = existingRows[0];

  const space = await getSpaceForUser(userId);
  if (!space || existing.spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const rows = await sql`
    UPDATE "DealStage"
    SET "name" = ${body.name}, "color" = ${body.color}
    WHERE "id" = ${id}
    RETURNING *
  `;

  return NextResponse.json(rows[0]);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const existingRows = await sql`SELECT * FROM "DealStage" WHERE "id" = ${id}`;
  if (!existingRows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const existing = existingRows[0];

  const space = await getSpaceForUser(userId);
  if (!space || existing.spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await sql`DELETE FROM "DealStage" WHERE "id" = ${id}`;
  return NextResponse.json({ success: true });
}
