import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSpaceFromSubdomain } from '@/lib/space';
import { computeQualScore, generateSummary } from '@/lib/scoring';
import { scoreApplicationWithAI } from '@/lib/ai-scoring';

// POST /api/applications/[id]/submit  — public, finalizes the application and creates a Contact
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { subdomain } = body as { subdomain: string };

  if (!subdomain) {
    return NextResponse.json({ error: 'subdomain required' }, { status: 400 });
  }

  const space = await getSpaceFromSubdomain(subdomain);
  if (!space) {
    return NextResponse.json({ error: 'Space not found' }, { status: 404 });
  }

  // Fetch the full application
  const application = await db.rentalApplication.findFirst({
    where: { id, spaceId: space.id },
    include: {
      applicants: { where: { isPrimary: true }, take: 1 },
    },
  });

  if (!application) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (application.status === 'SUBMITTED') {
    return NextResponse.json({ error: 'Already submitted' }, { status: 400 });
  }

  const primaryApplicant = application.applicants[0];

  // Require at minimum a name and contact info
  if (!primaryApplicant?.legalName || (!primaryApplicant?.email && !primaryApplicant?.phone)) {
    return NextResponse.json(
      { error: 'Applicant name and email or phone are required' },
      { status: 422 }
    );
  }

  // Compute qualification score
  const qualScore = computeQualScore(
    { monthlyRent: application.monthlyRent },
    {
      monthlyGrossIncome: primaryApplicant.monthlyGrossIncome,
      additionalIncome: primaryApplicant.additionalIncome,
      employmentStatus: primaryApplicant.employmentStatus,
      priorEvictions: primaryApplicant.priorEvictions,
      outstandingBalances: primaryApplicant.outstandingBalances,
      latePayments: primaryApplicant.latePayments,
      leaseViolations: primaryApplicant.leaseViolations,
      backgroundConsent: primaryApplicant.backgroundConsent,
    }
  );

  const summary = generateSummary(
    {
      monthlyRent: application.monthlyRent,
      targetMoveIn: application.targetMoveIn,
      occupantCount: application.occupantCount,
    },
    {
      legalName: primaryApplicant.legalName,
      monthlyGrossIncome: primaryApplicant.monthlyGrossIncome,
      additionalIncome: primaryApplicant.additionalIncome,
      employmentStatus: primaryApplicant.employmentStatus,
      employerName: primaryApplicant.employerName,
      priorEvictions: primaryApplicant.priorEvictions,
      outstandingBalances: primaryApplicant.outstandingBalances,
      latePayments: primaryApplicant.latePayments,
      leaseViolations: primaryApplicant.leaseViolations,
      hasPets: primaryApplicant.hasPets,
      petDetails: primaryApplicant.petDetails,
      smokingDeclaration: primaryApplicant.smokingDeclaration,
      adultsOnApp: primaryApplicant.adultsOnApp,
      children: primaryApplicant.children,
    },
    qualScore
  );

  // Create or find the Contact record in the CRM
  let contact = primaryApplicant.email
    ? await db.contact.findFirst({
        where: { spaceId: space.id, email: primaryApplicant.email },
      })
    : null;

  if (!contact) {
    contact = await db.contact.create({
      data: {
        spaceId: space.id,
        name: primaryApplicant.legalName,
        email: primaryApplicant.email ?? undefined,
        phone: primaryApplicant.phone ?? undefined,
        address: primaryApplicant.currentAddress ?? undefined,
        notes: summary,
        type: 'APPLICATION',
        tags: [qualScore, 'rental-application'],
      },
    });
    console.log('[analytics]', 'crm_card_created', {
      applicationId: id,
      contactId: contact.id,
    });
  } else {
    // Update notes with the latest summary
    contact = await db.contact.update({
      where: { id: contact.id },
      data: { notes: summary, type: 'APPLICATION' },
    });
  }

  // Finalize the application
  const finalized = await db.rentalApplication.update({
    where: { id },
    data: {
      status: 'SUBMITTED',
      submittedAt: new Date(),
      qualScore,
      summary,
      contactId: contact.id,
      completedSteps: Array.from(
        new Set([...application.completedSteps, '7'])
      ),
    },
  });

  console.log('[analytics]', 'application_submitted', {
    applicationId: id,
    qualScore,
    contactId: contact.id,
  });

  // Trigger AI scoring asynchronously — does not block the response
  scoreApplicationWithAI(id).catch(() => {
    // Errors already logged inside scoreApplicationWithAI
  });

  return NextResponse.json({
    applicationId: finalized.id,
    contactId: contact.id,
    qualScore,
    summary,
  });
}
