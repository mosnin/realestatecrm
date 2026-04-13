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
  MapPin,
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

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
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
  let buyerLeadCount = 0, rentalLeadCount = 0;
  let deals: { value: number | null; stageId: string }[] = [];
  let stages: { id: string; name: string; color: string; position: number; spaceId: string }[] = [];
  let recentLeads: { id: string; name: string; phone: string | null; budget: number | null; preferences: string | null; createdAt: Date; tags: string[]; leadScore: number | null; scoreLabel: string | null; scoringStatus: string | null }[] = [];
  let followUpContacts: FollowUpContact[] = [];
  let upcomingTours: { id: string; guestName: string; startsAt: string; endsAt: string; propertyAddress: string | null; status: string }[] = [];

  try {
    [contactCount, dealCount, deals, stages, recentLeads, newLeadCount, totalLeads, followUpDue, followUpContacts, upcomingTourCount, upcomingTours, buyerLeadCount, rentalLeadCount] =
      await Promise.all([
        supabase.from('Contact').select('*', { count: 'exact', head: true }).eq('spaceId', space.id).is('brokerageId', null).then(r => { if (r.error) throw r.error; return r.count ?? 0; }),
        supabase.from('Deal').select('*', { count: 'exact', head: true }).eq('spaceId', space.id).then(r => { if (r.error) throw r.error; return r.count ?? 0; }),
        supabase.from('Deal').select('value, stageId').eq('spaceId', space.id).then(r => { if (r.error) throw r.error; return r.data as { value: number | null; stageId: string }[]; }),
        supabase.from('DealStage').select('*').eq('spaceId', space.id).order('position', { ascending: true }).then(r => { if (r.error) throw r.error; return r.data as { id: string; name: string; color: string; position: number; spaceId: string }[]; }),
        supabase.from('Contact').select('id, name, phone, budget, preferences, createdAt, tags, leadScore, scoreLabel, scoringStatus').eq('spaceId', space.id).is('brokerageId', null).contains('tags', ['application-link']).order('createdAt', { ascending: false }).limit(5).then(r => { if (r.error) throw r.error; return r.data as { id: string; name: string; phone: string | null; budget: number | null; preferences: string | null; createdAt: Date; tags: string[]; leadScore: number | null; scoreLabel: string | null; scoringStatus: string | null }[]; }),
        supabase.from('Contact').select('*', { count: 'exact', head: true }).eq('spaceId', space.id).is('brokerageId', null).contains('tags', ['new-lead']).then(r => { if (r.error) throw r.error; return r.count ?? 0; }),
        supabase.from('Contact').select('*', { count: 'exact', head: true }).eq('spaceId', space.id).is('brokerageId', null).contains('tags', ['application-link']).then(r => { if (r.error) throw r.error; return r.count ?? 0; }),
        supabase.from('Contact').select('*', { count: 'exact', head: true }).eq('spaceId', space.id).is('brokerageId', null).lte('followUpAt', new Date().toISOString()).then(r => { return r.count ?? 0; }),
        supabase.from('Contact').select('id, name, phone, email, type, followUpAt, leadScore, scoreLabel').eq('spaceId', space.id).is('brokerageId', null).not('followUpAt', 'is', null).lte('followUpAt', new Date().toISOString()).order('followUpAt', { ascending: true }).limit(8).then(r => { return (r.data ?? []) as FollowUpContact[]; }),
        supabase.from('Tour').select('*', { count: 'exact', head: true }).eq('spaceId', space.id).gte('startsAt', new Date().toISOString()).in('status', ['scheduled', 'confirmed']).then(r => r.count ?? 0),
        supabase.from('Tour').select('id, guestName, startsAt, endsAt, propertyAddress, status').eq('spaceId', space.id).gte('startsAt', new Date().toISOString()).in('status', ['scheduled', 'confirmed']).order('startsAt', { ascending: true }).limit(4).then(r => (r.data ?? []) as any[]),
        supabase.from('Contact').select('*', { count: 'exact', head: true }).eq('spaceId', space.id).is('brokerageId', null).eq('leadType', 'buyer').contains('tags', ['application-link']).then(r => r.count ?? 0),
        supabase.from('Contact').select('*', { count: 'exact', head: true }).eq('spaceId', space.id).is('brokerageId', null).eq('leadType', 'rental').contains('tags', ['application-link']).then(r => r.count ?? 0),
      ]);
  } catch (err) {
    console.error('[space-home] DB queries failed', { slug, error: err });
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center mx-auto mb-2">
            <AlertCircle size={22} className="text-destructive" />
          </div>
          <h1 className="text-xl font-semibold">Couldn&apos;t load your dashboard</h1>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            This is usually a temporary connection issue. Try refreshing the page. If it keeps happening, check your internet connection or try again in a few minutes.
          </p>
          <a href={`/s/${slug}`} className="inline-block px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90">Refresh page</a>
        </div>
      </div>
    );
  }

  const totalValue = deals.reduce((s, d) => s + (d.value ?? 0), 0);
  const maxStageValue = Math.max(1, ...deals.map(d => d.value ?? 0));

  const dealsByStage = stages
    .map((stage) => ({
      ...stage,
      count: deals.filter((d) => d.stageId === stage.id).length,
      value: deals.filter((d) => d.stageId === stage.id).reduce((s, d) => s + (d.value ?? 0), 0),
    }))
    .filter((s) => s.count > 0);

  const totalDealsByStage = dealsByStage.reduce((s, st) => s + st.count, 0) || 1;

  const intakeUrl = buildIntakeUrl(space.slug);
  const bookingUrl = intakeUrl.replace('/apply/', '/book/');

  const stats = [
    { label: 'New leads', value: newLeadCount, sub: 'unread', icon: PhoneIncoming, accent: newLeadCount > 0, dotCls: 'bg-brand', href: `/s/${slug}/leads` },
    { label: 'Total leads', value: totalLeads, sub: 'total', icon: TrendingUp, accent: false, dotCls: '', href: `/s/${slug}/leads` },
    { label: 'Clients', value: contactCount, sub: 'in CRM', icon: Users, accent: false, dotCls: '', href: `/s/${slug}/contacts` },
    { label: 'Active deals', value: dealCount, sub: formatCurrency(totalValue), icon: Briefcase, accent: false, dotCls: '', href: `/s/${slug}/deals` },
    { label: 'Tours', value: upcomingTourCount, sub: upcomingTourCount > 0 ? 'scheduled' : 'none', icon: CalendarDays, accent: upcomingTourCount > 0, dotCls: 'bg-muted-foreground', href: `/s/${slug}/tours` },
    { label: 'Follow-ups', value: followUpDue, sub: followUpDue > 0 ? 'due now' : 'all clear', icon: AlertCircle, accent: followUpDue > 0, dotCls: 'bg-destructive', href: `/s/${slug}/follow-ups` },
  ];

  return (
    <div className="space-y-8 max-w-[1120px]">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{getGreeting()}</p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mt-0.5">
            {space.name}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/s/${slug}/leads`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground font-medium hover:text-foreground hover:underline underline-offset-2"
          >
            View all leads <ArrowRight size={14} />
          </Link>
        </div>
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map(({ label, value, sub, icon: Icon, accent, dotCls, href }) => (
          <Link key={label} href={href}>
            <Card className="transition-colors hover:border-foreground/20 hover:bg-muted/30">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-muted">
                    <Icon size={16} className="text-muted-foreground" />
                  </div>
                  {accent && value > 0 && (
                    <span className={`w-2 h-2 rounded-full animate-pulse ${dotCls}`} />
                  )}
                </div>
                <p className="text-2xl font-bold tabular-nums leading-tight text-foreground">
                  {value}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1 leading-tight">{label}</p>
                <p className="text-[10px] text-muted-foreground/70">{sub}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* ── Share links ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ShareLinkCard
          icon={Link2}
          title="Intake link"
          description="Receive client applications"
          url={intakeUrl}
          previewHref={`/apply/${space.slug}`}
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
              className="text-xs text-muted-foreground font-medium hover:text-foreground hover:underline underline-offset-2 flex items-center gap-1"
            >
              View all <ArrowRight size={12} />
            </Link>
          </div>
          {recentLeads.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                  <PhoneIncoming size={20} className="text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">No applications yet</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[240px] mx-auto">
                  Share your intake link to start receiving applications.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <div className="divide-y divide-border">
                {recentLeads.map((lead) => {
                  const isNew = lead.tags.includes('new-lead');
                  const scoreBadge =
                    lead.scoreLabel === 'hot'  ? { label: 'Hot',  cls: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400', barCls: 'bg-red-500' } :
                    lead.scoreLabel === 'warm' ? { label: 'Warm', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400', barCls: 'bg-amber-500' } :
                    lead.scoreLabel === 'cold' ? { label: 'Cold', cls: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400', barCls: 'bg-slate-400' } :
                    null;
                  return (
                    <Link key={lead.id} href={`/s/${slug}/leads`} className="block">
                      <div className="flex items-center gap-3 px-5 py-3.5 hover:bg-muted/40 transition-colors">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0">
                          {lead.name?.split(' ')?.map((n: string) => n?.[0])?.join('')?.toUpperCase()?.slice(0, 2) || '??'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold truncate">{lead.name}</p>
                            {isNew && (
                              <span className="inline-flex text-[10px] font-semibold text-orange-700 bg-orange-50 dark:text-orange-400 dark:bg-orange-500/10 rounded-md px-1.5 py-0.5 flex-shrink-0">
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
                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                          {lead.scoringStatus === 'scored' && lead.leadScore != null && scoreBadge ? (
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden hidden sm:block">
                                <div className={`h-full rounded-full ${scoreBadge.barCls}`} style={{ width: `${Math.min(100, lead.leadScore)}%` }} />
                              </div>
                              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded-md px-2 py-0.5 ${scoreBadge.cls}`}>
                                {Math.round(lead.leadScore)}
                                <span className="font-medium opacity-80">{scoreBadge.label}</span>
                              </span>
                            </div>
                          ) : lead.scoringStatus === 'pending' ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/60 italic">
                              <span className="w-3 h-3 rounded-full border-2 border-muted-foreground/30 border-t-foreground animate-spin" />
                              AI scoring
                            </span>
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
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">Pipeline</h2>
              <Link href={`/s/${slug}/deals`} className="text-xs text-muted-foreground font-medium hover:text-foreground hover:underline flex items-center gap-1">
                View all <ArrowRight size={12} />
              </Link>
            </div>
            <Card>
              <CardContent className="p-4">
                {dealsByStage.length === 0 ? (
                  <div className="text-center py-6">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center mx-auto mb-2">
                      <Briefcase size={18} className="text-muted-foreground" />
                    </div>
                    <p className="text-xs font-medium text-foreground">No active deals yet</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 max-w-[180px] mx-auto">
                      Convert a lead or add a deal to start tracking your pipeline.
                    </p>
                    <Link
                      href={`/s/${slug}/deals`}
                      className="text-xs text-muted-foreground font-medium hover:text-foreground hover:underline mt-2 inline-flex items-center gap-1"
                    >
                      Go to deals <ArrowRight size={11} />
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {dealsByStage.map((stage) => (
                      <div key={stage.id} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: stage.color }}
                            />
                            <span className="text-sm font-medium truncate">{stage.name}</span>
                            <span className="text-[11px] text-muted-foreground bg-muted rounded-md px-1.5 py-0.5 tabular-nums flex-shrink-0">
                              {stage.count}
                            </span>
                          </div>
                          <span className="text-sm font-semibold flex-shrink-0 tabular-nums">
                            {formatCurrency(stage.value)}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.max(4, (stage.count / totalDealsByStage) * 100)}%`,
                              backgroundColor: stage.color,
                            }}
                          />
                        </div>
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
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">Upcoming tours</h2>
              <Link href={`/s/${slug}/tours`} className="text-xs text-muted-foreground font-medium hover:text-foreground hover:underline flex items-center gap-1">
                View all <ArrowRight size={12} />
              </Link>
            </div>
            {upcomingTours.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center mx-auto mb-2">
                    <CalendarDays size={18} className="text-muted-foreground" />
                  </div>
                  <p className="text-xs font-medium text-foreground">No upcoming tours</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 max-w-[180px] mx-auto">
                    Share your booking link so prospects can schedule tours.
                  </p>
                  <Link
                    href={`/s/${slug}/tours`}
                    className="text-xs text-muted-foreground font-medium hover:text-foreground hover:underline mt-2 inline-flex items-center gap-1"
                  >
                    Manage tours <ArrowRight size={11} />
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <div className="divide-y divide-border">
                  {upcomingTours.map((tour: any) => {
                    const d = new Date(tour.startsAt);
                    return (
                      <Link key={tour.id} href={`/s/${slug}/tours`} className="block">
                        <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                          <div className="w-11 h-11 rounded-lg bg-muted border border-border flex flex-col items-center justify-center flex-shrink-0">
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase leading-none">
                              {d.toLocaleDateString([], { month: 'short' })}
                            </span>
                            <span className="text-base font-bold text-foreground leading-tight">
                              {d.getDate()}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold truncate">{tour.guestName}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <Clock size={11} className="text-muted-foreground flex-shrink-0" />
                              <span className="text-xs text-muted-foreground">
                                {d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                              </span>
                              {tour.propertyAddress && (
                                <>
                                  <MapPin size={11} className="text-muted-foreground flex-shrink-0 ml-1" />
                                  <span className="text-xs text-muted-foreground truncate">
                                    {tour.propertyAddress}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>
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
          <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
            <Icon size={16} className="text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight">{title}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-full px-2.5 py-1 flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Live
          </span>
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-muted rounded-lg px-3 py-2 font-mono text-muted-foreground border border-border/60 break-all line-clamp-2 sm:line-clamp-1">
            {url}
          </code>
          <CopyLinkButton url={url} />
          <a
            href={previewHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-border bg-card hover:bg-muted transition-colors flex-shrink-0"
          >
            <ExternalLink size={13} />
            <span className="hidden sm:inline">Preview</span>
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
