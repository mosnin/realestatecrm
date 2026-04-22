import { notFound } from 'next/navigation';
import Link from 'next/link';
import { currentUser } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import {
  PhoneIncoming,
  Link2,
  ExternalLink,
  Clock,
  CalendarDays,
  AlertCircle,
  Briefcase,
  MapPin,
  ChevronRight,
  Settings,
  BarChart3,
  UserPlus,
  ArrowRight,
  Sparkles,
  Inbox,
} from 'lucide-react';
import type { Metadata } from 'next';
import { buildIntakeUrl } from '@/lib/intake';
import { CopyLinkButton } from './copy-link-button';
import { timeAgo, formatCurrency } from '@/lib/formatting';
import { FollowUpWidget, type FollowUpContact } from '@/components/dashboard/follow-up-widget';
import { OnboardingChecklist } from '@/components/dashboard/onboarding-checklist';
import { AgentInsightsWidget } from '@/components/agent/agent-insights-widget';
import { logger } from '@/lib/logger';

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

  const [space, clerkUser] = await Promise.all([
    getSpaceFromSlug(slug),
    currentUser(),
  ]);
  if (!space) notFound();

  const firstName = clerkUser?.firstName ?? space.name.split(' ')[0] ?? 'there';

  let contactCount = 0, dealCount = 0, newLeadCount = 0, totalLeads = 0, followUpDue = 0;
  let upcomingTourCount = 0;
  let buyerLeadCount = 0, rentalLeadCount = 0;
  let pendingDraftCount = 0;
  let deals: { value: number | null; stageId: string }[] = [];
  let stages: { id: string; name: string; color: string; position: number; spaceId: string }[] = [];
  let recentLeads: { id: string; name: string; phone: string | null; budget: number | null; preferences: string | null; createdAt: Date; tags: string[]; leadScore: number | null; scoreLabel: string | null; scoringStatus: string | null }[] = [];
  let followUpContacts: FollowUpContact[] = [];
  let upcomingTours: { id: string; guestName: string; startsAt: string; endsAt: string; propertyAddress: string | null; status: string }[] = [];
  let overdueNextActions: { id: string; title: string; nextAction: string; nextActionDueAt: string }[] = [];

  try {
    [contactCount, dealCount, deals, stages, recentLeads, newLeadCount, totalLeads, followUpDue, followUpContacts, upcomingTourCount, upcomingTours, buyerLeadCount, rentalLeadCount, pendingDraftCount, overdueNextActions] =
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
        supabase.from('AgentDraft').select('*', { count: 'exact', head: true }).eq('spaceId', space.id).eq('status', 'pending').then(r => r.count ?? 0),
        // Deals with a realtor-authored next action that's overdue — surface in
        // the Today inbox. Scoped to active deals only.
        supabase
          .from('Deal')
          .select('id, title, nextAction, nextActionDueAt')
          .eq('spaceId', space.id)
          .eq('status', 'active')
          .not('nextAction', 'is', null)
          .not('nextActionDueAt', 'is', null)
          .lte('nextActionDueAt', new Date().toISOString())
          .order('nextActionDueAt', { ascending: true })
          .limit(5)
          .then(r => (r.data ?? []) as { id: string; title: string; nextAction: string; nextActionDueAt: string }[]),
      ]);
  } catch (err) {
    logger.error('[space-home] DB queries failed', { slug }, err);
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center mx-auto mb-2">
            <AlertCircle size={22} className="text-destructive" />
          </div>
          <h1 className="text-xl font-semibold">Couldn&apos;t load your dashboard</h1>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            This is usually a temporary connection issue. Try refreshing the page.
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

  // ── Today inbox: one unified stream of things that need attention ─────────
  // Ordered by urgency: overdue → tours today → new leads → drafts awaiting review.
  const todayTours = upcomingTours.filter(t =>
    new Date(t.startsAt).toDateString() === new Date().toDateString()
  );

  type TodayItem = {
    key: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    iconBg: string;
    iconColor: string;
    title: string;
    sub: string;
    href: string;
    cta: string;
    urgent?: boolean;
  };

  const todayItems: TodayItem[] = [];

  if (followUpDue > 0) {
    todayItems.push({
      key: 'follow-ups',
      icon: Clock,
      iconBg: 'bg-red-50 dark:bg-red-500/10',
      iconColor: 'text-red-600 dark:text-red-400',
      title: `${followUpDue} follow-up${followUpDue === 1 ? '' : 's'} overdue`,
      sub: 'These people were expecting to hear from you today.',
      href: `/s/${slug}/follow-ups`,
      cta: 'Open',
      urgent: true,
    });
  }
  // Overdue next actions on deals — one row per deal up to 3, the rest rolled
  // into a "deals" link.
  const visibleNextActions = overdueNextActions.slice(0, 3);
  for (const d of visibleNextActions) {
    todayItems.push({
      key: `next-${d.id}`,
      icon: ArrowRight,
      iconBg: 'bg-red-50 dark:bg-red-500/10',
      iconColor: 'text-red-600 dark:text-red-400',
      title: d.nextAction,
      sub: `${d.title} · overdue`,
      href: `/s/${slug}/deals/${d.id}`,
      cta: 'Open',
      urgent: true,
    });
  }
  if (overdueNextActions.length > visibleNextActions.length) {
    const rest = overdueNextActions.length - visibleNextActions.length;
    todayItems.push({
      key: 'next-actions-more',
      icon: ArrowRight,
      iconBg: 'bg-red-50 dark:bg-red-500/10',
      iconColor: 'text-red-600 dark:text-red-400',
      title: `${rest} more overdue deal ${rest === 1 ? 'action' : 'actions'}`,
      sub: 'Open the deals board to triage.',
      href: `/s/${slug}/deals`,
      cta: 'Open',
      urgent: true,
    });
  }
  for (const t of todayTours.slice(0, 3)) {
    const d = new Date(t.startsAt);
    todayItems.push({
      key: `tour-${t.id}`,
      icon: CalendarDays,
      iconBg: 'bg-indigo-50 dark:bg-indigo-500/10',
      iconColor: 'text-indigo-600 dark:text-indigo-400',
      title: `Tour with ${t.guestName} today`,
      sub: `${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${t.propertyAddress ? ` · ${t.propertyAddress}` : ''}`,
      href: `/s/${slug}/tours`,
      cta: 'View',
    });
  }
  if (newLeadCount > 0) {
    todayItems.push({
      key: 'new-leads',
      icon: PhoneIncoming,
      iconBg: 'bg-brand-subtle dark:bg-brand/10',
      iconColor: 'text-brand',
      title: `${newLeadCount} new ${newLeadCount === 1 ? 'lead' : 'leads'} to review`,
      sub: 'Fresh applications came in through your intake link.',
      href: `/s/${slug}/leads`,
      cta: 'Review',
    });
  }
  if (pendingDraftCount > 0) {
    todayItems.push({
      key: 'drafts',
      icon: Sparkles,
      iconBg: 'bg-violet-50 dark:bg-violet-500/10',
      iconColor: 'text-violet-600 dark:text-violet-400',
      title: `${pendingDraftCount} AI ${pendingDraftCount === 1 ? 'draft' : 'drafts'} waiting for you`,
      sub: 'Review, edit, and send in one tap.',
      href: `/s/${slug}/agent`,
      cta: 'Review drafts',
    });
  }

  const quickTiles = [
    { icon: UserPlus,    label: 'Add Contact',    sub: `${contactCount} total`,                                          href: `/s/${slug}/contacts` },
    { icon: Briefcase,   label: 'Create Deal',    sub: `${dealCount} active`,                                            href: `/s/${slug}/deals` },
    { icon: CalendarDays,label: 'Schedule Tour',  sub: upcomingTourCount > 0 ? `${upcomingTourCount} upcoming` : 'None', href: `/s/${slug}/tours` },
    { icon: BarChart3,   label: 'Analytics',      sub: 'View insights',                                                  href: `/s/${slug}/analytics` },
  ];

  return (
    <div className="space-y-5 max-w-[1320px]">

      {/* ── 1. Hero ───────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-4 px-1">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/60 mb-1.5">
            {formatToday()}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {getGreeting()}, {firstName}.
          </h1>
        </div>
      </div>

      {/* ── 2. Today inbox ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-[0_1px_2px_0_rgba(0,0,0,0.03)]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Inbox size={14} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold">Today</h2>
            {todayItems.length > 0 && (
              <span className="text-[11px] text-muted-foreground">
                {todayItems.length} {todayItems.length === 1 ? 'thing' : 'things'} to do
              </span>
            )}
          </div>
        </div>

        {todayItems.length === 0 ? (
          <div className="flex items-center gap-3 px-5 py-5">
            <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center flex-shrink-0 text-emerald-600 dark:text-emerald-400 text-sm">✓</div>
            <div>
              <p className="text-sm font-medium">You&apos;re caught up.</p>
              <p className="text-xs text-muted-foreground mt-0.5">No follow-ups, tours, or new leads needing attention right now.</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {todayItems.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className="group flex items-center gap-3 px-5 py-3.5 hover:bg-muted/30 transition-colors"
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${item.iconBg}`}>
                  <item.icon size={16} className={item.iconColor} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground truncate">{item.title}</p>
                    {item.urgent && (
                      <span className="inline-flex text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 leading-none flex-shrink-0">
                        Overdue
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.sub}</p>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0">
                  {item.cta} <ArrowRight size={12} />
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── 3. Recent Applications ────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-[0_1px_2px_0_rgba(0,0,0,0.03)]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h2 className="text-sm font-semibold">Recent Applications</h2>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-[11px] text-muted-foreground">Connected Tools:</span>
            <Link href={`/s/${slug}/intake`} className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2.5 py-0.5 bg-brand-subtle text-brand border border-brand/20 hover:bg-brand-subtle/70 transition-colors">
              Intake Form
            </Link>
            <Link href={`/s/${slug}/intake`} className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted transition-colors" title="Intake settings">
              <Settings size={13} />
            </Link>
          </div>
        </div>

        {recentLeads.length === 0 ? (
          <div className="flex items-center gap-4 px-5 py-5">
            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
              <PhoneIncoming size={16} className="text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">No applications yet</p>
              <p className="text-xs text-muted-foreground">Share your intake link and applications will appear here.</p>
            </div>
            <a href={`/apply/${space.slug}`} target="_blank" rel="noreferrer" className="hidden sm:inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground flex-shrink-0 transition-colors">
              Preview <ExternalLink size={11} />
            </a>
          </div>
        ) : (
          <>
            <div className="hidden sm:grid grid-cols-[140px_1fr_110px_72px] px-5 py-2 border-b border-border bg-muted/30">
              {['Source', 'Name', 'Score', 'Time'].map((h, i) => (
                <span key={h} className={`text-[10px] font-semibold uppercase tracking-wider text-muted-foreground ${i === 3 ? 'text-right' : ''}`}>{h}</span>
              ))}
            </div>
            <div className="divide-y divide-border">
              {recentLeads.map((lead) => {
                const isNew = lead.tags.includes('new-lead');
                const scoreBadge =
                  lead.scoreLabel === 'hot'  ? { label: 'Hot',  cls: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400' } :
                  lead.scoreLabel === 'warm' ? { label: 'Warm', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' } :
                  lead.scoreLabel === 'cold' ? { label: 'Cold', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300' } : null;
                return (
                  <Link key={lead.id} href={`/s/${slug}/leads`} className="flex sm:grid sm:grid-cols-[140px_1fr_110px_72px] items-center gap-3 sm:gap-0 px-5 py-3 hover:bg-muted/30 transition-colors">
                    <div className="hidden sm:block">
                      <span className="inline-flex items-center text-[11px] font-semibold rounded-full px-2.5 py-0.5 bg-brand-subtle text-brand border border-brand/20">Intake Form</span>
                    </div>
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 sm:flex-none">
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground flex-shrink-0">
                        {lead.name?.split(' ').map((n: string) => n?.[0]).join('').toUpperCase().slice(0, 2) || '??'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-medium truncate">{lead.name}</span>
                          {isNew && <span className="inline-flex text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-brand-subtle text-brand flex-shrink-0 leading-none">New</span>}
                        </div>
                        {lead.phone && <p className="text-[11px] text-muted-foreground">{lead.phone}</p>}
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      {lead.scoringStatus === 'scored' && lead.leadScore != null && scoreBadge ? (
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold rounded px-1.5 py-0.5 leading-none ${scoreBadge.cls}`}>
                          {Math.round(lead.leadScore)} <span className="font-medium opacity-80">{scoreBadge.label}</span>
                        </span>
                      ) : lead.scoringStatus === 'pending' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60 italic">
                          <span className="w-2.5 h-2.5 rounded-full border-2 border-muted-foreground/30 border-t-foreground animate-spin" />scoring
                        </span>
                      ) : null}
                    </div>
                    <div className="hidden sm:flex justify-end flex-shrink-0">
                      <span className="text-[11px] text-muted-foreground tabular-nums">{timeAgo(new Date(lead.createdAt))}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
            <div className="border-t border-border px-5 py-2.5">
              <Link href={`/s/${slug}/leads`} className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                View all leads <ArrowRight size={11} />
              </Link>
            </div>
          </>
        )}
      </div>

      {/* ── 4. Follow-up Queue (conditional) ─────────────────────────── */}
      {followUpContacts.length > 0 && (
        <FollowUpWidget slug={slug} contacts={followUpContacts} />
      )}

      {/* ── 5. Pipeline ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-[0_1px_2px_0_rgba(0,0,0,0.03)]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h2 className="text-sm font-semibold">Pipeline</h2>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-[11px] text-muted-foreground">Connected Tools:</span>
            <Link href={`/s/${slug}/deals`} className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2.5 py-0.5 bg-muted text-muted-foreground border border-border hover:bg-muted/70 transition-colors">
              Deals Board
            </Link>
            <Link href={`/s/${slug}/settings`} className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted transition-colors" title="Pipeline settings">
              <Settings size={13} />
            </Link>
          </div>
        </div>

        {/* Quick tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-border">
          {quickTiles.map((tile, i) => (
            <Link
              key={tile.label}
              href={tile.href}
              className={`group flex flex-col gap-2.5 p-4 hover:bg-muted/30 transition-colors${i > 0 ? ' border-l border-border' : ''}${i >= 2 ? ' border-t border-border sm:border-t-0' : ''}`}
            >
              <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center group-hover:bg-muted/60 transition-colors">
                <tile.icon size={15} className="text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">{tile.label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{tile.sub}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* Deals table */}
        {dealsByStage.length === 0 ? (
          <div className="flex items-center gap-3 px-5 py-4">
            <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
              <Briefcase size={14} className="text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">No active deals</p>
              <p className="text-xs text-muted-foreground">Convert a lead or create a deal to get started.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="hidden sm:grid grid-cols-[2fr_1fr_3fr_100px_88px] px-5 py-2 border-b border-border bg-muted/30">
              {[['Stage', ''], ['Deals', ''], ['Progress', ''], ['Value', 'text-right'], ['', '']].map(([h, cls], i) => (
                <span key={i} className={`text-[10px] font-semibold uppercase tracking-wider text-muted-foreground ${cls}`}>{h}</span>
              ))}
            </div>
            <div className="divide-y divide-border">
              {dealsByStage.map((stage) => (
                <div key={stage.id} className="flex sm:grid sm:grid-cols-[2fr_1fr_3fr_100px_88px] items-center gap-3 sm:gap-0 px-5 py-3.5 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2 min-w-0 flex-1 sm:flex-none">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
                    <span className="text-sm text-foreground truncate">{stage.name}</span>
                  </div>
                  <span className="hidden sm:block text-sm text-muted-foreground">{stage.count}</span>
                  <div className="hidden sm:block pr-6">
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(6, (stage.count / totalDealsByStage) * 100)}%`, backgroundColor: stage.color }} />
                    </div>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-right text-foreground flex-shrink-0">{formatCurrency(stage.value)}</span>
                  <div className="hidden sm:flex justify-end flex-shrink-0">
                    <Link href={`/s/${slug}/deals`} className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors">
                      See Deals <ArrowRight size={10} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-border px-5 py-2.5 flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground">Total pipeline</span>
              <span className="text-sm font-semibold tabular-nums">{formatCurrency(totalValue)}</span>
            </div>
          </>
        )}
      </div>

      {/* ── 6. Lead Overview + Upcoming Tours ────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Lead metrics */}
        <div className="lg:col-span-3 rounded-xl border border-border bg-card overflow-hidden shadow-[0_1px_2px_0_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h2 className="text-sm font-semibold">Lead Overview</h2>
            <Link href={`/s/${slug}/analytics`} className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2.5 py-0.5 bg-muted text-muted-foreground border border-border hover:bg-muted/70 transition-colors">
              Analytics
            </Link>
          </div>
          <div className="grid grid-cols-2 divide-x divide-border">
            <div className="p-5">
              <p className="text-[11px] text-muted-foreground mb-1.5">Total Leads</p>
              <p className="text-3xl font-semibold tabular-nums tracking-tight">{totalLeads}</p>
              <div className="flex items-center flex-wrap gap-2 mt-2.5">
                {newLeadCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 bg-brand-subtle text-brand border border-brand/20">+{newLeadCount} new</span>
                )}
                <span className="text-[11px] text-muted-foreground">Rental: {rentalLeadCount} · Buyer: {buyerLeadCount}</span>
              </div>
            </div>
            <div className="p-5">
              <p className="text-[11px] text-muted-foreground mb-1.5">Pipeline Value</p>
              <p className="text-3xl font-semibold tabular-nums tracking-tight">{formatCurrency(totalValue)}</p>
              <p className="text-[11px] text-muted-foreground mt-2.5">
                {dealCount === 0 ? 'No active deals' : `across ${dealCount} active deal${dealCount === 1 ? '' : 's'}`}
              </p>
            </div>
          </div>
        </div>

        {/* Upcoming tours */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card overflow-hidden shadow-[0_1px_2px_0_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h2 className="text-sm font-semibold">Upcoming Tours</h2>
            <Link href={`/s/${slug}/tours`} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5">
              All tours <ArrowRight size={10} />
            </Link>
          </div>
          {upcomingTours.length === 0 ? (
            <div className="flex items-center gap-3 px-5 py-5">
              <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                <CalendarDays size={14} className="text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">No tours scheduled</p>
                <p className="text-xs text-muted-foreground">Share your booking link to get started.</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {upcomingTours.map((tour: any) => {
                const d = new Date(tour.startsAt);
                const isToday = d.toDateString() === new Date().toDateString();
                return (
                  <Link key={tour.id} href={`/s/${slug}/tours`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors">
                    <div className="w-9 h-9 rounded-lg bg-muted border border-border flex flex-col items-center justify-center flex-shrink-0">
                      <span className="text-[9px] font-semibold text-muted-foreground uppercase leading-none">{d.toLocaleDateString([], { month: 'short' })}</span>
                      <span className="text-[13px] font-bold leading-tight">{d.getDate()}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium truncate">{tour.guestName}</p>
                        {isToday && <span className="inline-flex text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-brand-subtle text-brand leading-none flex-shrink-0">Today</span>}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5 text-[11px] text-muted-foreground">
                        <Clock size={9} className="flex-shrink-0" />
                        <span>{d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                        {tour.propertyAddress && (<><MapPin size={9} className="flex-shrink-0 ml-0.5" /><span className="truncate">{tour.propertyAddress}</span></>)}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── 7. Agent Insights ────────────────────────────────────────── */}
      <AgentInsightsWidget slug={slug} />

      {/* ── 8. Utilities ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-[0_1px_2px_0_rgba(0,0,0,0.03)]">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">Your Links</h2>
        </div>
        <div className="divide-y divide-border">
          <ToolRow icon={Link2} title="Intake link" description="Receive applications" url={intakeUrl} previewHref={`/apply/${space.slug}`} />
          <ToolRow icon={CalendarDays} title="Tour booking" description="Let prospects schedule" url={bookingUrl} previewHref={`/book/${space.slug}`} />
        </div>
      </div>

      {/* ── 9. Onboarding Checklist ───────────────────────────────────── */}
      <div className="order-last">
        <OnboardingChecklist slug={slug} hasLeads={totalLeads > 0} hasContacts={contactCount > 0} hasTours={upcomingTourCount > 0} hasDeals={dealCount > 0} />
      </div>

    </div>
  );
}

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
    <div className="flex items-center gap-2.5 px-4 py-3">
      <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
        <Icon size={13} className="text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-semibold leading-tight">{title}</p>
          <span className="text-[10px] text-muted-foreground/70">· {description}</span>
        </div>
        <code className="block mt-0 text-[10px] font-mono text-muted-foreground truncate">{url}</code>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <CopyLinkButton url={url} />
        <a href={previewHref} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-border bg-card hover:bg-muted transition-colors" aria-label={`Preview ${title}`}>
          <ExternalLink size={12} />
        </a>
      </div>
    </div>
  );
}
