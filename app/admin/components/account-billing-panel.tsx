'use client';

/**
 * Reusable platform-admin billing panel for a single account (a Space or a
 * Brokerage). Renders four clearly-separated, money-aware controls — all POST to
 * the existing, audited, rate-limited admin endpoints:
 *
 *   1. Change plan        → POST /api/admin/actions { action: 'change_plan' }
 *                           (moves the Stripe sub item price, then mirrors the DB)
 *   2. Cancel subscription→ POST /api/admin/actions { action: 'cancel_subscription' }
 *                           (immediate vs end-of-period)
 *   3. Credits            → GET/POST /api/admin/billing (grant / reverse a txn,
 *                           with current balance + recent ledger). Credit refund
 *                           is explicitly labeled NOT a money refund.
 *   4. Money refund       → POST /api/admin/actions { action: 'issue_refund' }
 *                           with an invoice picker (list_invoices) + partial amount.
 *
 * Used by the user detail page (space accounts) and the brokerage detail page
 * (brokerage accounts) so the two never drift.
 */

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { SURFACE_CARD } from '@/components/ui/surface-card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/app/admin/components/confirm-dialog';
import { ArrowRightLeft, Ban, Coins, DollarSign, RefreshCw, Plus, Undo2, Gift } from 'lucide-react';

type AccountType = 'space' | 'brokerage';

interface AccountBillingPanelProps {
  accountType: AccountType;
  accountId: string;
  /** Current plan label from the DB (free|solo|pro | starter|team|team_plus|enterprise). */
  currentPlan: string | null;
  /** Owner User.id — REQUIRED for money-refund + comp (those key off the owning Space). */
  ownerUserId?: string | null;
  /** Whether a Stripe customer exists (gates the money-refund control). */
  hasStripeCustomer?: boolean;
  /** Whether a Stripe subscription exists (gates plan-change + cancel). */
  hasSubscription?: boolean;
}

const SPACE_PLAN_OPTIONS = [
  { id: 'solo', label: 'Solo ($97/mo)' },
  { id: 'pro', label: 'Pro Performer ($197/mo)' },
];
const BROKERAGE_PLAN_OPTIONS = [
  { id: 'team', label: 'Team ($497/mo)' },
  { id: 'team_plus', label: 'Team Plus ($897/mo)' },
];

interface InvoiceRow {
  id: string;
  number: string | null;
  status: string | null;
  amountPaid: number;
  currency: string;
  created: number;
  refundable: boolean;
}

interface TxnRow {
  id: string;
  delta: number;
  workflow: string;
  reason: string | null;
  createdAt: string;
}

function fmtMoney(cents: number, currency = 'usd'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
}

