import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSpaceFromSlug } from '@/lib/space';
import { db } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import {
  PhoneIncoming,
  Users,
  Link2,
  ArrowRight,
  Copy,
  ExternalLink,
  Clock,
  TrendingUp,
} from 'lucide-react';
import type { Metadata } from 'next';
import { protocol, rootDomain } from '@/lib/utils';
import { CopyLinkButton } from './copy-link-button';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: `${slug} — Chippi` };
}

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const [contactCount, dealCount, deals, stages, recentLeads, newLeadCount] =
    await Promise.all([
      db.contact.count({ where: { spaceId: space.id } }),
      db.deal.count({ where: { spaceId: space.id } }),
      db.deal.findMany({
        where: { spaceId: space.id },
        select: { value: true, stageId: true },
      }),
      db.dealStage.findMany({
        where: { spaceId: space.id },
        orderBy: { position: 'asc' },
      }),
      db.contact.findMany({
        where: { spaceId: space.id, tags: { has: 'application-link' } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, name: true, phone: true, budget: true, preferences: true, createdAt: true, tags: true },
      }),
      db.contact.count({
        where: { spaceId: space.id, tags: { has: 'new-lead' } },
      }),
    ]);

  const totalValue = deals.reduce((s, d) => s + (d.value ?? 0), 0);

  const dealsByStage = stages
    .map((stage) => ({
      ...stage,
      count: deals.filter((d) => d.stageId === stage.id).length,
      value: deals.filter((d) => d.stageId === stage.id).reduce((s, d) => s + (d.value ?? 0), 0),
    }))
    .filter((s) => s.count > 0);

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(n);

  const intakeUrl = `/apply/${space.slug}`;
  const totalLeads = await db.contact.count({
    where: { spaceId: space.id, tags: { has: 'application-link' } },
  });

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {space.emoji} {space.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Your leasing command center
          </p>
        </div>
        <Link
          href={`/s/${slug}/leads`}
          className="hidden sm:flex items-center gap-1.5 text-sm text-primary font-medium hover:underline underline-offset-2"
        >
          View all leads <ArrowRight size={14} />
        </Link>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'New applications',
            value: newLeadCount,
            sub: 'unread',
            icon: PhoneIncoming,
            accent: newLeadCount > 0,
          },
          {
            label: 'Total leads',
            value: totalLeads,
            sub: 'all time',
            icon: TrendingUp,
            accent: false,
          },
          {
            label: 'Clients',
            value: contactCount,
            sub: 'in CRM',
            icon: Users,
            accent: false,
          },
          {
            label: 'Active deals',
            value: dealCount,
            sub: formatCurrency(totalValue),
            icon: null,
            accent: false,
          },
        ].map(({ label, value, sub, icon: Icon, accent }) => (
          <Card
            key={label}
            className={accent ? 'border-primary/30 bg-primary/5' : ''}
          >
            <CardContent className="px-4 py-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{label}</p>
                  <p className={`text-2xl font-bold mt-0.5 ${accent ? 'text-primary' : ''}`}>
                    {value}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
                </div>
                {Icon && (
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent ? 'bg-primary/10' : 'bg-muted'}`}>
                    <Icon size={15} className={accent ? 'text-primary' : 'text-muted-foreground'} />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Intake link card */}
      <Card>
        <CardContent className="px-5 py-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
              <Link2 size={14} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Intake link</p>
              <p className="text-xs text-muted-foreground">Share to receive renter applications</p>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-full px-2 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Live
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <code className="flex-1 text-xs bg-muted rounded-lg px-3 py-2.5 break-all font-mono text-muted-foreground border border-border">
              {intakeUrl}
            </code>
            <div className="flex gap-2 flex-shrink-0">
              <CopyLinkButton url={intakeUrl} />
              <a
                href={intakeUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md border border-border bg-card hover:bg-muted transition-colors"
              >
                <ExternalLink size={13} />
                Preview
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent applications + pipeline side by side on larger screens */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Recent applications */}
        <div className="lg:col-span-3">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold">Recent applications</p>
            <Link
              href={`/s/${slug}/leads`}
              className="text-xs text-primary font-medium hover:underline underline-offset-2 flex items-center gap-1"
            >
              View all <ArrowRight size={12} />
            </Link>
          </div>
          {recentLeads.length === 0 ? (
            <Card>
              <CardContent className="px-5 py-8 text-center">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                  <PhoneIncoming size={18} className="text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">No applications yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Share your intake link to start receiving renter submissions.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {recentLeads.map((lead) => {
                const isNew = lead.tags.includes('new-lead');
                return (
                  <Link key={lead.id} href={`/s/${slug}/leads`}>
                    <div className={`rounded-xl border bg-card px-4 py-3 hover:shadow-sm transition-all duration-150 ${isNew ? 'border-primary/30' : 'border-border'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0 mt-0.5">
                            {lead.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold truncate">{lead.name}</p>
                              {isNew && (
                                <span className="inline-flex text-[10px] font-semibold text-primary bg-primary/10 rounded-full px-1.5 py-0.5 flex-shrink-0">
                                  New
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {lead.phone && (
                                <span className="text-xs text-muted-foreground">{lead.phone}</span>
                              )}
                              {lead.budget && (
                                <span className="text-xs text-muted-foreground">
                                  · {formatCurrency(lead.budget)}/mo
                                </span>
                              )}
                              {lead.preferences && (
                                <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                                  · {lead.preferences}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground flex items-center gap-1 flex-shrink-0">
                          <Clock size={11} />
                          {timeAgo(new Date(lead.createdAt))}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Pipeline stages */}
        <div className="lg:col-span-2">
          <p className="text-sm font-semibold mb-3">Pipeline</p>
          <Card>
            <CardContent className="px-4 py-4">
              {dealsByStage.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-xs text-muted-foreground">No active deals.</p>
                  <Link
                    href={`/s/${slug}/deals`}
                    className="text-xs text-primary font-medium hover:underline mt-1 inline-block"
                  >
                    Go to deals →
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {dealsByStage.map((stage) => (
                    <div key={stage.id} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: stage.color }}
                        />
                        <span className="text-sm truncate">{stage.name}</span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {stage.count}
                        </span>
                      </div>
                      <span className="text-sm font-medium flex-shrink-0 tabular-nums">
                        {formatCurrency(stage.value)}
                      </span>
                    </div>
                  ))}
                  <div className="border-t border-border pt-2 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Total pipeline</span>
                    <span className="text-sm font-semibold tabular-nums">{formatCurrency(totalValue)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
