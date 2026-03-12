import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { syncContact, deleteContactVector } from '@/lib/vectorize';
import { getSpaceForUser } from '@/lib/space';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const contact = await db.contact.findUnique({
    where: { id },
    include: { dealContacts: { include: { deal: { include: { stage: true } } } } }
  });

  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const space = await getSpaceForUser(userId);
  if (!space || contact.spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json(contact);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const existing = await db.contact.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const space = await getSpaceForUser(userId);
  if (!space || existing.spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const contact = await db.contact.update({
    where: { id },
    data: {
      name: body.name,
      email: body.email ?? null,
      phone: body.phone ?? null,
      budget: body.budget != null && body.budget !== '' ? parseFloat(body.budget) : null,
      preferences: body.preferences ?? null,
      properties: body.properties ?? [],
      address: body.address ?? null,
      notes: body.notes ?? null,
      type: body.type,
      tags: body.tags ?? []
    } as any
  });

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
  const contact = await db.contact.findUnique({ where: { id } });
  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const space = await getSpaceForUser(userId);
  if (!space || contact.spaceId !== space.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await db.contact.delete({ where: { id } });
  deleteContactVector(contact.spaceId, id).catch(console.error);

  return NextResponse.json({ success: true });
}
