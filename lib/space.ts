import { db } from '@/lib/db';

export async function getSpaceFromSubdomain(subdomain: string) {
  return db.space.findUnique({
    where: { subdomain }
  });
}

export async function getSpaceByOwnerId(ownerId: string) {
  return db.space.findUnique({
    where: { ownerId }
  });
}
