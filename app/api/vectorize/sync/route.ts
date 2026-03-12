import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSpaceFromSlug } from '@/lib/space';
import { syncContact, syncDeal } from '@/lib/vectorize';
import type { Contact, Deal, DealStage } from '@/lib/types';

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { slug } = await req.json();
  const space = await getSpaceFromSlug(slug);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

  const [contacts, dealRows] = await Promise.all([
    sql`SELECT * FROM "Contact" WHERE "spaceId" = ${space.id}` as Promise<Contact[]>,
    sql`
      SELECT d.*, ds."name" AS "stageName", ds."color" AS "stageColor", ds."position" AS "stagePosition"
      FROM "Deal" d
      LEFT JOIN "DealStage" ds ON ds."id" = d."stageId"
      WHERE d."spaceId" = ${space.id}
    ` as Promise<(Deal & { stageName: string; stageColor: string; stagePosition: number })[]>
  ]);

  const deals = dealRows.map((row) => ({
    ...row,
    stage: {
      id: row.stageId,
      spaceId: row.spaceId,
      name: row.stageName,
      color: row.stageColor,
      position: row.stagePosition,
    } as DealStage,
  }));

  await Promise.all([
    ...contacts.map((c: Contact) => syncContact(c).catch(console.error)),
    ...deals.map((d: Deal & { stage: DealStage }) => syncDeal(d).catch(console.error))
  ]);

  return NextResponse.json({
    synced: { contacts: contacts.length, deals: deals.length }
  });
}
