import React from 'react';
import { getBrokerMemberContext } from '@/lib/permissions';
import { getBrokerageMembers } from '@/lib/brokerage-members';
import { supabase } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowUpRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { MemberDashboard } from '../member-dashboard';

/** The brokerage daily desk: lead ownership, response gaps and recorded work.
 * Forecasts and detailed reports remain on their own dedicated routes. */
export default async function BrokerBriefPage() {
  const ctx = await getBrokerMemberContext();
  if (!ctx) redirect('/');
  if (ctx.membership.role === 'realtor_member')
    return <MemberDashboard ctx={ctx} />;
  const { brokerage } = ctx;
  const members = await getBrokerageMembers(brokerage.id, {
    strict: true,
    includeOnboard: true,
    includeSpaceName: true,
  });
  const { data: ownerSpace, error: ownerError } = await supabase
    .from('Space')
    .select('id')
    .eq('ownerId', brokerage.ownerId)
    .maybeSingle();
  const spaceIds = [
    ...new Set(
      [...members.map((member) => member.Space?.id), ownerSpace?.id].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  ];
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const responseMinutes = brokerage.slaFirstResponseMinutes || 15;
  const responseBefore = new Date(
    Date.now() - responseMinutes * 60 * 1000,
  ).toISOString();
  const empty = { data: [], error: null, count: 0 };
  const [leads, legacyLeads, waiting, activity, invitations] =
    await Promise.all([
      supabase
        .from('Contact')
        .select('id, name, tags', { count: 'exact' })
        .eq('brokerageId', brokerage.id)
        .or('tags.is.null,tags.not.cs.{assigned}')
        .order('createdAt', { ascending: false })
        .limit(500),
      ownerSpace?.id
        ? supabase
            .from('Contact')
            .select('id, name, tags', { count: 'exact' })
            .eq('spaceId', ownerSpace.id)
            .or('tags.is.null,tags.not.cs.{assigned}')
            .is('brokerageId', null)
            .contains('tags', ['brokerage-lead'])
            .order('createdAt', { ascending: false })
            .limit(200)
        : Promise.resolve(empty),
      spaceIds.length
        ? supabase
            .from('Contact')
            .select('id, name, spaceId', { count: 'exact' })
            .in('spaceId', spaceIds)
            .contains('tags', ['assigned-by-broker'])
            .is('lastContactedAt', null)
            .lte('createdAt', responseBefore)
            .order('createdAt', { ascending: true })
            .limit(100)
        : Promise.resolve(empty),
      spaceIds.length
        ? supabase
            .from('AgentActivityLog')
            .select('id, actionType, createdAt, reasoning')
            .in('spaceId', spaceIds)
            .eq('outcome', 'completed')
            .not(
              'actionType',
              'in',
              '(create_draft_message,message_drafted,packet_drafted,draft_email,draft_sms)',
            )
            .gte('createdAt', since)
            .order('createdAt', { ascending: false })
            .limit(8)
        : Promise.resolve(empty),
      supabase
        .from('Invitation')
        .select('id, email')
        .eq('brokerageId', brokerage.id)
        .eq('status', 'pending')
        .gt('expiresAt', new Date().toISOString())
        .limit(20),
    ]);
  const unavailable =
    ownerError ||
    [leads, legacyLeads, waiting, activity, invitations].some(
      (result) => result.error,
    );
  const unassigned = [
    ...(leads.data ?? []),
    ...(legacyLeads.data ?? []),
  ].filter((row) => !row.tags?.includes('assigned'));
  const unassignedCount = (leads.count ?? 0) + (legacyLeads.count ?? 0);
  const waitingCount = waiting.count ?? 0;
  const waitingRows = waiting.data ?? [];
  const activityRows = activity.data ?? [];
  const labelFor: Record<string, string> = {
    send_email: 'Email sent',
    send_sms: 'Text message sent',
    schedule_tour: 'Tour booked',
    set_followup: 'Follow-up scheduled',
    add_person: 'Contact added',
    create_automation: 'Automation enabled',
  };
  return (
    <div
      className="mx-auto max-w-6xl space-y-8 pb-12"
      data-broker-premium-page="today"
    >
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
        <div>
          <p className="text-xs text-muted-foreground">{brokerage.name}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Today
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Keep every lead owned and every client moving.
          </p>
        </div>
        <Link
          href="/broker/chippi"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-white"
        >
          Give Chippi a task <ArrowUpRight size={15} />
        </Link>
      </header>
      {unavailable && (
        <div
          role="alert"
          className="flex gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm"
        >
          <AlertCircle size={18} className="shrink-0" />
          <p>
            Some team data is unavailable. This view may be incomplete.{' '}
            <Link href="/broker/brief" className="font-medium text-brand">
              Reload Today
            </Link>
          </p>
        </div>
      )}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.8fr)_minmax(16rem,1fr)] lg:gap-12">
        <div className="min-w-0 space-y-8">
          <section>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Needs attention</h2>
              <Link
                href="/broker/leads"
                className="text-xs text-muted-foreground"
              >
                All leads ↗
              </Link>
            </div>
            {leads.error || legacyLeads.error || ownerError ? (
              <p className="py-4 text-sm text-muted-foreground">
                Lead ownership could not be checked.
              </p>
            ) : unassigned.length > 0 ? (
              <Link
                href="/broker/leads"
                className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-border p-4"
              >
                <div>
                  <p className="text-sm font-semibold">
                    {unassignedCount} leads need an owner
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {unassigned
                      .slice(0, 3)
                      .map((row) => row.name)
                      .join(', ')}
                    {unassigned.length > 3 ? '…' : ''}
                  </p>
                </div>
                <ArrowUpRight size={16} />
              </Link>
            ) : (
              <p className="py-4 text-sm text-muted-foreground">
                No unassigned leads in the records checked.
              </p>
            )}
            {waiting.error ? (
              <p className="py-4 text-sm text-muted-foreground">
                First responses could not be checked.
              </p>
            ) : (
              waitingRows.length > 0 && (
                <Link
                  href="/broker/leads"
                  className="mt-3 flex items-center justify-between gap-4 rounded-lg border border-border p-4"
                >
                  <div>
                    <p className="text-sm font-semibold">
                      {waitingCount} assigned leads await a first response
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      No contact logged after {responseMinutes} minutes.
                    </p>
                  </div>
                  <ArrowUpRight size={16} />
                </Link>
              )
            )}
          </section>
          <section className="border-t border-border pt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Work completed</h2>
              <Link
                href="/broker/agent-activity"
                className="text-xs text-muted-foreground"
              >
                Activity ↗
              </Link>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Recent recorded actions · last 24 hours
            </p>
            {activity.error ? (
              <p className="py-5 text-sm text-muted-foreground">
                Team activity could not be loaded.
              </p>
            ) : activityRows.length ? (
              <ul className="mt-3 divide-y divide-border">
                {activityRows.map((row) => (
                  <li key={row.id} className="flex gap-3 py-4">
                    <CheckCircle2
                      size={18}
                      className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                    />
                    <div>
                      <p className="text-sm font-medium">
                        {labelFor[row.actionType] ??
                          row.actionType.replaceAll('_', ' ')}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.reasoning || 'Recorded in the activity timeline.'}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-5 text-sm text-muted-foreground">
                No completed actions recorded in this window.
              </p>
            )}
          </section>
        </div>
        <aside className="min-w-0 border-t border-border pt-6 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Your team</h2>
            <Link
              href="/broker/realtors"
              className="text-xs text-muted-foreground"
            >
              View all ↗
            </Link>
          </div>
          <ul className="mt-3 divide-y divide-border">
            {members.slice(0, 8).map((member) => {
              const unanswered = waitingRows.filter(
                (row) => row.spaceId === member.Space?.id,
              ).length;
              return (
                <li key={member.userId}>
                  <Link
                    href={`/broker/realtors/${member.userId}`}
                    className="block py-4"
                  >
                    <p className="text-sm font-medium">
                      {member.User?.name || member.User?.email || 'Team member'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {!member.User?.onboard
                        ? 'Setup incomplete'
                        : waiting.error
                          ? 'Response data unavailable'
                          : unanswered
                            ? `${unanswered} first responses waiting`
                            : 'No overdue first responses in this view'}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Link
            href="/broker/members"
            className="mt-3 inline-flex min-h-10 items-center text-sm font-medium text-brand"
          >
            Invite a team member →
          </Link>
          {invitations.data?.length ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {invitations.data.length} invitations pending
            </p>
          ) : null}
          <div className="mt-7 rounded-lg bg-muted/50 p-5">
            <h2 className="text-sm font-semibold">Make ownership automatic</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Route incoming leads to the right agent and escalate missed
              responses.
            </p>
            <Link
              href="/broker/settings/auto-assignment"
              className="mt-3 inline-flex min-h-10 items-center text-sm font-medium text-brand"
            >
              Manage lead routing →
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
