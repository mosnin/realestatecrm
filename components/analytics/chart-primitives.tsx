'use client';

import { useState, useEffect } from 'react';
import { formatCompact as formatCurrency } from '@/lib/formatting';

// ── Dark mode hook for recharts colors ────────────────────────────────────

export function useChartTheme() {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return {
    isDark,
    tickColor: isDark ? '#a1a1aa' : '#71717a',
    gridColor: isDark ? '#27272a' : '#e4e4e7',
  };
}

// ── Stat card ─────────────────────────────────────────────────────────────

export function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-3 sm:px-5 sm:py-4">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className="text-xl sm:text-2xl font-bold mt-0.5 tabular-nums">{value}</p>
      {sub && <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Chart tooltip ─────────────────────────────────────────────────────────

export function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color ?? p.fill }}>
          {p.name ?? p.dataKey}:{' '}
          <span className="font-semibold">
            {typeof p.value === 'number' && p.name === 'Value'
              ? formatCurrency(p.value)
              : p.value}
          </span>
        </p>
      ))}
    </div>
  );
}

// ── Chart section wrapper ─────────────────────────────────────────────────

export function ChartSection({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 sm:p-5">
      <p className="font-semibold text-sm">{title}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5 mb-3 sm:mb-4">{sub}</p>}
      {!sub && <div className="mb-3 sm:mb-4" />}
      <div className="overflow-x-auto -mx-1 px-1">{children}</div>
    </div>
  );
}

export { formatCurrency };
