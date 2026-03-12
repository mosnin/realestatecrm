import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSpaceFromSlug, getSpaceForUser } from '@/lib/space';
import { syncContact } from '@/lib/vectorize';
import type { Contact } from '@/lib/types';

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

  let contacts: Contact[];

  if (search && type && type !== 'ALL') {
    const pattern = `%${search}%`;
    contacts = await sql`
      SELECT * FROM "Contact"
      WHERE "spaceId" = ${space.id}
        AND "type" = ${type}
        AND (
          "name" ILIKE ${pattern}
          OR "email" ILIKE ${pattern}
          OR "phone" ILIKE ${pattern}
          OR "preferences" ILIKE ${pattern}
        )
      ORDER BY "createdAt" DESC
    ` as Contact[];
  } else if (search) {
    const pattern = `%${search}%`;
    contacts = await sql`
      SELECT * FROM "Contact"
      WHERE "spaceId" = ${space.id}
        AND (
          "name" ILIKE ${pattern}
          OR "email" ILIKE ${pattern}
          OR "phone" ILIKE ${pattern}
          OR "preferences" ILIKE ${pattern}
        )
      ORDER BY "createdAt" DESC
    ` as Contact[];
  } else if (type && type !== 'ALL') {
    contacts = await sql`
      SELECT * FROM "Contact"
      WHERE "spaceId" = ${space.id}
        AND "type" = ${type}
      ORDER BY "createdAt" DESC
    ` as Contact[];
  } else {
    contacts = await sql`
      SELECT * FROM "Contact"
      WHERE "spaceId" = ${space.id}
      ORDER BY "createdAt" DESC
    ` as Contact[];
  }

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

  const id = crypto.randomUUID();
  const budgetVal = budget != null && budget !== '' ? parseFloat(budget) : null;
  const propsVal = properties || [];
  const tagsVal = tags || [];

  const rows = await sql`
    INSERT INTO "Contact" ("id", "spaceId", "name", "email", "phone", "address", "notes", "type", "budget", "preferences", "properties", "tags")
    VALUES (
      ${id}, ${space.id}, ${name}, ${email || null}, ${phone || null},
      ${address || null}, ${notes || null}, ${type || 'QUALIFICATION'},
      ${budgetVal}, ${preferences || null}, ${propsVal}, ${tagsVal}
    )
    RETURNING *
  `;

  const contact = rows[0] as Contact;

  // Async vectorization — don't block the response
  syncContact(contact).catch(console.error);

  return NextResponse.json(contact, { status: 201 });
}
