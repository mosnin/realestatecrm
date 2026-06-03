import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getBrokerageMembers } from '@/lib/brokerage-members';
import { resolveBrokerContext } from '@/lib/agent/broker-context';
import { getInitials, timeAgo } from '@/lib/formatting';
import { Users } from 'lucide-react';
import type { Metadata } from 'next';
import {
  H1,
  TITLE_FONT,
  BODY_MUTED,
  SECTION_LABEL,
  META,
} from '@/lib/typography';
import { cn } from '@/lib/utils';
import { StaggerList, StaggerItem } from '@/components/motion/stagger-list';

export const metadata: Metadata = { title: 'People — Teams' };

// ── Lead-tier colour tokens ────────────────────────────────────────────────────
// Mirrors the scoreTier helper in contact-table.tsx and broker-leads-client.tsx.
// Thresholds: ≥75 hot, ≥45 warm, else cold.
function scoreTierClasses(score: number | null): {
  dot: string;
  text: string;
  label: string;
} | null {
  if (score == null || score <= 0) return null;
  if (score >= 75)
    return { dot: 'bg-lead-hot', text: 'text-lead-hot', label: 'Hot' };
  if (score >= 45)
    return { dot: 'bg-lead-warm', text: 'text-lead-warm', label: 'Warm' };
  return { dot: 'bg-lead-cold', text: 'text-lead-cold', label: 'Cold' };
}

// scoreLabel fallback for contacts that carry a string label but no numeric score
function labelTierClasses(label: string | null) {
  if (!label) return null;
  const l = label.toLowerCase();
  if (l === 'hot') return 'text-rose-700 bg-rose-50 dark:text-rose-400 dark:bg-rose-500/15';
  if (l === 'warm') return 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15';
  if (l === 'cold') return 'text-sky-700 bg-sky-50 dark:text-sky-400 dark:bg-sky-500/15';
  return 'text-muted-foreground bg-muted/60';
}

type ContactRow = {
  id: string;
  name: string;
  email: string | null;
  leadScore: number | null;
  scoreLabel: string | null;
  spaceId: string;
  createdAt: string;
  lastContactedAt: string | null;
  updatedAt: string;
};

