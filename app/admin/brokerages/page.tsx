import { redirect } from 'next/navigation';
import { isPlatformAdmin } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Building2, Users, CheckCircle2, XCircle, ChevronRight } from 'lucide-react';
import Link from 'next/link';

export default async function AdminBrokeragesPage() {
  const isAdmin = await isPlatformAdmin();
  if (!isAdmin) redirect('/');

  const { data: brokerages, error } = await supabase
    .from('Brokerage')
    .select('*, User!Brokerage_ownerId_fkey(id, name, email)')
    .order('createdAt', { ascending: false });

  if (error) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-2 p-8">
          <p className="text-sm text-muted-foreground">Couldn't load brokerages.</p>
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

  const active    = (brokerages ?? []).filter((b) => b.status === 'active').length;
  const suspended = (brokerages ?? []).filter((b) => b.status === 'suspended').length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Brokerages</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {brokerages?.length ?? 0} total · {active} active · {suspended} suspended
          </p>
        </div>
      </div>

      {!brokerages || brokerages.length === 0 ? (
        <Card>
          <CardContent className="px-5 py-10 text-center">
            <p className="text-sm text-muted-foreground">No brokerages yet.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-border">
            {brokerages.map((b) => {
              const owner = b.User as { id: string; name: string | null; email: string } | null;
              const memberCount = countMap[b.id] ?? 0;
              const createdAt = new Date(b.createdAt).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              });
              return (
                <Link
                  key={b.id}
                  href={`/admin/brokerages/${b.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Building2 size={16} className="text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold truncate">{b.name}</p>
                        {b.status === 'active' ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15">
                            <CheckCircle2 size={9} /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/15">
                            <XCircle size={9} /> Suspended
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {owner?.name ?? owner?.email ?? 'Unknown owner'} ·{' '}
                        <Users size={10} className="inline" /> {memberCount} members · Created {createdAt}
                      </p>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
                </Link>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
