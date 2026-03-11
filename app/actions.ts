'use server';

import { redis } from '@/lib/redis';
import { db } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export async function deleteSlugAction(
  prevState: any,
  formData: FormData
) {
  const slug = formData.get('slug') as string;
  await redis.del(`slug:${slug}`).catch(() => null);
  await db.space.delete({ where: { slug } }).catch(() => null);
  revalidatePath('/admin');
  return { success: 'Space deleted successfully' };
}
