import { redirect } from 'next/navigation';
import { isPlatformAdmin } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { BrokerageListClient } from './brokerage-list-client';

export const metadata = { title: 'Brokerages — Admin — Chippi' };

export default async function AdminBrokeragesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const isAdmin = await isPlatformAdmin();
  if (!isAdmin) redirect('/');

  const params = await searchParams;
  const query = params.q?.trim() || '';
  const filter = params.filter || 'all';

  const { data: brokerages, error } = await supabase
    .from('Brokerage')
    .select('*, User!Brokerage_ownerId_fkey(id, name, email)')
    .order('createdAt', { ascending: false });

  if (error) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-2 p-8">
          <p className="text-sm text-muted-foreground">Couldn&apos;t load brokerages.</p>
          <a href="/admin/brokerages" className="text-xs text-primary hover:underline">Retry</a>
        </div>
      </div>
    );
  }

  const allIds = (brokerages ?? []).map((b) => b.id);
  const { data: memberships } = allIds.length > 0
    ? await supabase.from('BrokerageMembership').select('brokerageId').in('brokerageId', allIds)
    : { data: [] };

  const countMap: Record<string, number> = {};
  for (const m of memberships ?? []) {
    countMap[m.brokerageId] = (countMap[m.brokerageId] ?? 0) + 1;
  }

  const totalCount = brokerages?.length ?? 0;
  const active = (brokerages ?? []).filter((b) => b.status === 'active').length;
  const suspended = (brokerages ?? []).filter((b) => b.status === 'suspended').length;

  // Shape rows, then apply status filter + free-text search (mirrors the users page:
  // server fetches the set, search/filter is applied here over the in-memory rows).
  let rows = (brokerages ?? []).map((b) => {
    const owner = b.User as { id: string; name: string | null; email: string } | null;
    return {
      id: b.id as string,
      name: b.name as string,
      status: b.status as string,
      createdAt: typeof b.createdAt === 'string' ? b.createdAt : String(b.createdAt),
      owner: owner ? { id: owner.id, name: owner.name, email: owner.email } : null,
      memberCount: countMap[b.id] ?? 0,
    };
  });

  if (filter === 'active') rows = rows.filter((r) => r.status === 'active');
  else if (filter === 'suspended') rows = rows.filter((r) => r.status === 'suspended');

  if (query) {
    const s = query.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(s) ||
        r.owner?.name?.toLowerCase().includes(s) ||
        r.owner?.email?.toLowerCase().includes(s),
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <header className="space-y-1.5">
        <p className="text-sm text-muted-foreground">Management.</p>
        <h1
          className="text-3xl tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          Brokerages
        </h1>
        <p className="text-sm text-muted-foreground">
          {totalCount} total · {active} active · {suspended} suspended.
        </p>
      </header>

      <BrokerageListClient
        brokerages={rows}
        query={query}
        filter={filter}
        resultCount={rows.length}
      />
    </div>
  );
}
