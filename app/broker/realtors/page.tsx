import { getBrokerContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { getBrokerageMembers } from '@/lib/brokerage-members';
import Link from 'next/link';
import type { Metadata } from 'next';
import { H1, TITLE_FONT, BODY_MUTED } from '@/lib/typography';
import { cn } from '@/lib/utils';
import { RealtorsClient, type RealtorRow } from './realtors-client';

export const metadata: Metadata = { title: 'Realtors — Teams' };

export default async function BrokerRealtorsPage() {
  const ctx = await getBrokerContext();
  if (!ctx) redirect('/');

  const { brokerage } = ctx;

  const members = await getBrokerageMembers(brokerage.id, { includeOnboard: true, includeSpaceName: true });

  const spaceIds = members.map((m) => m.Space?.id).filter(Boolean) as string[];

  // 7-day response-time window. Mirrors agent/tools/broker/performance.py
  // (which uses 30 days for the deeper Chippi audit); the inline row pill
  // wants a fresher, shorter window — what's happening THIS week. Same
  // outbound activity types (call/email/meeting) so the two surfaces don't
  // disagree about what "responding" means.
  const RESPONSE_WINDOW_DAYS = 7;
  const RESPONSE_OUTBOUND_TYPES = ['call', 'email', 'meeting'] as const;
  const responseSince = new Date(Date.now() - RESPONSE_WINDOW_DAYS * 24 * 3600 * 1000).toISOString();

  // Pull only what the table actually shows: people on file + deals (count + value)
  // + recent contacts in the response-time window + their first outbound activity.
  // The recent-contact + activity queries feed the inline response-time pill.
  const [contactRows, dealRows, recentContactRows] = await Promise.all([
    spaceIds.length > 0
      ? supabase
          .from('Contact')
          .select('spaceId')
          .in('spaceId', spaceIds)
          .not('tags', 'cs', '["application-link"]')
          .limit(10000)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
    spaceIds.length > 0
      ? supabase
          .from('Deal')
          .select('spaceId, value')
          .in('spaceId', spaceIds)
          .limit(10000)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
    spaceIds.length > 0
      ? supabase
          .from('Contact')
          .select('id, spaceId, createdAt')
          .in('spaceId', spaceIds)
          .gte('createdAt', responseSince)
          .limit(10000)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
  ]);

  // First outbound activity per contact in the window. One query against
  // ContactActivity instead of N per-space queries — the broker page already
  // has the contact ids in hand.
  const recentContactIds = (recentContactRows as { id: string }[]).map((c) => c.id);
  const activityRows = recentContactIds.length > 0
    ? (await supabase
        .from('ContactActivity')
        .select('contactId, createdAt, type')
        .in('contactId', recentContactIds)
        .in('type', [...RESPONSE_OUTBOUND_TYPES])
        .limit(20000)
        .then((r) => r.data ?? [])) as { contactId: string; createdAt: string; type: string }[]
    : [];

  // First outbound timestamp per contact (only the earliest counts — that's
  // the "first response").
  const firstOutboundByContact = new Map<string, number>();
  for (const a of activityRows) {
    const ts = new Date(a.createdAt).getTime();
    if (Number.isNaN(ts)) continue;
    const prev = firstOutboundByContact.get(a.contactId);
    if (prev === undefined || ts < prev) {
      firstOutboundByContact.set(a.contactId, ts);
    }
  }

  // Per-space response-hour samples. Negative deltas (clock skew or
  // back-dated activity) are dropped — same defensive filter the Python
  // tool applies.
  const samplesBySpace = new Map<string, number[]>();
  for (const c of recentContactRows as { id: string; spaceId: string; createdAt: string }[]) {
    const first = firstOutboundByContact.get(c.id);
    if (first === undefined) continue;
    const created = new Date(c.createdAt).getTime();
    if (Number.isNaN(created)) continue;
    const hours = (first - created) / 3_600_000;
    if (hours < 0) continue;
    if (!samplesBySpace.has(c.spaceId)) samplesBySpace.set(c.spaceId, []);
    samplesBySpace.get(c.spaceId)!.push(hours);
  }

  // Team median across ALL response samples — same definition as the Chippi
  // audit tool. Median (not mean) so a single 200-hour outlier doesn't drag
  // the threshold.
  const allSamples = ([] as number[]).concat(...samplesBySpace.values()).sort((a, b) => a - b);
  const teamMedianHours = allSamples.length > 0
    ? allSamples[Math.floor(allSamples.length / 2)]
    : null;

  // Band multipliers — match agent/tools/broker/performance.py:48-49 so
  // Chippi's narrative answer ("Alice is slow") and the row pill agree.
  const FAST_MULTIPLIER = 0.5;
  const SLOW_MULTIPLIER = 2.0;
  function bandFor(avgHours: number | null): RealtorRow['responseBand'] {
    if (avgHours === null) return 'no_data';
    if (teamMedianHours === null) return 'no_data';
    if (avgHours <= teamMedianHours * FAST_MULTIPLIER) return 'fast';
    if (avgHours >= teamMedianHours * SLOW_MULTIPLIER) return 'slow';
    return 'on_pace';
  }

  const peopleBySpace = (contactRows as { spaceId: string }[]).reduce<Record<string, number>>(
    (acc, r) => { acc[r.spaceId] = (acc[r.spaceId] ?? 0) + 1; return acc; },
    {}
  );
  const dealsBySpace = (dealRows as { spaceId: string; value: number | null }[]).reduce<
    Record<string, { count: number; value: number }>
  >(
    (acc, r) => {
      if (!acc[r.spaceId]) acc[r.spaceId] = { count: 0, value: 0 };
      acc[r.spaceId].count += 1;
      acc[r.spaceId].value += r.value ?? 0;
      return acc;
    },
    {}
  );

  const realtors: RealtorRow[] = members.map((m) => {
    const sid = m.Space?.id ?? null;
    const samples = sid ? samplesBySpace.get(sid) ?? [] : [];
    const avgHours = samples.length > 0
      ? samples.reduce((a, b) => a + b, 0) / samples.length
      : null;
    return {
      membershipId: m.id,
      userId: m.userId,
      name: m.User?.name ?? null,
      email: m.User?.email ?? '',
      onboard: m.User?.onboard ?? false,
      role: m.role,
      spaceSlug: m.Space?.slug ?? null,
      people:   sid ? (peopleBySpace[sid] ?? 0) : 0,
      deals:    sid ? (dealsBySpace[sid]?.count ?? 0) : 0,
      pipeline: sid ? (dealsBySpace[sid]?.value ?? 0) : 0,
      responseAvgHours: avgHours === null ? null : Math.round(avgHours * 10) / 10,
      responseBand: bandFor(avgHours),
    };
  });

  // ── Page-scoped narration. Pick the loudest fact: top performer by deals,
  // a quiet-week call-out, or a "nobody onboard" flag. Hand-coded ladder, no
  // agent call — this is the deals-page-cuts pattern.
  const subtitle = (() => {
    if (realtors.length === 0) {
      return 'No realtors yet. Send the first invite.';
    }
    const active = realtors.filter((r) => r.onboard);
    if (active.length === 0) {
      return `${realtors.length} invited. Nobody onboard yet.`;
    }
    const ranked = [...realtors].sort((a, b) => b.deals - a.deals);
    const top = ranked[0];
    if (top.deals > 0) {
      const firstName = (top.name ?? top.email).split(/\s+/)[0];
      return `${firstName} leads the team — ${top.deals} ${top.deals === 1 ? 'deal' : 'deals'} in flight.`;
    }
    const quiet = realtors.filter((r) => r.onboard && r.people === 0).length;
    if (quiet > 0) {
      return `${active.length} active. ${quiet} ${quiet === 1 ? 'is' : 'are'} sitting quiet.`;
    }
    return `${active.length} active. Pipeline empty — nudge the team.`;
  })();

  return (
    <div className="space-y-6 max-w-3xl pb-56 md:pb-24">
      <header className="space-y-1.5">
        <p className={cn(BODY_MUTED)}>Realtors.</p>
        <h1 className={cn(H1)} style={TITLE_FONT}>
          Your team in flight
        </h1>
        <p className={cn(BODY_MUTED)}>{subtitle}</p>
      </header>

      {members.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-12 text-center">
          <p className="text-sm text-foreground">No realtors yet.</p>
          <p className={cn('text-xs mt-1', BODY_MUTED)}>
            <Link
              href="/broker/invitations"
              className="text-foreground underline underline-offset-2 hover:no-underline"
            >
              Send the first invite
            </Link>{' '}
            to get someone working.
          </p>
        </div>
      ) : (
        <RealtorsClient realtors={realtors} />
      )}
    </div>
  );
}
