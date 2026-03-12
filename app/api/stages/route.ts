import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSpaceFromSlug, getSpaceForUser } from '@/lib/space';
import type { DealStage } from '@/lib/types';

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

  // Get stages
  const stageRows = await sql`
    SELECT * FROM "DealStage"
    WHERE "spaceId" = ${space.id}
    ORDER BY "position" ASC
  `;

  // Get deals
  const dealRows = await sql`
    SELECT * FROM "Deal"
    WHERE "spaceId" = ${space.id}
    ORDER BY "position" ASC
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

  // Group deals by stageId
  const dealsByStage = new Map<string, any[]>();
  for (const deal of dealRows) {
    const arr = dealsByStage.get(deal.stageId) || [];
    arr.push({
      ...deal,
      dealContacts: dcByDeal.get(deal.id) || []
    });
    dealsByStage.set(deal.stageId, arr);
  }

  // Assemble stages with deals
  const stages = stageRows.map((stage: any) => ({
    ...stage,
    deals: dealsByStage.get(stage.id) || []
  }));

  return NextResponse.json(stages);
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { slug, name, color } = await req.json();
  const space = await getSpaceFromSlug(slug);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || space.id !== userSpace.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const lastStageRows = await sql`
    SELECT "position" FROM "DealStage"
    WHERE "spaceId" = ${space.id}
    ORDER BY "position" DESC
    LIMIT 1
  `;
  const lastPosition = lastStageRows.length > 0 ? lastStageRows[0].position : -1;

  const id = crypto.randomUUID();
  const rows = await sql`
    INSERT INTO "DealStage" ("id", "spaceId", "name", "color", "position")
    VALUES (${id}, ${space.id}, ${name}, ${color ?? '#6366f1'}, ${lastPosition + 1})
    RETURNING *
  `;

  return NextResponse.json(rows[0] as DealStage, { status: 201 });
}
