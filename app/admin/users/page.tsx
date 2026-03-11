import { db } from '@/lib/db';
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

  const where: Record<string, unknown> = {};

  // Search filter
  if (query) {
    where.OR = [
      { name: { contains: query, mode: 'insensitive' } },
      { email: { contains: query, mode: 'insensitive' } },
      { space: { slug: { contains: query, mode: 'insensitive' } } },
    ];
  }

  // Status filter
  if (filter === 'onboarded') where.onboard = true;
  if (filter === 'not-onboarded') where.onboard = false;
  if (filter === 'has-space') where.space = { isNot: null };
  if (filter === 'no-space') where.space = { is: null };

  const users = await db.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      name: true,
      email: true,
      onboard: true,
      createdAt: true,
      onboardingCurrentStep: true,
      space: { select: { slug: true, name: true, emoji: true } },
    },
  });

  const totalCount = await db.user.count();

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
