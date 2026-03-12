'use server';

import { auth } from '@clerk/nextjs/server';
import { redis } from '@/lib/redis';
import { db } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { getSpaceForUser } from '@/lib/space';

export async function deleteSlugAction(
  prevState: any,
  formData: FormData
) {
  const { userId } = await auth();
  if (!userId) return { error: 'Unauthorized' };

  const slug = formData.get('slug') as string;

  const space = await db.space.findUnique({ where: { slug } });
  if (!space) return { error: 'Space not found' };

  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || space.id !== userSpace.id) return { error: 'Forbidden' };

  await redis.del(`slug:${slug}`).catch(() => null);
  await db.space.delete({ where: { slug } });
  revalidatePath('/admin');
  return { success: 'Space deleted successfully' };
}
