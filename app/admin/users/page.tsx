import { supabase } from '@/lib/supabase';
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

  let users: { id: string; name: string | null; email: string; onboard: boolean; createdAt: Date; onboardingCurrentStep: number; space: { slug: string; name: string; emoji: string } | null }[];
  let totalCount: number;

  let supaQuery = supabase
    .from('User')
    .select('id, name, email, onboard, createdAt, onboardingCurrentStep, Space(slug, name, emoji)');

  if (filter === 'onboarded') supaQuery = supaQuery.eq('onboard', true);
  else if (filter === 'not-onboarded') supaQuery = supaQuery.eq('onboard', false);

  const { data, error } = await supaQuery.order('createdAt', { ascending: false }).limit(200);
  if (error) throw error;

  let results = (data ?? []) as any[];

  // Filter by search across User fields and Space slug
  if (query) {
    const s = query.toLowerCase();
    results = results.filter((r: any) =>
      r.name?.toLowerCase().includes(s) ||
      r.email?.toLowerCase().includes(s) ||
      r.Space?.slug?.toLowerCase().includes(s)
    );
  }

  // Filter has-space / no-space in JS since PostgREST can't reliably do IS NULL on joins
  if (filter === 'has-space') results = results.filter((r: any) => r.Space !== null);
  if (filter === 'no-space') results = results.filter((r: any) => r.Space === null);

  users = results.map((row: any) => ({
    id: row.id as string,
    name: row.name as string | null,
    email: row.email as string,
    onboard: row.onboard as boolean,
    createdAt: row.createdAt as Date,
    onboardingCurrentStep: row.onboardingCurrentStep as number,
    space: row.Space?.slug ? { slug: row.Space.slug as string, name: row.Space.name as string, emoji: row.Space.emoji as string } : null,
  }));

  const { count, error: countError } = await supabase.from('User').select('*', { count: 'exact', head: true });
  if (countError) throw countError;
  totalCount = count ?? 0;

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
