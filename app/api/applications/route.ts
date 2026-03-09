import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { getSpaceFromSubdomain } from '@/lib/space';

// GET /api/applications?subdomain=X  — protected, returns all applications for the CRM
export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const subdomain = request.nextUrl.searchParams.get('subdomain');
  if (!subdomain) {
    return NextResponse.json({ error: 'subdomain required' }, { status: 400 });
  }

  const space = await getSpaceFromSubdomain(subdomain);
  if (!space) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Verify user owns this space
  const user = await db.user.findUnique({ where: { clerkId: userId } });
  if (!user || space.ownerId !== user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const applications = await db.rentalApplication.findMany({
    where: { spaceId: space.id },
    include: {
      applicants: {
        where: { isPrimary: true },
        take: 1,
      },
      documents: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(applications);
}

// POST /api/applications  — public, creates a draft application
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { subdomain, ...step1Data } = body as {
    subdomain: string;
    propertyAddress?: string;
    unitType?: string;
    targetMoveIn?: string;
    monthlyRent?: number;
    leaseTerm?: string;
    occupantCount?: number;
  };

  if (!subdomain) {
    return NextResponse.json({ error: 'subdomain required' }, { status: 400 });
  }

  const space = await getSpaceFromSubdomain(subdomain);
  if (!space) {
    return NextResponse.json({ error: 'Space not found' }, { status: 404 });
  }

  const application = await db.rentalApplication.create({
    data: {
      spaceId: space.id,
      status: 'IN_PROGRESS',
      currentStep: 1,
      completedSteps: ['1'],
      propertyAddress: step1Data.propertyAddress ?? null,
      unitType: step1Data.unitType ?? null,
      targetMoveIn: step1Data.targetMoveIn ? new Date(step1Data.targetMoveIn) : null,
      monthlyRent: step1Data.monthlyRent ?? null,
      leaseTerm: step1Data.leaseTerm ?? null,
      occupantCount: step1Data.occupantCount ?? null,
    },
  });

  console.log('[analytics]', 'application_started', { applicationId: application.id, subdomain });

  return NextResponse.json(application, { status: 201 });
}