export default async function BrokerPeoplePage() {
  // ── Auth gate ──────────────────────────────────────────────────────────────
  const ctx = await resolveBrokerContext();
  if (!ctx) redirect('/');

  const { brokerage } = ctx;

  // ── Resolve member space IDs (same scoping as leads page) ─────────────────
  // getBrokerageMembers returns every BrokerageMembership (owners, admins,
  // realtor_members) — each maps to one Space via ownerId.
  const allMembers = await getBrokerageMembers(brokerage.id, {
    includeSpaceName: true,
  });

  // Include the brokerage owner's space (mirrors the leads page pattern).
  const memberSpaceIds = allMembers
    .map((m) => m.Space?.id)
    .filter(Boolean) as string[];

  // Also include owner's spaces explicitly (owner may appear as broker_owner
  // in memberships, so they're already covered — but guard belt-and-suspenders).
  const ownerSpaceIds: string[] = [];
  if (memberSpaceIds.length === 0) {
    const { data: ownerSpaces } = await supabase
      .from('Space')
      .select('id')
      .eq('ownerId', brokerage.ownerId)
      .limit(10);
    ownerSpaceIds.push(
      ...((ownerSpaces ?? []).map((s: { id: string }) => s.id))
    );
  }

  const spaceIds = [...new Set([...memberSpaceIds, ...ownerSpaceIds])];

  // ── Build spaceId → realtor name map ──────────────────────────────────────
  const spaceToRealtor = new Map<string, string>();
  for (const m of allMembers) {
    const sid = m.Space?.id;
    if (!sid) continue;
    const displayName =
      m.User?.name ?? m.User?.email ?? 'Unknown realtor';
    spaceToRealtor.set(sid, displayName);
  }

  // ── Query contacts across all member spaces ────────────────────────────────
  // Scoping query: Contact.spaceId IN (all member space IDs).
  // Ordered by updatedAt descending (most active first); capped at 5000.
  let contacts: ContactRow[] = [];
  if (spaceIds.length > 0) {
    const { data } = await supabase
      .from('Contact')
      .select(
        'id, name, email, leadScore, scoreLabel, spaceId, createdAt, lastContactedAt, updatedAt'
      )
      .in('spaceId', spaceIds)
      .order('updatedAt', { ascending: false })
      .limit(5000);
    contacts = (data ?? []) as ContactRow[];
  }

  // ── Status sentence (picks the loudest fact) ──────────────────────────────
  const total = contacts.length;
  const hotCount = contacts.filter(
    (c) => (c.leadScore ?? 0) >= 75 || c.scoreLabel?.toLowerCase() === 'hot'
  ).length;
  const warmCount = contacts.filter(
    (c) =>
      ((c.leadScore ?? 0) >= 45 && (c.leadScore ?? 0) < 75) ||
      c.scoreLabel?.toLowerCase() === 'warm'
  ).length;

  const subtitle = (() => {
    if (total === 0) {
      return 'No contacts across the brokerage yet.';
    }
    if (hotCount > 0) {
      return `${total.toLocaleString()} ${total === 1 ? 'person' : 'people'} — ${hotCount} hot, ${warmCount} warm across the team.`;
    }
    if (warmCount > 0) {
      return `${total.toLocaleString()} ${total === 1 ? 'person' : 'people'} — ${warmCount} warm in the pipeline.`;
    }
    return `${total.toLocaleString()} ${total === 1 ? 'person' : 'people'} across ${spaceIds.length} ${spaceIds.length === 1 ? 'realtor' : 'realtors'}.`;
  })();

  return (
    <div className="space-y-6 max-w-3xl pb-56 md:pb-24">
      {/* ── Page header (status-sentence pattern from STYLESHEET.md) ─────── */}
      <header className="space-y-1.5">
        <p className={cn(BODY_MUTED)}>People.</p>
        <h1 className={cn(H1)} style={TITLE_FONT}>
          Everyone your brokerage is working with.
        </h1>
        <p className={cn(BODY_MUTED)}>{subtitle}</p>
      </header>

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {contacts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-12 text-center">
          <Users
            size={24}
            className="mx-auto mb-3 text-muted-foreground/50"
            aria-hidden
          />
          <p className="text-sm text-foreground">No contacts yet.</p>
          <p className={cn('text-xs mt-1', BODY_MUTED)}>
            Contacts will appear here as your realtors add them.
          </p>
        </div>
      ) : (
        /* ── Contact feed ─────────────────────────────────────────────────── */
        <StaggerList className="divide-y divide-border/60">
          {contacts.map((c) => {
            const tier = scoreTierClasses(c.leadScore);
            const labelCls = !tier ? labelTierClasses(c.scoreLabel) : null;
            const realtorName = spaceToRealtor.get(c.spaceId) ?? 'Unknown';
            const activityTs = c.lastContactedAt ?? c.updatedAt ?? c.createdAt;
            const initials = getInitials(c.name);

            return (
              <StaggerItem key={c.id}>
                <div className="flex items-center gap-3 py-3 hover:bg-foreground/[0.04] transition-colors -mx-1 px-1 rounded-sm">
                  {/* Avatar / initial */}
                  <div
                    className="w-8 h-8 rounded-full bg-foreground/[0.06] text-foreground/70
                               flex items-center justify-center text-[11px] font-semibold
                               flex-shrink-0 select-none"
                    aria-hidden
                  >
                    {initials}
                  </div>

                  {/* Name + owning realtor */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate leading-snug">
                      {c.name}
                    </p>
                    {c.email && (
                      <p className={cn('truncate leading-snug', META)}>
                        {c.email}
                      </p>
                    )}
                    <p className={cn('truncate leading-snug', META)}>
                      <span className={cn(SECTION_LABEL, 'normal-case tracking-normal')}>
                        {realtorName}
                      </span>
                    </p>
                  </div>

                  {/* Lead-tier chip + score */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {tier ? (
                      <span
                        className="inline-flex items-center gap-1 flex-shrink-0"
                        title={`${tier.label} lead · score ${c.leadScore}`}
                      >
                        <span
                          className={cn('h-1.5 w-1.5 rounded-full', tier.dot)}
                          aria-hidden
                        />
                        <span
                          className={cn(
                            'text-[11px] font-semibold tabular-nums',
                            tier.text
                          )}
                        >
                          {c.leadScore}
                        </span>
                      </span>
                    ) : c.scoreLabel ? (
                      <span
                        className={cn(
                          'inline-flex text-[10px] font-semibold rounded-full px-2 py-0.5 flex-shrink-0',
                          labelCls
                        )}
                      >
                        {c.scoreLabel.charAt(0).toUpperCase() +
                          c.scoreLabel.slice(1)}
                      </span>
                    ) : null}

                    {/* Last activity timestamp */}
                    <span className={cn(META, 'hidden sm:block')}>
                      {timeAgo(activityTs)}
                    </span>
                  </div>
                </div>
              </StaggerItem>
            );
          })}
        </StaggerList>
      )}
    </div>
  );
}
