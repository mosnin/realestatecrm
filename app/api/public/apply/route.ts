import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSpaceFromSubdomain } from '@/lib/space';

function normalizePhone(input: string) {
  return input.replace(/\D/g, '');
}

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

    const safeName = String(name).trim();
    const safePhone = String(phone).trim();
    const normalizedPhone = normalizePhone(safePhone);

    // Prevent accidental duplicate submissions from rapid double-submit.
    // If we see the same name+phone for the same workspace within 2 minutes,
    // treat it as the same lead and return success without creating another row.
    const duplicateCutoff = new Date(Date.now() - 2 * 60 * 1000);
    const existingRecentLead = await db.contact.findFirst({
      where: {
        spaceId: space.id,
        name: safeName,
        tags: { has: 'application-link' },
        createdAt: { gte: duplicateCutoff }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (existingRecentLead) {
      const existingNormalizedPhone = normalizePhone(existingRecentLead.phone ?? '');
      if (existingNormalizedPhone && existingNormalizedPhone === normalizedPhone) {
        return NextResponse.json({ success: true, id: existingRecentLead.id }, { status: 200 });
      }
    }

    const contact = await db.contact.create({
      data: {
        spaceId: space.id,
        name: safeName,
        email: email ? String(email) : null,
        phone: safePhone,
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
