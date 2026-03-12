import { sql } from '@/lib/db';
import { normalizeSlug } from '@/lib/intake';
import type { Space } from '@/lib/types';

export async function getSpaceFromSlug(inputSlug: string): Promise<Space | null> {
  const slug = normalizeSlug(inputSlug);
  const rows = await sql`SELECT *, "subdomain" AS "slug" FROM "Space" WHERE "subdomain" = ${slug} LIMIT 1`;
  return (rows[0] as Space) ?? null;
}

export async function getSpaceByOwnerId(ownerId: string): Promise<Space | null> {
  const rows = await sql`SELECT *, "subdomain" AS "slug" FROM "Space" WHERE "ownerId" = ${ownerId} LIMIT 1`;
  return (rows[0] as Space) ?? null;
}

export async function getSpaceForUser(clerkUserId: string): Promise<Space | null> {
  const users = await sql`SELECT id FROM "User" WHERE "clerkId" = ${clerkUserId} LIMIT 1`;
  if (!users[0]) return null;
  const rows = await sql`SELECT *, "subdomain" AS "slug" FROM "Space" WHERE "ownerId" = ${users[0].id} LIMIT 1`;
  return (rows[0] as Space) ?? null;
}
