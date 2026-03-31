'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { DollarSign, TrendingUp, Clock, CheckCircle2 } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgentCommissionData {
  userId: string;
  name: string;
  email: string;
  role: string;
  dealsClosed: number;
  totalValue: number;
  deals: Array<{
    id: string;
    title: string;
    value: number;
    closedAt: string;
  }>;
}

interface Props {
  agents: AgentCommissionData[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function initials(name: string) {
  return name
    .split(/[\s@]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function isInMonth(iso: string, year: number, month: number): boolean {
  const d = new Date(iso);
  return d.getFullYear() === year && d.getMonth() === month;
}

// ── Main component ───────────────────────────────────────────────────────────

export function CommissionsClient({ agents }: Props) {
  // Commission rates per agent (userId -> rate as decimal, e.g. 0.03 for 3%)
  const [rates, setRates] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const a of agents) {
      initial[a.userId] = 0.03; // Default 3%
    }
    return initial;
  });

  // Date range filter
  const [dateRange, setDateRange] = useState<'all' | '30d' | '90d' | 'ytd'>('all');

  const filteredAgents = useMemo(() => {
    const now = new Date();
    return agents.map((agent) => {
      let filtered = agent.deals;

      if (dateRange === '30d') {
        const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        filtered = agent.deals.filter((d) => new Date(d.closedAt) >= cutoff);
      } else if (dateRange === '90d') {
        const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        filtered = agent.deals.filter((d) => new Date(d.closedAt) >= cutoff);
      } else if (dateRange === 'ytd') {
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        filtered = agent.deals.filter((d) => new Date(d.closedAt) >= startOfYear);
      }

      const totalValue = filtered.reduce((sum, d) => sum + d.value, 0);
      return {
        ...agent,
        deals: filtered,
        dealsClosed: filtered.length,
        totalValue,
      };
    });
  }, [agents, dateRange]);

  // Summary calculations
  const summary = useMemo(() => {
    let totalCommissions = 0;
    let totalValue = 0;
    let totalDeals = 0;
    const now = new Date();
    let paidThisMonth = 0;

    for (const agent of filteredAgents) {
      const rate = rates[agent.userId] ?? 0.03;
      const commission = agent.totalValue * rate;
      totalCommissions += commission;
      totalValue += agent.totalValue;
      totalDeals += agent.dealsClosed;

      // "Paid this month" = commissions from deals closed this month
      const thisMonthDeals = agent.deals.filter((d) =>
        isInMonth(d.closedAt, now.getFullYear(), now.getMonth())
      );
      paidThisMonth += thisMonthDeals.reduce((s, d) => s + d.value * rate, 0);
    }

    return {
      totalCommissions,
      totalValue,
      totalDeals,
      pendingPayouts: totalCommissions - paidThisMonth,
      paidThisMonth,
    };
  }, [filteredAgents, rates]);

  function handleRateChange(userId: string, value: string) {
    const num = parseFloat(value);
    if (isNaN(num) || num < 1 || num > 10) return;
    setRates((prev) => ({ ...prev, [userId]: num / 100 }));
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <DollarSign size={15} className="text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
            <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatCurrency(summary.totalCommissions)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Total Commissions Earned</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Clock size={15} className="text-amber-600 dark:text-amber-400" />
              </div>
            </div>
            <p className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
              {formatCurrency(summary.pendingPayouts)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Pending Payouts</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <CheckCircle2 size={15} className="text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <p className="text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400">
              {formatCurrency(summary.paidThisMonth)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Paid This Month</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <TrendingUp size={15} className="text-primary" />
              </div>
            </div>
            <p className="text-2xl font-bold tabular-nums">
              {formatCurrency(summary.totalValue)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Total Deal Value</p>
          </CardContent>
        </Card>
      </div>

      {/* Date range filter */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Per-Agent Commissions</h2>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
          {([
            ['all', 'All Time'],
            ['ytd', 'YTD'],
            ['90d', '90 Days'],
            ['30d', '30 Days'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setDateRange(key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                dateRange === key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Agent commission table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Agent</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Deals Closed</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total Value</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Commission Rate</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount Owed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {filteredAgents.map((agent) => {
                const rate = rates[agent.userId] ?? 0.03;
                const commission = agent.totalValue * rate;

                return (
                  <tr key={agent.userId} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
                          {initials(agent.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{agent.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{agent.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-xs font-semibold">
                      {agent.dealsClosed}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-xs">
                      {formatCurrency(agent.totalValue)}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="inline-flex items-center gap-1">
                        <input
                          type="number"
                          min={1}
                          max={10}
                          step={0.5}
                          value={Math.round(rate * 100 * 10) / 10}
                          onChange={(e) => handleRateChange(agent.userId, e.target.value)}
                          className="w-14 text-center text-xs font-medium border border-border rounded-md py-1 bg-background text-foreground tabular-nums"
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(commission)}
                    </td>
                  </tr>
                );
              })}
              {filteredAgents.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No won deals found for the selected period.
                  </td>
                </tr>
              )}
              {/* Totals row */}
              {filteredAgents.length > 0 && (
                <tr className="bg-muted/40 font-semibold">
                  <td className="px-4 py-3 text-xs font-bold">Team Total</td>
                  <td className="px-3 py-3 text-right tabular-nums text-xs font-bold">
                    {summary.totalDeals}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-xs font-bold">
                    {formatCurrency(summary.totalValue)}
                  </td>
                  <td className="px-3 py-3 text-center text-xs text-muted-foreground">--</td>
                  <td className="px-4 py-3 text-right tabular-nums text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(summary.totalCommissions)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Info note */}
      <p className="text-xs text-muted-foreground">
        Commission rates are adjustable per agent (1-10%). Default is 3%. Rates are calculated on-the-fly based on won deal values. Adjust rates above to see updated commission amounts instantly.
      </p>
    </div>
  );
}
