import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Building2, Users, CheckCircle2, XCircle } from 'lucide-react';
import { BrokerageStatusToggle } from './brokerage-status-toggle';

export default async function AdminBrokeragesPage() {
  // Fetch all brokerages with owner info
  const { data: brokerages, error } = await supabase
    .from('Brokerage')
    .select('*, User!Brokerage_ownerId_fkey(id, name, email)')
    .order('createdAt', { ascending: false });

  if (error) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-4 p-8">
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

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Brokerages</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {brokerages?.length ?? 0} brokerage{(brokerages?.length ?? 0) !== 1 ? 's' : ''} on the platform
        </p>
      </div>

      {!brokerages || brokerages.length === 0 ? (
        <Card>
          <CardContent className="px-5 py-8 text-center">
            <p className="text-sm text-muted-foreground">No brokerages yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {brokerages.map((b) => {
            const owner = b.User as { id: string; name: string | null; email: string } | null;
            const memberCount = countMap[b.id] ?? 0;
            const createdAt = new Date(b.createdAt).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
            });
            return (
              <div key={b.id} className="rounded-xl border border-border bg-card px-4 py-3">
                <div className="flex items-center justify-between gap-3">
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
                      <p className="text-xs text-muted-foreground">
                        Owner: {owner?.name ?? owner?.email ?? 'Unknown'} · {memberCount}{' '}
                        <Users size={10} className="inline" /> · Created {createdAt}
                      </p>
                    </div>
                  </div>
                  <BrokerageStatusToggle brokerageId={b.id} currentStatus={b.status} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
