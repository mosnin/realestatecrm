'use client';

/**
 * Platform-admin credit tool for the /admin/billing dashboard (Fix #5).
 *
 * Backend already exists at /api/admin/billing (grant / reverse a txn, with
 * balance + recent ledger). This is the missing UI: pick an account (space or
 * brokerage by id), load its plan + balance + recent transactions, then grant
 * credits (amount + optional expiry) or reverse a specific debit. Credit-refund
 * is explicitly labeled NOT a money refund.
 */

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/app/admin/components/confirm-dialog';
import { Coins, Plus, RefreshCw, Search, Undo2 } from 'lucide-react';

type AccountType = 'space' | 'brokerage';

interface TxnRow {
  id: string;
  delta: number;
  workflow: string;
  reason: string | null;
  createdAt: string;
}

export function BillingCreditTool() {
  const [accountType, setAccountType] = useState<AccountType>('space');
  const [accountId, setAccountId] = useState('');
  const [loadedAccount, setLoadedAccount] = useState<{ type: AccountType; id: string } | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [txns, setTxns] = useState<TxnRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [grantAmount, setGrantAmount] = useState(1000);
  const [grantExpiry, setGrantExpiry] = useState<'30d' | 'never'>('30d');
  const [grantLoading, setGrantLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const load = useCallback(
    async (type: AccountType, id: string) => {
      if (!id.trim()) {
        setResult('Enter an account id.');
        return;
      }
      setLoading(true);
      setResult(null);
      try {
        const res = await fetch(`/api/admin/billing?accountType=${type}&accountId=${encodeURIComponent(id.trim())}`);
        const data = await res.json();
        if (res.ok) {
          setLoadedAccount({ type, id: id.trim() });
          setPlan(data.plan ?? null);
          setBalance(data.balance ?? 0);
          setTxns(Array.isArray(data.txns) ? data.txns : []);
        } else {
          setResult(data.error || 'Lookup failed.');
        }
      } catch {
        setResult('Network error.');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  async function handleGrant() {
    if (!loadedAccount) return;
    if (!Number.isInteger(grantAmount) || grantAmount <= 0) {
      setResult('Grant amount must be a positive integer.');
      return;
    }
    setGrantLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'grant',
          accountType: loadedAccount.type,
          accountId: loadedAccount.id,
          amount: grantAmount,
          expiry: grantExpiry === 'never' ? 'never' : '30d',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setBalance(data.balance ?? balance);
        setResult(`Granted ${grantAmount.toLocaleString()} credits.`);
        await load(loadedAccount.type, loadedAccount.id);
      } else {
        setResult(data.error || 'Grant failed.');
      }
    } catch {
      setResult('Network error.');
    } finally {
      setGrantLoading(false);
    }
  }

  async function handleReverse(txnId: string) {
    if (!loadedAccount) return;
    const res = await fetch('/api/admin/billing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'refund', accountType: loadedAccount.type, accountId: loadedAccount.id, txnId }),
    });
    const data = await res.json();
    if (res.ok) {
      setResult('Credit transaction reversed.');
      await load(loadedAccount.type, loadedAccount.id);
      return;
    }
    return data.error || 'Reverse failed.';
  }

  const selectClass =
    'text-xs rounded-md border border-border bg-card px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring';

  return (
    <Card>
      <CardContent className="px-5 py-4 space-y-4">
        <div>
          <p className="text-sm font-medium flex items-center gap-1.5">
            <Coins size={14} />
            Credit management
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Look up an account by id (Space or Brokerage), view its balance + ledger, grant credits, or
            reverse a debit. Granting/reversing credits changes the in-app ledger only — it is NOT a money
            refund.
          </p>
        </div>

        {/* Account picker */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-muted-foreground">Account type</label>
            <select value={accountType} onChange={(e) => setAccountType(e.target.value as AccountType)} className={selectClass}>
              <option value="space">Space</option>
              <option value="brokerage">Brokerage</option>
            </select>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
            <label className="text-[11px] text-muted-foreground">Account id</label>
            <input
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') load(accountType, accountId); }}
              placeholder="UUID of the Space or Brokerage"
              className="text-xs rounded-md border border-border bg-card px-2 py-1.5 font-mono focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => load(accountType, accountId)} disabled={loading} className="text-xs gap-1.5">
            <Search size={13} className={loading ? 'animate-pulse' : ''} />
            {loading ? 'Loading…' : 'Load account'}
          </Button>
        </div>

        {loadedAccount && (
          <div className="space-y-3 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">
              {loadedAccount.type} <span className="font-mono">{loadedAccount.id.slice(0, 12)}…</span> · plan{' '}
              <span className="font-medium">{plan ?? '—'}</span> · balance{' '}
              <span className="font-medium tabular-nums">{(balance ?? 0).toLocaleString()}</span> credits
            </p>

            {/* Grant */}
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
              <Button variant="ghost" size="sm" onClick={() => load(loadedAccount.type, loadedAccount.id)} className="text-xs gap-1.5">
                <RefreshCw size={12} />
                Refresh
              </Button>
            </div>

            {/* Ledger */}
            {txns.length > 0 ? (
              <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                <p className="px-3 py-1.5 text-[11px] font-medium text-muted-foreground bg-muted/40">Recent ledger</p>
                {txns.slice(0, 15).map((t) => (
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
                        description="This adjusts the in-app credit ledger only — it does NOT refund money. Use a Stripe refund to return money."
                        confirmLabel="Reverse transaction"
                        tone="danger"
                        onConfirm={() => handleReverse(t.id)}
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No ledger transactions for this account.</p>
            )}
          </div>
        )}

        {result && <p className="text-xs text-muted-foreground">{result}</p>}
      </CardContent>
    </Card>
  );
}
