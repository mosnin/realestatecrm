import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { redis } from '@/lib/redis';

// GET /api/spaces?action=check_name&name=...&subdomain=...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action    = searchParams.get('action');
  const name      = searchParams.get('name')?.trim();
  const subdomain = searchParams.get('subdomain');

  if (action !== 'check_name' || !name || !subdomain) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // Find any space with this name (case-insensitive), excluding the caller's own space
  const conflict = await db.space.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      subdomain: { not: subdomain },
    },
    select: { id: true },
  });

  return NextResponse.json({ available: !conflict });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const {
    subdomain,
    name,
    emoji,
    notifications,
    phoneNumber,
    aiPersonalization,
    anthropicApiKey,
  } = await req.json();

  // Validate name uniqueness when name is being changed
  if (name) {
    const conflict = await db.space.findFirst({
      where: {
        name: { equals: String(name).trim(), mode: 'insensitive' },
        subdomain: { not: subdomain },
      },
      select: { id: true },
    });
    if (conflict) {
      return NextResponse.json({ error: 'That workspace name is already taken.' }, { status: 409 });
    }
  }

  const space = await db.space.update({
    where: { subdomain },
    data: {
      ...(name  !== undefined ? { name: String(name).trim() } : {}),
      ...(emoji !== undefined ? { emoji } : {}),
    },
  });

  await db.spaceSetting.upsert({
    where: { spaceId: space.id },
    update: {
      notifications,
      phoneNumber,
      aiPersonalization,
      anthropicApiKey: anthropicApiKey || null,
    } as any,
    create: {
      spaceId: space.id,
      notifications,
      phoneNumber,
      aiPersonalization,
      anthropicApiKey: anthropicApiKey || null,
    } as any,
  });

  // Keep Redis cache in sync
  const existing = await redis.get<any>(`subdomain:${subdomain}`).catch(() => null);
  if (existing) {
    await redis.set(`subdomain:${subdomain}`, { ...existing, ...(emoji !== undefined ? { emoji } : {}) }).catch(() => null);
  }

  return NextResponse.json(space);
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { subdomain } = await req.json();

  await redis.del(`subdomain:${subdomain}`).catch(() => null);
  await db.space.delete({ where: { subdomain } }).catch(() => null);

  return NextResponse.json({ success: true });
}
