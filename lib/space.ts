import { db } from '@/lib/db';
import { normalizeSlug } from '@/lib/intake';

export async function getSpaceFromSubdomain(subdomain: string) {
  const slug = normalizeSlug(subdomain);
  return db.space.findUnique({
    where: { subdomain: slug }
  });
}

export async function getSpaceByOwnerId(ownerId: string) {
  return db.space.findUnique({
    where: { ownerId }
  });
}
