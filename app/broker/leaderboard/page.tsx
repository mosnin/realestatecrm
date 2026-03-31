import { getBrokerContext } from '@/lib/permissions';
import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getSpaceByOwnerId } from '@/lib/space';
import { LeaderboardClient } from './leaderboard-client';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Leaderboard — Broker Dashboard' };

export type RealtorStats = {
  userId: string;
  name: string;
  email: string;
  avatar: string | null;
  totalLeads: number;
  dealsClosed: number;
  pipelineValue: number;
  toursCompleted: number;
  conversionRate: number;
  badges: string[];
};

export default async function LeaderboardPage() {
  const ctx = await getBrokerContext();
  if (!ctx) redirect('/');

  const { brokerage } = ctx;

  // Get all realtor_members
  const { data: members } = await supabase
    .from('BrokerageMembership')
    .select('userId')
    .eq('brokerageId', brokerage.id)
    .eq('role', 'realtor_member')
    .order('createdAt');

  if (!members?.length) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Leaderboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">No realtors to rank yet.</p>
        </div>
      </div>
    );
  }

  // Fetch stats for each realtor
  const stats: RealtorStats[] = [];

  for (const member of members) {
    // User info
    const { data: user } = await supabase
      .from('User')
      .select('name, email, avatar')
      .eq('id', member.userId)
      .maybeSingle();

    if (!user) continue;

    // Realtor's space
    const space = await getSpaceByOwnerId(member.userId);
    if (!space) {
      stats.push({
        userId: member.userId,
        name: user.name ?? user.email ?? 'Unknown',
        email: user.email ?? '',
        avatar: user.avatar ?? null,
        totalLeads: 0,
        dealsClosed: 0,
        pipelineValue: 0,
        toursCompleted: 0,
        conversionRate: 0,
        badges: [],
      });
      continue;
    }

    // Count total leads
    const { count: totalLeads } = await supabase
      .from('Contact')
      .select('*', { count: 'exact', head: true })
      .eq('spaceId', space.id);

    // Count deals won
    const { count: dealsClosed } = await supabase
      .from('Deal')
      .select('*', { count: 'exact', head: true })
      .eq('spaceId', space.id)
      .eq('status', 'won');

    // Pipeline value (sum of active deal values)
    const { data: activeDeals } = await supabase
      .from('Deal')
      .select('value')
      .eq('spaceId', space.id)
      .eq('status', 'active');

    const pipelineValue = (activeDeals ?? []).reduce(
      (sum, d) => sum + (d.value ?? 0),
      0,
    );

    // Tours completed
    const { count: toursCompleted } = await supabase
      .from('Tour')
      .select('*', { count: 'exact', head: true })
      .eq('spaceId', space.id)
      .eq('status', 'completed');

    const leads = totalLeads ?? 0;
    const closed = dealsClosed ?? 0;
    const conversionRate = leads > 0 ? Math.round((closed / leads) * 100) : 0;

    stats.push({
      userId: member.userId,
      name: user.name ?? user.email ?? 'Unknown',
      email: user.email ?? '',
      avatar: user.avatar ?? null,
      totalLeads: leads,
      dealsClosed: closed,
      pipelineValue,
      toursCompleted: toursCompleted ?? 0,
      conversionRate,
      badges: [],
    });
  }

  // Compute badges
  if (stats.length > 0) {
    // Top Closer — most deals closed
    const maxDeals = Math.max(...stats.map((s) => s.dealsClosed));
    if (maxDeals > 0) {
      stats.filter((s) => s.dealsClosed === maxDeals).forEach((s) => s.badges.push('Top Closer'));
    }

    // Fast Responder — highest conversion rate (proxy for response speed)
    const maxConv = Math.max(...stats.map((s) => s.conversionRate));
    if (maxConv > 0) {
      stats.filter((s) => s.conversionRate === maxConv).forEach((s) => s.badges.push('Fast Responder'));
    }

    // Hot Streak — most tours completed
    const maxTours = Math.max(...stats.map((s) => s.toursCompleted));
    if (maxTours >= 3) {
      stats.filter((s) => s.toursCompleted === maxTours).forEach((s) => s.badges.push('Hot Streak'));
    }
  }

  // Default sort by deals closed
  stats.sort((a, b) => b.dealsClosed - a.dealsClosed);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Leaderboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          See how your team is performing
        </p>
      </div>
      <LeaderboardClient initialStats={stats} />
    </div>
  );
}
