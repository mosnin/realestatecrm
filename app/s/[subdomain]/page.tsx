import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSpaceFromSubdomain } from '@/lib/space';
import { db } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Briefcase, DollarSign, TrendingUp, Link2, ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import { protocol, rootDomain } from '@/lib/utils';
import { CopyLinkButton } from './copy-link-button';

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

  const [contactCount, dealCount, deals, stages, inboundLeads] = await Promise.all([
    db.contact.count({ where: { spaceId: space.id } }),
    db.deal.count({ where: { spaceId: space.id } }),
    db.deal.findMany({
      where: { spaceId: space.id },
      select: { value: true, stageId: true }
    }),
    db.dealStage.findMany({
      where: { spaceId: space.id },
      orderBy: { position: 'asc' }
    }),
    db.contact.findMany({
      where: { spaceId: space.id, tags: { has: 'application-link' } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, name: true, phone: true, createdAt: true }
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

  const applicationUrl = `${protocol}://${space.subdomain}.${rootDomain}/apply/${space.subdomain}`;

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
            <CardTitle className="text-sm font-medium">Clients</CardTitle>
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 size={16} className="text-primary" />
            Application Link
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <code className="text-xs md:text-sm bg-surface border border-border rounded-md px-3 py-2 break-all">{applicationUrl}</code>
            <CopyLinkButton url={applicationUrl} />
          </div>
          <p className="text-sm text-muted-foreground">
            Share this link in listing replies, social bio, or email signatures. New submissions show up in Leads.
          </p>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Recent inbound leads</p>
              <Link href={`/s/${subdomain}/leads`} className="text-sm text-primary inline-flex items-center gap-1 hover:underline">
                View all <ArrowRight size={14} />
              </Link>
            </div>
            {inboundLeads.length === 0 ? (
              <p className="text-sm text-muted-foreground">No leads yet from the application link.</p>
            ) : (
              <div className="space-y-2">
                {inboundLeads.map((lead) => (
                  <div key={lead.id} className="rounded-md border border-border px-3 py-2 text-sm">
                    <p className="font-medium">{lead.name}</p>
                    <p className="text-muted-foreground text-xs">{lead.phone} • {new Date(lead.createdAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

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
