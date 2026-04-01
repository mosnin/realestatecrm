import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { AnalyticsDashboard } from '@/components/analytics/analytics-dashboard';
import type { AnalyticsData } from '@/components/analytics/analytics-dashboard';
import type { ApplicationData, LeadScoreDetails } from '@/lib/types';

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

function daysUntil(dateStr: string): number | null {
  try {
    const target = new Date(dateStr);
    if (isNaN(target.getTime())) return null;
    return Math.ceil((target.getTime() - Date.now()) / 86_400_000);
  } catch {
    return null;
  }
}

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  let data: AnalyticsData;

  try {
  // Fetch raw data — include applicationData & scoreDetails for qualification analytics
  const [contactsRes, dealsRes, stagesRes, toursRes] = await Promise.all([
    supabase
      .from('Contact')
      .select('id, type, tags, leadScore, scoreLabel, scoringStatus, createdAt, applicationData, scoreDetails, leadType')
      .eq('spaceId', space.id),
    supabase
      .from('Deal')
      .select('id, value, stageId, priority, createdAt, status, sourceTourId')
      .eq('spaceId', space.id),
    supabase
      .from('DealStage')
      .select('id, name, color')
      .eq('spaceId', space.id),
    supabase
      .from('Tour')
      .select('id, status')
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
    applicationData: ApplicationData | null;
    scoreDetails: LeadScoreDetails | null;
    leadType: 'rental' | 'buyer';
  }[];

  const deals = (dealsRes.data ?? []) as {
    id: string;
    value: number | null;
    stageId: string;
    priority: string;
    createdAt: string;
    status: string;
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

  // ── Qualification analytics ────────────────────────────────────────────────

  const leadsWithApp = leads.filter((l) => l.applicationData != null);

  // Employment breakdown
  const employmentCounts: Record<string, number> = {};
  for (const l of leadsWithApp) {
    const status = l.applicationData?.employmentStatus ?? '';
    const label =
      status === 'employed' ? 'Employed' :
      status === 'self-employed' ? 'Self-employed' :
      status === 'unemployed' ? 'Unemployed' :
      status === 'retired' ? 'Retired' :
      status === 'student' ? 'Student' :
      'Not provided';
    employmentCounts[label] = (employmentCounts[label] ?? 0) + 1;
  }
  const employmentBreakdown = Object.entries(employmentCounts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  // Affordability: income >= 3× monthly rent
  const affordabilityLeads = leadsWithApp.filter(
    (l) => l.applicationData?.monthlyGrossIncome != null && l.applicationData?.monthlyRent != null,
  );
  const affordabilityPasses = affordabilityLeads.filter(
    (l) => (l.applicationData!.monthlyGrossIncome ?? 0) >= (l.applicationData!.monthlyRent ?? 0) * 3,
  ).length;
  const affordabilityBuckets = affordabilityLeads.length > 0
    ? [
        { label: 'Passes 3× rule', count: affordabilityPasses },
        { label: 'Below 3× rule', count: affordabilityLeads.length - affordabilityPasses },
      ]
    : [];

  // Screening flags
  const screeningFlags = [
    { label: 'Prior evictions', count: leadsWithApp.filter((l) => l.applicationData?.priorEvictions === true).length },
    { label: 'Outstanding balances', count: leadsWithApp.filter((l) => l.applicationData?.outstandingBalances === true).length },
    { label: 'Bankruptcy', count: leadsWithApp.filter((l) => l.applicationData?.bankruptcy === true).length },
    { label: 'Has pets', count: leadsWithApp.filter((l) => l.applicationData?.hasPets === true).length },
    { label: 'Late payments', count: leadsWithApp.filter((l) => l.applicationData?.latePayments === true).length },
    { label: 'Lease violations', count: leadsWithApp.filter((l) => l.applicationData?.leaseViolations === true).length },
  ].filter((f) => f.count > 0);

  // Move-in urgency buckets
  const urgencyBuckets: Record<string, number> = {
    '≤ 30 days': 0,
    '31–60 days': 0,
    '61–90 days': 0,
    '90+ days': 0,
    'Not provided': 0,
  };
  for (const l of leadsWithApp) {
    const date = l.applicationData?.targetMoveInDate;
    if (!date) { urgencyBuckets['Not provided']++; continue; }
    const d = daysUntil(date);
    if (d == null) { urgencyBuckets['Not provided']++; continue; }
    if (d <= 30) urgencyBuckets['≤ 30 days']++;
    else if (d <= 60) urgencyBuckets['31–60 days']++;
    else if (d <= 90) urgencyBuckets['61–90 days']++;
    else urgencyBuckets['90+ days']++;
  }
  const moveInUrgency = Object.entries(urgencyBuckets)
    .filter(([, count]) => count > 0)
    .map(([label, count]) => ({ label, count }));

  // Lead state distribution (from AI scoring)
  const leadStateCounts: Record<string, number> = {};
  for (const l of leads) {
    if (!l.scoreDetails?.leadState) continue;
    const raw = l.scoreDetails.leadState;
    const label =
      raw === 'high_priority_qualified_renter' ? 'High priority' :
      raw === 'qualified_low_urgency' ? 'Qualified, low urgency' :
      raw === 'incomplete_application' ? 'Incomplete application' :
      raw === 'needs_additional_info' ? 'Needs more info' :
      raw === 'likely_unqualified' ? 'Likely unqualified' :
      raw;
    leadStateCounts[label] = (leadStateCounts[label] ?? 0) + 1;
  }
  const leadStateDistribution = Object.entries(leadStateCounts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  // Top risk flags aggregated from AI scoring
  const riskFlagCounts: Record<string, number> = {};
  for (const l of leads) {
    for (const flag of l.scoreDetails?.riskFlags ?? []) {
      if (flag) riskFlagCounts[flag] = (riskFlagCounts[flag] ?? 0) + 1;
    }
  }
  const topRiskFlags = Object.entries(riskFlagCounts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Avg lead score by month
  const scoreByMonth: Record<string, { total: number; count: number }> = {};
  for (const m of months) scoreByMonth[m] = { total: 0, count: 0 };
  for (const l of scoredLeads) {
    const key = monthKey(new Date(l.createdAt));
    if (key in scoreByMonth) {
      scoreByMonth[key].total += l.leadScore ?? 0;
      scoreByMonth[key].count += 1;
    }
  }
  const avgScoreByMonth = months.map((m) => ({
    month: m,
    avg: scoreByMonth[m].count > 0
      ? Math.round(scoreByMonth[m].total / scoreByMonth[m].count)
      : null,
  }));

  // ── Conversion funnel ────────────────────────────────────────────────────

  const qualCount = contacts.filter((c) => c.type === 'QUALIFICATION').length;
  const tourCount = contacts.filter((c) => c.type === 'TOUR').length;
  const appCount  = contacts.filter((c) => c.type === 'APPLICATION').length;

  const contactFunnel = [
    { label: 'Qualifying', count: qualCount, rate: 100 },
    { label: 'Tour', count: tourCount, rate: qualCount > 0 ? Math.round((tourCount / qualCount) * 100) : 0 },
    { label: 'Applied', count: appCount, rate: tourCount > 0 ? Math.round((appCount / tourCount) * 100) : 0 },
  ];

  const wonDeals = deals.filter((d) => d.status === 'won').length;
  const dealWinRate = deals.length > 0 ? Math.round((wonDeals / deals.length) * 100) : 0;

  // Tour analytics
  const allTours = (toursRes.data ?? []) as { id: string; status: string }[];
  const totalTours = allTours.length;
  const completedTours = allTours.filter((t) => t.status === 'completed').length;
  const toursConvertedToDeals = deals.filter((d: any) => d.sourceTourId != null).length;
  const tourConversionRate = completedTours > 0 ? Math.round((toursConvertedToDeals / completedTours) * 100) : 0;

  // Lead type breakdown
  const buyerLeads = leads.filter((l) => l.leadType === 'buyer');
  const rentalLeads = leads.filter((l) => l.leadType === 'rental');

  // Buyer budget distribution
  const buyerBudgetBuckets: Record<string, number> = {
    'Under $200K': 0,
    '$200K–$400K': 0,
    '$400K–$600K': 0,
    '$600K–$800K': 0,
    '$800K–$1M': 0,
    'Over $1M': 0,
  };
  for (const l of buyerLeads) {
    const app = l.applicationData;
    const raw = app?.preApprovalAmount ?? app?.monthlyRent;
    const budget = typeof raw === 'string' ? parseFloat(raw.replace(/[^0-9.]/g, '')) : (typeof raw === 'number' ? raw : null);
    if (budget == null || isNaN(budget)) continue;
    if (budget < 200000) buyerBudgetBuckets['Under $200K']++;
    else if (budget < 400000) buyerBudgetBuckets['$200K–$400K']++;
    else if (budget < 600000) buyerBudgetBuckets['$400K–$600K']++;
    else if (budget < 800000) buyerBudgetBuckets['$600K–$800K']++;
    else if (budget < 1000000) buyerBudgetBuckets['$800K–$1M']++;
    else buyerBudgetBuckets['Over $1M']++;
  }
  const buyerBudgetDistribution = Object.entries(buyerBudgetBuckets)
    .filter(([, count]) => count > 0)
    .map(([label, count]) => ({ label, count }));

  data = {
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
    // qualification analytics
    employmentBreakdown,
    affordabilityBuckets,
    screeningFlags,
    moveInUrgency,
    leadStateDistribution,
    topRiskFlags,
    avgScoreByMonth,
    // conversion funnel
    contactFunnel,
    dealWinRate,

    // tour analytics
    totalTours,
    completedTours,
    toursConvertedToDeals,
    tourConversionRate,

    // lead type breakdown
    buyerLeadCount: buyerLeads.length,
    rentalLeadCount: rentalLeads.length,
    buyerBudgetDistribution,
  };
  } catch (err) {
    console.error('[analytics] DB queries failed', err);
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">We couldn&apos;t load your data. This is usually temporary.</p>
          <a href={`/s/${slug}/analytics`} className="inline-block px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90">Try again</a>
        </div>
      </div>
    );
  }

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
