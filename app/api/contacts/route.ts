import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSpaceFromSlug, getSpaceForUser } from '@/lib/space';
import { syncContact } from '@/lib/vectorize';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const space = await getSpaceFromSlug(slug);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || space.id !== userSpace.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const search = req.nextUrl.searchParams.get('search') ?? '';
  const type = req.nextUrl.searchParams.get('type');

  const contacts = await db.contact.findMany({
    where: {
      spaceId: space.id,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { preferences: { contains: search, mode: 'insensitive' } }
        ]
      }),
      ...(type && type !== 'ALL' && { type: type as any })
    },
    orderBy: { createdAt: 'desc' }
  });

  return NextResponse.json(contacts);
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { slug, name, email, phone, budget, preferences, properties, address, notes, type, tags } = body;

  const space = await getSpaceFromSlug(slug);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || space.id !== userSpace.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const contact = await db.contact.create({
    data: {
      spaceId: space.id,
      name,
      email: email || null,
      phone: phone || null,
      address: address || null,
      notes: notes || null,
      type: type || 'QUALIFICATION',
      budget: budget != null && budget !== '' ? parseFloat(budget) : null,
      preferences: preferences || null,
      properties: properties || [],
      tags: tags || []
    } as any
  });

  // Async vectorization — don't block the response
  syncContact(contact).catch(console.error);

  return NextResponse.json(contact, { status: 201 });
}
