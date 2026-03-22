import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import {
  PhoneIncoming,
  Users,
  Link2,
  ArrowRight,
  ExternalLink,
  Clock,
  TrendingUp,
  CalendarDays,
  AlertCircle,
  Briefcase,
} from 'lucide-react';
import type { Metadata } from 'next';
import { buildIntakeUrl } from '@/lib/intake';
import { CopyLinkButton } from './copy-link-button';
import { timeAgo, formatCurrency } from '@/lib/formatting';
import { FollowUpWidget, type FollowUpContact } from '@/components/dashboard/follow-up-widget';
import { OnboardingChecklist } from '@/components/dashboard/onboarding-checklist';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: `${slug} — Chippi` };
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  let contactCount = 0, dealCount = 0, newLeadCount = 0, totalLeads = 0, followUpDue = 0;
  let upcomingTourCount = 0;
  let deals: { value: number | null; stageId: string }[] = [];
  let stages: { id: string; name: string; color: string; position: number; spaceId: string }[] = [];
  let recentLeads: { id: string; name: string; phone: string | null; budget: number | null; preferences: string | null; createdAt: Date; tags: string[]; leadScore: number | null; scoreLabel: string | null; scoringStatus: string | null }[] = [];
  let followUpContacts: FollowUpContact[] = [];
  let upcomingTours: { id: string; guestName: string; startsAt: string; endsAt: string; propertyAddress: string | null; status: string }[] = [];

  try {
    [contactCount, dealCount, deals, stages, recentLeads, newLeadCount, totalLeads, followUpDue, followUpContacts, upcomingTourCount, upcomingTours] =
      await Promise.all([
        supabase.from('Contact').select('*', { count: 'exact', head: true }).eq('spaceId', space.id).then(r => { if (r.error) throw r.error; return r.count ?? 0; }),
        supabase.from('Deal').select('*', { count: 'exact', head: true }).eq('spaceId', space.id).then(r => { if (r.error) throw r.error; return r.count ?? 0; }),
        supabase.from('Deal').select('value, stageId').eq('spaceId', space.id).then(r => { if (r.error) throw r.error; return r.data as { value: number | null; stageId: string }[]; }),
        supabase.from('DealStage').select('*').eq('spaceId', space.id).order('position', { ascending: true }).then(r => { if (r.error) throw r.error; return r.data as { id: string; name: string; color: string; position: number; spaceId: string }[]; }),
        supabase.from('Contact').select('id, name, phone, budget, preferences, createdAt, tags, leadScore, scoreLabel, scoringStatus').eq('spaceId', space.id).contains('tags', ['application-link']).order('createdAt', { ascending: false }).limit(5).then(r => { if (r.error) throw r.error; return r.data as { id: string; name: string; phone: string | null; budget: number | null; preferences: string | null; createdAt: Date; tags: string[]; leadScore: number | null; scoreLabel: string | null; scoringStatus: string | null }[]; }),
        supabase.from('Contact').select('*', { count: 'exact', head: true }).eq('spaceId', space.id).contains('tags', ['new-lead']).then(r => { if (r.error) throw r.error; return r.count ?? 0; }),
        supabase.from('Contact').select('*', { count: 'exact', head: true }).eq('spaceId', space.id).contains('tags', ['application-link']).then(r => { if (r.error) throw r.error; return r.count ?? 0; }),
        supabase.from('Contact').select('*', { count: 'exact', head: true }).eq('spaceId', space.id).lte('followUpAt', new Date().toISOString()).then(r => { return r.count ?? 0; }),
        supabase.from('Contact').select('id, name, phone, email, type, followUpAt').eq('spaceId', space.id).not('followUpAt', 'is', null).lte('followUpAt', new Date().toISOString()).order('followUpAt', { ascending: true }).limit(8).then(r => { return (r.data ?? []) as FollowUpContact[]; }),
        supabase.from('Tour').select('*', { count: 'exact', head: true }).eq('spaceId', space.id).gte('startsAt', new Date().toISOString()).in('status', ['scheduled', 'confirmed']).then(r => r.count ?? 0),
        supabase.from('Tour').select('id, guestName, startsAt, endsAt, propertyAddress, status').eq('spaceId', space.id).gte('startsAt', new Date().toISOString()).in('status', ['scheduled', 'confirmed']).order('startsAt', { ascending: true }).limit(4).then(r => (r.data ?? []) as any[]),
      ]);
  } catch (err) {
    console.error('[space-home] DB queries failed', { slug, error: err });
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">We couldn&apos;t load your dashboard data. This is usually temporary.</p>
          <a href={`/s/${slug}`} className="inline-block px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90">Try again</a>
        </div>
      </div>
    );
  }

  const totalValue = deals.reduce((s, d) => s + (d.value ?? 0), 0);

  const dealsByStage = stages
    .map((stage) => ({
      ...stage,
      count: deals.filter((d) => d.stageId === stage.id).length,
      value: deals.filter((d) => d.stageId === stage.id).reduce((s, d) => s + (d.value ?? 0), 0),
    }))
    .filter((s) => s.count > 0);

  const intakeUrl = buildIntakeUrl(space.slug);
  const bookingUrl = intakeUrl.replace('/apply/', '/book/');

  return (
    <div className="space-y-8 max-w-[1120px]">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {space.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your leasing command center
          </p>
        </div>
        <Link
          href={`/s/${slug}/leads`}
          className="hidden sm:inline-flex items-center gap-1.5 text-sm text-primary font-medium hover:underline underline-offset-2"
        >
          View all leads <ArrowRight size={14} />
        </Link>
      </div>

      {/* ── Onboarding checklist ──────────────────────────────────────────── */}
      <OnboardingChecklist
        slug={slug}
        hasLeads={totalLeads > 0}
        hasContacts={contactCount > 0}
        hasTours={upcomingTourCount > 0}
        hasDeals={dealCount > 0}
      />

      {/* ── Summary stats ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'New leads', value: newLeadCount, sub: 'unread', icon: PhoneIncoming, accent: newLeadCount > 0 },
          { label: 'Total leads', value: totalLeads, sub: 'all time', icon: TrendingUp, accent: false },
          { label: 'Clients', value: contactCount, sub: 'in CRM', icon: Users, accent: false },
          { label: 'Active deals', value: dealCount, sub: formatCurrency(totalValue), icon: Briefcase, accent: false },
          { label: 'Tours', value: upcomingTourCount, sub: upcomingTourCount > 0 ? 'scheduled' : 'none', icon: CalendarDays, accent: upcomingTourCount > 0 },
          { label: 'Follow-ups', value: followUpDue, sub: followUpDue > 0 ? 'due now' : 'all clear', icon: AlertCircle, accent: followUpDue > 0 },
        ].map(({ label, value, sub, icon: Icon, accent }) => (
          <Card key={label} className={accent ? 'border-primary/30 bg-primary/5' : ''}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-8 h-8 rounded-md flex items-center justify-center ${accent ? 'bg-primary/10' : 'bg-muted'}`}>
                  <Icon size={15} className={accent ? 'text-primary' : 'text-muted-foreground'} />
                </div>
              </div>
              <p className={`text-2xl font-bold tabular-nums ${accent ? 'text-primary' : 'text-foreground'}`}>
                {value}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{label} · {sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Share links (side by side) ────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ShareLinkCard
          icon={Link2}
          title="Intake link"
          description="Receive renter applications"
          url={intakeUrl}
          previewHref={intakeUrl}
        />
        <ShareLinkCard
          icon={CalendarDays}
          title="Tour booking"
          description="Let prospects schedule tours"
          url={bookingUrl}
          previewHref={`/book/${space.slug}`}
        />
      </div>

      {/* ── Follow-up widget ──────────────────────────────────────────────── */}
      <FollowUpWidget slug={slug} contacts={followUpContacts} />

      {/* ── Main content: Applications + Sidebar ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent applications — 2/3 width */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">Recent applications</h2>
            <Link
              href={`/s/${slug}/leads`}
              className="text-xs text-primary font-medium hover:underline underline-offset-2 flex items-center gap-1"
            >
              View all <ArrowRight size={12} />
            </Link>
          </div>
          {recentLeads.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center mx-auto mb-3">
                  <PhoneIncoming size={18} className="text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">No applications yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Share your intake link to start receiving renter submissions.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <div className="divide-y divide-border">
                {recentLeads.map((lead) => {
                  const isNew = lead.tags.includes('new-lead');
                  const scoreBadge =
                    lead.scoreLabel === 'hot'  ? { label: 'Hot',  cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' } :
                    lead.scoreLabel === 'warm' ? { label: 'Warm', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' } :
                    lead.scoreLabel === 'cold' ? { label: 'Cold', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-400' } :
                    null;
                  return (
                    <Link key={lead.id} href={`/s/${slug}/leads`} className="block">
                      <div className={`flex items-start justify-between gap-3 px-5 py-3.5 hover:bg-muted/40 transition-colors ${isNew ? 'bg-primary/[0.03]' : ''}`}>
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0 mt-0.5">
                            {lead.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold truncate">{lead.name}</p>
                              {isNew && (
                                <span className="inline-flex text-[10px] font-semibold text-primary bg-primary/10 rounded-md px-1.5 py-0.5 flex-shrink-0">
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
                                <span className="text-xs text-muted-foreground truncate max-w-[140px]">
                                  · {lead.preferences}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                          {lead.scoringStatus === 'scored' && lead.leadScore != null && scoreBadge ? (
                            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded-md px-2 py-0.5 ${scoreBadge.cls}`}>
                              {Math.round(lead.leadScore)}
                              <span className="font-medium opacity-80">{scoreBadge.label}</span>
                            </span>
                          ) : lead.scoringStatus === 'pending' ? (
                            <span className="text-[11px] text-muted-foreground/60 italic">scoring…</span>
                          ) : null}
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock size={11} />
                            {timeAgo(new Date(lead.createdAt))}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </Card>
          )}
        </div>

        {/* Right sidebar — Pipeline + Tours */}
        <div className="space-y-6">
          {/* Pipeline */}
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-4">Pipeline</h2>
            <Card>
              <CardContent className="p-4">
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
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: stage.color }}
                          />
                          <span className="text-sm truncate">{stage.name}</span>
                          <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
                            {stage.count}
                          </span>
                        </div>
                        <span className="text-sm font-medium flex-shrink-0 tabular-nums">
                          {formatCurrency(stage.value)}
                        </span>
                      </div>
                    ))}
                    <div className="border-t border-border pt-3 flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Total pipeline</span>
                      <span className="text-sm font-bold tabular-nums">{formatCurrency(totalValue)}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Upcoming tours */}
          {upcomingTours.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-foreground">Upcoming tours</h2>
                <Link href={`/s/${slug}/tours`} className="text-xs text-primary font-medium hover:underline flex items-center gap-1">
                  View all <ArrowRight size={12} />
                </Link>
              </div>
              <Card>
                <div className="divide-y divide-border">
                  {upcomingTours.map((tour: any) => (
                    <Link key={tour.id} href={`/s/${slug}/tours`} className="block">
                      <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                        <div className="w-10 h-10 rounded-md bg-muted flex flex-col items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-medium text-muted-foreground uppercase leading-none">
                            {new Date(tour.startsAt).toLocaleDateString([], { month: 'short' })}
                          </span>
                          <span className="text-sm font-bold text-foreground leading-tight">
                            {new Date(tour.startsAt).getDate()}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{tour.guestName}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(tour.startsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                            {tour.propertyAddress && ` · ${tour.propertyAddress}`}
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Share link card component ───────────────────────────────────────────────

function ShareLinkCard({
  icon: Icon,
  title,
  description,
  url,
  previewHref,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
  url: string;
  previewHref: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Icon size={15} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight">{title}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-md px-2 py-0.5 flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Live
          </span>
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-muted rounded-md px-3 py-2 break-all font-mono text-muted-foreground border border-border truncate">
            {url}
          </code>
          <CopyLinkButton url={url} />
          <a
            href={previewHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md border border-border bg-card hover:bg-muted transition-colors flex-shrink-0"
          >
            <ExternalLink size={13} />
            Preview
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
