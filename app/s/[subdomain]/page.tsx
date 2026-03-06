import { notFound } from 'next/navigation';
import { getSpaceFromSubdomain } from '@/lib/space';
import { db } from '@/lib/db';
import { Users, Briefcase, DollarSign, TrendingUp } from 'lucide-react';
import type { Metadata } from 'next';
import { rootDomain } from '@/lib/utils';

export async function generateMetadata({
  params
}: {
  params: Promise<{ subdomain: string }>;
}): Promise<Metadata> {
  const { subdomain } = await params;
  return { title: `${subdomain}.${rootDomain} — Dashboard` };
}

export default async function DashboardPage({
  params
}: {
  params: Promise<{ subdomain: string }>;
}) {
  const { subdomain } = await params;
  const space = await getSpaceFromSubdomain(subdomain);
  if (!space) notFound();

  const [contactCount, dealCount, deals, stages] = await Promise.all([
    db.contact.count({ where: { spaceId: space.id } }),
    db.deal.count({ where: { spaceId: space.id } }),
    db.deal.findMany({
      where: { spaceId: space.id },
      select: { value: true, stageId: true }
    }),
    db.dealStage.findMany({
      where: { spaceId: space.id },
      orderBy: { position: 'asc' }
    })
  ]);

  const totalValue = deals.reduce((sum, d) => sum + (d.value ?? 0), 0);

  const dealsByStage = stages.map((stage) => ({
    ...stage,
    count: deals.filter((d) => d.stageId === stage.id).length,
    value: deals
      .filter((d) => d.stageId === stage.id)
      .reduce((s, d) => s + (d.value ?? 0), 0)
  }));

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

  const statCards = [
    { label: 'Clients', value: contactCount, icon: Users },
    { label: 'Deals', value: dealCount, icon: Briefcase },
    { label: 'Pipeline Value', value: formatCurrency(totalValue), icon: DollarSign },
    { label: 'Active Stages', value: stages.length, icon: TrendingUp }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">Overview</h2>
        <p className="text-neutral-500">
          Welcome back to {space.emoji} {space.name}
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-neutral-500">{card.label}</span>
              <card.icon size={16} className="text-neutral-600" />
            </div>
            <div className="text-2xl font-bold text-white">{card.value}</div>
          </div>
        ))}
      </div>

      {/* Deals by stage */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03]">
        <div className="px-6 py-4 border-b border-white/10">
          <h3 className="text-sm font-semibold text-white">Pipeline by Stage</h3>
        </div>
        <div className="p-6">
          {dealsByStage.length === 0 ? (
            <p className="text-neutral-500 text-sm">No stages yet.</p>
          ) : (
            <div className="space-y-3">
              {dealsByStage.map((stage) => (
                <div key={stage.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: stage.color }}
                    />
                    <span className="text-sm font-medium text-neutral-200">{stage.name}</span>
                    <span className="text-xs text-neutral-600">
                      {stage.count} deal{stage.count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-white">
                    {formatCurrency(stage.value)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
