import { db } from '@/lib/db';

export async function getSpaceFromSlug(slug: string) {
  return db.space.findUnique({
    where: { slug: slug }
  });
}

export async function getSpaceByOwnerId(ownerId: string) {
  return db.space.findUnique({
    where: { ownerId }
  });
}
