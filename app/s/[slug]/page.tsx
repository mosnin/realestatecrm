import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import {
  Bot,
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
  Inbox,
  Play,
} from 'lucide-react';
import type { Metadata } from 'next';
import { buildIntakeUrl } from '@/lib/intake';
import { CopyLinkButton } from './copy-link-button';
import { timeAgo, formatCurrency } from '@/lib/formatting';
import { FollowUpWidget, type FollowUpContact } from '@/components/dashboard/follow-up-widget';
import { OnboardingChecklist } from '@/components/dashboard/onboarding-checklist';
import { ChippiTerminal } from '@/components/agent/chippi-terminal';
import { ChippiCommandBar } from '@/components/agent/chippi-command-bar';
import { logger } from '@/lib/logger';

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
  let buyerLeadCount = 0, rentalLeadCount = 0;
  let pendingDraftCount = 0;
  let deals: { value: number | null; stageId: string }[] = [];
  let stages: { id: string; name: string; color: string; position: number; spaceId: string }[] = [];
  let recentLeads: { id: string; name: string; phone: string | null; budget: number | null; preferences: string | null; createdAt: Date; tags: string[]; leadScore: number | null; scoreLabel: string | null; scoringStatus: string | null }[] = [];
  let followUpContacts: FollowUpContact[] = [];
  let upcomingTours: { id: string; guestName: string; startsAt: string; endsAt: string; propertyAddress: string | null; status: string }[] = [];
  let overdueNextActions: { id: string; title: string; nextAction: string; nextActionDueAt: string }[] = [];
  let overdueChecklistItems: { id: string; label: string; dueAt: string; dealId: string; dealTitle: string }[] = [];
  let agentEnabled = false;
  let heartbeatMinutes = 15;
  let priorityItems: { contactId: string; name: string; reason: string; leadScore: number; leadType: string | null; hasEmail: boolean; hasPhone: boolean }[] = [];

  try {
    [contactCount, dealCount, deals, stages, recentLeads, newLeadCount, totalLeads, followUpDue, followUpContacts, upcomingTourCount, upcomingTours, buyerLeadCount, rentalLeadCount, pendingDraftCount, overdueNextActions, overdueChecklistItems] =
      await Promise.all([
        supabase.from('Contact').select('*', { count: 'exact', head: true }).eq('spaceId', space.id).is('brokerageId', null).then(r => r.count ?? 0),
        supabase.from('Deal').select('*', { count: 'exact', head: true }).eq('spaceId', space.id).then(r => r.count ?? 0),
        supabase.from('Deal').select('value, stageId').eq('spaceId', space.id).then(r => (r.data ?? []) as { value: number | null; stageId: string }[]),
        supabase.from('DealStage').select('*').eq('spaceId', space.id).order('position', { ascending: true }).then(r => (r.data ?? []) as { id: string; name: string; color: string; position: number; spaceId: string }[]),
        supabase.from('Contact').select('id, name, phone, budget, preferences, createdAt, tags, leadScore, scoreLabel, scoringStatus').eq('spaceId', space.id).is('brokerageId', null).contains('tags', ['application-link']).order('createdAt', { ascending: false }).limit(5).then(r => (r.data ?? []) as { id: string; name: string; phone: string | null; budget: number | null; preferences: string | null; createdAt: Date; tags: string[]; leadScore: number | null; scoreLabel: string | null; scoringStatus: string | null }[]),
        supabase.from('Contact').select('*', { count: 'exact', head: true }).eq('spaceId', space.id).is('brokerageId', null).contains('tags', ['new-lead']).then(r => r.count ?? 0),
        supabase.from('Contact').select('*', { count: 'exact', head: true }).eq('spaceId', space.id).is('brokerageId', null).contains('tags', ['application-link']).then(r => r.count ?? 0),
        supabase.from('Contact').select('*', { count: 'exact', head: true }).eq('spaceId', space.id).is('brokerageId', null).lte('followUpAt', new Date().toISOString()).then(r => r.count ?? 0),
        supabase.from('Contact').select('id, name, phone, email, type, followUpAt, leadScore, scoreLabel').eq('spaceId', space.id).is('brokerageId', null).not('followUpAt', 'is', null).lte('followUpAt', new Date().toISOString()).order('followUpAt', { ascending: true }).limit(8).then(r => (r.data ?? []) as FollowUpContact[]),
        supabase.from('Tour').select('*', { count: 'exact', head: true }).eq('spaceId', space.id).gte('startsAt', new Date().toISOString()).in('status', ['scheduled', 'confirmed']).then(r => r.count ?? 0),
        supabase.from('Tour').select('id, guestName, startsAt, endsAt, propertyAddress, status').eq('spaceId', space.id).gte('startsAt', new Date().toISOString()).in('status', ['scheduled', 'confirmed']).order('startsAt', { ascending: true }).limit(4).then(r => (r.data ?? []) as { id: string; guestName: string; startsAt: string; endsAt: string; propertyAddress: string | null; status: string }[]),
        supabase.from('Contact').select('*', { count: 'exact', head: true }).eq('spaceId', space.id).is('brokerageId', null).eq('leadType', 'buyer').contains('tags', ['application-link']).then(r => r.count ?? 0),
        supabase.from('Contact').select('*', { count: 'exact', head: true }).eq('spaceId', space.id).is('brokerageId', null).eq('leadType', 'rental').contains('tags', ['application-link']).then(r => r.count ?? 0),
        supabase.from('AgentDraft').select('*', { count: 'exact', head: true }).eq('spaceId', space.id).eq('status', 'pending').then(r => r.count ?? 0),
        supabase.from('Deal').select('id, title, nextAction, nextActionDueAt').eq('spaceId', space.id).eq('status', 'active').not('nextAction', 'is', null).not('nextActionDueAt', 'is', null).lte('nextActionDueAt', new Date().toISOString()).order('nextActionDueAt', { ascending: true }).limit(5).then(r => (r.data ?? []) as { id: string; title: string; nextAction: string; nextActionDueAt: string }[]),
        supabase.from('DealChecklistItem').select('id, label, dueAt, dealId, Deal(title, status)').eq('spaceId', space.id).is('completedAt', null).not('dueAt', 'is', null).lte('dueAt', new Date().toISOString()).order('dueAt', { ascending: true }).limit(10).then((r) => ((r.data ?? []) as unknown as { id: string; label: string; dueAt: string; dealId: string; Deal: { title: string; status: string } | { title: string; status: string }[] | null }[]).filter((row) => { const deal = Array.isArray(row.Deal) ? row.Deal[0] : row.Deal; return deal?.status === 'active'; }).slice(0, 5).map((row) => { const deal = Array.isArray(row.Deal) ? row.Deal[0] : row.Deal; return { id: row.id, label: row.label, dueAt: row.dueAt, dealId: row.dealId, dealTitle: deal?.title ?? 'Deal' }; })),
      ]);

    // Fetch agent settings + priority list in parallel
    const [agentSettingsRes, priorityMemRes] = await Promise.all([
      supabase.from('AgentSettings').select('enabled, heartbeatIntervalMinutes').eq('spaceId', space.id).maybeSingle(),
      supabase.from('AgentMemory').select('content').eq('spaceId', space.id).like('content', 'PRIORITY_LIST:%').order('updatedAt', { ascending: false }).limit(1).maybeSingle(),
    ]);

    if (agentSettingsRes.data) {
      agentEnabled = agentSettingsRes.data.enabled ?? false;
      heartbeatMinutes = agentSettingsRes.data.heartbeatIntervalMinutes ?? 15;
    }

    if (priorityMemRes.data?.content) {
      try {
        const json = priorityMemRes.data.content.replace(/^PRIORITY_LIST:/, '');
        const parsed = JSON.parse(json);
        priorityItems = parsed.items ?? [];
      } catch { /* ignore parse errors */ }
    }
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
  const todayTours = upcomingTours.filter(t =>
    new Date(t.startsAt).toDateString() === new Date().toDateString()
  );

  // Urgent items that need attention right now
  const urgentCount = followUpDue + overdueNextActions.length + overdueChecklistItems.length + todayTours.length + newLeadCount + pendingDraftCount;

  return (
    <div className="space-y-5 max-w-[1320px]">

      {/* ── 1. Chippi Hero ────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-orange-200 dark:border-orange-900/40 bg-gradient-to-br from-orange-50 via-orange-50/60 to-transparent dark:from-orange-950/25 dark:via-orange-950/10 dark:to-transparent p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-5">
          <div className="flex items-center gap-4">
            <div className="relative flex-shrink-0">
              <div className="w-12 h-12 rounded-xl bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/30">
                <Bot size={22} className="text-white" />
              </div>
              {agentEnabled && (
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-orange-500 border-2 border-background animate-pulse" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-lg font-bold leading-tight">Chippi</h1>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${agentEnabled ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400' : 'bg-muted text-muted-foreground'}`}>
                  {agentEnabled ? 'ACTIVE' : 'DISABLED'}
                </span>
                {agentEnabled && pendingDraftCount > 0 && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange-500 text-white">
                    {pendingDraftCount} draft{pendingDraftCount !== 1 ? 's' : ''} ready
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {agentEnabled
                  ? `Autonomous outreach · runs every ${heartbeatMinutes} min`
                  : 'Enable in settings to activate autonomous outreach'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {pendingDraftCount > 0 && (
              <Link
                href={`/s/${slug}/agent`}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors shadow-sm shadow-orange-500/20"
              >
                <Inbox size={14} />
                Review {pendingDraftCount} draft{pendingDraftCount !== 1 ? 's' : ''}
              </Link>
            )}
            <Link
              href={`/s/${slug}/agent`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-orange-200 dark:border-orange-900/40 text-sm text-orange-700 dark:text-orange-400 hover:bg-orange-100/60 dark:hover:bg-orange-950/30 transition-colors"
            >
              <Play size={13} />
              Open workspace
            </Link>
            <Link
              href={`/s/${slug}/agent?tab=settings`}
              className="w-9 h-9 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
              title="Agent settings"
            >
              <Settings size={14} />
            </Link>
          </div>
        </div>

        {/* Two-column: Terminal + Priority list */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          {/* Left: Live terminal */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-orange-600/70 dark:text-orange-500/60 mb-2.5">Last Run</p>
            <ChippiTerminal compact />
          </div>

          {/* Right: Today's focus */}
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-orange-600/70 dark:text-orange-500/60">Today&apos;s Focus</p>
              <span className="text-[10px] text-orange-500 bg-orange-500/10 px-1.5 py-0.5 rounded-full font-medium">Chippi ranked</span>
            </div>
            {priorityItems.length > 0 ? (
              <div className="space-y-1.5">
                {priorityItems.slice(0, 5).map((item, i) => (
                  <Link
                    key={item.contactId}
                    href={`/s/${slug}/contacts/${item.contactId}`}
                    className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/60 dark:bg-black/20 border border-orange-100 dark:border-orange-900/30 hover:border-orange-300 dark:hover:border-orange-800/50 hover:bg-white/80 dark:hover:bg-black/30 transition-all group"
                  >
                    <span className="text-[10px] font-mono text-orange-400/60 mt-0.5 w-3 flex-shrink-0">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">{item.name}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{item.reason}</p>
                    </div>
                    {item.leadScore >= 70 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400 font-semibold flex-shrink-0">{item.leadScore}</span>
                    )}
                    <ChevronRight size={11} className="text-orange-300 group-hover:text-orange-500 transition-colors flex-shrink-0 mt-0.5" />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-xl bg-white/40 dark:bg-black/15 border border-orange-100 dark:border-orange-900/30 p-4 text-center">
                <Bot size={18} className="mx-auto mb-2 text-orange-300" />
                <p className="text-xs text-muted-foreground">Run Chippi to generate your focus list</p>
                <Link href={`/s/${slug}/agent`} className="mt-2 inline-flex text-[11px] text-orange-600 dark:text-orange-400 hover:underline">
                  Go to workspace →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 2. Urgent items needing attention ────────────────────────── */}
      {urgentCount > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Inbox size={14} className="text-muted-foreground" />
              <h2 className="text-sm font-semibold">Needs attention</h2>
              <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{urgentCount}</span>
            </div>
          </div>
          <div className="divide-y divide-border">
            {followUpDue > 0 && (
              <UrgentRow
                icon={Clock} iconBg="bg-red-50 dark:bg-red-500/10" iconColor="text-red-600 dark:text-red-400"
                title={`${followUpDue} follow-up${followUpDue === 1 ? '' : 's'} overdue`}
                sub="These people were expecting to hear from you."
                href={`/s/${slug}/follow-ups`} cta="Open" urgent
              />
            )}
            {overdueNextActions.slice(0, 3).map(d => (
              <UrgentRow key={`next-${d.id}`}
                icon={ArrowRight} iconBg="bg-red-50 dark:bg-red-500/10" iconColor="text-red-600 dark:text-red-400"
                title={d.nextAction} sub={`${d.title} · overdue`}
                href={`/s/${slug}/deals/${d.id}`} cta="Open" urgent
              />
            ))}
            {overdueChecklistItems.slice(0, 3).map(item => {
              const days = Math.max(0, Math.round((Date.now() - new Date(item.dueAt).getTime()) / 86_400_000));
              return (
                <UrgentRow key={`checklist-${item.id}`}
                  icon={Clock} iconBg="bg-red-50 dark:bg-red-500/10" iconColor="text-red-600 dark:text-red-400"
                  title={item.label} sub={`${item.dealTitle} · ${days === 0 ? 'due today' : `${days}d past`}`}
                  href={`/s/${slug}/deals/${item.dealId}?tab=checklist`} cta="Open" urgent
                />
              );
            })}
            {todayTours.slice(0, 3).map(t => {
              const d = new Date(t.startsAt);
              return (
                <UrgentRow key={`tour-${t.id}`}
                  icon={CalendarDays} iconBg="bg-indigo-50 dark:bg-indigo-500/10" iconColor="text-indigo-600 dark:text-indigo-400"
                  title={`Tour with ${t.guestName} today`}
                  sub={`${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${t.propertyAddress ? ` · ${t.propertyAddress}` : ''}`}
                  href={`/s/${slug}/tours`} cta="View"
                />
              );
            })}
            {newLeadCount > 0 && (
              <UrgentRow
                icon={PhoneIncoming} iconBg="bg-brand-subtle dark:bg-brand/10" iconColor="text-brand"
                title={`${newLeadCount} new ${newLeadCount === 1 ? 'lead' : 'leads'} to review`}
                sub="Fresh applications came in through your intake link."
                href={`/s/${slug}/leads`} cta="Review"
              />
            )}
            {pendingDraftCount > 0 && (
              <UrgentRow
                icon={Bot} iconBg="bg-orange-50 dark:bg-orange-500/10" iconColor="text-orange-500"
                title={`${pendingDraftCount} Chippi draft${pendingDraftCount !== 1 ? 's' : ''} awaiting your review`}
                sub="Approve, edit, or dismiss — Chippi is waiting."
                href={`/s/${slug}/agent`} cta="Review"
              />
            )}
          </div>
        </div>
      )}

      {/* ── 3. Follow-up Queue ────────────────────────────────────────── */}
      {followUpContacts.length > 0 && (
        <FollowUpWidget slug={slug} contacts={followUpContacts} />
      )}

      {/* ── 4. Pipeline ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h2 className="text-sm font-semibold">Pipeline</h2>
          <div className="flex items-center gap-2">
            <Link href={`/s/${slug}/deals`} className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2.5 py-0.5 bg-muted text-muted-foreground border border-border hover:bg-muted/70 transition-colors">
              Deals Board
            </Link>
            <Link href={`/s/${slug}/settings`} className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted transition-colors">
              <Settings size={13} />
            </Link>
          </div>
        </div>

        {/* Quick tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-border">
          {[
            { icon: UserPlus,    label: 'Add Contact',    sub: `${contactCount} total`,                                          href: `/s/${slug}/contacts` },
            { icon: Briefcase,   label: 'Create Deal',    sub: `${dealCount} active`,                                            href: `/s/${slug}/deals` },
            { icon: CalendarDays,label: 'Schedule Tour',  sub: upcomingTourCount > 0 ? `${upcomingTourCount} upcoming` : 'None', href: `/s/${slug}/tours` },
            { icon: BarChart3,   label: 'Analytics',      sub: 'View insights',                                                  href: `/s/${slug}/analytics` },
          ].map((tile, i) => (
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
              {['Stage', 'Deals', 'Progress', 'Value', ''].map((h, i) => (
                <span key={i} className={`text-[10px] font-semibold uppercase tracking-wider text-muted-foreground ${i === 3 ? 'text-right' : ''}`}>{h}</span>
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

      {/* ── 5. Lead Overview + Upcoming Tours ────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 rounded-xl border border-border bg-card overflow-hidden">
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
                {newLeadCount > 0 && <span className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 bg-brand-subtle text-brand border border-brand/20">+{newLeadCount} new</span>}
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
          {/* Recent applications */}
          {recentLeads.length > 0 && (
            <>
              <div className="hidden sm:grid grid-cols-[1fr_110px_72px] px-5 py-2 border-t border-b border-border bg-muted/30">
                {['Recent Applications', 'Score', 'Time'].map((h, i) => (
                  <span key={h} className={`text-[10px] font-semibold uppercase tracking-wider text-muted-foreground ${i === 2 ? 'text-right' : ''}`}>{h}</span>
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
                    <Link key={lead.id} href={`/s/${slug}/leads`} className="flex sm:grid sm:grid-cols-[1fr_110px_72px] items-center gap-3 sm:gap-0 px-5 py-3 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
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
                        {lead.scoringStatus === 'scored' && lead.leadScore != null && scoreBadge && (
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold rounded px-1.5 py-0.5 leading-none ${scoreBadge.cls}`}>
                            {Math.round(lead.leadScore)} <span className="font-medium opacity-80">{scoreBadge.label}</span>
                          </span>
                        )}
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

        {/* Upcoming tours */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card overflow-hidden">
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
              {upcomingTours.map((tour) => {
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

      {/* ── 6. Your Links ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">Your Links</h2>
        </div>
        <div className="divide-y divide-border">
          <ToolRow icon={Link2} title="Intake link" description="Receive applications" url={intakeUrl} previewHref={`/apply/${space.slug}`} />
          <ToolRow icon={CalendarDays} title="Tour booking" description="Let prospects schedule" url={bookingUrl} previewHref={`/book/${space.slug}`} />
        </div>
      </div>

      {/* ── 7. Onboarding ─────────────────────────────────────────────── */}
      <div className="order-last">
        <OnboardingChecklist slug={slug} hasLeads={totalLeads > 0} hasContacts={contactCount > 0} hasTours={upcomingTourCount > 0} hasDeals={dealCount > 0} />
      </div>

      {/* ── 8. Chippi Command Bar ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-orange-200 dark:border-orange-900/40 overflow-hidden shadow-lg shadow-orange-500/5">
        <ChippiCommandBar slug={slug} />
      </div>

    </div>
  );
}

function UrgentRow({
  icon: Icon, iconBg, iconColor, title, sub, href, cta, urgent,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  iconBg: string; iconColor: string;
  title: string; sub: string; href: string; cta: string; urgent?: boolean;
}) {
  return (
    <Link href={href} className="group flex items-center gap-3 px-5 py-3.5 hover:bg-muted/30 transition-colors">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        <Icon size={16} className={iconColor} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground truncate">{title}</p>
          {urgent && (
            <span className="inline-flex text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 leading-none flex-shrink-0">
              Overdue
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>
      </div>
      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0">
        {cta} <ArrowRight size={12} />
      </span>
    </Link>
  );
}

function ToolRow({
  icon: Icon, title, description, url, previewHref,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string; description: string; url: string; previewHref: string;
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
