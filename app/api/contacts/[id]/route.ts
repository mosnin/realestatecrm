import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { syncContact, deleteContactVector } from '@/lib/vectorize';
import { getSpaceForUser } from '@/lib/space';
import type { Contact } from '@/lib/types';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const contactRows = await sql`
    SELECT * FROM "Contact" WHERE "id" = ${id}
  `;

  if (!contactRows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const contact = contactRows[0] as Contact & { dealContacts?: any[] };

  const space = await getSpaceForUser(userId);
  if (!space || contact.spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Get dealContacts with deal and stage info
  const dealContactRows = await sql`
    SELECT
      dc."dealId",
      dc."contactId",
      d."id" AS "deal_id",
      d."spaceId" AS "deal_spaceId",
      d."title" AS "deal_title",
      d."description" AS "deal_description",
      d."value" AS "deal_value",
      d."address" AS "deal_address",
      d."priority" AS "deal_priority",
      d."closeDate" AS "deal_closeDate",
      d."stageId" AS "deal_stageId",
      d."position" AS "deal_position",
      d."createdAt" AS "deal_createdAt",
      d."updatedAt" AS "deal_updatedAt",
      s."id" AS "stage_id",
      s."spaceId" AS "stage_spaceId",
      s."name" AS "stage_name",
      s."color" AS "stage_color",
      s."position" AS "stage_position"
    FROM "DealContact" dc
    JOIN "Deal" d ON d."id" = dc."dealId"
    LEFT JOIN "DealStage" s ON s."id" = d."stageId"
    WHERE dc."contactId" = ${id}
  `;

  contact.dealContacts = dealContactRows.map((row: any) => ({
    dealId: row.dealId,
    contactId: row.contactId,
    deal: {
      id: row.deal_id,
      spaceId: row.deal_spaceId,
      title: row.deal_title,
      description: row.deal_description,
      value: row.deal_value,
      address: row.deal_address,
      priority: row.deal_priority,
      closeDate: row.deal_closeDate,
      stageId: row.deal_stageId,
      position: row.deal_position,
      createdAt: row.deal_createdAt,
      updatedAt: row.deal_updatedAt,
      stage: row.stage_id
        ? {
            id: row.stage_id,
            spaceId: row.stage_spaceId,
            name: row.stage_name,
            color: row.stage_color,
            position: row.stage_position
          }
        : null
    }
  }));

  return NextResponse.json(contact);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const existingRows = await sql`SELECT * FROM "Contact" WHERE "id" = ${id}`;
  if (!existingRows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const existing = existingRows[0];

  const space = await getSpaceForUser(userId);
  if (!space || existing.spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const budgetVal = body.budget != null && body.budget !== '' ? parseFloat(body.budget) : null;
  const propsVal = body.properties ?? [];
  const tagsVal = body.tags ?? [];

  const rows = await sql`
    UPDATE "Contact"
    SET
      "name" = ${body.name},
      "email" = ${body.email ?? null},
      "phone" = ${body.phone ?? null},
      "budget" = ${budgetVal},
      "preferences" = ${body.preferences ?? null},
      "properties" = ${propsVal},
      "address" = ${body.address ?? null},
      "notes" = ${body.notes ?? null},
      "type" = ${body.type},
      "tags" = ${tagsVal},
      "updatedAt" = NOW()
    WHERE "id" = ${id}
    RETURNING *
  `;

  const contact = rows[0] as Contact;

  syncContact(contact).catch(console.error);

  return NextResponse.json(contact);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const contactRows = await sql`SELECT * FROM "Contact" WHERE "id" = ${id}`;
  if (!contactRows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const contact = contactRows[0];

  const space = await getSpaceForUser(userId);
  if (!space || contact.spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await sql`DELETE FROM "Contact" WHERE "id" = ${id}`;
  deleteContactVector(contact.spaceId, id).catch(console.error);

  return NextResponse.json({ success: true });
}
