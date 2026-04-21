'use client';

import { formatCompact as formatCurrency } from '@/lib/formatting';

// ── Re-export shadcn chart primitives ─────────────────────────────────────

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
export type { ChartConfig } from '@/components/ui/chart';

// ── Stat card ─────────────────────────────────────────────────────────────

export function StatCard({
  label,
  value,
  sub,
  trend,
}: {
  label: string;
  value: string | number;
  sub?: string;
  trend?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 sm:px-5 sm:py-4">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className="text-xl sm:text-2xl font-bold mt-0.5 tabular-nums">{value}</p>
      {sub && <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">{sub}</p>}
      {trend && <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">{trend}</p>}
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