export function AccountBillingPanel({
  accountType,
  accountId,
  currentPlan,
  ownerUserId,
  hasStripeCustomer = false,
  hasSubscription = false,
}: AccountBillingPanelProps) {
  const router = useRouter();
  const planOptions = accountType === 'space' ? SPACE_PLAN_OPTIONS : BROKERAGE_PLAN_OPTIONS;

  // ── Complimentary (free) access ────────────────────────────────────────────
  // Stripe-independent: grant full access with no payment, for internal team
  // members and demo accounts. Status loads on mount (lightweight compOnly read).
  const [comp, setComp] = useState<{
    compAccess: boolean;
    compExpiresAt: string | null;
    compNote: string | null;
  } | null>(null);
  const [compDays, setCompDays] = useState('');
  const [compNoteInput, setCompNoteInput] = useState('');
  const [compLoading, setCompLoading] = useState(false);
  const [compResult, setCompResult] = useState<string | null>(null);

  const loadComp = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/billing?accountType=${accountType}&accountId=${accountId}&compOnly=1`,
      );
      const data = await res.json();
      if (res.ok && data.comp) setComp(data.comp);
    } catch {
      /* non-fatal: the control still allows granting */
    }
  }, [accountType, accountId]);

  useEffect(() => {
    loadComp();
  }, [loadComp]);

  async function handleGrantComp() {
    setCompLoading(true);
    setCompResult(null);
    try {
      const res = await fetch('/api/admin/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'grant_comp',
          accountType,
          accountId,
          ...(compDays.trim() !== '' ? { days: Number(compDays) } : {}),
          ...(compNoteInput.trim() !== '' ? { note: compNoteInput.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setComp(data.comp);
        setCompResult('Free access granted.');
        router.refresh();
      } else {
        setCompResult(data.error || 'Could not grant free access.');
      }
    } catch {
      setCompResult('Network error. Try again.');
    } finally {
      setCompLoading(false);
    }
  }

  async function handleRevokeComp() {
    setCompLoading(true);
    setCompResult(null);
    try {
      const res = await fetch('/api/admin/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke_comp', accountType, accountId }),
      });
      const data = await res.json();
      if (res.ok) {
        setComp(data.comp);
        setCompResult('Free access revoked.');
        router.refresh();
        return;
      }
      return data.error || 'Could not revoke free access.';
    } catch {
      return 'Network error. Try again.';
    } finally {
      setCompLoading(false);
    }
  }

  // ── Plan change ──────────────────────────────────────────────────────────
  const [targetPlan, setTargetPlan] = useState(
    planOptions.find((p) => p.id !== currentPlan)?.id ?? planOptions[0].id,
  );
  const [cadence, setCadence] = useState<'keep' | 'monthly' | 'annual'>('keep');
  const [proration, setProration] = useState<'create_prorations' | 'none'>('create_prorations');
  const [planLoading, setPlanLoading] = useState(false);
  const [planResult, setPlanResult] = useState<string | null>(null);
  const [planOpen, setPlanOpen] = useState(false);

  async function handleChangePlan() {
    setPlanLoading(true);
    setPlanResult(null);
    try {
      const res = await fetch('/api/admin/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'change_plan',
          accountType,
          accountId,
          plan: targetPlan,
          ...(cadence !== 'keep' ? { cadence } : {}),
          proration,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setPlanResult(data.message || 'Plan changed.');
        setPlanOpen(false);
        router.refresh();
      } else {
        setPlanResult(data.error || 'Plan change failed.');
      }
    } catch {
      setPlanResult('Network error. Try again.');
    } finally {
      setPlanLoading(false);
    }
  }

  // ── Cancel ───────────────────────────────────────────────────────────────
  const [cancelMode, setCancelMode] = useState<'end_of_period' | 'immediate'>('end_of_period');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelResult, setCancelResult] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  // SOC2 step-up: reason (>= 10 chars) + the operator typing 'CANCEL'.
  const [cancelReason, setCancelReason] = useState('');
  const [cancelConfirm, setCancelConfirm] = useState('');

  async function handleCancel() {
    setCancelLoading(true);
    setCancelResult(null);
    try {
      const res = await fetch('/api/admin/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cancel_subscription',
          accountType,
          accountId,
          mode: cancelMode,
          reason: cancelReason.trim(),
          confirm: cancelConfirm,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCancelResult(data.message || 'Subscription canceled.');
        setCancelOpen(false);
        setCancelReason('');
        setCancelConfirm('');
        router.refresh();
      } else {
        setCancelResult(data.error || 'Cancel failed.');
      }
    } catch {
      setCancelResult('Network error. Try again.');
    } finally {
      setCancelLoading(false);
    }
  }

  // ── Credits ──────────────────────────────────────────────────────────────
  const [balance, setBalance] = useState<number | null>(null);
  const [txns, setTxns] = useState<TxnRow[]>([]);
  const [creditsLoaded, setCreditsLoaded] = useState(false);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [grantAmount, setGrantAmount] = useState(1000);
  const [grantExpiry, setGrantExpiry] = useState<'30d' | 'never'>('30d');
  const [grantLoading, setGrantLoading] = useState(false);
  const [creditResult, setCreditResult] = useState<string | null>(null);

  const loadCredits = useCallback(async () => {
    setCreditsLoading(true);
    setCreditResult(null);
    try {
      const res = await fetch(`/api/admin/billing?accountType=${accountType}&accountId=${accountId}`);
      const data = await res.json();
      if (res.ok) {
        setBalance(data.balance ?? 0);
        setTxns(Array.isArray(data.txns) ? data.txns : []);
        setCreditsLoaded(true);
      } else {
        setCreditResult(data.error || 'Failed to load credits.');
      }
    } catch {
      setCreditResult('Network error loading credits.');
    } finally {
      setCreditsLoading(false);
    }
  }, [accountType, accountId]);

  async function handleGrant() {
    if (!Number.isInteger(grantAmount) || grantAmount <= 0) {
      setCreditResult('Grant amount must be a positive integer.');
      return;
    }
    setGrantLoading(true);
    setCreditResult(null);
    try {
      const res = await fetch('/api/admin/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'grant',
          accountType,
          accountId,
          amount: grantAmount,
          expiry: grantExpiry === 'never' ? 'never' : '30d',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setBalance(data.balance ?? balance);
        setCreditResult(`Granted ${grantAmount.toLocaleString()} credits.`);
        await loadCredits();
        router.refresh();
      } else {
        setCreditResult(data.error || 'Grant failed.');
      }
    } catch {
      setCreditResult('Network error. Try again.');
    } finally {
      setGrantLoading(false);
    }
  }

  async function handleReverseTxn(txnId: string) {
    setCreditResult(null);
    try {
      const res = await fetch('/api/admin/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refund', accountType, accountId, txnId }),
      });
      const data = await res.json();
      if (res.ok) {
        setCreditResult('Credit transaction reversed.');
        await loadCredits();
        router.refresh();
        return;
      }
      return data.error || 'Reverse failed.';
    } catch {
      return 'Network error. Try again.';
    }
  }

  // ── Money refund ─────────────────────────────────────────────────────────
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [invoicesLoaded, setInvoicesLoaded] = useState(false);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<string>('');
  const [refundAmountDollars, setRefundAmountDollars] = useState<string>('');
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundResult, setRefundResult] = useState<string | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);
  // SOC2 step-up: reason (>= 10 chars) + the operator typing 'REFUND'.
  const [refundReason, setRefundReason] = useState('');
  const [refundConfirm, setRefundConfirm] = useState('');

  const loadInvoices = useCallback(async () => {
    setInvoicesLoading(true);
    setRefundResult(null);
    try {
      const res = await fetch('/api/admin/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Account-aware: a brokerage subscription bills the brokerage's own
        // Stripe customer, not the owner's personal space.
        body: JSON.stringify({ action: 'list_invoices', accountType, accountId, ...(ownerUserId ? { userId: ownerUserId } : {}) }),
      });
      const data = await res.json();
      if (res.ok) {
        setInvoices(Array.isArray(data.invoices) ? data.invoices : []);
        setInvoicesLoaded(true);
        const firstRefundable = (data.invoices as InvoiceRow[]).find((i) => i.refundable);
        if (firstRefundable) setSelectedInvoice(firstRefundable.id);
      } else {
        setRefundResult(data.error || 'Failed to load invoices.');
      }
    } catch {
      setRefundResult('Network error loading invoices.');
    } finally {
      setInvoicesLoading(false);
    }
  }, [accountType, accountId, ownerUserId]);

  async function handleRefund() {
    setRefundLoading(true);
    setRefundResult(null);
    try {
      const amountCents =
        refundAmountDollars.trim() === '' ? undefined : Math.round(parseFloat(refundAmountDollars) * 100);
      if (amountCents !== undefined && (!Number.isFinite(amountCents) || amountCents <= 0)) {
        setRefundResult('Enter a valid positive amount, or leave blank for a full refund.');
        setRefundLoading(false);
        return;
      }
      const res = await fetch('/api/admin/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'issue_refund',
          accountType,
          accountId,
          ...(ownerUserId ? { userId: ownerUserId } : {}),
          ...(selectedInvoice ? { invoiceId: selectedInvoice } : {}),
          ...(amountCents !== undefined ? { amount: amountCents } : {}),
          reason: refundReason.trim(),
          confirm: refundConfirm,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setRefundResult(`Refund issued. ID ${data.refundId}, amount ${fmtMoney(data.amount)}.`);
        setRefundOpen(false);
        setRefundReason('');
        setRefundConfirm('');
        router.refresh();
      } else {
        setRefundResult(data.error || 'Refund failed.');
      }
    } catch {
      setRefundResult('Network error. Try again.');
    } finally {
      setRefundLoading(false);
    }
  }

  const selectClass =
    'text-xs rounded-md border border-border bg-card px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring';

  return (
    <div className={`${SURFACE_CARD} px-5 py-4 space-y-5`}>
        {/* ── Complimentary (free) access ──────────────────────────────── */}
        <div className="space-y-2">
          <p className="text-sm font-medium flex items-center gap-1.5">
            <Gift size={13} />
            Free access (comp)
          </p>
          <p className="text-xs text-muted-foreground">
            Grant this {accountType} full access with no payment — for internal team members and
            demos. Independent of Stripe: it never touches their subscription, and a real
            subscription later still works normally.
          </p>
          {comp?.compAccess ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs space-y-1.5">
              <p className="font-medium text-emerald-700 dark:text-emerald-400">
                Free access is ON
                {comp.compExpiresAt
                  ? ` · expires ${new Date(comp.compExpiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                  : ' · no expiry'}
              </p>
              {comp.compNote && <p className="text-muted-foreground">Note: {comp.compNote}</p>}
              <ConfirmDialog
                trigger={
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={compLoading}
                    className="text-xs gap-1.5 text-destructive hover:text-destructive"
                  >
                    <Ban size={13} />
                    {compLoading ? 'Revoking…' : 'Revoke free access'}
                  </Button>
                }
                title="Revoke free access"
                description={`Revoke complimentary access for this ${accountType}? They will need a paid subscription to keep using the app.`}
                confirmLabel="Revoke free access"
                tone="danger"
                onConfirm={handleRevokeComp}
              />
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-muted-foreground">Expiry (days, blank = none)</label>
                <input
                  type="number"
                  min={1}
                  placeholder="No expiry"
                  value={compDays}
                  onChange={(e) => setCompDays(e.target.value)}
                  className="w-32 text-xs rounded-md border border-border bg-card px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-muted-foreground">Note (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Sales — Jane"
                  value={compNoteInput}
                  onChange={(e) => setCompNoteInput(e.target.value)}
                  className="w-44 text-xs rounded-md border border-border bg-card px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGrantComp}
                disabled={compLoading}
                className="text-xs gap-1.5"
              >
                <Gift size={13} />
                {compLoading ? 'Granting…' : 'Grant free access'}
              </Button>
            </div>
          )}
          {compResult && <p className="text-xs text-muted-foreground">{compResult}</p>}
        </div>

        <div className="border-t border-border" />

        {/* ── Change plan ──────────────────────────────────────────────── */}
        <div className="space-y-2">
          <p className="text-sm font-medium flex items-center gap-1.5">
            <ArrowRightLeft size={13} />
            Change plan
          </p>
          <p className="text-xs text-muted-foreground">
            Current plan: <span className="font-medium">{currentPlan || '—'}</span>. Moves the Stripe
            subscription to the new price (with proration), then mirrors the plan in the database.
          </p>
          {!hasSubscription ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              No Stripe subscription on record — the customer must subscribe before a plan change.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <select value={targetPlan} onChange={(e) => setTargetPlan(e.target.value)} className={selectClass} aria-label="Target plan">
                {planOptions.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
              <select value={cadence} onChange={(e) => setCadence(e.target.value as 'keep' | 'monthly' | 'annual')} className={selectClass} aria-label="Billing cadence">
                <option value="keep">Keep cadence</option>
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
              </select>
              <select value={proration} onChange={(e) => setProration(e.target.value as 'create_prorations' | 'none')} className={selectClass} aria-label="Proration">
                <option value="create_prorations">Prorate</option>
                <option value="none">No proration</option>
              </select>
              <Dialog open={planOpen} onOpenChange={setPlanOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-xs gap-1.5">
                    <ArrowRightLeft size={13} />
                    Change plan
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Change plan</DialogTitle>
                    <DialogDescription>
                      Move this {accountType} from <strong>{currentPlan || '—'}</strong> to{' '}
                      <strong>{planOptions.find((p) => p.id === targetPlan)?.label}</strong>
                      {cadence !== 'keep' ? ` (${cadence})` : ''}? This updates the live Stripe subscription
                      {proration === 'create_prorations' ? ' and prorates the difference' : ' without proration'}.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setPlanOpen(false)}>Cancel</Button>
                    <Button onClick={handleChangePlan} disabled={planLoading}>
                      <ArrowRightLeft size={14} />
                      {planLoading ? 'Changing…' : 'Confirm change'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}
          {planResult && <p className="text-xs text-muted-foreground">{planResult}</p>}
        </div>

        <div className="border-t border-border" />

        {/* ── Cancel subscription ──────────────────────────────────────── */}
        <div className="space-y-2">
          <p className="text-sm font-medium flex items-center gap-1.5">
            <Ban size={13} />
            Cancel subscription
          </p>
          <p className="text-xs text-muted-foreground">
            End-of-period keeps access until the current period ends; immediate cancels now and downgrades
            the plan ({accountType === 'space' ? 'free' : 'starter'}) right away.
          </p>
          {!hasSubscription ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">No Stripe subscription to cancel.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <select value={cancelMode} onChange={(e) => setCancelMode(e.target.value as 'end_of_period' | 'immediate')} className={selectClass} aria-label="Cancel mode">
                <option value="end_of_period">At end of period</option>
                <option value="immediate">Immediately</option>
              </select>
              <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-xs gap-1.5 text-destructive hover:text-destructive">
                    <Ban size={13} />
                    Cancel subscription
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Cancel subscription</DialogTitle>
                    <DialogDescription>
                      {cancelMode === 'immediate' ? (
                        <>Cancel this subscription <strong>immediately</strong>? Access ends now and the plan
                          downgrades to {accountType === 'space' ? 'free' : 'starter'}.</>
                      ) : (
                        <>Schedule this subscription to cancel <strong>at the end of the current billing
                          period</strong>? Access continues until then.</>
                      )}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col gap-3 py-1">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-foreground/80">
                        Reason (recorded in the audit log)
                      </span>
                      <textarea
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        rows={2}
                        placeholder="Why is this subscription being canceled?"
                        className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      />
                      {cancelReason.length > 0 && cancelReason.trim().length < 10 && (
                        <span className="text-[11px] text-muted-foreground">At least 10 characters.</span>
                      )}
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-foreground/80">
                        Type &quot;CANCEL&quot; to confirm
                      </span>
                      <input
                        value={cancelConfirm}
                        onChange={(e) => setCancelConfirm(e.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      />
                    </label>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCancelOpen(false)}>Back</Button>
                    <Button
                      variant="destructive"
                      onClick={handleCancel}
                      disabled={
                        cancelLoading ||
                        cancelReason.trim().length < 10 ||
                        cancelConfirm !== 'CANCEL'
                      }
                    >
                      <Ban size={14} />
                      {cancelLoading ? 'Canceling…' : 'Confirm cancel'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}
          {cancelResult && <p className="text-xs text-muted-foreground">{cancelResult}</p>}
        </div>

        <div className="border-t border-border" />

        {/* ── Credits ──────────────────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Coins size={13} />
              Credits
            </p>
            <Button variant="outline" size="sm" onClick={loadCredits} disabled={creditsLoading} className="text-xs gap-1.5">
              <RefreshCw size={12} className={creditsLoading ? 'animate-spin' : ''} />
              {creditsLoaded ? 'Refresh' : 'Load'}
            </Button>
          </div>
          {creditsLoaded && (
            <p className="text-xs text-muted-foreground">
              Balance: <span className="font-medium tabular-nums">{(balance ?? 0).toLocaleString()}</span> credits
            </p>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-muted-foreground">Grant amount</label>
              <input
                type="number"
                min={1}
                value={grantAmount}
                onChange={(e) => setGrantAmount(Math.max(1, Math.floor(Number(e.target.value) || 0)))}
                className="w-28 text-xs rounded-md border border-border bg-card px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <select value={grantExpiry} onChange={(e) => setGrantExpiry(e.target.value as '30d' | 'never')} className={selectClass} aria-label="Expiry">
              <option value="30d">30-day expiry</option>
              <option value="never">Never expires</option>
            </select>
            <Button variant="outline" size="sm" onClick={handleGrant} disabled={grantLoading} className="text-xs gap-1.5">
              <Plus size={13} />
              {grantLoading ? 'Granting…' : 'Grant credits'}
            </Button>
          </div>

          {creditsLoaded && txns.length > 0 && (
            <div className="rounded-lg border border-border divide-y divide-border overflow-hidden mt-1">
              <p className="px-3 py-1.5 text-[11px] font-medium text-muted-foreground bg-muted/40">Recent ledger</p>
              {txns.slice(0, 10).map((t) => (
                <div key={t.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                  <span className={`tabular-nums font-medium ${t.delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}`}>
                    {t.delta >= 0 ? '+' : ''}{t.delta}
                  </span>
                  <span className="text-muted-foreground truncate flex-1">
                    {t.workflow || t.reason || '—'} · {new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  {t.delta < 0 && (
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px] gap-1 text-muted-foreground hover:text-foreground">
                          <Undo2 size={11} />
                          Reverse
                        </Button>
                      }
                      title="Reverse credit transaction"
                      description="This adjusts the in-app credit ledger only — it does NOT refund money. Use “Refund payment” to return money via Stripe."
                      confirmLabel="Reverse transaction"
                      tone="danger"
                      onConfirm={() => handleReverseTxn(t.id)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Note: granting/reversing credits changes the in-app credit ledger only. It is NOT a money
            refund — use &quot;Refund payment&quot; below to return money via Stripe.
          </p>
          {creditResult && <p className="text-xs text-muted-foreground">{creditResult}</p>}
        </div>

        {/* ── Money refund (real Stripe refund against this account's customer) ── */}
        {(
          <>
            <div className="border-t border-border" />
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <DollarSign size={13} />
                Refund payment (real money)
              </p>
              <p className="text-xs text-muted-foreground">
                Returns money to the customer via Stripe. Pick an invoice and optionally a partial amount.
                Capped at 3 refunds/admin/day.
              </p>
              {!hasStripeCustomer ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">No Stripe customer on record.</p>
              ) : (
                <Dialog open={refundOpen} onOpenChange={(o) => { setRefundOpen(o); if (o && !invoicesLoaded) loadInvoices(); }}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="text-xs gap-1.5 text-destructive hover:text-destructive">
                      <DollarSign size={13} />
                      Refund a payment
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Refund a payment</DialogTitle>
                      <DialogDescription>
                        Choose the invoice to refund. Leave the amount blank for a full refund, or enter a
                        partial dollar amount.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                      {invoicesLoading ? (
                        <p className="text-xs text-muted-foreground">Loading invoices…</p>
                      ) : invoices.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No invoices found for this customer.</p>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] text-muted-foreground">Invoice</label>
                          <select
                            value={selectedInvoice}
                            onChange={(e) => setSelectedInvoice(e.target.value)}
                            className="text-xs rounded-md border border-border bg-card px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            <option value="">Most recent paid invoice</option>
                            {invoices.map((inv) => (
                              <option key={inv.id} value={inv.id} disabled={!inv.refundable}>
                                {(inv.number || inv.id)} · {fmtMoney(inv.amountPaid, inv.currency)} · {inv.status}
                                {!inv.refundable ? ' (not refundable)' : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] text-muted-foreground">Partial amount (USD, blank = full)</label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder="Full refund"
                          value={refundAmountDollars}
                          onChange={(e) => setRefundAmountDollars(e.target.value)}
                          className="w-40 text-xs rounded-md border border-border bg-card px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] text-muted-foreground">Reason (recorded in the audit log)</label>
                        <textarea
                          value={refundReason}
                          onChange={(e) => setRefundReason(e.target.value)}
                          rows={2}
                          placeholder="Why is this refund being issued?"
                          className="w-full resize-none text-xs rounded-md border border-border bg-card px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        {refundReason.length > 0 && refundReason.trim().length < 10 && (
                          <span className="text-[11px] text-muted-foreground">At least 10 characters.</span>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] text-muted-foreground">Type &quot;REFUND&quot; to confirm</label>
                        <input
                          value={refundConfirm}
                          onChange={(e) => setRefundConfirm(e.target.value)}
                          autoComplete="off"
                          spellCheck={false}
                          className="w-40 text-xs rounded-md border border-border bg-card px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setRefundOpen(false)}>Cancel</Button>
                      <Button
                        variant="destructive"
                        onClick={handleRefund}
                        disabled={
                          refundLoading ||
                          refundReason.trim().length < 10 ||
                          refundConfirm !== 'REFUND'
                        }
                      >
                        <DollarSign size={14} />
                        {refundLoading ? 'Refunding…' : 'Confirm refund'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
              {refundResult && <p className="text-xs text-muted-foreground">{refundResult}</p>}
            </div>
          </>
        )}
    </div>
  );
}
