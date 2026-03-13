import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { AnalyticsDashboard } from '@/components/analytics/analytics-dashboard';
import type { AnalyticsData } from '@/components/analytics/analytics-dashboard';

function monthKey(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function buildMonthBuckets(dates: Date[], months: string[]): { month: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const m of months) counts[m] = 0;
  for (const d of dates) {
    const key = monthKey(d);
    if (key in counts) counts[key] = (counts[key] ?? 0) + 1;
  }
  return months.map((m) => ({ month: m, count: counts[m] ?? 0 }));
}

function last6Months(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(monthKey(d));
  }
  return months;
}

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  // Fetch raw data
  const [contactsRes, dealsRes, stagesRes] = await Promise.all([
    supabase
      .from('Contact')
      .select('id, type, tags, leadScore, scoreLabel, scoringStatus, createdAt')
      .eq('spaceId', space.id),
    supabase
      .from('Deal')
      .select('id, value, stageId, priority, createdAt')
      .eq('spaceId', space.id),
    supabase
      .from('DealStage')
      .select('id, name, color')
      .eq('spaceId', space.id),
  ]);

  const contacts = (contactsRes.data ?? []) as {
    id: string;
    type: string;
    tags: string[];
    leadScore: number | null;
    scoreLabel: string | null;
    scoringStatus: string | null;
    createdAt: string;
  }[];

  const deals = (dealsRes.data ?? []) as {
    id: string;
    value: number | null;
    stageId: string;
    priority: string;
    createdAt: string;
  }[];

  const stages = (stagesRes.data ?? []) as {
    id: string;
    name: string;
    color: string;
  }[];

  const months = last6Months();

  // Leads = contacts with application-link tag
  const leads = contacts.filter((c) => c.tags?.includes('application-link'));
  const nonLeadContacts = contacts.filter((c) => !c.tags?.includes('application-link'));

  // Time-series
  const leadsOverTime = buildMonthBuckets(
    leads.map((l) => new Date(l.createdAt)),
    months,
  );
  const contactsOverTime = buildMonthBuckets(
    nonLeadContacts.map((c) => new Date(c.createdAt)),
    months,
  );

  // Deals by stage
  const dealsByStage = stages.map((stage) => {
    const stageDeals = deals.filter((d) => d.stageId === stage.id);
    return {
      name: stage.name,
      count: stageDeals.length,
      value: stageDeals.reduce((s, d) => s + (d.value ?? 0), 0),
      color: stage.color,
    };
  });

  // Lead score buckets
  const scoredLeads = leads.filter((l) => l.scoringStatus === 'scored' && l.leadScore != null);
  const avgLeadScore =
    scoredLeads.length > 0
      ? scoredLeads.reduce((s, l) => s + (l.leadScore ?? 0), 0) / scoredLeads.length
      : null;

  const leadScoreBuckets = [
    { label: 'Hot', count: leads.filter((l) => l.scoreLabel === 'hot').length },
    { label: 'Warm', count: leads.filter((l) => l.scoreLabel === 'warm').length },
    { label: 'Cold', count: leads.filter((l) => l.scoreLabel === 'cold').length },
    {
      label: 'Unscored',
      count: leads.filter((l) => !l.scoreLabel || l.scoringStatus !== 'scored').length,
    },
  ];

  // Contacts by stage
  const contactsByStage = [
    { label: 'Qualifying', count: contacts.filter((c) => c.type === 'QUALIFICATION').length },
    { label: 'Tour', count: contacts.filter((c) => c.type === 'TOUR').length },
    { label: 'Applied', count: contacts.filter((c) => c.type === 'APPLICATION').length },
  ];

  const data: AnalyticsData = {
    totalLeads: leads.length,
    totalContacts: contacts.length,
    totalDeals: deals.length,
    totalPipelineValue: deals.reduce((s, d) => s + (d.value ?? 0), 0),
    avgLeadScore,
    leadsOverTime,
    contactsOverTime,
    dealsByStage,
    leadScoreBuckets,
    contactsByStage,
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Insights across your leads, contacts, and deals
        </p>
      </div>
      <AnalyticsDashboard data={data} />
    </div>
  );
}
