import { notFound } from 'next/navigation';
import { getSpaceFromSubdomain } from '@/lib/space';
import { db } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Overview</h2>
        <p className="text-muted-foreground">
          Welcome back to {space.emoji} {space.name}
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Contacts</CardTitle>
            <Users size={16} className="text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{contactCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Deals</CardTitle>
            <Briefcase size={16} className="text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dealCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
            <DollarSign size={16} className="text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalValue)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Stages</CardTitle>
            <TrendingUp size={16} className="text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stages.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Deals by stage */}
      <Card>
        <CardHeader>
          <CardTitle>Pipeline by Stage</CardTitle>
        </CardHeader>
        <CardContent>
          {dealsByStage.length === 0 ? (
            <p className="text-muted-foreground text-sm">No stages yet.</p>
          ) : (
            <div className="space-y-3">
              {dealsByStage.map((stage) => (
                <div key={stage.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: stage.color }}
                    />
                    <span className="text-sm font-medium">{stage.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {stage.count} deal{stage.count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <span className="text-sm font-semibold">
                    {formatCurrency(stage.value)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
