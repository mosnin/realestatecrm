import { db } from '@/lib/db';
import { normalizeSlug } from '@/lib/intake';

export async function getSpaceFromSlug(inputSlug: string) {
  const slug = normalizeSlug(inputSlug);
  return db.space.findUnique({
    where: { slug }
  });
}

export async function getSpaceByOwnerId(ownerId: string) {
  return db.space.findUnique({
    where: { ownerId }
  });
}

export async function getSpaceForUser(clerkUserId: string) {
  const user = await db.user.findUnique({
    where: { clerkId: clerkUserId },
    select: { id: true },
  });
  if (!user) return null;
  return db.space.findUnique({ where: { ownerId: user.id } });
}
