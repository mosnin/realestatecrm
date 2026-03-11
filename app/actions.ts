'use server';

import { auth, clerkClient, currentUser } from '@clerk/nextjs/server';
import { redis } from '@/lib/redis';
import { db } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getAdminAuth, isValidAdminRole } from '@/lib/admin-auth';

const DEFAULT_STAGES = [
  { name: 'Lead', color: '#94a3b8', position: 0 },
  { name: 'Qualified', color: '#60a5fa', position: 1 },
  { name: 'Proposal', color: '#a78bfa', position: 2 },
  { name: 'Negotiation', color: '#f59e0b', position: 3 },
  { name: 'Closed Won', color: '#22c55e', position: 4 },
  { name: 'Closed Lost', color: '#ef4444', position: 5 }
];

export async function createSlugAction(
  prevState: any,
  formData: FormData
) {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: 'You must be signed in to create a space' };
  }

  const slug = formData.get('slug') as string;

  if (!slug) {
    return { success: false, error: 'Workspace name is required' };
  }

  const sanitizedSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '');

  if (sanitizedSlug !== slug) {
    return {
      slug,
      success: false,
      error:
        'Workspace name can only have lowercase letters, numbers, and hyphens. Please try again.'
    };
  }

  const slugAlreadyExists = await db.space.findUnique({
    where: { slug: sanitizedSlug },
    select: { id: true }
  });
  if (slugAlreadyExists) {
    return {
      slug,
      success: false,
      error: 'This workspace name is already taken'
    };
  }

  const clerkUser = await currentUser();
  const dbUser = await db.user.upsert({
    where: { clerkId: userId },
    update: {},
    create: {
      clerkId: userId,
      email: clerkUser?.emailAddresses?.[0]?.emailAddress ?? '',
      name: clerkUser?.fullName ?? clerkUser?.firstName ?? null
    }
  });

  const existingSpace = await db.space.findUnique({
    where: { ownerId: dbUser.id }
  });
  if (existingSpace) {
    return {
      slug,
      success: false,
      error: 'You already have a space. Each account is limited to one space.'
    };
  }

  await redis
    .set(`slug:${sanitizedSlug}`, {
      emoji: '🏢',
      createdAt: Date.now()
    })
    .catch(() => null);

  await db.space.create({
    data: {
      slug: sanitizedSlug,
      name: sanitizedSlug,
      emoji: '🏢',
      ownerId: dbUser.id,
      settings: { create: {} },
      stages: { create: DEFAULT_STAGES }
    }
  });

  redirect('/dashboard');
}

export async function deleteSlugAction(
  prevState: any,
  formData: FormData
) {
  const adminAuth = await getAdminAuth();
  if (!adminAuth.isAuthenticated || !adminAuth.isAdmin) {
    return { error: 'Unauthorized' };
  }

  const slug = formData.get('slug') as string;
  await redis.del(`slug:${slug}`).catch(() => null);
  await db.space.delete({ where: { slug: slug } }).catch(() => null);
  revalidatePath('/admin');
  return { success: 'Space deleted successfully' };
}

export async function setUserRoleAction(prevState: any, formData: FormData) {
  const adminAuth = await getAdminAuth();
  if (!adminAuth.isAuthenticated || !adminAuth.isAdmin) {
    return { error: 'Unauthorized' };
  }

  const targetClerkId = String(formData.get('targetClerkId') ?? '');
  const nextRole = String(formData.get('role') ?? '');

  if (!targetClerkId || !isValidAdminRole(nextRole)) {
    return { error: 'Invalid request' };
  }

  if (targetClerkId === adminAuth.userId && nextRole !== 'admin') {
    return { error: 'You cannot remove your own admin access.' };
  }

  const clerk = await clerkClient();
  const targetUser = await clerk.users.getUser(targetClerkId);
  await clerk.users.updateUserMetadata(targetClerkId, {
    publicMetadata: {
      ...targetUser.publicMetadata,
      role: nextRole
    }
  });

  revalidatePath('/admin');
  return { success: `Updated role to ${nextRole}.` };
}

export async function resetUserOnboardingAction(prevState: any, formData: FormData) {
  const adminAuth = await getAdminAuth();
  if (!adminAuth.isAuthenticated || !adminAuth.isAdmin) {
    return { error: 'Unauthorized' };
  }

  const targetClerkId = String(formData.get('targetClerkId') ?? '');
  if (!targetClerkId) {
    return { error: 'Invalid request' };
  }

  await db.user.updateMany({
    where: { clerkId: targetClerkId },
    data: {
      onboardingCurrentStep: 1,
      onboardingStartedAt: null,
      onboardingCompletedAt: null
    }
  });

  const clerk = await clerkClient();
  const targetUser = await clerk.users.getUser(targetClerkId);
  await clerk.users.updateUserMetadata(targetClerkId, {
    publicMetadata: {
      ...targetUser.publicMetadata,
      onboardingCompleted: false,
      onboardingCompletedAt: null,
      spaceSlug: null
    }
  });

  revalidatePath('/admin');
  return { success: 'Onboarding reset for user.' };
}
