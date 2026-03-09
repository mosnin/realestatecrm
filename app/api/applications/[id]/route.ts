import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { getSpaceFromSubdomain } from '@/lib/space';

// GET /api/applications/[id]?subdomain=X  — protected, returns full application detail
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const subdomain = request.nextUrl.searchParams.get('subdomain');

  if (!subdomain) {
    return NextResponse.json({ error: 'subdomain required' }, { status: 400 });
  }

  const space = await getSpaceFromSubdomain(subdomain);
  if (!space) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const user = await db.user.findUnique({ where: { clerkId: userId } });
  if (!user || space.ownerId !== user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const application = await db.rentalApplication.findFirst({
    where: { id, spaceId: space.id },
    include: { applicants: true, documents: true },
  });

  if (!application) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(application);
}

// PATCH /api/applications/[id]  — public autosave, validates app belongs to subdomain
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { subdomain, step, applicantData, ...appData } = body as {
    subdomain: string;
    step: number;
    applicantData?: Record<string, unknown>;
    [key: string]: unknown;
  };

  if (!subdomain) {
    return NextResponse.json({ error: 'subdomain required' }, { status: 400 });
  }

  const space = await getSpaceFromSubdomain(subdomain);
  if (!space) {
    return NextResponse.json({ error: 'Space not found' }, { status: 404 });
  }

  // Verify this application belongs to the space
  const existing = await db.rentalApplication.findFirst({
    where: { id, spaceId: space.id },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Build the completed steps list
  const completedSteps = Array.from(
    new Set([...existing.completedSteps, String(step)])
  );

  // Update the application-level fields
  const updated = await db.rentalApplication.update({
    where: { id },
    data: {
      currentStep: Math.max(existing.currentStep, step + 1),
      completedSteps,
      status: 'IN_PROGRESS',
      ...(appData.propertyAddress !== undefined && { propertyAddress: appData.propertyAddress as string }),
      ...(appData.unitType !== undefined && { unitType: appData.unitType as string }),
      ...(appData.targetMoveIn !== undefined && {
        targetMoveIn: appData.targetMoveIn ? new Date(appData.targetMoveIn as string) : null,
      }),
      ...(appData.monthlyRent !== undefined && { monthlyRent: appData.monthlyRent as number }),
      ...(appData.leaseTerm !== undefined && { leaseTerm: appData.leaseTerm as string }),
      ...(appData.occupantCount !== undefined && { occupantCount: appData.occupantCount as number }),
    },
  });

  // Upsert the primary applicant record if applicant data was sent
  if (applicantData && Object.keys(applicantData).length > 0) {
    const existingApplicant = await db.rentalApplicant.findFirst({
      where: { applicationId: id, isPrimary: true },
    });

    const safeDate = (val: unknown) =>
      val ? new Date(val as string) : null;
    const safeBool = (val: unknown) =>
      val === true || val === 'true' ? true : val === false || val === 'false' ? false : null;
    const safeNum = (val: unknown) =>
      val !== undefined && val !== null && val !== '' ? Number(val) : null;

    const applicantPayload = {
      isPrimary: true,
      ...(applicantData.legalName !== undefined && { legalName: applicantData.legalName as string }),
      ...(applicantData.email !== undefined && { email: applicantData.email as string }),
      ...(applicantData.phone !== undefined && { phone: applicantData.phone as string }),
      ...(applicantData.dateOfBirth !== undefined && { dateOfBirth: safeDate(applicantData.dateOfBirth) }),
      ...(applicantData.idLastFour !== undefined && { idLastFour: applicantData.idLastFour as string }),
      ...(applicantData.currentAddress !== undefined && { currentAddress: applicantData.currentAddress as string }),
      ...(applicantData.housingStatus !== undefined && { housingStatus: applicantData.housingStatus as string || null }),
      ...(applicantData.currentPayment !== undefined && { currentPayment: safeNum(applicantData.currentPayment) }),
      ...(applicantData.lengthAtAddress !== undefined && { lengthAtAddress: applicantData.lengthAtAddress as string }),
      ...(applicantData.reasonForMoving !== undefined && { reasonForMoving: applicantData.reasonForMoving as string }),
      ...(applicantData.adultsOnApp !== undefined && { adultsOnApp: safeNum(applicantData.adultsOnApp) }),
      ...(applicantData.children !== undefined && { children: safeNum(applicantData.children) }),
      ...(applicantData.roommates !== undefined && { roommates: safeNum(applicantData.roommates) }),
      ...(applicantData.emergencyContactName !== undefined && { emergencyContactName: applicantData.emergencyContactName as string }),
      ...(applicantData.emergencyContactPhone !== undefined && { emergencyContactPhone: applicantData.emergencyContactPhone as string }),
      ...(applicantData.employmentStatus !== undefined && { employmentStatus: applicantData.employmentStatus as string || null }),
      ...(applicantData.employerName !== undefined && { employerName: applicantData.employerName as string }),
      ...(applicantData.monthlyGrossIncome !== undefined && { monthlyGrossIncome: safeNum(applicantData.monthlyGrossIncome) }),
      ...(applicantData.additionalIncome !== undefined && { additionalIncome: safeNum(applicantData.additionalIncome) }),
      ...(applicantData.currentLandlordName !== undefined && { currentLandlordName: applicantData.currentLandlordName as string }),
      ...(applicantData.currentLandlordPhone !== undefined && { currentLandlordPhone: applicantData.currentLandlordPhone as string }),
      ...(applicantData.prevLandlordName !== undefined && { prevLandlordName: applicantData.prevLandlordName as string }),
      ...(applicantData.prevLandlordPhone !== undefined && { prevLandlordPhone: applicantData.prevLandlordPhone as string }),
      ...(applicantData.rentPaidOnTime !== undefined && { rentPaidOnTime: safeBool(applicantData.rentPaidOnTime) }),
      ...(applicantData.latePayments !== undefined && { latePayments: safeNum(applicantData.latePayments) }),
      ...(applicantData.leaseViolations !== undefined && { leaseViolations: safeBool(applicantData.leaseViolations) }),
      ...(applicantData.referencePermission !== undefined && { referencePermission: safeBool(applicantData.referencePermission) }),
      ...(applicantData.priorEvictions !== undefined && { priorEvictions: safeBool(applicantData.priorEvictions) }),
      ...(applicantData.outstandingBalances !== undefined && { outstandingBalances: safeBool(applicantData.outstandingBalances) }),
      ...(applicantData.bankruptcy !== undefined && { bankruptcy: safeBool(applicantData.bankruptcy) }),
      ...(applicantData.backgroundConsent !== undefined && { backgroundConsent: safeBool(applicantData.backgroundConsent) }),
      ...(applicantData.hasPets !== undefined && { hasPets: safeBool(applicantData.hasPets) }),
      ...(applicantData.petDetails !== undefined && { petDetails: applicantData.petDetails as string }),
      ...(applicantData.smokingDeclaration !== undefined && { smokingDeclaration: safeBool(applicantData.smokingDeclaration) }),
      ...(applicantData.screeningConsent !== undefined && { screeningConsent: safeBool(applicantData.screeningConsent) }),
      ...(applicantData.truthCertification !== undefined && { truthCertification: safeBool(applicantData.truthCertification) }),
      ...(applicantData.electronicSignature !== undefined && { electronicSignature: applicantData.electronicSignature as string }),
    };

    if (existingApplicant) {
      await db.rentalApplicant.update({
        where: { id: existingApplicant.id },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: applicantPayload as any,
      });
    } else {
      await db.rentalApplicant.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { applicationId: id, ...applicantPayload } as any,
      });
    }
  }

  console.log('[analytics]', 'autosave_succeeded', { applicationId: id, step });

  return NextResponse.json(updated);
}
