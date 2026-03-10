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
