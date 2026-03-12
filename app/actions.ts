'use server';

import { auth } from '@clerk/nextjs/server';
import { redis } from '@/lib/redis';
import { sql } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { getSpaceForUser } from '@/lib/space';

export async function deleteSlugAction(
  prevState: any,
  formData: FormData
) {
  const { userId } = await auth();
  if (!userId) return { error: 'Unauthorized' };

  const slug = formData.get('slug') as string;

  const [space] = await sql`SELECT * FROM "Space" WHERE "slug" = ${slug} LIMIT 1`;
  if (!space) return { error: 'Space not found' };

  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || space.id !== userSpace.id) return { error: 'Forbidden' };

  await redis.del(`slug:${slug}`).catch(() => null);
  await sql`DELETE FROM "Space" WHERE "slug" = ${slug}`;
  revalidatePath('/admin');
  return { success: 'Space deleted successfully' };
}
