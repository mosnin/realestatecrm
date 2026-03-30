import { supabase } from '@/lib/supabase';
import { UserListClient } from './user-list-client';
import { isPlatformAdmin } from '@/lib/permissions';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Users — Admin — Chippi' };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const isAdmin = await isPlatformAdmin();
  if (!isAdmin) redirect('/');
  const params = await searchParams;
  const query = params.q?.trim() || '';
  const filter = params.filter || 'all';

  let users: { id: string; name: string | null; email: string; onboard: boolean; createdAt: Date; onboardingCurrentStep: number; space: { slug: string; name: string } | null }[];
  let totalCount: number;

  let supaQuery = supabase
    .from('User')
    .select('id, name, email, onboard, createdAt, onboardingCurrentStep, Space(slug, name)');

  if (filter === 'onboarded') supaQuery = supaQuery.eq('onboard', true);
  else if (filter === 'not-onboarded') supaQuery = supaQuery.eq('onboard', false);

  const { data, error } = await supaQuery.order('createdAt', { ascending: false }).limit(200);
  if (error) throw error;

  let results = (data ?? []) as any[];

  // Filter by search across User fields and Space slug
  if (query) {
    const s = query.toLowerCase();
    results = results.filter((r: any) => {
      const sp = Array.isArray(r.Space) ? r.Space[0] : r.Space;
      return (
        r.name?.toLowerCase().includes(s) ||
        r.email?.toLowerCase().includes(s) ||
        sp?.slug?.toLowerCase().includes(s)
      );
    });
  }

  // Filter has-space / no-space
  if (filter === 'has-space') results = results.filter((r: any) => {
    const sp = Array.isArray(r.Space) ? r.Space[0] : r.Space;
    return sp !== null && sp !== undefined;
  });
  if (filter === 'no-space') results = results.filter((r: any) => {
    const sp = Array.isArray(r.Space) ? r.Space[0] : r.Space;
    return !sp;
  });

  users = results.map((row: any) => {
    const spaceData = Array.isArray(row.Space) ? row.Space[0] : row.Space;
    return {
      id: row.id as string,
      name: row.name as string | null,
      email: row.email as string,
      onboard: row.onboard as boolean,
      createdAt: row.createdAt as Date,
      onboardingCurrentStep: row.onboardingCurrentStep as number,
      space: spaceData?.slug ? { slug: spaceData.slug as string, name: spaceData.name as string } : null,
    };
  });

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
          createdAt: typeof u.createdAt === 'string' ? u.createdAt : String(u.createdAt),
        }))}
        query={query}
        filter={filter}
        resultCount={users.length}
      />
    </div>
  );
}
