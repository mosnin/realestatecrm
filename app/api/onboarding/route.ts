import { auth, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

function isPrismaMissingColumnError(error: unknown) {
  if (!(error instanceof Error)) return false;

  // Prisma P2022 = "The column ... does not exist in the current database".
  // We also keep a message fallback for environments where error codes are stripped.
  return (
    error.message.includes('P2022') ||
    error.message.toLowerCase().includes('does not exist in the current database')
  );
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const user = await db.user.findUnique({
      where: { clerkId: userId },
      include: {
        space: {
          include: { settings: true }
        }
      }
    });

    if (!user) {
      return NextResponse.json({ step: 1, completed: false, user: null, space: null });
    }

    return NextResponse.json({
      step: user.onboardingCurrentStep,
      completed: !!user.onboardingCompletedAt,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        onboardingStartedAt: user.onboardingStartedAt,
        onboardingCompletedAt: user.onboardingCompletedAt
      },
      space: user.space
        ? {
            id: user.space.id,
            subdomain: user.space.subdomain,
            name: user.space.name,
            settings: user.space.settings
          }
        : null
    });
  } catch (err) {
    console.error('[onboarding GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { action } = body;

  try {
    // Ensure user record exists
    const clerkUser = await currentUser();
    const user = await db.user.upsert({
      where: { clerkId: userId },
      update: {},
      create: {
        clerkId: userId,
        email: clerkUser?.emailAddresses?.[0]?.emailAddress ?? '',
        name: clerkUser?.fullName ?? clerkUser?.firstName ?? null,
        onboardingStartedAt: new Date()
      },
      include: { space: { include: { settings: true } } }
    });

    if (action === 'start') {
      await db.user.update({
        where: { id: user.id },
        data: {
          onboardingCurrentStep: 1,
          onboardingStartedAt: user.onboardingStartedAt ?? new Date()
        }
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'save_step') {
      const { step } = body as { step: number };
      await db.user.update({
        where: { id: user.id },
        data: {
          onboardingCurrentStep: step,
          onboardingStartedAt: user.onboardingStartedAt ?? new Date()
        }
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'save_profile') {
      const { name, phoneNumber, phone, businessName } = body as {
        name: string;
        phoneNumber: string;
        phone?: string;
        businessName: string;
      };
      const normalizedPhone = phoneNumber ?? phone ?? '';

      await db.user.update({
        where: { id: user.id },
        data: { name: name || user.name }
      });

      if (user.space) {
        try {
          await db.spaceSetting.upsert({
            where: { spaceId: user.space.id },
            update: { phoneNumber: normalizedPhone, businessName },
            create: { spaceId: user.space.id, phoneNumber: normalizedPhone, businessName }
          });
        } catch (error) {
          if (!isPrismaMissingColumnError(error)) throw error;
          // Legacy DB schema fallback: only guaranteed baseline setting fields.
          await db.spaceSetting.upsert({
            where: { spaceId: user.space.id },
            update: {},
            create: { spaceId: user.space.id }
          });
        }
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'create_space') {
      const { subdomain, intakePageTitle, intakePageIntro, businessName } = body as {
        subdomain: string;
        intakePageTitle: string;
        intakePageIntro: string;
        businessName: string;
      };

      if (!subdomain) {
        return NextResponse.json({ error: 'Subdomain is required' }, { status: 400 });
      }

      const sanitized = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (sanitized !== subdomain) {
        return NextResponse.json(
          { error: 'Only lowercase letters, numbers, and hyphens allowed' },
          { status: 400 }
        );
      }

      if (user.space) {
        // Space already created — just update settings
        try {
          await db.spaceSetting.upsert({
            where: { spaceId: user.space.id },
            update: { intakePageTitle, intakePageIntro, businessName },
            create: { spaceId: user.space.id, intakePageTitle, intakePageIntro, businessName }
          });
        } catch (error) {
          if (!isPrismaMissingColumnError(error)) throw error;
          await db.spaceSetting.upsert({
            where: { spaceId: user.space.id },
            update: {},
            create: { spaceId: user.space.id }
          });
        }
        return NextResponse.json({ success: true, subdomain: user.space.subdomain });
      }

      const existing = await db.space.findUnique({
        where: { subdomain: sanitized },
        select: { id: true }
      });
      if (existing) {
        return NextResponse.json({ error: 'That slug is already taken' }, { status: 409 });
      }

      const DEFAULT_STAGES = [
        { name: 'New', color: '#94a3b8', position: 0 },
        { name: 'Reviewing', color: '#60a5fa', position: 1 },
        { name: 'Showing', color: '#a78bfa', position: 2 },
        { name: 'Applied', color: '#f59e0b', position: 3 },
        { name: 'Approved', color: '#22c55e', position: 4 },
        { name: 'Declined', color: '#ef4444', position: 5 }
      ];

      let space;
      try {
        space = await db.space.create({
          data: {
            subdomain: sanitized,
            name: businessName || sanitized,
            emoji: '🏠',
            ownerId: user.id,
            settings: {
              create: {
                intakePageTitle: intakePageTitle || 'Rental Application',
                intakePageIntro:
                  intakePageIntro ||
                  "Share a few details so I can review your rental fit faster.",
                businessName,
                phoneNumber: null
              }
            },
            stages: { create: DEFAULT_STAGES }
          }
        });
      } catch (error) {
        if (!isPrismaMissingColumnError(error)) throw error;
        // Some environments have an older SpaceSetting table. Create a space with
        // baseline settings only so onboarding can proceed instead of hard-failing.
        space = await db.space.create({
          data: {
            subdomain: sanitized,
            name: businessName || sanitized,
            emoji: '🏠',
            ownerId: user.id,
            settings: { create: {} },
            stages: { create: DEFAULT_STAGES }
          }
        });
      }

      await db.user.update({
        where: { id: user.id },
        data: { onboardingCurrentStep: 4 }
      });

      return NextResponse.json({ success: true, subdomain: space.subdomain });
    }

    if (action === 'save_notifications') {
      const { emailNotifications, defaultSubmissionStatus } = body as {
        emailNotifications: boolean;
        defaultSubmissionStatus: string;
      };

      if (!user.space) {
        return NextResponse.json({ error: 'No space found' }, { status: 400 });
      }

      await db.spaceSetting.upsert({
        where: { spaceId: user.space.id },
        update: { notifications: emailNotifications },
        create: { spaceId: user.space.id, notifications: emailNotifications }
      });

      await db.spaceSetting.update({
        where: { spaceId: user.space.id },
        data: {
          myConnections: JSON.stringify({
            defaultSubmissionStatus: defaultSubmissionStatus || 'New'
          })
        }
      });

      return NextResponse.json({ success: true });
    }

    if (action === 'complete') {
      await db.user.update({
        where: { id: user.id },
        data: {
          onboardingCurrentStep: 7,
          onboardingCompletedAt: new Date()
        }
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'check_slug') {
      const { slug } = body as { slug: string };
      if (!slug) return NextResponse.json({ available: false });
      const sanitized = slug.toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (sanitized !== slug || slug.length < 3) {
        return NextResponse.json({ available: false, reason: 'invalid' });
      }
      const existing = await db.space.findUnique({
        where: { subdomain: sanitized },
        select: { id: true }
      });
      return NextResponse.json({ available: !existing });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

  } catch (err) {
    console.error('[onboarding POST] action:', action, err);
    return NextResponse.json(
      { error: 'Server error. Please try again.' },
      { status: 500 }
    );
  }
}
