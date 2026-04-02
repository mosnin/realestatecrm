import { requireBroker } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { CommissionsClient, type AgentCommissionData } from './commissions-client';

export const metadata: Metadata = { title: 'Commissions — Broker Dashboard' };

export default async function BrokerCommissionsPage() {
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    redirect('/');
  }

  const { brokerage } = ctx;

  // Fetch all members with their spaces
  const { data: memberships } = await supabase
    .from('BrokerageMembership')
    .select('userId, role, User!userId(id, name, email), Space!Space_ownerId_fkey(id, slug, name)')
    .eq('brokerageId', brokerage.id)
    .order('createdAt', { ascending: true });

  const members = ((memberships ?? []) as unknown as Array<{
    userId: string;
    role: string;
    User: { id: string; name: string | null; email: string } | null;
    Space: { id: string; slug: string; name: string } | null;
  }>);

  const spaceIds = members.map((m) => m.Space?.id).filter(Boolean) as string[];

  // Fetch all won deals across member spaces
  const { data: wonDeals } = spaceIds.length > 0
    ? await supabase
        .from('Deal')
        .select('id, spaceId, title, value, status, createdAt, updatedAt')
        .in('spaceId', spaceIds)
        .eq('status', 'won')
        .order('updatedAt', { ascending: false })
        .limit(10000)
    : { data: [] };

  const deals = (wonDeals ?? []) as Array<{
    id: string;
    spaceId: string;
    title: string;
    value: number | null;
    status: string;
    createdAt: string;
    updatedAt: string;
  }>;

  // Build per-agent data
  const agentData: AgentCommissionData[] = members
    .filter((m) => m.Space?.id)
    .map((m) => {
      const sid = m.Space!.id;
      const agentDeals = deals.filter((d) => d.spaceId === sid);
      const totalValue = agentDeals.reduce((sum, d) => sum + (d.value ?? 0), 0);

      return {
        userId: m.userId,
        name: m.User?.name ?? m.User?.email ?? 'Unknown',
        email: m.User?.email ?? '',
        role: m.role === 'broker_owner' ? 'Owner' : m.role === 'broker_admin' ? 'Admin' : 'Realtor',
        dealsClosed: agentDeals.length,
        totalValue,
        deals: agentDeals.map((d) => ({
          id: d.id,
          title: d.title,
          value: d.value ?? 0,
          closedAt: d.updatedAt,
        })),
      };
    });

  return (
    <div className="space-y-6 w-full">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Commissions</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Commission tracking for won deals &middot; {brokerage.name}
        </p>
      </div>

      <CommissionsClient agents={agentData} />
    </div>
  );
}
