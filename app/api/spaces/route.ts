import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { redis } from '@/lib/redis';

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { subdomain, name, emoji, notifications } = await req.json();

  const space = await db.space.update({
    where: { subdomain },
    data: { name, emoji }
  });

  await db.spaceSetting.upsert({
    where: { spaceId: space.id },
    update: { notifications },
    create: { spaceId: space.id, notifications }
  });

  // Update Redis emoji
  const existing = await redis.get<any>(`subdomain:${subdomain}`);
  if (existing) {
    await redis.set(`subdomain:${subdomain}`, { ...existing, emoji });
  }

  return NextResponse.json(space);
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { subdomain } = await req.json();

  await redis.del(`subdomain:${subdomain}`);
  await db.space.delete({ where: { subdomain } }).catch(() => null);

  return NextResponse.json({ success: true });
}
