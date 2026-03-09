import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSpaceFromSubdomain } from '@/lib/space';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      subdomain,
      name,
      email,
      phone,
      budget,
      timeline,
      preferredAreas,
      notes,
    } = body ?? {};

    if (!subdomain || !name || !phone) {
      return NextResponse.json(
        { error: 'subdomain, name, and phone are required' },
        { status: 400 }
      );
    }

    const space = await getSpaceFromSubdomain(String(subdomain));
    if (!space) {
      return NextResponse.json({ error: 'Space not found' }, { status: 404 });
    }

    const contact = await db.contact.create({
      data: {
        spaceId: space.id,
        name: String(name),
        email: email ? String(email) : null,
        phone: String(phone),
        budget: budget != null && budget !== '' ? Number.parseFloat(String(budget)) : null,
        preferences: preferredAreas ? String(preferredAreas) : null,
        notes: notes || timeline ? `Timeline: ${timeline ?? 'N/A'}\n${notes ?? ''}`.trim() : null,
        type: 'QUALIFICATION',
        properties: [],
        tags: ['application-link', 'new-lead'],
      },
    });

    return NextResponse.json({ success: true, id: contact.id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
