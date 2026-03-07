import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const spaceId = request.nextUrl.searchParams.get('spaceId');
  const after = request.nextUrl.searchParams.get('after');

  if (!spaceId) {
    return NextResponse.json({ error: 'spaceId required' }, { status: 400 });
  }

  // Verify user owns this space
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

  const leads = await db.lead.findMany({
    where: {
      spaceId,
      ...(after ? { createdAt: { gt: new Date(after) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json(leads);
}
