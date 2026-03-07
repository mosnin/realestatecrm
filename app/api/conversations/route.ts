import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const spaceId = request.nextUrl.searchParams.get('spaceId');
  const type = request.nextUrl.searchParams.get('type');
  const search = request.nextUrl.searchParams.get('search');
  const after = request.nextUrl.searchParams.get('after');

  if (!spaceId) {
    return NextResponse.json({ error: 'spaceId required' }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { clerkId: userId } });
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const space = await db.space.findFirst({
    where: { id: spaceId, ownerId: user.id },
  });
  if (!space) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const where: Record<string, unknown> = { spaceId };
  if (type && type !== 'all') where.type = type;
  if (after) where.createdAt = { gt: new Date(after) };
  if (search) {
    where.OR = [
      { phone: { contains: search, mode: 'insensitive' } },
      { summary: { contains: search, mode: 'insensitive' } },
      { transcript: { contains: search, mode: 'insensitive' } },
    ];
  }

  const conversations = await db.conversation.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json(conversations);
}
