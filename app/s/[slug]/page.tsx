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

function formatToday() {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
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

  // ── Compressed KPI strip (5 tiles; Total leads dropped — redundant with Leads page header)
  const stats = [
    { label: 'New leads',    value: newLeadCount,      sub: newLeadCount > 0 ? 'unread' : 'inbox clear', accent: newLeadCount > 0,      dotCls: 'bg-brand',        href: `/s/${slug}/leads` },
    { label: 'Clients',      value: contactCount,       sub: contactCount === 1 ? 'contact' : 'contacts', accent: false,                dotCls: '',                href: `/s/${slug}/contacts` },
    { label: 'Active deals', value: dealCount,          sub: formatCurrency(totalValue),                 accent: false,                 dotCls: '',                href: `/s/${slug}/deals` },
    { label: 'Tours',        value: upcomingTourCount,  sub: upcomingTourCount > 0 ? 'scheduled' : 'none', accent: false,              dotCls: '',                href: `/s/${slug}/tours` },
    { label: 'Follow-ups',   value: followUpDue,        sub: followUpDue > 0 ? 'due now' : 'all clear',  accent: followUpDue > 0,      dotCls: 'bg-destructive',  href: `/s/${slug}/follow-ups` },
  ];

  // ── Compact live status segments for the top strip
  const statusSegments: { label: string; href: string; tone: 'urgent' | 'accent' | 'muted' }[] = [];
  if (followUpDue > 0) statusSegments.push({ label: `${followUpDue} follow-up${followUpDue === 1 ? '' : 's'} due`, href: `/s/${slug}/follow-ups`, tone: 'urgent' });
  if (newLeadCount > 0) statusSegments.push({ label: `${newLeadCount} new lead${newLeadCount === 1 ? '' : 's'}`, href: `/s/${slug}/leads`, tone: 'accent' });
  if (upcomingTourCount > 0) statusSegments.push({ label: `${upcomingTourCount} upcoming tour${upcomingTourCount === 1 ? '' : 's'}`, href: `/s/${slug}/tours`, tone: 'muted' });

  return (
    <div className="space-y-6 max-w-[1200px]">

      {/* ── Top strip — greeting + compact live status ─────────────────────
          Compressed header: no oversized hero, no standalone "View leads"
          pill. Status segments carry the single-tap navigation. */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80">
            {getGreeting()} · {formatToday()}
          </p>
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground leading-tight mt-0.5 truncate">
            {space.name}
          </h1>
        </div>
        {statusSegments.length > 0 ? (
          <nav className="flex flex-wrap items-center gap-1.5 flex-shrink-0" aria-label="Today's status">
            {statusSegments.map((seg) => (
              <Link
                key={seg.label}
                href={seg.href}
                className={
                  'inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-1 border transition-colors ' +
                  (seg.tone === 'urgent'
                    ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/25 dark:hover:bg-red-500/15'
                    : seg.tone === 'accent'
                    ? 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/25 dark:hover:bg-orange-500/15'
                    : 'bg-muted/50 text-foreground border-border hover:bg-muted')
                }
              >
                <span className={
                  'w-1.5 h-1.5 rounded-full ' +
                  (seg.tone === 'urgent' ? 'bg-red-500 animate-pulse' : seg.tone === 'accent' ? 'bg-brand animate-pulse' : 'bg-muted-foreground/50')
                } />
                {seg.label}
              </Link>
            ))}
          </nav>
        ) : (
          <Link
            href={`/s/${slug}/leads`}
            className="inline-flex items-center gap-1.5 text-xs font-medium bg-foreground text-background px-3 py-1.5 rounded-md hover:bg-foreground/90 transition-colors flex-shrink-0 self-start sm:self-auto"
          >
            View leads <ArrowRight size={12} />
          </Link>
        )}
      </header>

      {/* ── Onboarding checklist (unchanged) ────────────────────────────── */}
      <OnboardingChecklist
        slug={slug}
        hasLeads={totalLeads > 0}
        hasContacts={contactCount > 0}
        hasTours={upcomingTourCount > 0}
        hasDeals={dealCount > 0}
      />

      {/*
        ── Main grid ───────────────────────────────────────────────────────
        Asymmetric 12-col composition. Primary work zone on the left
        (cols 1–8) dominates; secondary insight rail on the right (cols
        9–12) is narrower and denser. KPIs and tools demoted to full-width
        bars beneath the work zone — never competing with it for attention.

        Mobile (single column) stacks by priority:
          1. Hero queue  2. New leads  3. Pipeline  4. Tours
          5. KPI strip   6. Tools bar
      */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-12 lg:gap-5">

        {/* ── Hero work queue — Follow-ups due ─────────────────────────────
            Primary surface. Full width on mobile, cols 1–8 on lg.
            FollowUpWidget has its own section chrome — we don't double it. */}
        <section className="order-1 lg:col-span-8" aria-label="Priority queue">
          <SectionLabel>Today&apos;s queue</SectionLabel>
          <FollowUpWidget slug={slug} contacts={followUpContacts} />
        </section>

        {/* ── Pipeline snapshot (right rail top) ───────────────────────────
            Mobile order 3 (after hero + new leads). Desktop rail top. */}
        <section className="order-3 lg:order-none lg:col-span-4" aria-label="Pipeline snapshot">
          <SectionLabel
            trailing={
              <Link
                href={`/s/${slug}/deals`}
                className="text-[11px] text-muted-foreground hover:text-foreground hover:underline underline-offset-2 flex items-center gap-0.5"
              >
                All deals <ArrowRight size={11} />
              </Link>
            }
          >
            Pipeline
          </SectionLabel>
          <Card>
            <CardContent className="p-4">
              {dealsByStage.length === 0 ? (
                <div className="py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                      <Briefcase size={14} className="text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground">No active deals</p>
                      <p className="text-[11px] text-muted-foreground leading-tight">
                        Convert a lead to start tracking.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {dealsByStage.map((stage) => (
                    <div key={stage.id} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: stage.color }}
                          />
                          <span className="text-[12px] font-medium truncate">{stage.name}</span>
                          <span className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0">
                            · {stage.count}
                          </span>
                        </div>
                        <span className="text-[12px] font-semibold flex-shrink-0 tabular-nums">
                          {formatCurrency(stage.value)}
                        </span>
                      </div>
                      <div className="h-[3px] rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.max(6, (stage.count / totalDealsByStage) * 100)}%`,
                            backgroundColor: stage.color,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  <div className="border-t border-border pt-2.5 flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Total</span>
                    <span className="text-sm font-semibold tabular-nums">{formatCurrency(totalValue)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* ── New leads (primary secondary module) ─────────────────────────
            Dense, easier to scan list. Under the hero queue on all widths.
            Kept at cols 1–8 on desktop to mirror the queue. */}
        <section className="order-2 lg:col-span-8" aria-label="New leads">
          <SectionLabel
            trailing={
              <Link
                href={`/s/${slug}/leads`}
                className="text-[11px] text-muted-foreground hover:text-foreground hover:underline underline-offset-2 flex items-center gap-0.5"
              >
                All leads <ArrowRight size={11} />
              </Link>
            }
          >
            New leads
          </SectionLabel>
          {recentLeads.length === 0 ? (
            <Card>
              <CardContent className="py-6 px-5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    <PhoneIncoming size={16} className="text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">No leads yet</p>
                    <p className="text-xs text-muted-foreground">
                      Share your intake link and applications will land here.
                    </p>
                  </div>
                  <Link
                    href={`/apply/${space.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:underline flex-shrink-0"
                  >
                    Preview <ExternalLink size={11} />
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <div className="divide-y divide-border">
                {recentLeads.map((lead) => {
                  const isNew = lead.tags.includes('new-lead');
                  // Cold retuned from blue → slate to stay clear of indigo territory.
                  const scoreBadge =
                    lead.scoreLabel === 'hot'  ? { label: 'Hot',  cls: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400',       barCls: 'bg-red-500' } :
                    lead.scoreLabel === 'warm' ? { label: 'Warm', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400', barCls: 'bg-amber-500' } :
                    lead.scoreLabel === 'cold' ? { label: 'Cold', cls: 'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300', barCls: 'bg-slate-400' } :
                    null;
                  return (
                    <Link key={lead.id} href={`/s/${slug}/leads`} className="block">
                      <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold text-muted-foreground flex-shrink-0">
                          {lead.name?.split(' ')?.map((n: string) => n?.[0])?.join('')?.toUpperCase()?.slice(0, 2) || '??'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-semibold truncate">{lead.name}</p>
                            {isNew && (
                              <span className="inline-flex text-[10px] font-semibold text-orange-700 bg-orange-50 dark:text-orange-400 dark:bg-orange-500/10 rounded px-1.5 py-0.5 flex-shrink-0 leading-none">
                                New
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap text-[11px] text-muted-foreground">
                            {lead.phone && <span className="truncate">{lead.phone}</span>}
                            {lead.budget && <span>· {formatCurrency(lead.budget)}/mo</span>}
                            {lead.preferences && (
                              <span className="truncate max-w-[140px]">· {lead.preferences}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {lead.scoringStatus === 'scored' && lead.leadScore != null && scoreBadge ? (
                            <div className="flex items-center gap-1.5">
                              <div className="w-10 h-1 rounded-full bg-muted overflow-hidden hidden sm:block">
                                <div
                                  className={`h-full rounded-full ${scoreBadge.barCls}`}
                                  style={{ width: `${Math.min(100, lead.leadScore)}%` }}
                                />
                              </div>
                              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold rounded px-1.5 py-0.5 leading-none ${scoreBadge.cls}`}>
                                {Math.round(lead.leadScore)}
                                <span className="font-medium opacity-80">{scoreBadge.label}</span>
                              </span>
                            </div>
                          ) : lead.scoringStatus === 'pending' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70 italic">
                              <span className="w-2.5 h-2.5 rounded-full border-2 border-muted-foreground/30 border-t-foreground animate-spin" />
                              scoring
                            </span>
                          ) : null}
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1 tabular-nums">
                            <Clock size={10} />
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
        </section>

        {/* ── Upcoming tours (right rail bottom) ──────────────────────────
            Mobile order 4. Desktop cols 9–12. */}
        <section className="order-4 lg:order-none lg:col-span-4" aria-label="Upcoming tours">
          <SectionLabel
            trailing={
              <Link
                href={`/s/${slug}/tours`}
                className="text-[11px] text-muted-foreground hover:text-foreground hover:underline underline-offset-2 flex items-center gap-0.5"
              >
                All tours <ArrowRight size={11} />
              </Link>
            }
          >
            Upcoming tours
          </SectionLabel>
          {upcomingTours.length === 0 ? (
            <Card>
              <CardContent className="py-5 px-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                    <CalendarDays size={14} className="text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground">No tours scheduled</p>
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      Share your booking link.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <div className="divide-y divide-border">
                {upcomingTours.map((tour: any) => {
                  const d = new Date(tour.startsAt);
                  return (
                    <Link key={tour.id} href={`/s/${slug}/tours`} className="block">
                      <div className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/40 transition-colors">
                        <div className="w-9 h-9 rounded-md bg-muted border border-border flex flex-col items-center justify-center flex-shrink-0">
                          <span className="text-[9px] font-semibold text-muted-foreground uppercase leading-none">
                            {d.toLocaleDateString([], { month: 'short' })}
                          </span>
                          <span className="text-[13px] font-bold text-foreground leading-tight">
                            {d.getDate()}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold truncate">{tour.guestName}</p>
                          <div className="flex items-center gap-1 mt-0.5 text-[11px] text-muted-foreground">
                            <Clock size={9} className="flex-shrink-0" />
                            <span>
                              {d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                            </span>
                            {tour.propertyAddress && (
                              <>
                                <MapPin size={9} className="flex-shrink-0 ml-0.5" />
                                <span className="truncate">{tour.propertyAddress}</span>
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
        </section>

        {/* ── KPI strip — compressed ───────────────────────────────────────
            Demoted below primary work. Single card, 5 divided segments.
            Small icons replaced by uppercase section labels for a calmer,
            more operational read. Not competing with work surfaces. */}
        <section className="order-5 lg:col-span-12" aria-label="At a glance">
          <Card>
            <CardContent className="p-0">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-x divide-y sm:divide-y-0 divide-border">
                {stats.map(({ label, value, sub, accent, dotCls, href }) => (
                  <Link
                    key={label}
                    href={href}
                    className="group px-3.5 py-3 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.1em]">
                        {label}
                      </span>
                      {accent && value > 0 ? (
                        <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${dotCls}`} />
                      ) : (
                        <ArrowRight size={10} className="text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-colors" />
                      )}
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[22px] font-semibold tabular-nums leading-none text-foreground">
                        {value}
                      </span>
                      <span className="text-[11px] text-muted-foreground truncate">{sub}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ── Compressed tools bar ─────────────────────────────────────────
            Intake + Booking collapsed into a single lighter bar. No
            decorative "Live" pulse; inline copy + preview actions
            preserve functionality. */}
        <section className="order-6 lg:col-span-12" aria-label="Tools">
          <Card>
            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
              <ToolRow
                icon={Link2}
                title="Intake link"
                description="Receive applications"
                url={intakeUrl}
                previewHref={`/apply/${space.slug}`}
              />
              <ToolRow
                icon={CalendarDays}
                title="Tour booking"
                description="Let prospects schedule"
                url={bookingUrl}
                previewHref={`/book/${space.slug}`}
              />
            </div>
          </Card>
        </section>

      </div>
    </div>
  );
}

// ── Section label ──────────────────────────────────────────────────────────
// Calmer, operational: uppercase tracking-wide, muted, optional trailing link.

function SectionLabel({
  children,
  trailing,
}: {
  children: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between mb-2">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {children}
      </h2>
      {trailing}
    </div>
  );
}

// ── Tool row — compressed utility treatment ────────────────────────────────
// Preserves CopyLinkButton (copy action) and preview link. Single row, no
// decorative status pulse, clearly secondary to primary work surfaces.

function ToolRow({
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
    <div className="flex items-center gap-3 px-3.5 py-3">
      <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
        <Icon size={13} className="text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-semibold leading-tight">{title}</p>
          <span className="text-[10px] text-muted-foreground/70">· {description}</span>
        </div>
        <code className="block mt-0.5 text-[10.5px] font-mono text-muted-foreground truncate">
          {url}
        </code>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <CopyLinkButton url={url} />
        <a
          href={previewHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-border bg-card hover:bg-muted transition-colors"
          aria-label={`Preview ${title}`}
          title={`Preview ${title}`}
        >
          <ExternalLink size={12} />
        </a>
      </div>
    </div>
  );
}
