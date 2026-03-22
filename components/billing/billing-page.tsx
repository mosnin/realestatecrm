'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  CreditCard,
  Check,
  Zap,
  Shield,
  Bot,
  Users,
  BarChart2,
  PhoneIncoming,
  Briefcase,
  ArrowRight,
  AlertCircle,
  Download,
  RefreshCw,
  Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BillingPageProps {
  slug: string;
  /** 'inactive' = no subscription yet (Stripe not wired up) */
  subscriptionStatus: 'active' | 'trialing' | 'past_due' | 'canceled' | 'inactive';
  /** ISO date string for next billing cycle end */
  currentPeriodEnd?: string;
  /** Last 4 digits of card on file */
  cardLast4?: string;
  cardBrand?: string;
  /** Mock invoices — replaced by real Stripe data once live */
  invoices?: Invoice[];
}

interface Invoice {
  id: string;
  date: string;
  amount: string;
  status: 'paid' | 'open' | 'void';
  pdf?: string;
}

// ─── Plan config ──────────────────────────────────────────────────────────────

const PLAN_PRICE = 97;
const PLAN_NAME = 'Pro';

const PLAN_FEATURES = [
  { icon: PhoneIncoming, label: 'Unlimited lead intake & AI scoring' },
  { icon: Users,         label: 'Unlimited clients & contact management' },
  { icon: Briefcase,     label: 'Deals pipeline & kanban board' },
  { icon: Bot,           label: 'AI assistant with RAG knowledge base' },
  { icon: BarChart2,     label: 'Analytics & performance insights' },
  { icon: Zap,           label: 'Automated email notifications' },
  { icon: Shield,        label: 'Secure, encrypted data storage' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SectionBlock({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border bg-muted/20">
        <p className="font-semibold text-sm">{title}</p>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: BillingPageProps['subscriptionStatus'] }) {
  const map = {
    active:   { label: 'Active',   className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
    trialing: { label: 'Trial',    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
    past_due: { label: 'Past due', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
    canceled: { label: 'Canceled', className: 'bg-muted text-muted-foreground' },
    inactive: { label: 'Inactive', className: 'bg-muted text-muted-foreground' },
  };
  const { label, className } = map[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        className,
      )}
    >
      {status === 'active' && (
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
      )}
      {label}
    </span>
  );
}

function InvoiceStatusBadge({ status }: { status: Invoice['status'] }) {
  if (status === 'paid') return <Badge className="bg-emerald-100 text-emerald-700 border-0 dark:bg-emerald-900/30 dark:text-emerald-400">Paid</Badge>;
  if (status === 'open') return <Badge variant="outline">Open</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">Void</Badge>;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BillingPage({
  subscriptionStatus,
  currentPeriodEnd,
  cardLast4,
  cardBrand = 'Visa',
  invoices = [],
}: BillingPageProps) {
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [canceling, setCanceling] = useState(false);

  const isActive = subscriptionStatus === 'active' || subscriptionStatus === 'trialing';

  // ── Handlers (wired to Stripe once live) ──────────────────────────────────

  async function handleSubscribe() {
    // TODO: Call POST /api/billing/checkout → stripe.checkout.sessions.create()
    // const res = await fetch('/api/billing/checkout', { method: 'POST' });
    // const { url } = await res.json();
    // window.location.href = url;
    alert('Stripe integration coming soon — subscribe button is ready to wire up.');
  }

  async function handleManage() {
    // TODO: Call POST /api/billing/portal → stripe.billingPortal.sessions.create()
    // const res = await fetch('/api/billing/portal', { method: 'POST' });
    // const { url } = await res.json();
    // window.location.href = url;
    alert('Stripe billing portal coming soon.');
  }

  async function handleCancel() {
    setCanceling(true);
    try {
      // TODO: Call POST /api/billing/cancel → stripe.subscriptions.update({ cancel_at_period_end: true })
      await new Promise((r) => setTimeout(r, 800)); // placeholder delay
      setCancelDialogOpen(false);
    } finally {
      setCanceling(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 max-w-2xl">

      {/* ── Stripe-not-live banner ── */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/40 px-4 py-3.5">
        <Lock size={15} className="text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Payments coming soon
          </p>
          <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5">
            Stripe integration is being set up. The billing UI is fully built —
            once the API keys are configured, subscriptions will go live automatically.
          </p>
        </div>
      </div>

      {/* ── Current plan ── */}
      <SectionBlock
        title="Current plan"
        description="Your active subscription and billing cycle"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <p className="text-lg font-bold">{PLAN_NAME}</p>
              <StatusBadge status={subscriptionStatus} />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold tabular-nums">${PLAN_PRICE}</span>
              <span className="text-sm text-muted-foreground">/ month</span>
            </div>
            {isActive && currentPeriodEnd && (
              <p className="text-xs text-muted-foreground">
                Next billing date:{' '}
                <span className="font-medium text-foreground">
                  {new Date(currentPeriodEnd).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </p>
            )}
            {!isActive && (
              <p className="text-xs text-muted-foreground">
                Subscribe to unlock full access to Chippi
              </p>
            )}
          </div>

          {/* Plan icon */}
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Zap size={22} className="text-primary" />
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2.5">
          {isActive ? (
            <>
              <Button onClick={handleManage} variant="outline" size="sm" className="gap-1.5">
                <CreditCard size={14} />
                Manage subscription
              </Button>
              <Button
                onClick={() => setCancelDialogOpen(true)}
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
              >
                Cancel plan
              </Button>
            </>
          ) : (
            <Button onClick={handleSubscribe} size="sm" className="gap-2">
              Subscribe now
              <ArrowRight size={14} />
            </Button>
          )}
        </div>
      </SectionBlock>

      {/* ── What's included ── */}
      <SectionBlock
        title="What's included"
        description="Everything in the Pro plan"
      >
        <ul className="space-y-3">
          {PLAN_FEATURES.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-3 text-sm">
              <span className="flex-shrink-0 w-6 h-6 rounded-md bg-primary/8 flex items-center justify-center">
                <Icon size={13} className="text-primary" />
              </span>
              {label}
              <Check size={13} className="ml-auto text-emerald-500 flex-shrink-0" />
            </li>
          ))}
        </ul>

        {!isActive && (
          <div className="mt-5 pt-4 border-t border-border flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Get started for ${PLAN_PRICE}/mo</p>
              <p className="text-xs text-muted-foreground mt-0.5">No contracts. Cancel anytime.</p>
            </div>
            <Button onClick={handleSubscribe} size="sm" className="gap-1.5">
              Subscribe
              <ArrowRight size={14} />
            </Button>
          </div>
        )}
      </SectionBlock>

      {/* ── Payment method ── */}
      <SectionBlock
        title="Payment method"
        description="Card on file for your subscription"
      >
        {cardLast4 ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-7 rounded-md border border-border bg-muted flex items-center justify-center flex-shrink-0">
                <CreditCard size={14} className="text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  {cardBrand} ending in {cardLast4}
                </p>
                <p className="text-xs text-muted-foreground">Updated via Stripe</p>
              </div>
            </div>
            <Button onClick={handleManage} variant="outline" size="sm" className="gap-1.5">
              <RefreshCw size={13} />
              Update
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3 py-2">
            <div className="w-10 h-7 rounded-md border border-dashed border-border bg-muted/40 flex items-center justify-center flex-shrink-0">
              <CreditCard size={14} className="text-muted-foreground/50" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">No payment method on file</p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                A card will be added when you subscribe
              </p>
            </div>
          </div>
        )}
      </SectionBlock>

      {/* ── Billing history ── */}
      <SectionBlock
        title="Billing history"
        description="Past invoices and receipts"
      >
        {invoices.length > 0 ? (
          <div className="space-y-1 -mx-1">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">
              <span>Date</span>
              <span className="text-right">Amount</span>
              <span className="text-right">Status</span>
              <span />
            </div>
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/40 transition-colors items-center"
              >
                <span className="text-sm">{inv.date}</span>
                <span className="text-sm font-medium tabular-nums text-right">{inv.amount}</span>
                <div className="flex justify-end">
                  <InvoiceStatusBadge status={inv.status} />
                </div>
                {inv.pdf ? (
                  <a
                    href={inv.pdf}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-end"
                  >
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                      <Download size={13} />
                    </Button>
                  </a>
                ) : (
                  <div className="w-7" />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
              <AlertCircle size={18} className="text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">No invoices yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Your billing history will appear here once you subscribe
            </p>
          </div>
        )}
      </SectionBlock>

      {/* ── Cancel confirmation dialog ── */}
      <Dialog open={cancelDialogOpen} onOpenChange={(o) => !o && setCancelDialogOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel subscription?</DialogTitle>
            <DialogDescription>
              Your {PLAN_NAME} plan will remain active until the end of the current
              billing period. After that, your workspace will be locked to read-only.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 space-y-1.5">
            <p className="text-xs font-medium">You&apos;ll lose access to:</p>
            <ul className="space-y-1">
              {PLAN_FEATURES.slice(0, 4).map(({ label }) => (
                <li key={label} className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-muted-foreground/40 flex-shrink-0" />
                  {label}
                </li>
              ))}
              <li className="text-xs text-muted-foreground">
                + {PLAN_FEATURES.length - 4} more features
              </li>
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
              Keep plan
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={canceling}
            >
              {canceling ? 'Canceling...' : 'Cancel subscription'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
