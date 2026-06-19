import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import {
  DollarSign,
  CreditCard,
  Clock,
  AlertTriangle,
  XCircle,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import { isPlatformAdmin } from '@/lib/permissions';
import { PLANS } from '@/lib/plans';
import { SUBSCRIPTION_STATUS_COLORS } from '@/lib/constants/colors';
import { redirect } from 'next/navigation';
import { H3, SECTION_LABEL } from '@/lib/typography';
import { cn } from '@/lib/utils';
import { AdminPageHeader } from '@/app/admin/components/admin-page-header';
import { StatGrid } from '@/app/admin/components/stat-grid';
import { EmptyState } from '@/components/ui/empty-state';
import { BillingCreditTool } from './credit-tool';

type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'inactive';

// Entry-tier price (Solo, $97 — lib/plans.ts). MRR here is approximate: it
// prices every active Space sub at the entry tier because Space rows don't
// record their tier yet. Exact per-plan MRR lands with a plan column.
const PRICE_PER_SEAT = PLANS.solo.priceMonthly;

/** Live-mode Stripe dashboard deep links. (Test-mode objects need /test/ in the
 *  path — these links are for the production dashboard.) */
const stripeCustomerUrl = (id: string) => `https://dashboard.stripe.com/customers/${id}`;
const stripeSubscriptionUrl = (id: string) => `https://dashboard.stripe.com/subscriptions/${id}`;


const statusBarColors: Record<SubscriptionStatus, string> = {
  active: 'bg-emerald-500',
  trialing: 'bg-blue-500',
  past_due: 'bg-amber-500',
  canceled: 'bg-red-500',
  unpaid: 'bg-red-400',
  inactive: 'bg-muted-foreground/40',
};

export default async function AdminBillingPage() {
  const isAdmin = await isPlatformAdmin();
  if (!isAdmin) redirect('/');

  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 86_400_000).toISOString();

  let statusCounts: Record<SubscriptionStatus, number> = {
    active: 0,
    trialing: 0,
    past_due: 0,
    canceled: 0,
    unpaid: 0,
    inactive: 0,
  };
  let totalSpaces = 0;
  let recentSubscriptions: {
    id: string;
    name: string;
    ownerId: string;
    ownerEmail: string;
    stripeSubscriptionStatus: SubscriptionStatus;
    stripePeriodEnd: string | null;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
  }[] = [];
  let brokerageSubscriptions: {
    id: string;
    name: string;
    plan: string;
    stripeSubscriptionStatus: SubscriptionStatus;
    stripePeriodEnd: string | null;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
  }[] = [];
  let trialExpiringSoon: {
    id: string;
    name: string;
    ownerId: string;
    ownerEmail: string;
    stripePeriodEnd: string;
    daysLeft: number;
  }[] = [];

  try {
    const [allSpacesRes, recentRes, trialExpiringRes, brokerageRes] = await Promise.all([
      // All spaces for status counts
      supabase
        .from('Space')
        .select('stripeSubscriptionStatus'),
      // Recent subscriptions (non-inactive, ordered by period end)
      supabase
        .from('Space')
        .select('id, name, ownerId, stripeSubscriptionStatus, stripePeriodEnd, stripeCustomerId, stripeSubscriptionId, User!inner(email)')
        .neq('stripeSubscriptionStatus', 'inactive')
        .order('stripePeriodEnd', { ascending: false, nullsFirst: false })
        .limit(50),
      // Trials expiring within 7 days
      supabase
        .from('Space')
        .select('id, name, ownerId, stripePeriodEnd, User!inner(email)')
        .eq('stripeSubscriptionStatus', 'trialing')
        .lte('stripePeriodEnd', sevenDaysFromNow)
        .gte('stripePeriodEnd', now.toISOString())
        .order('stripePeriodEnd', { ascending: true }),
      // Brokerage-scoped subscriptions (the brokerage checkout writes these to
      // the Brokerage row, not a Space — previously invisible on this page)
      supabase
        .from('Brokerage')
        .select('id, name, plan, stripeSubscriptionStatus, stripePeriodEnd, stripeCustomerId, stripeSubscriptionId')
        .neq('stripeSubscriptionStatus', 'inactive')
        .order('stripePeriodEnd', { ascending: false, nullsFirst: false })
        .limit(50),
    ]);

    // Count by status
    const allSpaces = (allSpacesRes.data ?? []) as { stripeSubscriptionStatus: SubscriptionStatus }[];
    totalSpaces = allSpaces.length;
    for (const space of allSpaces) {
      const status = space.stripeSubscriptionStatus as SubscriptionStatus;
      if (status in statusCounts) {
        statusCounts[status]++;
      }
    }

    // Map recent subscriptions
    recentSubscriptions = ((recentRes.data ?? []) as any[]).map((row) => ({
      id: row.id,
      name: row.name,
      ownerId: row.ownerId,
      ownerEmail: row.User?.email ?? '',
      stripeSubscriptionStatus: row.stripeSubscriptionStatus as SubscriptionStatus,
      stripePeriodEnd: row.stripePeriodEnd,
      stripeCustomerId: row.stripeCustomerId,
      stripeSubscriptionId: row.stripeSubscriptionId,
    }));

    brokerageSubscriptions = ((brokerageRes.data ?? []) as any[]).map((row) => ({
      id: row.id,
      name: row.name,
      plan: row.plan ?? '—',
      stripeSubscriptionStatus: row.stripeSubscriptionStatus as SubscriptionStatus,
      stripePeriodEnd: row.stripePeriodEnd,
      stripeCustomerId: row.stripeCustomerId,
      stripeSubscriptionId: row.stripeSubscriptionId,
    }));

    // Map trial expiring soon
    trialExpiringSoon = ((trialExpiringRes.data ?? []) as any[]).map((row) => {
      const periodEnd = new Date(row.stripePeriodEnd);
      const daysLeft = Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / 86_400_000));
      return {
        id: row.id,
        name: row.name,
        ownerId: row.ownerId,
        ownerEmail: row.User?.email ?? '',
        stripePeriodEnd: row.stripePeriodEnd,
        daysLeft,
      };
    });
  } catch (err) {
    console.error('[admin/billing] DB queries failed', { error: err });
    return (
      <div className="space-y-8 pb-12">
        <AdminPageHeader eyebrow="Management." title="Billing" />
        <EmptyState
          icon={DollarSign}
          title="Couldn’t load the billing dashboard."
          description="This is usually temporary. Reload to try again."
          action={{ label: 'Reload', href: '/admin/billing' }}
        />
      </div>
    );
  }

  const mrr = statusCounts.active * PRICE_PER_SEAT;
  const paidStatuses: SubscriptionStatus[] = ['active', 'trialing', 'past_due', 'canceled', 'unpaid'];
  const displayStatuses: SubscriptionStatus[] = ['active', 'trialing', 'past_due', 'canceled', 'unpaid', 'inactive'];

  return (
    <div className="space-y-8 pb-12">
      <AdminPageHeader
        eyebrow="Management."
        title="Billing"
        subtitle="Subscription metrics and revenue overview."
      />

      {/* ── KPI strip — hairline grid (count-up via StatGrid) ────── */}
      <StatGrid
        aria-label="Billing key metrics"
        columnsClassName="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
        cells={[
          {
            label: 'MRR',
            value: `$${mrr.toLocaleString()}`,
            sub: `${statusCounts.active} active × $${PRICE_PER_SEAT}`,
          },
          {
            label: 'Active',
            value: statusCounts.active,
            sub: totalSpaces > 0 ? `${Math.round((statusCounts.active / totalSpaces) * 100)}% of spaces` : '—',
          },
          {
            label: 'Trialing',
            value: statusCounts.trialing,
            sub: `${trialExpiringSoon.length} expiring soon`,
          },
          {
            label: 'Past due',
            value: statusCounts.past_due,
            sub: statusCounts.past_due > 0 ? 'needs attention' : 'all clear',
            alert: statusCounts.past_due > 0,
          },
          {
            label: 'Churned',
            value: statusCounts.canceled,
            sub: totalSpaces > 0 ? `${Math.round((statusCounts.canceled / totalSpaces) * 100)}% churn` : '—',
            alert: statusCounts.canceled > 0,
          },
        ]}
      />

      {/* ── Subscription Breakdown ──────────────────────────────── */}
      <Card>
        <CardContent className="px-5 py-4">
          <p className={`${H3} mb-4`}>Subscription breakdown</p>

          {/* Visual bar */}
          <div className="h-4 rounded-full overflow-hidden flex bg-muted mb-4">
            {displayStatuses.map((status) => {
              const count = statusCounts[status];
              if (count === 0 || totalSpaces === 0) return null;
              const pct = (count / totalSpaces) * 100;
              return (
                <div
                  key={status}
                  className={`${statusBarColors[status]} transition-all duration-500`}
                  style={{ width: `${pct}%` }}
                  title={`${status}: ${count} (${Math.round(pct)}%)`}
                />
              );
            })}
          </div>

          {/* Status table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className={cn('text-left py-2 pr-4', SECTION_LABEL)}>Status</th>
                  <th className={cn('text-right py-2 px-4', SECTION_LABEL)}>Count</th>
                  <th className={cn('text-right py-2 pl-4', SECTION_LABEL)}>% of total</th>
                </tr>
              </thead>
              <tbody>
                {displayStatuses.map((status) => (
                  <tr key={status} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4">
                      <span className={`inline-flex text-[11px] font-semibold rounded-full px-2 py-0.5 ${SUBSCRIPTION_STATUS_COLORS[status]}`}>
                        {status}
                      </span>
                    </td>
                    <td className="text-right py-2 px-4 tabular-nums font-medium">{statusCounts[status]}</td>
                    <td className="text-right py-2 pl-4 tabular-nums text-muted-foreground">
                      {totalSpaces > 0 ? `${Math.round((statusCounts[status] / totalSpaces) * 100)}%` : '0%'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Credit management (grant / reverse) ──────────────────── */}
      <div>
        <p className={`${H3} mb-3`}>Credit management</p>
        <BillingCreditTool />
      </div>

      {/* ── Trial Expiring Soon ─────────────────────────────────── */}
      {trialExpiringSoon.length > 0 && (
        <Card className="border-amber-300/50 bg-amber-50/30 dark:border-amber-500/20 dark:bg-amber-500/5">
          <CardContent className="px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock size={15} className="text-amber-500" />
              <p className="text-sm font-semibold">Trial expiring soon</p>
              <span className="text-[11px] text-muted-foreground">({trialExpiringSoon.length} within 7 days)</span>
            </div>
            <div className="space-y-2">
              {trialExpiringSoon.map((space) => (
                <Link key={space.id} href={`/admin/users/${space.ownerId}`}>
                  <div className="rounded-xl border border-border/70 bg-card px-4 py-3 hover:bg-foreground/[0.04] transition-colors duration-150">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{space.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{space.ownerEmail}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <span className={`inline-flex text-[11px] font-semibold rounded-full px-2 py-0.5 ${
                          space.daysLeft <= 2
                            ? 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/15'
                            : 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15'
                        }`}>
                          {space.daysLeft === 0 ? 'Expires today' : `${space.daysLeft}d left`}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Recent Subscriptions ────────────────────────────────── */}
      <div>
        <p className={`${H3} mb-3`}>Recent subscriptions</p>
        {recentSubscriptions.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="No active subscriptions yet."
            description="Paid and trialing Space subscriptions will appear here."
            size="sm"
          />
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className={cn('text-left py-3 px-4', SECTION_LABEL)}>Space name</th>
                    <th className={cn('text-left py-3 px-4', SECTION_LABEL)}>Owner email</th>
                    <th className={cn('text-left py-3 px-4', SECTION_LABEL)}>Status</th>
                    <th className={cn('text-left py-3 px-4', SECTION_LABEL)}>Period end</th>
                    <th className={cn('text-left py-3 px-4', SECTION_LABEL)}>Stripe customer</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSubscriptions.map((space) => (
                    <tr key={space.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4">
                        <Link
                          href={`/admin/users/${space.ownerId}`}
                          className="font-medium hover:underline underline-offset-2"
                        >
                          {space.name}
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground truncate max-w-[200px]">{space.ownerEmail}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex text-[11px] font-semibold rounded-full px-2 py-0.5 ${SUBSCRIPTION_STATUS_COLORS[space.stripeSubscriptionStatus]}`}>
                          {space.stripeSubscriptionStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4 tabular-nums text-muted-foreground">
                        {space.stripePeriodEnd
                          ? new Date(space.stripePeriodEnd).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : '—'}
                      </td>
                      <td className="py-3 px-4 text-xs font-mono">
                        {space.stripeCustomerId ? (
                          <span className="inline-flex items-center gap-2.5">
                            <a
                              href={stripeCustomerUrl(space.stripeCustomerId)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline underline-offset-2"
                              title="Open customer in Stripe"
                            >
                              {space.stripeCustomerId}
                              <ExternalLink size={11} />
                            </a>
                            {space.stripeSubscriptionId && (
                              <a
                                href={stripeSubscriptionUrl(space.stripeSubscriptionId)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground hover:underline underline-offset-2"
                                title="Open subscription in Stripe"
                              >
                                sub
                              </a>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {/* ── Brokerage subscriptions ─────────────────────────────── */}
      {/* Brokerage-scoped subs live on the Brokerage row (written by the
          brokerage checkout + webhook) and were invisible on this page, which
          only listed Space subs. Same Stripe deep links for one-click control. */}
      <div>
        <p className={`${H3} mb-3`}>Brokerage subscriptions</p>
        {brokerageSubscriptions.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="No brokerage subscriptions yet."
            description="Team and Team Plus subscriptions billed to a brokerage will appear here."
            size="sm"
          />
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className={cn('text-left py-3 px-4', SECTION_LABEL)}>Brokerage</th>
                    <th className={cn('text-left py-3 px-4', SECTION_LABEL)}>Plan</th>
                    <th className={cn('text-left py-3 px-4', SECTION_LABEL)}>Status</th>
                    <th className={cn('text-left py-3 px-4', SECTION_LABEL)}>Period end</th>
                    <th className={cn('text-left py-3 px-4', SECTION_LABEL)}>Stripe</th>
                  </tr>
                </thead>
                <tbody>
                  {brokerageSubscriptions.map((b) => (
                    <tr key={b.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4 font-medium">{b.name}</td>
                      <td className="py-3 px-4 text-muted-foreground">{b.plan}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex text-[11px] font-semibold rounded-full px-2 py-0.5 ${SUBSCRIPTION_STATUS_COLORS[b.stripeSubscriptionStatus]}`}>
                          {b.stripeSubscriptionStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4 tabular-nums text-muted-foreground">
                        {b.stripePeriodEnd
                          ? new Date(b.stripePeriodEnd).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : '—'}
                      </td>
                      <td className="py-3 px-4 text-xs font-mono">
                        {b.stripeCustomerId ? (
                          <span className="inline-flex items-center gap-2.5">
                            <a
                              href={stripeCustomerUrl(b.stripeCustomerId)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline underline-offset-2"
                              title="Open customer in Stripe"
                            >
                              {b.stripeCustomerId}
                              <ExternalLink size={11} />
                            </a>
                            {b.stripeSubscriptionId && (
                              <a
                                href={stripeSubscriptionUrl(b.stripeSubscriptionId)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground hover:underline underline-offset-2"
                                title="Open subscription in Stripe"
                              >
                                sub
                              </a>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
