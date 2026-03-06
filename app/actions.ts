'use server';

import { auth, currentUser } from '@clerk/nextjs/server';
import { redis } from '@/lib/redis';
import { db } from '@/lib/db';
import { isValidIcon } from '@/lib/subdomains';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

const DEFAULT_STAGES = [
  { name: 'Lead', color: '#94a3b8', position: 0 },
  { name: 'Qualified', color: '#60a5fa', position: 1 },
  { name: 'Proposal', color: '#a78bfa', position: 2 },
  { name: 'Negotiation', color: '#f59e0b', position: 3 },
  { name: 'Closed Won', color: '#22c55e', position: 4 },
  { name: 'Closed Lost', color: '#ef4444', position: 5 }
];

export async function createSubdomainAction(
  prevState: any,
  formData: FormData
) {
  const { userId } = await auth();
  if (!userId) {
    return { success: false, error: 'You must be signed in to create a space' };
  }

  const subdomain = formData.get('subdomain') as string;
  const icon = formData.get('icon') as string;

  if (!subdomain || !icon) {
    return { success: false, error: 'Workspace name and icon are required' };
  }

  if (!isValidIcon(icon)) {
    return {
      subdomain,
      icon,
      success: false,
      error: 'Please enter a valid emoji (maximum 10 characters)'
    };
  }

  const sanitizedSubdomain = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '');

  if (sanitizedSubdomain !== subdomain) {
    return {
      subdomain,
      icon,
      success: false,
      error:
        'Workspace name can only have lowercase letters, numbers, and hyphens. Please try again.'
    };
  }

  const subdomainAlreadyExists = await redis.get(
    `subdomain:${sanitizedSubdomain}`
  );
  if (subdomainAlreadyExists) {
    return {
      subdomain,
      icon,
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
      subdomain,
      icon,
      success: false,
      error: 'You already have a space. Each account is limited to one space.'
    };
  }

  await redis.set(`subdomain:${sanitizedSubdomain}`, {
    emoji: icon,
    createdAt: Date.now()
  });

  await db.space.create({
    data: {
      subdomain: sanitizedSubdomain,
      name: sanitizedSubdomain,
      emoji: icon,
      ownerId: dbUser.id,
      settings: { create: {} },
      stages: { create: DEFAULT_STAGES }
    }
  });

  redirect('/dashboard');
}

export async function deleteSubdomainAction(
  prevState: any,
  formData: FormData
) {
  const subdomain = formData.get('subdomain') as string;
  await redis.del(`subdomain:${subdomain}`);
  await db.space.delete({ where: { subdomain } }).catch(() => null);
  revalidatePath('/admin');
  return { success: 'Space deleted successfully' };
}
