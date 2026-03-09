'use server';

import { auth, currentUser } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { redis } from '@/lib/redis';

const DEFAULT_STAGES = [
  { name: 'Lead', color: '#94a3b8', position: 0 },
  { name: 'Qualified', color: '#60a5fa', position: 1 },
  { name: 'Proposal', color: '#a78bfa', position: 2 },
  { name: 'Negotiation', color: '#f59e0b', position: 3 },
  { name: 'Closed Won', color: '#22c55e', position: 4 },
  { name: 'Closed Lost', color: '#ef4444', position: 5 }
];

async function getOrCreateDbUser() {
  const { userId } = await auth();
  if (!userId) throw new Error('Unauthorized');

  const clerk = await currentUser();
  const email = clerk?.emailAddresses?.[0]?.emailAddress;
  if (!email) throw new Error('No email available for this account');

  return db.user.upsert({
    where: { clerkId: userId },
    update: {
      email,
      name: clerk?.fullName ?? clerk?.firstName ?? undefined
    },
    create: {
      clerkId: userId,
      email,
      name: clerk?.fullName ?? clerk?.firstName ?? null,
      onboardingStartedAt: new Date(),
      onboardingCurrentStep: 1
    }
  });
}

async function markStepCompleted(userId: string, step: number) {
  await db.user.update({
    where: { id: userId },
    data: {
      onboardingStartedAt: new Date(),
      onboardingCurrentStep: step
    }
  });

  console.log('[analytics]', 'onboarding_step_completed', { step, userId });
}

export async function startOnboardingAction() {
  const user = await getOrCreateDbUser();
  await db.user.update({
    where: { id: user.id },
    data: {
      onboardingStartedAt: user.onboardingStartedAt ?? new Date(),
      onboardingCurrentStep: Math.max(user.onboardingCurrentStep ?? 1, 1)
    }
  });
  console.log('[analytics]', 'onboarding_started', { userId: user.id });
  return { success: true };
}

export async function saveProfileBasicsAction(input: {
  fullName: string;
  businessName?: string;
  email: string;
  phone?: string;
}) {
  const user = await getOrCreateDbUser();

  await db.user.update({
    where: { id: user.id },
    data: {
      name: input.fullName.trim() || null,
      businessName: input.businessName?.trim() || null,
      email: input.email.trim(),
      phone: input.phone?.trim() || null
    }
  });

  await markStepCompleted(user.id, 3);
  return { success: true };
}

function sanitizeSlug(slug: string) {
  return slug.toLowerCase().replace(/[^a-z0-9-]/g, '');
}

export async function setupIntakeLinkAction(input: {
  slug: string;
  displayTitle?: string;
  introLine?: string;
}) {
  const user = await getOrCreateDbUser();
  const slug = sanitizeSlug(input.slug);

  if (!slug) {
    return { success: false, error: 'Public slug is required' } as const;
  }

  const existingSlug = await db.space.findUnique({ where: { subdomain: slug } });
  const existingSpace = await db.space.findUnique({ where: { ownerId: user.id } });

  if (existingSlug && existingSlug.ownerId !== user.id) {
    return { success: false, error: 'That slug is already taken' } as const;
  }

  const name = input.displayTitle?.trim() || user.businessName || user.name || slug;
  const intro = input.introLine?.trim() || 'Complete this quick application so we can review your fit and follow up fast.';

  const space = existingSpace
    ? await db.space.update({
        where: { id: existingSpace.id },
        data: {
          subdomain: slug,
          name,
          intakeDisplayTitle: name,
          intakeIntroLine: intro
        }
      })
    : await db.space.create({
        data: {
          subdomain: slug,
          name,
          emoji: '🏢',
          ownerId: user.id,
          intakeDisplayTitle: name,
          intakeIntroLine: intro,
          settings: { create: { notifications: true } },
          stages: { create: DEFAULT_STAGES }
        }
      });

  await redis
    .set(`subdomain:${slug}`, {
      emoji: space.emoji,
      createdAt: Date.now()
    })
    .catch(() => null);

  await markStepCompleted(user.id, 4);
  console.log('[analytics]', 'intake_link_generated', { subdomain: slug, userId: user.id });

  return {
    success: true,
    subdomain: space.subdomain,
    intakeUrl: `/apply/${space.subdomain}`
  } as const;
}

export async function completeTemplateStepAction() {
  const user = await getOrCreateDbUser();
  await markStepCompleted(user.id, 5);
  return { success: true };
}

export async function saveRoutingStepAction(input: { notifications: boolean }) {
  const user = await getOrCreateDbUser();
  const space = await db.space.findUnique({ where: { ownerId: user.id } });
  if (!space) throw new Error('Space not found');

  await db.spaceSetting.upsert({
    where: { spaceId: space.id },
    update: { notifications: input.notifications },
    create: { spaceId: space.id, notifications: input.notifications }
  });

  await markStepCompleted(user.id, 6);
  return { success: true };
}

export async function completePreviewStepAction() {
  const user = await getOrCreateDbUser();
  await markStepCompleted(user.id, 7);
  return { success: true };
}

export async function completeOnboardingAction() {
  const user = await getOrCreateDbUser();
  const space = await db.space.findUnique({ where: { ownerId: user.id } });
  if (!space) throw new Error('Space not found');

  await db.user.update({
    where: { id: user.id },
    data: {
      onboardingCompletedAt: new Date(),
      onboardingCurrentStep: 7,
      onboardingStartedAt: user.onboardingStartedAt ?? new Date()
    }
  });

  console.log('[analytics]', 'onboarding_completed', {
    userId: user.id,
    subdomain: space.subdomain
  });

  return { success: true, subdomain: space.subdomain };
}

export async function checkSlugAvailabilityAction(slugInput: string) {
  const user = await getOrCreateDbUser();
  const slug = sanitizeSlug(slugInput);
  if (!slug) return { available: false, normalized: slug };

  const existing = await db.space.findUnique({ where: { subdomain: slug } });
  return { available: !existing || existing.ownerId === user.id, normalized: slug };
}
