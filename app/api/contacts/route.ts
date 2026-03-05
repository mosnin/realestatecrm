import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSpaceFromSubdomain } from '@/lib/space';
import { syncContact } from '@/lib/vectorize';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const subdomain = req.nextUrl.searchParams.get('subdomain');
  if (!subdomain) return NextResponse.json({ error: 'subdomain required' }, { status: 400 });

  const space = await getSpaceFromSubdomain(subdomain);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

  const search = req.nextUrl.searchParams.get('search') ?? '';
  const type = req.nextUrl.searchParams.get('type');

  const contacts = await db.contact.findMany({
    where: {
      spaceId: space.id,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } }
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
  const { subdomain, name, email, phone, address, notes, type, tags } = body;

  const space = await getSpaceFromSubdomain(subdomain);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

  const contact = await db.contact.create({
    data: {
      spaceId: space.id,
      name,
      email: email || null,
      phone: phone || null,
      address: address || null,
      notes: notes || null,
      type: type || 'OTHER',
      tags: tags || []
    }
  });

  // Async vectorization — don't block the response
  syncContact(contact).catch(console.error);

  return NextResponse.json(contact, { status: 201 });
}
