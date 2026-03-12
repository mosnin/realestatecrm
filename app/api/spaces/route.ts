import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { redis } from '@/lib/redis';
import { getSpaceForUser } from '@/lib/space';

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const {
    slug,
    name,
    emoji,
    notifications,
    phoneNumber,
    myConnections,
    aiPersonalization,
    billingSettings,
    anthropicApiKey
  } = await req.json();

  const space = await db.space.findUnique({ where: { slug } });
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || space.id !== userSpace.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const updated = await db.space.update({
    where: { slug },
    data: {
      name,
      ...(emoji !== undefined ? { emoji } : {})
    }
  });

  await db.spaceSetting.upsert({
    where: { spaceId: space.id },
    update: {
      notifications,
      phoneNumber,
      myConnections,
      aiPersonalization,
      billingSettings,
      anthropicApiKey: anthropicApiKey || null
    } as any,
    create: {
      spaceId: space.id,
      notifications,
      phoneNumber,
      myConnections,
      aiPersonalization,
      billingSettings,
      anthropicApiKey: anthropicApiKey || null
    } as any
  });

  // Update Redis emoji
  const existing = await redis.get<any>(`slug:${slug}`).catch(() => null);
  if (existing) {
    await redis
      .set(`slug:${slug}`, { ...existing, emoji })
      .catch(() => null);
  }

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { slug } = await req.json();

  const space = await db.space.findUnique({ where: { slug } });
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || space.id !== userSpace.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await redis.del(`slug:${slug}`).catch(() => null);
  await db.space.delete({ where: { slug } });

  return NextResponse.json({ success: true });
}
