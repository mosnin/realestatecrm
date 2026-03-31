import { requireBroker } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import {
  PipelineClient,
  type PipelineDeal,
  type StageInfo,
  type RealtorInfo,
  type PipelineSummary,
} from './pipeline-client';

export const metadata: Metadata = { title: 'Pipeline — Broker Dashboard' };

export default async function BrokerPipelinePage() {
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    redirect('/');
  }

  const { brokerage } = ctx;

  // Get all realtor members with their spaces
  const { data: memberships } = await supabase
    .from('BrokerageMembership')
    .select(
      'id, role, userId, User(id, name, email), Space!Space_ownerId_fkey(id, slug, name)'
    )
    .eq('brokerageId', brokerage.id)
    .eq('role', 'realtor_member')
    .order('createdAt', { ascending: true });

  const members = (memberships ?? []) as unknown as Array<{
    id: string;
    role: string;
    userId: string;
    User: { id: string; name: string | null; email: string } | null;
    Space: { id: string; slug: string; name: string } | null;
  }>;

  const spaceIds = members.map((m) => m.Space?.id).filter(Boolean) as string[];

  // Build space -> realtor lookup
  const spaceToRealtor = new Map<string, { userId: string; name: string }>();
  const realtors: RealtorInfo[] = [];
  for (const m of members) {
    const name = m.User?.name ?? m.User?.email ?? 'Unknown';
    if (m.Space?.id) {
      spaceToRealtor.set(m.Space.id, { userId: m.userId, name });
    }
    realtors.push({ userId: m.userId, name });
  }

  // Fetch all deals across realtor spaces
  const { data: dealsRaw } = spaceIds.length > 0
    ? await supabase
        .from('Deal')
        .select('id, spaceId, title, description, value, address, priority, closeDate, stageId, status, createdAt, updatedAt')
        .in('spaceId', spaceIds)
        .limit(5000)
    : { data: [] };

  // Fetch all deal stages across realtor spaces
  const { data: stagesRaw } = spaceIds.length > 0
    ? await supabase
        .from('DealStage')
        .select('id, spaceId, name, color, position')
        .in('spaceId', spaceIds)
        .order('position', { ascending: true })
        .limit(1000)
    : { data: [] };

  // Build stage lookup
  const stageMap = new Map<string, { name: string; color: string; position: number }>();
  for (const s of (stagesRaw ?? []) as { id: string; spaceId: string; name: string; color: string; position: number }[]) {
    stageMap.set(s.id, { name: s.name, color: s.color, position: s.position });
  }

  // Deduplicate stage names across spaces for the pipeline chart
  const stageNames = new Map<string, StageInfo>();
  for (const s of (stagesRaw ?? []) as { id: string; name: string; color: string; position: number }[]) {
    if (!stageNames.has(s.name)) {
      stageNames.set(s.name, { name: s.name, color: s.color, position: s.position });
    }
  }
  const stages: StageInfo[] = Array.from(stageNames.values()).sort((a, b) => a.position - b.position);

  // Build deals list
  type DealRow = {
    id: string;
    spaceId: string;
    title: string;
    description: string | null;
    value: number | null;
    address: string | null;
    priority: string;
    closeDate: string | null;
    stageId: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  };

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  let totalPipelineValue = 0;
  let activeDeals = 0;
  let dealsWonThisMonth = 0;
  let dealsLostThisMonth = 0;

  const deals: PipelineDeal[] = [];

  for (const d of (dealsRaw ?? []) as DealRow[]) {
    const realtor = spaceToRealtor.get(d.spaceId);
    const stage = stageMap.get(d.stageId);

    const deal: PipelineDeal = {
      id: d.id,
      title: d.title,
      value: d.value,
      priority: d.priority as 'LOW' | 'MEDIUM' | 'HIGH',
      closeDate: d.closeDate,
      status: d.status as 'active' | 'won' | 'lost' | 'on_hold',
      stageName: stage?.name ?? 'Unknown',
      stageColor: stage?.color ?? '#888',
      agentName: realtor?.name ?? 'Unknown',
      agentUserId: realtor?.userId ?? '',
      createdAt: d.createdAt,
    };

    deals.push(deal);

    // Aggregate summaries
    if (d.status === 'active' || d.status === 'on_hold') {
      totalPipelineValue += d.value ?? 0;
      activeDeals += 1;
    }

    const updatedAt = new Date(d.updatedAt);
    if (d.status === 'won' && updatedAt >= startOfMonth) {
      dealsWonThisMonth += 1;
    }
    if (d.status === 'lost' && updatedAt >= startOfMonth) {
      dealsLostThisMonth += 1;
    }
  }

  const summary: PipelineSummary = {
    totalPipelineValue,
    activeDeals,
    dealsWonThisMonth,
    dealsLostThisMonth,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Pipeline</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Team deal pipeline across all realtors &middot; {brokerage.name}
        </p>
      </div>

      <PipelineClient
        deals={deals}
        stages={stages}
        realtors={realtors}
        summary={summary}
      />
    </div>
  );
}
