import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSpaceFromSlug } from '@/lib/space';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const space = await getSpaceFromSlug(slug);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const stages = await db.dealStage.findMany({
    where: { spaceId: space.id },
    orderBy: { position: 'asc' },
    include: {
      deals: {
        orderBy: { position: 'asc' },
        include: {
          dealContacts: { include: { contact: { select: { id: true, name: true } } } }
        }
      }
    }
  });

  return NextResponse.json(stages);
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { slug, name, color } = await req.json();
  const space = await getSpaceFromSlug(slug);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const lastStage = await db.dealStage.findFirst({
    where: { spaceId: space.id },
    orderBy: { position: 'desc' }
  });

  const stage = await db.dealStage.create({
    data: {
      spaceId: space.id,
      name,
      color: color ?? '#6366f1',
      position: (lastStage?.position ?? -1) + 1
    }
  });

  return NextResponse.json(stage, { status: 201 });
}
