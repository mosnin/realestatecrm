import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSpaceFromSubdomain } from '@/lib/space';
import { syncDeal } from '@/lib/vectorize';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const subdomain = req.nextUrl.searchParams.get('subdomain');
  if (!subdomain) return NextResponse.json({ error: 'subdomain required' }, { status: 400 });

  const space = await getSpaceFromSubdomain(subdomain);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const deals = await db.deal.findMany({
    where: { spaceId: space.id },
    include: {
      stage: true,
      dealContacts: { include: { contact: { select: { id: true, name: true } } } }
    },
    orderBy: { position: 'asc' }
  });

  return NextResponse.json(deals);
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { subdomain, title, description, value, address, priority, closeDate, stageId, contactIds } = body;

  const space = await getSpaceFromSubdomain(subdomain);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const lastDealInStage = await db.deal.findFirst({
    where: { stageId },
    orderBy: { position: 'desc' }
  });

  const deal = await db.deal.create({
    data: {
      spaceId: space.id,
      title,
      description: description || null,
      value: value ? parseFloat(value) : null,
      address: address || null,
      priority: priority || 'MEDIUM',
      closeDate: closeDate ? new Date(closeDate) : null,
      stageId,
      position: (lastDealInStage?.position ?? -1) + 1,
      dealContacts: contactIds?.length
        ? { create: contactIds.map((cId: string) => ({ contactId: cId })) }
        : undefined
    },
    include: { stage: true }
  });

  syncDeal(deal).catch(console.error);

  return NextResponse.json(deal, { status: 201 });
}
