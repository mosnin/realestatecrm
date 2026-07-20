'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Download,
  MoreHorizontal,
  Loader2,
  Receipt,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { StatCard, StatusPill, SurfaceCard, SurfaceCardHeader } from '@/components/ui/surface-card';
import { StaggerReveal, AnimatedNumber } from '@/components/motion';

// ── Types ────────────────────────────────────────────────────────────────────

export type LedgerStatus = 'pending' | 'paid' | 'void';

export interface LedgerRow {
  id: string;
  dealId: string;
  dealTitle: string | null;
  closedAt: string;
  dealValue: number;
  agentUserId: string;
  agentName: string | null;
  agentEmail: string | null;
  agentRate: number;
  brokerRate: number;
  referralRate: number;
  referralUserId: string | null;
  agentAmount: number;
  brokerAmount: number;
  referralAmount: number;
  status: LedgerStatus;
  payoutAt: string | null;
  notes: string | null;
}

interface Props {
  ledger: LedgerRow[];
  defaultAgentRate: number;
  defaultBrokerRate: number;
}

type StatusFilter = 'all' | LedgerStatus;

// ── Helpers ──────────────────────────────────────────────────────────────────

export function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function initials(name: string | null | undefined, email?: string | null): string {
  const src = (name && name.trim()) || email || '';
  return src
    .split(/[\s@]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

// Month grouping is done in UTC to match the export endpoint, which filters
// closedAt by UTC month boundaries. Mixing local-TZ and UTC grouping would
// quietly drop deals that closed near midnight into the wrong bucket for
// any broker outside UTC.
function currentMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthKeyOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Rates on ledger rows and in the PATCH route are PERCENT (2.5 = 2.5%, route
// computes amounts as dealValue * rate / 100, validates 0..100). Parse the
// edit-field string straight through in percent units, no division.
function parsePct(v: string): number | null {
  const n = parseFloat(v);
  if (Number.isNaN(n)) return null;
  if (n < 0 || n > 100) return null;
  return n;
}

// Display a percent-valued rate (2.5 -> "2.5"). Round to 2 decimals to avoid
// float noise.
function formatPct(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

// Brokerage DEFAULT rates are stored as DECIMALS (0.03 = 3%); convert to
// percent for the defaults caption only.
function decimalToPct(d: number): string {
  return (Math.round(d * 10000) / 100).toString();
}

// ── Edit modal ───────────────────────────────────────────────────────────────

type EditFields = {
  agentRate: string;
  brokerRate: string;
  referralRate: string;
  referralUserEmail: string;
  notes: string;
  status: LedgerStatus;
};

function buildEditDefaults(row: LedgerRow): EditFields {
  return {
    agentRate: formatPct(row.agentRate),
    brokerRate: formatPct(row.brokerRate),
    referralRate: formatPct(row.referralRate),
    referralUserEmail: '',
    notes: row.notes ?? '',
    status: row.status,
  };
}

interface EditDialogProps {
  row: LedgerRow | null;
  onClose: () => void;
  onSaved: (updated: LedgerRow) => void;
}

function EditRowDialog({ row, onClose, onSaved }: EditDialogProps) {
  const [fields, setFields] = useState<EditFields>(() =>
    row ? buildEditDefaults(row) : {
      agentRate: '',
      brokerRate: '',
      referralRate: '',
      referralUserEmail: '',
      notes: '',
      status: 'pending',
    }
  );
  const [saving, setSaving] = useState(false);

  // Reset when row changes.
  useMemoEffect(row, () => {
    if (row) setFields(buildEditDefaults(row));
  });

  if (!row) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!row) return;

    const patch: Record<string, unknown> = {};

    const newAgent = parsePct(fields.agentRate);
    if (newAgent === null) {
      toast.error('Agent rate must be between 0 and 100');
      return;
    }
    if (Math.abs(newAgent - row.agentRate) > 1e-9) patch.agentRate = newAgent;

    const newBroker = parsePct(fields.brokerRate);
    if (newBroker === null) {
      toast.error('Broker rate must be between 0 and 100');
      return;
    }
    if (Math.abs(newBroker - row.brokerRate) > 1e-9) patch.brokerRate = newBroker;

    const newReferral = parsePct(fields.referralRate);
    if (newReferral === null) {
      toast.error('Referral rate must be between 0 and 100');
      return;
    }
    if (Math.abs(newReferral - row.referralRate) > 1e-9) patch.referralRate = newReferral;

    if (fields.referralUserEmail.trim()) {
      patch.referralUserEmail = fields.referralUserEmail.trim();
    }

    const newNotes = fields.notes.trim() ? fields.notes : null;
    if (newNotes !== (row.notes ?? null)) patch.notes = newNotes;

    if (fields.status !== row.status) patch.status = fields.status;

    if (Object.keys(patch).length === 0) {
      toast.info('Nothing to update');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/broker/commissions/ledger/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? 'Update failed');
        return;
      }
      toast.success('Ledger row updated');
      onSaved(normalizeRow(data, row));
      onClose();
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit commission row</DialogTitle>
          <DialogDescription>
            {row.dealTitle ?? 'Deal'} &middot; {formatDate(row.closedAt)}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="agent-rate">Agent %</Label>
              <Input
                id="agent-rate"
                type="number"
                step="0.01"
                min={0}
                max={100}
                value={fields.agentRate}
                onChange={(e) => setFields((p) => ({ ...p, agentRate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="broker-rate">Broker %</Label>
              <Input
                id="broker-rate"
                type="number"
                step="0.01"
                min={0}
                max={100}
                value={fields.brokerRate}
                onChange={(e) => setFields((p) => ({ ...p, brokerRate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="referral-rate">Referral %</Label>
              <Input
                id="referral-rate"
                type="number"
                step="0.01"
                min={0}
                max={100}
                value={fields.referralRate}
                onChange={(e) => setFields((p) => ({ ...p, referralRate: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="referral-email">Referral user email (optional)</Label>
            <Input
              id="referral-email"
              type="email"
              placeholder="referrer@example.com"
              value={fields.referralUserEmail}
              onChange={(e) => setFields((p) => ({ ...p, referralUserEmail: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to keep the current referral assignment.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="row-status">Status</Label>
            <Select
              value={fields.status}
              onValueChange={(v) => setFields((p) => ({ ...p, status: v as LedgerStatus }))}
            >
              <SelectTrigger id="row-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="void">Void</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="row-notes">Notes</Label>
            <textarea
              id="row-notes"
              rows={3}
              value={fields.notes}
              onChange={(e) => setFields((p) => ({ ...p, notes: e.target.value }))}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-1 focus-visible:ring-offset-background transition-colors duration-150"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 size={14} className="mr-1.5 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save changes'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Tiny helper so we can reset dialog state when `row` changes without pulling
 * in a full useEffect import for a single call site.
 */
function useMemoEffect(dep: unknown, fn: () => void) {
  const last = useRef<unknown>(null);
  if (last.current !== dep) {
    last.current = dep;
    fn();
  }
}

import { useRef } from 'react';

/**
 * Normalize a PATCH API response into our LedgerRow shape. Falls back to the
 * previous row's joined fields (agent/deal metadata) if the response omits
 * them, because the API may only return the bare ledger row.
 */
function normalizeRow(apiResponse: unknown, prev: LedgerRow): LedgerRow {
  if (!apiResponse || typeof apiResponse !== 'object') return prev;
  const r = apiResponse as Record<string, unknown>;
  // Some APIs wrap the row under a key.
  const raw: Record<string, unknown> =
    (r.row as Record<string, unknown> | undefined) ??
    (r.ledger as Record<string, unknown> | undefined) ??
    (r.data as Record<string, unknown> | undefined) ??
    r;

  function pick<K extends keyof LedgerRow>(key: K, fallback: LedgerRow[K]): LedgerRow[K] {
    const v = raw[key as string];
    return (v === undefined || v === null ? fallback : (v as LedgerRow[K]));
  }

  return {
    id: (raw.id as string | undefined) ?? prev.id,
    dealId: pick('dealId', prev.dealId),
    dealTitle: pick('dealTitle', prev.dealTitle),
    closedAt: pick('closedAt', prev.closedAt),
    dealValue: pick('dealValue', prev.dealValue),
    agentUserId: pick('agentUserId', prev.agentUserId),
    agentName: pick('agentName', prev.agentName),
    agentEmail: pick('agentEmail', prev.agentEmail),
    agentRate: pick('agentRate', prev.agentRate),
    brokerRate: pick('brokerRate', prev.brokerRate),
    referralRate: pick('referralRate', prev.referralRate),
    referralUserId: pick('referralUserId', prev.referralUserId),
    agentAmount: pick('agentAmount', prev.agentAmount),
    brokerAmount: pick('brokerAmount', prev.brokerAmount),
    referralAmount: pick('referralAmount', prev.referralAmount),
    status: pick('status', prev.status),
    payoutAt: pick('payoutAt', prev.payoutAt),
    notes: pick('notes', prev.notes),
  };
}

// ── Main component ───────────────────────────────────────────────────────────

export function CommissionsClient({ ledger: initialLedger, defaultAgentRate, defaultBrokerRate }: Props) {
  const [ledger, setLedger] = useState<LedgerRow[]>(initialLedger);
  const [month, setMonth] = useState<string>(currentMonthKey());
  const [status, setStatus] = useState<StatusFilter>('all');
  const [pendingRowId, setPendingRowId] = useState<string | null>(null);
  const [editing, setEditing] = useState<LedgerRow | null>(null);

  // Derive available month options from the ledger (descending), plus the
  // current month so the default is always selectable.
  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    set.add(currentMonthKey());
    for (const r of ledger) set.add(monthKeyOf(r.closedAt));
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }, [ledger]);

  const filtered = useMemo(() => {
    return ledger.filter((r) => {
      if (monthKeyOf(r.closedAt) !== month) return false;
      if (status !== 'all' && r.status !== status) return false;
      return true;
    });
  }, [ledger, month, status]);

  // Summary across filtered rows
  const summary = useMemo(() => {
    let totalCommissions = 0;
    let totalValue = 0;
    let pending = 0;
    let paid = 0;
    for (const r of filtered) {
      totalValue += r.dealValue;
      totalCommissions += r.brokerAmount + r.agentAmount + r.referralAmount;
      if (r.status === 'paid') paid += r.brokerAmount;
      else if (r.status === 'pending') pending += r.brokerAmount;
    }
    return {
      totalCommissions,
      totalValue,
      totalDeals: filtered.length,
      pendingPayouts: pending,
      paidThisMonth: paid,
    };
  }, [filtered]);

  // Group filtered rows by agent for the per-agent breakdown.
  const byAgent = useMemo(() => {
    const map = new Map<
      string,
      {
        agentUserId: string;
        name: string;
        email: string;
        dealsClosed: number;
        totalValue: number;
        agentCommission: number;
        brokerCommission: number;
        rows: LedgerRow[];
      }
    >();
    for (const r of filtered) {
      const existing = map.get(r.agentUserId);
      if (existing) {
        existing.dealsClosed += 1;
        existing.totalValue += r.dealValue;
        existing.agentCommission += r.agentAmount;
        existing.brokerCommission += r.brokerAmount;
        existing.rows.push(r);
      } else {
        map.set(r.agentUserId, {
          agentUserId: r.agentUserId,
          name: r.agentName ?? r.agentEmail ?? 'Unknown',
          email: r.agentEmail ?? '',
          dealsClosed: 1,
          totalValue: r.dealValue,
          agentCommission: r.agentAmount,
          brokerCommission: r.brokerAmount,
          rows: [r],
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalValue - a.totalValue);
  }, [filtered]);

  async function changeStatus(row: LedgerRow, next: LedgerStatus) {
    setPendingRowId(row.id);
    try {
      const body: Record<string, unknown> = { status: next };
      if (next === 'paid') body.payoutAt = new Date().toISOString();
      const res = await fetch(`/api/broker/commissions/ledger/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? 'Failed to update status');
        return;
      }
      const updated = normalizeRow(data, { ...row, status: next, payoutAt: next === 'paid' ? (body.payoutAt as string) : row.payoutAt });
      setLedger((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
      toast.success(`Marked ${next}`);
    } catch {
      toast.error('Network error');
    } finally {
      setPendingRowId(null);
    }
  }

  function handleSavedRow(updated: LedgerRow) {
    setLedger((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  function handleExport() {
    const params = new URLSearchParams();
    params.set('month', month);
    params.set('format', 'csv');
    if (status !== 'all') params.set('status', status);
    const url = `/api/broker/commissions/export?${params.toString()}`;
    window.location.assign(url);
  }

  return (
    <div className="space-y-6">
      {/* Header toolbar */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="month-select" className="text-xs">Month</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger id="month-select" size="sm" className="min-w-[10rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="status-select" className="text-xs">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger id="status-select" size="sm" className="min-w-[8rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="void">Void</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="text-xs text-muted-foreground pb-2">
            Defaults: agent {decimalToPct(defaultAgentRate)}% &middot; broker {decimalToPct(defaultBrokerRate)}%
          </div>
        </div>

        <Button onClick={handleExport} size="sm">
          <Download size={14} className="mr-1.5" />
          Export CSV
        </Button>
      </div>

      {/* Summary — surface-card stat row. Cascades in once on first paint
          (StaggerReveal); each focal figure counts up on entry and re-counts
          when the month/status filter changes the underlying total
          (AnimatedNumber, reduced-motion aware). */}
      <StaggerReveal as="section" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total commissions"
          value={<AnimatedNumber value={summary.totalCommissions} format={formatCurrency} />}
        />
        <StatCard
          label="Pending (broker)"
          value={<AnimatedNumber value={summary.pendingPayouts} format={formatCurrency} />}
          dim={summary.pendingPayouts === 0}
        />
        <StatCard
          label="Paid (broker)"
          value={<AnimatedNumber value={summary.paidThisMonth} format={formatCurrency} />}
          dim={summary.paidThisMonth === 0}
        />
        <StatCard
          label="Total deal value"
          value={<AnimatedNumber value={summary.totalValue} format={formatCurrency} />}
        />
      </StaggerReveal>

      {/* Per-agent summary */}
      <SurfaceCard className="p-0 sm:p-0 overflow-hidden">
        <div className="px-6 pt-6 sm:px-7 sm:pt-7">
          <SurfaceCardHeader title="Per-agent commissions" />
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60">
                <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground sm:px-7">Agent</th>
                <th className="text-right px-3 py-3 text-xs font-medium text-muted-foreground">Deals</th>
                <th className="text-right px-3 py-3 text-xs font-medium text-muted-foreground">Total value</th>
                <th className="text-right px-3 py-3 text-xs font-medium text-muted-foreground">Agent owed</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-muted-foreground sm:px-7">Broker earned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {byAgent.map((a) => (
                <tr key={a.agentUserId} className="hover:bg-foreground/[0.04] transition-colors">
                  <td className="px-6 py-3 sm:px-7">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground flex-shrink-0">
                        {initials(a.name, a.email)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{a.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{a.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-xs font-medium">{a.dealsClosed}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-xs">{formatCurrency(a.totalValue)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-xs">{formatCurrency(a.agentCommission)}</td>
                  <td className="px-6 py-3 text-right tabular-nums text-xs font-medium sm:px-7">
                    {formatCurrency(a.brokerCommission)}
                  </td>
                </tr>
              ))}
              {byAgent.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 pb-8 pt-2 sm:px-7">
                    <TableEmpty icon={<Users size={20} strokeWidth={1.5} />}>
                      No ledger rows for the selected month and status.
                    </TableEmpty>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SurfaceCard>

      {/* Ledger detail table */}
      <SurfaceCard className="p-0 sm:p-0 overflow-hidden">
        <div className="px-6 pt-6 sm:px-7 sm:pt-7">
          <SurfaceCardHeader title="Ledger" />
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60">
                <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground sm:px-7">Deal</th>
                <th className="text-left px-3 py-3 text-xs font-medium text-muted-foreground">Agent</th>
                <th className="text-right px-3 py-3 text-xs font-medium text-muted-foreground">Closed</th>
                <th className="text-right px-3 py-3 text-xs font-medium text-muted-foreground">Value</th>
                <th className="text-right px-3 py-3 text-xs font-medium text-muted-foreground">Agent %</th>
                <th className="text-right px-3 py-3 text-xs font-medium text-muted-foreground">Broker %</th>
                <th className="text-right px-3 py-3 text-xs font-medium text-muted-foreground">Broker $</th>
                <th className="text-center px-3 py-3 text-xs font-medium text-muted-foreground">Status</th>
                <th className="w-10 px-2 py-3 sm:pr-7" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filtered.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-foreground/[0.04] transition-colors cursor-pointer"
                    onClick={(e) => {
                      // Ignore clicks that originated on the row-action dropdown.
                      const target = e.target as HTMLElement;
                      if (target.closest('[data-row-action]')) return;
                      setEditing(row);
                    }}
                  >
                    <td className="px-6 py-3 text-xs sm:px-7">
                      <p className="font-medium truncate max-w-[16rem]">{row.dealTitle ?? row.dealId}</p>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <p className="font-medium truncate max-w-[12rem]">{row.agentName ?? row.agentEmail ?? '—'}</p>
                      {row.agentName && row.agentEmail && (
                        <p className="text-[11px] text-muted-foreground truncate max-w-[12rem]">{row.agentEmail}</p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-xs">{formatDate(row.closedAt)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-xs">{formatCurrency(row.dealValue)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-xs">{formatPct(row.agentRate)}%</td>
                    <td className="px-3 py-3 text-right tabular-nums text-xs">{formatPct(row.brokerRate)}%</td>
                    <td className="px-3 py-3 text-right tabular-nums text-xs font-medium">
                      {formatCurrency(row.brokerAmount)}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <StatusPill className={STATUS_PILL[row.status].className}>
                        {STATUS_PILL[row.status].label}
                      </StatusPill>
                    </td>
                    <td className="px-2 py-3 text-right sm:pr-7" data-row-action>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={pendingRowId === row.id}
                            aria-label="Row actions"
                          >
                            {pendingRowId === row.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <MoreHorizontal size={14} />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            disabled={row.status === 'paid'}
                            onSelect={() => changeStatus(row, 'paid')}
                          >
                            Mark paid
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={row.status === 'pending'}
                            onSelect={() => changeStatus(row, 'pending')}
                          >
                            Mark pending
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={row.status === 'void'}
                            onSelect={() => changeStatus(row, 'void')}
                          >
                            Mark void
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => setEditing(row)}>
                            Edit row...
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 pb-8 pt-2 sm:px-7">
                    <TableEmpty icon={<Receipt size={20} strokeWidth={1.5} />}>
                      No ledger rows for the selected filters.
                    </TableEmpty>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SurfaceCard>

      <p className="text-xs text-muted-foreground">
        Ledger rows are snapshotted when a deal is won. Row rates reflect the rates
        in effect at that moment; changes to brokerage defaults only affect future
        won deals.
      </p>

      <EditRowDialog row={editing} onClose={() => setEditing(null)} onSaved={handleSavedRow} />
    </div>
  );
}

// ── Small UI bits ────────────────────────────────────────────────────────────

/**
 * Money-surface status tones for the shared StatusPill. On a ledger a broker
 * must tell paid / pending / void apart at a glance, so each state gets a
 * visually distinct tone rather than the identical bg-muted the old local pill
 * used:
 *   - paid    → filled positive (emerald) — money is out the door.
 *   - pending → the shared muted default — still owed.
 *   - void    → dim + struck through — cancelled, don't count it.
 */
const STATUS_PILL: Record<LedgerStatus, { label: string; className: string }> = {
  paid: { label: 'Paid', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  pending: { label: 'Pending', className: 'text-muted-foreground' },
  void: { label: 'Void', className: 'bg-muted/50 text-muted-foreground/50 line-through' },
};

/**
 * Designed calm empty state for a table body — a soft-circle icon over the
 * section's existing copy. Sits inside a full-width `<td>`.
 */
function TableEmpty({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center py-8 text-center">
      <span
        aria-hidden
        className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-foreground/[0.04] text-muted-foreground/60"
      >
        {icon}
      </span>
      <p className="max-w-xs text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
