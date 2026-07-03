import { getBrokerContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { formatCompact, pluralize } from '@/lib/formatting';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Calendar,
  Mail as MailIcon,
  Phone,
  BookOpen,
  ArrowUpRight,
} from 'lucide-react';
import type { Metadata } from 'next';
import { cn } from '@/lib/utils';
import {
  SECTION_LABEL,
  STAT_NUMBER_COMPACT,
  TITLE_FONT,
  CHIPPI_PILL,
} from '@/lib/typography';

export const metadata: Metadata = { title: 'Realtor Detail — Teams' };

type Params = { params: Promise<{ userId: string }> };

export default async function RealtorDrilldownPage({ params }: Params) {
  const { userId } = await params;
  const ctx = await getBrokerContext();
  if (!ctx) redirect('/');

  // Verify membership
  const { data: membership } = await supabase
    .from('BrokerageMembership')
    .select('id, role, createdAt')
    .eq('brokerageId', ctx.brokerage.id)
    .eq('userId', userId)
    .maybeSingle();

  if (!membership) redirect('/broker/realtors');

  // Get user + space
  const { data: user } = await supabase
    .from('User')
    .select('id, name, email, onboard')
    .eq('id', userId)
    .maybeSingle();

  if (!user) redirect('/broker/realtors');

  const { data: space } = await supabase
    .from('Space')
    .select('id, slug, name')
    .eq('ownerId', userId)
    .maybeSingle();

  // Fetch data in parallel — display rows are limited, but counts are separate
  const spaceId = space?.id;
  const nowIso = new Date().toISOString();
  const [contactsRes, dealsRes, stagesRes, contactCountRes, newLeadCountRes, hotLeadCountRes, dealCountRes, overdueCountRes] = await Promise.all([
    spaceId
      ? supabase
          .from('Contact')
          .select('id, name, email, phone, type, tags, leadScore, scoreLabel, followUpAt, createdAt')
          .eq('spaceId', spaceId)
          .order('createdAt', { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
    spaceId
      ? supabase
          .from('Deal')
          .select('id, title, value, status, stageId, closeDate, createdAt')
          .eq('spaceId', spaceId)
          .order('createdAt', { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
    spaceId
      ? supabase
          .from('DealStage')
          .select('id, name, color, position')
          .eq('spaceId', spaceId)
          .order('position', { ascending: true })
      : Promise.resolve({ data: [] }),
    // Accurate counts (head-only queries)
    spaceId
      ? supabase.from('Contact').select('*', { count: 'exact', head: true }).eq('spaceId', spaceId)
      : Promise.resolve({ count: 0 }),
    spaceId
      ? supabase.from('Contact').select('*', { count: 'exact', head: true }).eq('spaceId', spaceId).contains('tags', ['new-lead'])
      : Promise.resolve({ count: 0 }),
    spaceId
      ? supabase.from('Contact').select('*', { count: 'exact', head: true }).eq('spaceId', spaceId).eq('scoreLabel', 'hot')
      : Promise.resolve({ count: 0 }),
    spaceId
      ? supabase.from('Deal').select('id, value, status').eq('spaceId', spaceId).limit(10000)
      : Promise.resolve({ data: [] }),
    // Overdue follow-ups — the one "needs attention" signal a broker scans for.
    spaceId
      ? supabase
          .from('Contact')
          .select('*', { count: 'exact', head: true })
          .eq('spaceId', spaceId)
          .not('followUpAt', 'is', null)
          .lte('followUpAt', nowIso)
      : Promise.resolve({ count: 0 }),
  ]);

  const contacts = (contactsRes.data ?? []) as Array<{
    id: string; name: string; email: string | null; phone: string | null;
    type: string; tags: string[]; leadScore: number | null;
    scoreLabel: string | null; followUpAt: string | null; createdAt: string;
  }>;

  const deals = (dealsRes.data ?? []) as Array<{
    id: string; title: string; value: number | null; status: string;
    stageId: string; closeDate: string | null; createdAt: string;
  }>;

  const stages = (stagesRes.data ?? []) as Array<{
    id: string; name: string; color: string; position: number;
  }>;

  const stageMap = Object.fromEntries(stages.map((s) => [s.id, s]));

  // Stats — use accurate counts, not the display-limited rows
  const allDeals = (dealCountRes.data ?? []) as Array<{ id: string; value: number | null; status: string }>;
  const totalContacts = contactCountRes.count ?? 0;
  const newLeads = newLeadCountRes.count ?? 0;
  const hotLeads = hotLeadCountRes.count ?? 0;
  const totalDeals = allDeals.length;
  const activeDeals = allDeals.filter((d) => d.status === 'active').length;
  const pipelineValue = allDeals.filter((d) => d.status === 'active').reduce((sum, d) => sum + (d.value ?? 0), 0);
  const wonDeals = allDeals.filter((d) => d.status === 'won').length;
  const wonValue = allDeals.filter((d) => d.status === 'won').reduce((sum, d) => sum + (d.value ?? 0), 0);
  const overdueFollowUps = overdueCountRes.count ?? 0;
  // Lead-to-win conversion — the same metric the brokerage analytics ranks on,
  // shown here so a realtor's page carries one quality number, not just volume.
  const conversionPct = totalContacts > 0 ? Math.round((wonDeals / totalContacts) * 100) : null;

  const displayName = user.name ?? user.email ?? 'this realtor';
  const roleLabel = membership.role === 'broker_owner' ? 'Owner' : membership.role === 'broker_admin' ? 'Admin' : 'Realtor';
  const joinedAt = new Date(membership.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const initials = (user.name ?? user.email ?? '?').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);

  // Coach prefill — drops the broker into Chippi with this realtor's snapshot,
  // mirroring the Realtors-list "Coach" affordance so the two surfaces agree.
  const coachSummary = (() => {
    const bits: string[] = [];
    if (overdueFollowUps > 0) bits.push(`${overdueFollowUps} overdue ${pluralize(overdueFollowUps, 'follow-up')}`);
    if (newLeads > 0) bits.push(`${newLeads} new ${pluralize(newLeads, 'lead')}`);
    if (activeDeals > 0) bits.push(`${activeDeals} active ${pluralize(activeDeals, 'deal')} worth ${formatCompact(pipelineValue)}`);
    if (wonDeals > 0) bits.push(`${wonDeals} won`);
    return bits.length > 0 ? bits.join(', ') : 'quiet, nothing notable yet';
  })();
  const coachHref = `/broker?prompt=${encodeURIComponent(
    `Help me coach ${displayName}. Here's what I'm seeing: ${coachSummary}. Draft a 1:1 agenda and a nudge I can send.`,
  )}`;
  const auditHref = `/broker?prompt=${encodeURIComponent(
    `Audit ${displayName}'s pipeline. ${activeDeals} active ${activeDeals === 1 ? 'deal' : 'deals'} worth ${formatCompact(pipelineValue)}. Which deals are stuck or need attention, and what should they do next?`,
  )}`;

  const scoreBadge = (label: string | null) => {
    if (label === 'hot') return 'text-foreground bg-foreground/[0.06]';
    if (label === 'warm') return 'text-muted-foreground bg-muted';
    return 'text-muted-foreground bg-muted';
  };

  // Secondary stats — the volume context. Pipeline + Won are pulled out above
  // as the two focal numbers (money is the loudest signal), so this strip
  // carries the funnel counts and the quality read.
  const stats: Array<{ label: string; value: string | number }> = [
    { label: 'People', value: totalContacts },
    { label: 'New people', value: newLeads },
    { label: 'Hot people', value: hotLeads },
    { label: 'Active deals', value: activeDeals },
    { label: 'Deals won', value: wonDeals },
    { label: 'Lead to win', value: conversionPct != null ? `${conversionPct}%` : '—' },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Back link */}
      <Link
        href="/broker/realtors"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={14} /> Back to realtors
      </Link>

      {/* Profile header — identity on the left, the two real actions on the
          right. A broker lands here to DO something (coach, or look at the
          live workspace), so the page can't dead-end at a back link. */}
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-full bg-foreground/[0.06] text-foreground/70 flex items-center justify-center text-lg font-semibold flex-shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-3xl tracking-tight text-foreground" style={TITLE_FONT}>
              {user.name ?? 'No name'}
            </h1>
            {user.onboard ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2.5 py-0.5 text-foreground bg-foreground/[0.06]">
                <CheckCircle2 size={11} /> Active
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2.5 py-0.5 text-muted-foreground bg-muted">
                <AlertCircle size={11} /> Pending
              </span>
            )}
            <span className="text-xs font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5">
              {roleLabel}
            </span>
            {overdueFollowUps > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2.5 py-0.5 text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15">
                <AlertTriangle size={11} />
                {overdueFollowUps} overdue
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{user.email}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Joined {joinedAt}
            {space?.slug && <> · Workspace <span className="font-mono text-muted-foreground">/{space.slug}</span></>}
          </p>
        </div>

        {/* Actions */}
        <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
          {activeDeals > 0 && (
            <Link
              href={auditHref}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-border/70 text-sm font-medium text-foreground hover:bg-foreground/[0.04] transition-colors"
            >
              Audit pipeline
              <ArrowUpRight size={14} />
            </Link>
          )}
          <Link href={coachHref} className={CHIPPI_PILL}>
            <BookOpen size={14} />
            Coach with Chippi
          </Link>
        </div>
      </div>

      {/* Focal money — pipeline + won are the loudest signal a broker reads on
          a realtor, so they get the serif STAT scale and full width before the
          quieter count strip. */}
      <section className="grid grid-cols-2 gap-px rounded-xl overflow-hidden border border-border/60 bg-border/60">
        <div className="bg-background px-4 py-4">
          <p className={SECTION_LABEL}>Active pipeline</p>
          <p className="text-[25px] leading-tight tracking-tight tabular-nums text-foreground mt-1" style={TITLE_FONT}>
            {formatCompact(pipelineValue)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
            {activeDeals} active {pluralize(activeDeals, 'deal')}
          </p>
        </div>
        <div className="bg-background px-4 py-4">
          <p className={SECTION_LABEL}>Closed (won)</p>
          <p className="text-[25px] leading-tight tracking-tight tabular-nums text-foreground mt-1" style={TITLE_FONT}>
            {formatCompact(wonValue)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
            {wonDeals} {pluralize(wonDeals, 'deal')} won
          </p>
        </div>
      </section>

      {/* Mobile actions — stacked below the money on small screens. */}
      <div className="flex sm:hidden items-center gap-2">
        {activeDeals > 0 && (
          <Link
            href={auditHref}
            className="inline-flex flex-1 items-center justify-center gap-1.5 h-9 px-3.5 rounded-full border border-border/70 text-sm font-medium text-foreground hover:bg-foreground/[0.04] transition-colors"
          >
            Audit pipeline
            <ArrowUpRight size={14} />
          </Link>
        )}
        <Link href={coachHref} className={cn(CHIPPI_PILL, 'flex-1 justify-center')}>
          <BookOpen size={14} />
          Coach
        </Link>
      </div>

      {/* Stats — hairline-divider snapshot grid (the funnel counts + quality) */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px rounded-xl overflow-hidden border border-border/60 bg-border/60">
        {stats.map(({ label, value }) => (
          <div key={label} className="bg-background px-4 py-4">
            <p className={SECTION_LABEL}>{label}</p>
            <p className={`${STAT_NUMBER_COMPACT} mt-1`} style={TITLE_FONT}>
              {value}
            </p>
          </div>
        ))}
      </section>

      {!space ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
          <p className="text-sm text-foreground">No workspace yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            This realtor hasn&apos;t set up their workspace.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Recent Contacts */}
          <div className="space-y-2">
            <p className={SECTION_LABEL}>
              People
              <span className="ml-2 normal-case tracking-normal text-muted-foreground/70">
                {totalContacts}
              </span>
            </p>
            {contacts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
                <p className="text-sm text-foreground">No people yet.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  New contacts will show up here.
                </p>
              </div>
            ) : (
              <>
                <ul className="divide-y divide-border/60 border-y border-border/60">
                  {contacts.slice(0, 20).map((c) => (
                    <li key={c.id} className="flex items-start gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                        <div className="mt-0.5 space-y-0.5">
                          {c.email && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
                              <MailIcon size={11} className="shrink-0" /> {c.email}
                            </p>
                          )}
                          {c.phone && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                              <Phone size={11} className="shrink-0" /> {c.phone}
                            </p>
                          )}
                          {c.followUpAt && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                              <Calendar size={11} className="shrink-0" />
                              Follow up {new Date(c.followUpAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </p>
                          )}
                        </div>
                      </div>
                      {c.scoreLabel && (
                        <span className={`inline-flex text-xs font-medium rounded-full px-2.5 py-0.5 capitalize shrink-0 ${scoreBadge(c.scoreLabel)}`}>
                          {c.leadScore != null ? Math.round(c.leadScore) : ''} {c.scoreLabel}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {contacts.length > 20 && (
                  <p className="text-xs text-muted-foreground text-center pt-1">
                    Showing 20 of {contacts.length}.
                  </p>
                )}
              </>
            )}
          </div>

          {/* Deals Pipeline */}
          <div className="space-y-2">
            <p className={SECTION_LABEL}>
              Deals
              <span className="ml-2 normal-case tracking-normal text-muted-foreground/70">
                {totalDeals}
              </span>
            </p>
            {deals.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
                <p className="text-sm text-foreground">No deals yet.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Deals in this workspace will show up here.
                </p>
              </div>
            ) : (
              <>
                <ul className="divide-y divide-border/60 border-y border-border/60">
                  {deals.slice(0, 20).map((d) => {
                    const stage = stageMap[d.stageId];
                    const statusColor =
                      d.status === 'won'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : d.status === 'lost'
                          ? 'text-destructive'
                          : d.status === 'on_hold'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-muted-foreground';
                    return (
                      <li key={d.id} className="flex items-start gap-3 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{d.title}</p>
                          <div className="mt-1 flex items-center gap-2 flex-wrap">
                            <span
                              className={`inline-flex text-xs font-medium rounded-full px-2.5 py-0.5 ${statusColor}`}
                              style={stage ? { backgroundColor: `${stage.color}15`, color: stage.color } : undefined}
                            >
                              {stage?.name ?? d.status}
                            </span>
                            {d.closeDate && (
                              <span className="text-xs text-muted-foreground">
                                Close {new Date(d.closeDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-sm font-medium tabular-nums shrink-0 text-foreground">
                          {d.value != null ? formatCompact(d.value) : '—'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {deals.length > 20 && (
                  <p className="text-xs text-muted-foreground text-center pt-1">
                    Showing 20 of {deals.length}.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
