import { sql } from '@/lib/db';
import { UserListClient } from './user-list-client';

export const metadata = { title: 'Users — Admin — Chippi' };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const params = await searchParams;
  const query = params.q?.trim() || '';
  const filter = params.filter || 'all';

  // Build WHERE conditions
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (query) {
    conditions.push(`(u.name ILIKE $1 OR u.email ILIKE $1 OR s."subdomain" ILIKE $1)`);
    values.push(`%${query}%`);
  }

  if (filter === 'onboarded') conditions.push('u.onboard = true');
  if (filter === 'not-onboarded') conditions.push('u.onboard = false');
  if (filter === 'has-space') conditions.push('s.id IS NOT NULL');
  if (filter === 'no-space') conditions.push('s.id IS NULL');

  const whereClause = conditions.length > 0 ? conditions.join(' AND ') : 'true';

  // We need to use tagged template for neon serverless, so we'll handle search differently
  let users: { id: string; name: string | null; email: string; onboard: boolean; createdAt: Date; onboardingCurrentStep: number; space: { slug: string; name: string; emoji: string } | null }[];
  let totalCount: number;

  if (query) {
    const searchPattern = `%${query}%`;

    // Determine base filter for the query with search
    let rows: Record<string, unknown>[];
    if (filter === 'onboarded') {
      rows = await sql`
        SELECT u.id, u.name, u.email, u.onboard, u."createdAt", u."onboardingCurrentStep",
               s."subdomain" AS "spaceSlug", s.name AS "spaceName", s.emoji AS "spaceEmoji"
        FROM "User" u
        LEFT JOIN "Space" s ON s."ownerId" = u.id
        WHERE u.onboard = true AND (u.name ILIKE ${searchPattern} OR u.email ILIKE ${searchPattern} OR s."subdomain" ILIKE ${searchPattern})
        ORDER BY u."createdAt" DESC
        LIMIT 200
      ` as Record<string, unknown>[];
    } else if (filter === 'not-onboarded') {
      rows = await sql`
        SELECT u.id, u.name, u.email, u.onboard, u."createdAt", u."onboardingCurrentStep",
               s."subdomain" AS "spaceSlug", s.name AS "spaceName", s.emoji AS "spaceEmoji"
        FROM "User" u
        LEFT JOIN "Space" s ON s."ownerId" = u.id
        WHERE u.onboard = false AND (u.name ILIKE ${searchPattern} OR u.email ILIKE ${searchPattern} OR s."subdomain" ILIKE ${searchPattern})
        ORDER BY u."createdAt" DESC
        LIMIT 200
      ` as Record<string, unknown>[];
    } else if (filter === 'has-space') {
      rows = await sql`
        SELECT u.id, u.name, u.email, u.onboard, u."createdAt", u."onboardingCurrentStep",
               s."subdomain" AS "spaceSlug", s.name AS "spaceName", s.emoji AS "spaceEmoji"
        FROM "User" u
        LEFT JOIN "Space" s ON s."ownerId" = u.id
        WHERE s.id IS NOT NULL AND (u.name ILIKE ${searchPattern} OR u.email ILIKE ${searchPattern} OR s."subdomain" ILIKE ${searchPattern})
        ORDER BY u."createdAt" DESC
        LIMIT 200
      ` as Record<string, unknown>[];
    } else if (filter === 'no-space') {
      rows = await sql`
        SELECT u.id, u.name, u.email, u.onboard, u."createdAt", u."onboardingCurrentStep",
               s."subdomain" AS "spaceSlug", s.name AS "spaceName", s.emoji AS "spaceEmoji"
        FROM "User" u
        LEFT JOIN "Space" s ON s."ownerId" = u.id
        WHERE s.id IS NULL AND (u.name ILIKE ${searchPattern} OR u.email ILIKE ${searchPattern} OR s."subdomain" ILIKE ${searchPattern})
        ORDER BY u."createdAt" DESC
        LIMIT 200
      ` as Record<string, unknown>[];
    } else {
      rows = await sql`
        SELECT u.id, u.name, u.email, u.onboard, u."createdAt", u."onboardingCurrentStep",
               s."subdomain" AS "spaceSlug", s.name AS "spaceName", s.emoji AS "spaceEmoji"
        FROM "User" u
        LEFT JOIN "Space" s ON s."ownerId" = u.id
        WHERE (u.name ILIKE ${searchPattern} OR u.email ILIKE ${searchPattern} OR s."subdomain" ILIKE ${searchPattern})
        ORDER BY u."createdAt" DESC
        LIMIT 200
      ` as Record<string, unknown>[];
    }

    users = rows.map(row => ({
      id: row.id as string,
      name: row.name as string | null,
      email: row.email as string,
      onboard: row.onboard as boolean,
      createdAt: row.createdAt as Date,
      onboardingCurrentStep: row.onboardingCurrentStep as number,
      space: row.spaceSlug ? { slug: row.spaceSlug as string, name: row.spaceName as string, emoji: row.spaceEmoji as string } : null,
    }));
  } else {
    let rows: Record<string, unknown>[];
    if (filter === 'onboarded') {
      rows = await sql`
        SELECT u.id, u.name, u.email, u.onboard, u."createdAt", u."onboardingCurrentStep",
               s."subdomain" AS "spaceSlug", s.name AS "spaceName", s.emoji AS "spaceEmoji"
        FROM "User" u
        LEFT JOIN "Space" s ON s."ownerId" = u.id
        WHERE u.onboard = true
        ORDER BY u."createdAt" DESC
        LIMIT 200
      ` as Record<string, unknown>[];
    } else if (filter === 'not-onboarded') {
      rows = await sql`
        SELECT u.id, u.name, u.email, u.onboard, u."createdAt", u."onboardingCurrentStep",
               s."subdomain" AS "spaceSlug", s.name AS "spaceName", s.emoji AS "spaceEmoji"
        FROM "User" u
        LEFT JOIN "Space" s ON s."ownerId" = u.id
        WHERE u.onboard = false
        ORDER BY u."createdAt" DESC
        LIMIT 200
      ` as Record<string, unknown>[];
    } else if (filter === 'has-space') {
      rows = await sql`
        SELECT u.id, u.name, u.email, u.onboard, u."createdAt", u."onboardingCurrentStep",
               s."subdomain" AS "spaceSlug", s.name AS "spaceName", s.emoji AS "spaceEmoji"
        FROM "User" u
        LEFT JOIN "Space" s ON s."ownerId" = u.id
        WHERE s.id IS NOT NULL
        ORDER BY u."createdAt" DESC
        LIMIT 200
      ` as Record<string, unknown>[];
    } else if (filter === 'no-space') {
      rows = await sql`
        SELECT u.id, u.name, u.email, u.onboard, u."createdAt", u."onboardingCurrentStep",
               s."subdomain" AS "spaceSlug", s.name AS "spaceName", s.emoji AS "spaceEmoji"
        FROM "User" u
        LEFT JOIN "Space" s ON s."ownerId" = u.id
        WHERE s.id IS NULL
        ORDER BY u."createdAt" DESC
        LIMIT 200
      ` as Record<string, unknown>[];
    } else {
      rows = await sql`
        SELECT u.id, u.name, u.email, u.onboard, u."createdAt", u."onboardingCurrentStep",
               s."subdomain" AS "spaceSlug", s.name AS "spaceName", s.emoji AS "spaceEmoji"
        FROM "User" u
        LEFT JOIN "Space" s ON s."ownerId" = u.id
        ORDER BY u."createdAt" DESC
        LIMIT 200
      ` as Record<string, unknown>[];
    }

    users = rows.map(row => ({
      id: row.id as string,
      name: row.name as string | null,
      email: row.email as string,
      onboard: row.onboard as boolean,
      createdAt: row.createdAt as Date,
      onboardingCurrentStep: row.onboardingCurrentStep as number,
      space: row.spaceSlug ? { slug: row.spaceSlug as string, name: row.spaceName as string, emoji: row.spaceEmoji as string } : null,
    }));
  }

  const countRows = await sql`SELECT COUNT(*)::int AS count FROM "User"`;
  totalCount = (countRows[0] as { count: number }).count;

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {totalCount} total accounts
        </p>
      </div>

      <UserListClient
        users={users.map((u) => ({
          ...u,
          createdAt: u.createdAt.toISOString(),
        }))}
        query={query}
        filter={filter}
        resultCount={users.length}
      />
    </div>
  );
}
