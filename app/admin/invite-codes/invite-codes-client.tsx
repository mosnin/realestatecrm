'use client';

/**
 * InviteCodesClient — the admin table + create dialog for invite codes.
 *
 * Visual language matches the admin announcements/list surfaces: hairline table,
 * a create Dialog, and the admin ConfirmDialog for the destructive deactivate.
 * Each code grants a Space FREE access (comp) at its plan when redeemed; the list
 * shows uses (usesCount / maxUses), expiry, comp duration, and active state.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Copy, Check, Ticket } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/app/admin/components/confirm-dialog';
import { PLANS, type PlanId } from '@/lib/plans';
import type { InviteCodeRow } from '@/lib/billing/invite-codes';

// Order plans cheapest-first; the $97 'solo' tier is the default selection.
const PLAN_OPTIONS = (Object.values(PLANS) as { id: PlanId; label: string; priceMonthly: number }[])
  .slice()
  .sort((a, b) => a.priceMonthly - b.priceMonthly);

type FormState = {
  code: string;
  plan: PlanId;
  maxUses: string;
  expiresAt: string;
  compDurationDays: string;
  note: string;
};

const EMPTY_FORM: FormState = {
  code: '',
  plan: 'solo',
  maxUses: '',
  expiresAt: '',
  compDurationDays: '',
  note: '',
};

function planLabel(plan: string): string {
  return plan in PLANS ? PLANS[plan as PlanId].label : plan;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function InviteCodesClient({ initialCodes }: { initialCodes: InviteCodeRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<InviteCodeRow[]>(initialCodes);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  function openCreate() {
    setForm(EMPTY_FORM);
    setErr(null);
    setDialogOpen(true);
  }

  async function handleCreate() {
    setErr(null);
    const payload = {
      code: form.code.trim() || undefined,
      plan: form.plan,
      maxUses: form.maxUses.trim() === '' ? null : Number(form.maxUses),
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      compDurationDays: form.compDurationDays.trim() === '' ? null : Number(form.compDurationDays),
      note: form.note.trim() || null,
    };

    setSaving(true);
    try {
      const res = await fetch('/api/admin/invite-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || 'Create failed.');
        return;
      }
      setRows((prev) => [data.code as InviteCodeRow, ...prev]);
      setDialogOpen(false);
      router.refresh();
    } catch {
      setErr('Network error. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(row: InviteCodeRow) {
    const res = await fetch(`/api/admin/invite-codes?id=${encodeURIComponent(row.id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return data.error || 'Could not deactivate the code.';
    }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, active: false } : r)));
    router.refresh();
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 1500);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">
          {rows.length} {rows.length === 1 ? 'code' : 'codes'}
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus size={14} className="mr-1" />
          New code
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title="No invite codes yet."
          description="Create one to give a workspace free access at a chosen plan, no payment required."
        />
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Code</th>
                  <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Plan</th>
                  <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Uses</th>
                  <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hidden md:table-cell">Comp</th>
                  <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hidden lg:table-cell">Expires</th>
                  <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hidden lg:table-cell">Note</th>
                  <th className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Active</th>
                  <th className="text-right px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {rows.map((r) => {
                  const exhausted = r.maxUses != null && r.usesCount >= r.maxUses;
                  return (
                    <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => copyCode(r.code)}
                          className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold hover:text-foreground transition-colors"
                          title="Copy code"
                        >
                          {r.code}
                          {copied === r.code ? (
                            <Check size={12} className="text-emerald-600" />
                          ) : (
                            <Copy size={12} className="text-muted-foreground" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-xs">{planLabel(r.plan)}</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        <span className={cn(exhausted && 'text-amber-600 dark:text-amber-400')}>
                          {r.usesCount}
                          {r.maxUses != null ? ` / ${r.maxUses}` : ' / ∞'}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground whitespace-nowrap">
                        {r.compDurationDays != null ? `${r.compDurationDays}d` : 'Indefinite'}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground whitespace-nowrap">
                        {fmtDate(r.expiresAt)}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                        <span className="block max-w-[200px] truncate">{r.note || '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center text-[10px] font-semibold rounded-full px-2 py-0.5 border',
                            r.active
                              ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-500/15 dark:border-emerald-500/30'
                              : 'text-muted-foreground bg-muted border-border',
                          )}
                        >
                          {r.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {r.active ? (
                            <ConfirmDialog
                              trigger={
                                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                                  Deactivate
                                </Button>
                              }
                              title="Deactivate invite code"
                              description={
                                <>
                                  Deactivate <strong className="font-mono">{r.code}</strong>? It can no longer be
                                  redeemed. Workspaces that already redeemed it keep their access.
                                </>
                              }
                              confirmLabel="Deactivate"
                              tone="danger"
                              onConfirm={() => deactivate(r)}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New invite code</DialogTitle>
            <DialogDescription>
              Grants a workspace free access at the chosen plan when redeemed — bypassing payment.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Code (optional)</label>
              <Input
                value={form.code}
                maxLength={64}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="Leave blank to auto-generate"
                className="font-mono"
              />
              <p className="text-[10px] text-muted-foreground">
                Case-insensitive. Leave blank for a secure random code.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">Plan</label>
              <Select value={form.plan} onValueChange={(v) => setForm({ ...form, plan: v as PlanId })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLAN_OPTIONS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label} — ${p.priceMonthly}/mo
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Max uses</label>
                <Input
                  type="number"
                  min={1}
                  value={form.maxUses}
                  onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                  placeholder="Unlimited"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Comp duration (days)</label>
                <Input
                  type="number"
                  min={1}
                  value={form.compDurationDays}
                  onChange={(e) => setForm({ ...form, compDurationDays: e.target.value })}
                  placeholder="Indefinite"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">Code expires at (optional)</label>
              <Input
                type="datetime-local"
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
              />
              <p className="text-[10px] text-muted-foreground">
                After this, the code can’t be redeemed. Separate from the comp duration above.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">Note (optional)</label>
              <Input
                value={form.note}
                maxLength={500}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="Partner: Acme webinar"
              />
            </div>

            {err && <p className="text-xs text-destructive">{err}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating…' : 'Create code'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
