import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSpaceFromSubdomain } from '@/lib/space';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const subdomain = req.nextUrl.searchParams.get('subdomain');
  if (!subdomain) return NextResponse.json({ error: 'subdomain required' }, { status: 400 });

  const space = await getSpaceFromSubdomain(subdomain);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

  const agent = await db.retellAgent.findUnique({
    where: { spaceId: space.id },
    select: {
      id: true,
      retellAgentId: true,
      phoneNumber: true,
      telephonyType: true,
      status: true,
      greetingText: true,
      brokerageName: true,
      primaryMarket: true,
      createdAt: true
    }
  });

  if (!agent) return NextResponse.json(null);
  return NextResponse.json(agent);
}
