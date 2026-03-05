import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSpaceFromSubdomain } from '@/lib/space';
import { syncContact, syncDeal } from '@/lib/vectorize';
import type { Contact, Deal, DealStage } from '@prisma/client';

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { subdomain } = await req.json();
  const space = await getSpaceFromSubdomain(subdomain);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

  const [contacts, deals] = await Promise.all([
    db.contact.findMany({ where: { spaceId: space.id } }),
    db.deal.findMany({
      where: { spaceId: space.id },
      include: { stage: true }
    })
  ]);

  await Promise.all([
    ...contacts.map((c: Contact) => syncContact(c).catch(console.error)),
    ...deals.map((d: Deal & { stage: DealStage }) => syncDeal(d).catch(console.error))
  ]);

  return NextResponse.json({
    synced: { contacts: contacts.length, deals: deals.length }
  });
}
