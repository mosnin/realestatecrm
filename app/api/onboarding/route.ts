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

function isPrismaUnknownSpaceSettingFieldError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return [
    'Unknown argument `phoneNumber`',
    'Unknown argument `businessName`',
    'Unknown argument `intakePageTitle`',
    'Unknown argument `intakePageIntro`',
    'Unknown argument `myConnections`'
  ].some((snippet) => error.message.includes(snippet));
}

function isLegacySpaceSettingShapeError(error: unknown) {
  return (
    isPrismaMissingColumnError(error) ||
    isPrismaUnknownSpaceSettingFieldError(error)
  );
}

function isPrismaUnknownOnboardingFieldError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return [
    'Unknown argument `onboarded`',
    'Unknown argument `onboardingCurrentStep`',
    'Unknown argument `onboardingStartedAt`',
    'Unknown argument `onboardingCompletedAt`'
  ].some((snippet) => error.message.includes(snippet));
}

async function updateOnboardingUserFields(
  userId: string,
  data: Record<string, unknown>
) {
  try {
    await db.user.update({
      where: { id: userId },
      data
    });
  } catch (error) {
    if (!isPrismaUnknownOnboardingFieldError(error)) throw error;
    // Deployed Prisma client may be older than the schema and not recognize
    // onboarding fields yet. In that case, allow flow to continue.
  }
}

function getSafeUserEmail(userId: string, clerkEmail?: string | null) {
  const normalized = clerkEmail?.trim();
  if (normalized) return normalized;
  // Clerk can return no primary email in some account states.
  // User.email is unique in our DB, so empty-string fallbacks cause P2002 collisions.
  return `${userId}@no-email.local`;
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
      step: (user as any).onboardingCurrentStep ?? 1,
      completed: !!((user as any).onboarded || (user as any).onboardingCompletedAt),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        onboardingStartedAt: (user as any).onboardingStartedAt ?? null,
        onboardingCompletedAt: (user as any).onboardingCompletedAt ?? null
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
    const safeEmail = getSafeUserEmail(
      userId,
      clerkUser?.emailAddresses?.[0]?.emailAddress
    );
    const user = await db.user.upsert({
      where: { clerkId: userId },
      update: {
        email: safeEmail,
        name: clerkUser?.fullName ?? clerkUser?.firstName ?? undefined
      },
      create: {
        clerkId: userId,
        email: safeEmail,
        name: clerkUser?.fullName ?? clerkUser?.firstName ?? null
      },
      include: { space: { include: { settings: true } } }
    });

    if (action === 'start') {
      await updateOnboardingUserFields(user.id, {
        onboardingCurrentStep: 1,
        onboardingStartedAt: (user as any).onboardingStartedAt ?? new Date()
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'save_step') {
      const { step } = body as { step: number };
      await updateOnboardingUserFields(user.id, {
        onboardingCurrentStep: step,
        onboardingStartedAt: (user as any).onboardingStartedAt ?? new Date()
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
          if (!isLegacySpaceSettingShapeError(error)) throw error;
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
          if (!isLegacySpaceSettingShapeError(error)) throw error;
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
        if (!isLegacySpaceSettingShapeError(error)) throw error;
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

      await updateOnboardingUserFields(user.id, { onboardingCurrentStep: 4 });

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

      try {
        await db.spaceSetting.update({
          where: { spaceId: user.space.id },
          data: {
            myConnections: JSON.stringify({
              defaultSubmissionStatus: defaultSubmissionStatus || 'New'
            })
          }
        });
      } catch (error) {
        if (!isLegacySpaceSettingShapeError(error)) throw error;
        // Optional legacy field write; safe to skip.
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'complete') {
      await updateOnboardingUserFields(user.id, {
        onboarded: true,
        onboardingCurrentStep: 7,
        onboardingCompletedAt: new Date()
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
    const message = err instanceof Error ? err.message : 'Server error. Please try again.';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
