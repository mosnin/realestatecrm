import { getBrokerContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { getBrokerageMembers } from '@/lib/brokerage-members';
import { Card, CardContent } from '@/components/ui/card';
import { PhoneIncoming, Users, Briefcase, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { formatCompact } from '@/lib/formatting';
import { RealtorsClient, type RealtorRow } from './realtors-client';

export const metadata: Metadata = { title: 'Realtors — Broker Dashboard' };

export default async function BrokerRealtorsPage() {
  const ctx = await getBrokerContext();
  if (!ctx) redirect('/');

  const { brokerage } = ctx;

  const members = await getBrokerageMembers(brokerage.id, { includeOnboard: true, includeSpaceName: true });

  const spaceIds = members.map((m) => m.Space?.id).filter(Boolean) as string[];

  const [leadRows, contactRows, dealRows, hotLeadRows] = await Promise.all([
    spaceIds.length > 0
      ? supabase
          .from('Contact')
          .select('spaceId')
          .in('spaceId', spaceIds)
          .contains('tags', ['application-link'])
          .limit(10000)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
    spaceIds.length > 0
      ? supabase
          .from('Contact')
          .select('spaceId')
          .in('spaceId', spaceIds)
          .not('tags', 'cs', '["application-link"]')
          .limit(10000)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
    spaceIds.length > 0
      ? supabase
          .from('Deal')
          .select('spaceId, value')
          .in('spaceId', spaceIds)
          .limit(10000)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
    // Hot leads: scoreLabel = 'hot'
    spaceIds.length > 0
      ? supabase
          .from('Contact')
          .select('spaceId')
          .in('spaceId', spaceIds)
          .eq('scoreLabel', 'hot')
          .limit(10000)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
  ]);

  const leadsBySpace = (leadRows as { spaceId: string }[]).reduce<Record<string, number>>(
    (acc, r) => { acc[r.spaceId] = (acc[r.spaceId] ?? 0) + 1; return acc; },
    {}
  );
  const contactsBySpace = (contactRows as { spaceId: string }[]).reduce<Record<string, number>>(
    (acc, r) => { acc[r.spaceId] = (acc[r.spaceId] ?? 0) + 1; return acc; },
    {}
  );
  const dealsBySpace = (dealRows as { spaceId: string; value: number | null }[]).reduce<
    Record<string, { count: number; value: number }>
  >(
    (acc, r) => {
      if (!acc[r.spaceId]) acc[r.spaceId] = { count: 0, value: 0 };
      acc[r.spaceId].count += 1;
      acc[r.spaceId].value += r.value ?? 0;
      return acc;
    },
    {}
  );
  const hotLeadsBySpace = (hotLeadRows as { spaceId: string }[]).reduce<Record<string, number>>(
    (acc, r) => { acc[r.spaceId] = (acc[r.spaceId] ?? 0) + 1; return acc; },
    {}
  );

  // Brokerage-wide totals for summary bar
  const totalLeads = Object.values(leadsBySpace).reduce((a, b) => a + b, 0);
  const totalContacts = Object.values(contactsBySpace).reduce((a, b) => a + b, 0);
  const totalDeals = Object.values(dealsBySpace).reduce((a, b) => a + b.count, 0);
  const totalPipeline = Object.values(dealsBySpace).reduce((a, b) => a + b.value, 0);

  // Shape data for client component
  const realtors: RealtorRow[] = members.map((m) => {
    const sid = m.Space?.id ?? null;
    return {
      membershipId: m.id,
      userId: m.userId,
      name: m.User?.name ?? null,
      email: m.User?.email ?? '',
      onboard: m.User?.onboard ?? false,
      role: m.role,
      joinedAt: m.createdAt,
      spaceId: sid,
      spaceSlug: m.Space?.slug ?? null,
      leads:    sid ? (leadsBySpace[sid]     ?? 0) : 0,
      contacts: sid ? (contactsBySpace[sid]  ?? 0) : 0,
      deals:    sid ? (dealsBySpace[sid]?.count ?? 0) : 0,
      pipeline: sid ? (dealsBySpace[sid]?.value ?? 0) : 0,
      hotLeads: sid ? (hotLeadsBySpace[sid]  ?? 0) : 0,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Realtors</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {members.length} {members.length === 1 ? 'member' : 'members'} · {brokerage.name}
        </p>
      </div>

      {/* Brokerage-wide summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total leads',    value: totalLeads,                  icon: PhoneIncoming },
          { label: 'Total contacts', value: totalContacts,               icon: Users },
          { label: 'Active deals',   value: totalDeals,                  icon: Briefcase },
          { label: 'Pipeline value', value: formatCompact(totalPipeline), icon: TrendingUp },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="px-4 py-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{label}</p>
                  <p className="text-2xl font-bold mt-0.5 tabular-nums">{value}</p>
                </div>
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  <Icon size={15} className="text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {members.length === 0 ? (
        <Card>
          <CardContent className="px-5 py-10 text-center space-y-2">
            <p className="text-sm text-muted-foreground">No realtors yet.</p>
            <Link
              href="/broker/invitations"
              className="text-xs text-primary font-medium hover:underline underline-offset-2 inline-block"
            >
              Invite realtors →
            </Link>
          </CardContent>
        </Card>
      ) : (
        <RealtorsClient realtors={realtors} />
      )}
    </div>
  );
}
