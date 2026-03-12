import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { syncDeal, deleteDealVector } from '@/lib/vectorize';
import { getSpaceForUser } from '@/lib/space';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const existing = await db.deal.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const space = await getSpaceForUser(userId);
  if (!space || existing.spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const deal = await db.deal.update({
    where: { id },
    data: {
      title: body.title,
      description: body.description ?? null,
      value: body.value != null ? parseFloat(body.value) : null,
      address: body.address ?? null,
      priority: body.priority,
      closeDate: body.closeDate ? new Date(body.closeDate) : null,
      stageId: body.stageId,
      position: body.position,
      dealContacts: body.contactIds
        ? {
            deleteMany: {},
            create: body.contactIds.map((cId: string) => ({ contactId: cId }))
          }
        : undefined
    },
    include: { stage: true }
  });

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
  const deal = await db.deal.findUnique({ where: { id } });
  if (!deal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const space = await getSpaceForUser(userId);
  if (!space || deal.spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await db.deal.delete({ where: { id } });
  deleteDealVector(deal.spaceId, id).catch(console.error);

  return NextResponse.json({ success: true });
}
