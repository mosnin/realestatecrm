import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSpaceFromSlug, getSpaceForUser } from '@/lib/space';
import { syncDeal } from '@/lib/vectorize';
import type { Deal, DealStage } from '@/lib/types';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const space = await getSpaceFromSlug(slug);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || space.id !== userSpace.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Get deals with stage
  const dealRows = await sql`
    SELECT
      d.*,
      s."id" AS "stage_id",
      s."spaceId" AS "stage_spaceId",
      s."name" AS "stage_name",
      s."color" AS "stage_color",
      s."position" AS "stage_position"
    FROM "Deal" d
    LEFT JOIN "DealStage" s ON s."id" = d."stageId"
    WHERE d."spaceId" = ${space.id}
    ORDER BY d."position" ASC
  `;

  const dealIds = dealRows.map((r: any) => r.id);

  // Get dealContacts with contact info
  let dealContactRows: any[] = [];
  if (dealIds.length > 0) {
    dealContactRows = await sql`
      SELECT
        dc."dealId",
        dc."contactId",
        c."id" AS "contact_id",
        c."name" AS "contact_name"
      FROM "DealContact" dc
      JOIN "Contact" c ON c."id" = dc."contactId"
      WHERE dc."dealId" = ANY(${dealIds})
    `;
  }

  // Group dealContacts by dealId
  const dcByDeal = new Map<string, any[]>();
  for (const dc of dealContactRows) {
    const arr = dcByDeal.get(dc.dealId) || [];
    arr.push({
      dealId: dc.dealId,
      contactId: dc.contactId,
      contact: { id: dc.contact_id, name: dc.contact_name }
    });
    dcByDeal.set(dc.dealId, arr);
  }

  const deals = dealRows.map((row: any) => ({
    id: row.id,
    spaceId: row.spaceId,
    title: row.title,
    description: row.description,
    value: row.value,
    address: row.address,
    priority: row.priority,
    closeDate: row.closeDate,
    stageId: row.stageId,
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    stage: row.stage_id
      ? {
          id: row.stage_id,
          spaceId: row.stage_spaceId,
          name: row.stage_name,
          color: row.stage_color,
          position: row.stage_position
        }
      : null,
    dealContacts: dcByDeal.get(row.id) || []
  }));

  return NextResponse.json(deals);
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { slug, title, description, value, address, priority, closeDate, stageId, contactIds } = body;

  const space = await getSpaceFromSlug(slug);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || space.id !== userSpace.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const lastDealRows = await sql`
    SELECT "position" FROM "Deal"
    WHERE "stageId" = ${stageId}
    ORDER BY "position" DESC
    LIMIT 1
  `;
  const lastPosition = lastDealRows.length > 0 ? lastDealRows[0].position : -1;

  const dealId = crypto.randomUUID();
  const valueVal = value ? parseFloat(value) : null;
  const closeDateVal = closeDate ? new Date(closeDate) : null;

  const dealRows = await sql`
    INSERT INTO "Deal" ("id", "spaceId", "title", "description", "value", "address", "priority", "closeDate", "stageId", "position")
    VALUES (
      ${dealId}, ${space.id}, ${title}, ${description || null},
      ${valueVal}, ${address || null}, ${priority || 'MEDIUM'},
      ${closeDateVal}, ${stageId}, ${lastPosition + 1}
    )
    RETURNING *
  `;

  // Insert dealContacts
  if (contactIds?.length) {
    for (const cId of contactIds) {
      await sql`
        INSERT INTO "DealContact" ("dealId", "contactId")
        VALUES (${dealId}, ${cId})
      `;
    }
  }

  // Get stage for the include
  const stageRows = await sql`
    SELECT * FROM "DealStage" WHERE "id" = ${stageId}
  `;

  const deal = {
    ...dealRows[0],
    stage: stageRows[0] || null
  } as Deal & { stage: DealStage | null };

  syncDeal(deal).catch(console.error);

  return NextResponse.json(deal, { status: 201 });
}
