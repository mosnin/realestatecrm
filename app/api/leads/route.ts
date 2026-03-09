import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSpaceFromSubdomain } from '@/lib/space';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const subdomain = req.nextUrl.searchParams.get('subdomain');
  if (!subdomain) {
    return NextResponse.json({ error: 'subdomain required' }, { status: 400 });
  }

  const takeParam = Number.parseInt(req.nextUrl.searchParams.get('take') ?? '50', 10);
  const take = Number.isNaN(takeParam) ? 50 : Math.min(Math.max(takeParam, 1), 100);

  const space = await getSpaceFromSubdomain(subdomain);
  if (!space) {
    return NextResponse.json({ error: 'Space not found' }, { status: 404 });
  }

  const leads = await db.lead.findMany({
    where: { spaceId: space.id },
    orderBy: { createdAt: 'desc' },
    take,
  });

  return NextResponse.json(leads);
}
