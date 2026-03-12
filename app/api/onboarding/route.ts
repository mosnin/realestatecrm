import { auth, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { isValidSlug, normalizeSlug } from '@/lib/intake';
import { getOnboardingStatus, ensureOnboardingBackfill } from '@/lib/onboarding';
import type { User, Space, SpaceSetting } from '@/lib/types';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const users = await sql`
      SELECT * FROM "User" WHERE "clerkId" = ${userId}
    ` as User[];

    const user = users[0] ?? null;

    if (!user) {
      return NextResponse.json({ step: 1, completed: false, user: null, space: null });
    }

    const spaces = await sql`
      SELECT * FROM "Space" WHERE "ownerId" = ${user.id}
    ` as Space[];
    const space = spaces[0] ?? null;

    let settings: SpaceSetting | null = null;
    if (space) {
      const settingsRows = await sql`
        SELECT * FROM "SpaceSetting" WHERE "spaceId" = ${space.id}
      ` as SpaceSetting[];
      settings = settingsRows[0] ?? null;
    }

    const userWithSpace = { ...user, space: space ? { ...space, settings } : null };

    try {
      await ensureOnboardingBackfill(userWithSpace);
    } catch (err) {
      console.error('[onboarding GET] backfill failed', err);
    }

    return NextResponse.json({
      step: user.onboardingCurrentStep,
      completed: getOnboardingStatus(user).isOnboarded,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        onboard: user.onboard,
        onboardingStartedAt: user.onboardingStartedAt,
        onboardingCompletedAt: user.onboardingCompletedAt
      },
      space: space
        ? {
            id: space.id,
            slug: space.slug,
            name: space.name,
            settings
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
    // SELECT first — avoid calling currentUser() (a Clerk API round-trip) for existing users
    let user: User;
    const existing = await sql`SELECT * FROM "User" WHERE "clerkId" = ${userId}` as User[];
    if (existing[0]) {
      user = existing[0];
    } else {
      const clerkUser = await currentUser();
      const inserted = await sql`
        INSERT INTO "User" ("id", "clerkId", "email", "name", "onboardingStartedAt", "onboard")
        VALUES (
          ${crypto.randomUUID()},
          ${userId},
          ${clerkUser?.emailAddresses?.[0]?.emailAddress ?? ''},
          ${clerkUser?.fullName ?? clerkUser?.firstName ?? null},
          ${new Date()},
          ${false}
        )
        ON CONFLICT ("clerkId") DO UPDATE SET "clerkId" = "User"."clerkId"
        RETURNING *
      ` as User[];
      user = inserted[0];
    }

    // Get space + settings separately
    const spaces = await sql`
      SELECT * FROM "Space" WHERE "ownerId" = ${user.id}
    ` as Space[];
    const space = spaces[0] ?? null;

    let settings: SpaceSetting | null = null;
    if (space) {
      const settingsRows = await sql`
        SELECT * FROM "SpaceSetting" WHERE "spaceId" = ${space.id}
      ` as SpaceSetting[];
      settings = settingsRows[0] ?? null;
    }

    const userWithSpace = { ...user, space: space ? { ...space, settings } : null };

    try {
      await ensureOnboardingBackfill(userWithSpace);
    } catch (err) {
      console.error('[onboarding POST] backfill failed', err);
    }

    if (action === 'start') {
      await sql`
        UPDATE "User"
        SET "onboard" = ${false},
            "onboardingCurrentStep" = ${1},
            "onboardingStartedAt" = ${user.onboardingStartedAt ?? new Date()}
        WHERE "id" = ${user.id}
      `;
      return NextResponse.json({ success: true });
    }

    if (action === 'save_step') {
      const { step } = body as { step: number };
      await sql`
        UPDATE "User"
        SET "onboardingCurrentStep" = ${step},
            "onboardingStartedAt" = ${user.onboardingStartedAt ?? new Date()}
        WHERE "id" = ${user.id}
      `;
      return NextResponse.json({ success: true });
    }

    if (action === 'save_profile') {
      const { name, phone, phoneNumber, businessName } = body as {
        name: string;
        phone?: string;
        phoneNumber?: string;
        businessName: string;
      };
      const resolvedPhone = phone || phoneNumber || null;

      await sql`
        UPDATE "User"
        SET "name" = ${name || user.name}
        WHERE "id" = ${user.id}
      `;

      if (space) {
        await sql`
          INSERT INTO "SpaceSetting" ("id", "spaceId", "phoneNumber", "businessName")
          VALUES (${crypto.randomUUID()}, ${space.id}, ${resolvedPhone}, ${businessName})
          ON CONFLICT ("spaceId") DO UPDATE
          SET "phoneNumber" = ${resolvedPhone},
              "businessName" = ${businessName}
        `;
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'create_space') {
      const { slug, intakePageTitle, intakePageIntro, businessName } = body as {
        slug: string;
        intakePageTitle: string;
        intakePageIntro: string;
        businessName: string;
      };

      if (!slug) return NextResponse.json({ error: 'Slug is required' }, { status: 400 });

      const sanitized = normalizeSlug(slug);
      if (!isValidSlug(slug) || sanitized !== slug) {
        return NextResponse.json({ error: 'Only lowercase letters, numbers, and hyphens allowed' }, { status: 400 });
      }

      if (space) {
        await sql`
          INSERT INTO "SpaceSetting" ("id", "spaceId", "intakePageTitle", "intakePageIntro", "businessName")
          VALUES (${crypto.randomUUID()}, ${space.id}, ${intakePageTitle}, ${intakePageIntro}, ${businessName})
          ON CONFLICT ("spaceId") DO UPDATE
          SET "intakePageTitle" = ${intakePageTitle},
              "intakePageIntro" = ${intakePageIntro},
              "businessName" = ${businessName}
        `;
        return NextResponse.json({ success: true, slug: space.slug });
      }

      const existingSlug = await sql`
        SELECT "id" FROM "Space" WHERE "slug" = ${sanitized} LIMIT 1
      ` as { id: string }[];
      if (existingSlug.length) return NextResponse.json({ error: 'That slug is already taken' }, { status: 409 });

      const existingOwnerSpace = await sql`
        SELECT "slug" FROM "Space" WHERE "ownerId" = ${user.id} LIMIT 1
      ` as { slug: string }[];
      if (existingOwnerSpace.length) return NextResponse.json({ success: true, slug: existingOwnerSpace[0].slug });

      const DEFAULT_STAGES = [
        { name: 'New', color: '#94a3b8', position: 0 },
        { name: 'Reviewing', color: '#60a5fa', position: 1 },
        { name: 'Showing', color: '#a78bfa', position: 2 },
        { name: 'Applied', color: '#f59e0b', position: 3 },
        { name: 'Approved', color: '#22c55e', position: 4 },
        { name: 'Declined', color: '#ef4444', position: 5 }
      ];

      let newSpace: Space;
      try {
        const spaceId = crypto.randomUUID();
        const createdSpaces = await sql`
          INSERT INTO "Space" ("id", "slug", "name", "emoji", "ownerId")
          VALUES (${spaceId}, ${sanitized}, ${businessName || sanitized}, ${'🏠'}, ${user.id})
          RETURNING *
        ` as Space[];
        newSpace = createdSpaces[0];

        await sql`
          INSERT INTO "SpaceSetting" ("id", "spaceId", "intakePageTitle", "intakePageIntro", "businessName", "phoneNumber")
          VALUES (
            ${crypto.randomUUID()},
            ${spaceId},
            ${intakePageTitle || 'Rental Application'},
            ${intakePageIntro || "Share a few details so I can review your rental fit faster."},
            ${businessName},
            ${null}
          )
        `;

        for (const stage of DEFAULT_STAGES) {
          await sql`
            INSERT INTO "DealStage" ("id", "spaceId", "name", "color", "position")
            VALUES (${crypto.randomUUID()}, ${spaceId}, ${stage.name}, ${stage.color}, ${stage.position})
          `;
        }
      } catch {
        const ownerSpace = await sql`
          SELECT "slug" FROM "Space" WHERE "ownerId" = ${user.id} LIMIT 1
        ` as { slug: string }[];
        if (ownerSpace.length) return NextResponse.json({ success: true, slug: ownerSpace[0].slug });
        return NextResponse.json({ error: 'That slug is already taken' }, { status: 409 });
      }

      await sql`
        UPDATE "User"
        SET "onboardingCurrentStep" = ${4}
        WHERE "id" = ${user.id}
      `;
      return NextResponse.json({ success: true, slug: newSpace.slug });
    }

    if (action === 'save_notifications') {
      const { emailNotifications, defaultSubmissionStatus } = body as {
        emailNotifications: boolean;
        defaultSubmissionStatus: string;
      };

      if (!space) return NextResponse.json({ error: 'No space found' }, { status: 400 });

      await sql`
        INSERT INTO "SpaceSetting" ("id", "spaceId", "notifications")
        VALUES (${crypto.randomUUID()}, ${space.id}, ${emailNotifications})
        ON CONFLICT ("spaceId") DO UPDATE
        SET "notifications" = ${emailNotifications}
      `;

      await sql`
        UPDATE "SpaceSetting"
        SET "myConnections" = ${JSON.stringify({ defaultSubmissionStatus: defaultSubmissionStatus || 'New' })}
        WHERE "spaceId" = ${space.id}
      `;

      return NextResponse.json({ success: true });
    }

    if (action === 'complete') {
      // Idempotent: if already onboarded, return success immediately
      if (user.onboard) {
        return NextResponse.json({
          success: true,
          onboard: true,
          onboardingCompletedAt: user.onboardingCompletedAt?.toISOString() ?? new Date().toISOString()
        });
      }

      if (!space) {
        return NextResponse.json(
          { error: 'Cannot complete onboarding without a workspace. Please create your workspace first.' },
          { status: 409 }
        );
      }

      const completedAt = new Date();
      await sql`
        UPDATE "User"
        SET "onboard" = ${true},
            "onboardingCurrentStep" = ${7},
            "onboardingCompletedAt" = ${completedAt}
        WHERE "id" = ${user.id}
      `;
      return NextResponse.json({ success: true, onboard: true, onboardingCompletedAt: completedAt.toISOString() });
    }

    if (action === 'check_slug') {
      const { slug } = body as { slug: string };
      if (!slug) return NextResponse.json({ available: false });
      const sanitized = normalizeSlug(slug);
      if (!isValidSlug(slug) || sanitized !== slug) {
        return NextResponse.json({ available: false, reason: 'invalid' });
      }
      const existing = await sql`
        SELECT "id" FROM "Space" WHERE "slug" = ${sanitized} LIMIT 1
      ` as { id: string }[];
      return NextResponse.json({ available: !existing.length });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[onboarding POST] action:', action, err);
    return NextResponse.json({ error: 'Server error. Please try again.' }, { status: 500 });
  }
}
