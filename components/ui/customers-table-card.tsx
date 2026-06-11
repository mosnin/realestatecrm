'use client'

/**
 * CustomersTableCard — the provided table component, integrated verbatim in
 * structure and tailored to Chippi: status labels are deal outcomes
 * (Closed / Active / Lost), "revenue" is deal value, and avatars are initials
 * placeholders (no external headshots to 404). Badge tones use the calm
 * palette (emerald / amber / rose) instead of lime / yellow / red.
 */

import * as React from 'react'
import { cn } from '@/lib/utils'

export type Customer = {
  id: number | string
  date: string
  status: 'Closed' | 'Lost' | 'Active'
  statusVariant: 'success' | 'danger' | 'warning'
  name: string
  avatar: string
  revenue: string
}

export type CustomersTableCardProps = {
  title?: string
  subtitle?: string
  className?: string
  customers?: Customer[]
}

const DEFAULT_CUSTOMERS: Customer[] = [
  { id: 1, date: 'Oct 31', status: 'Closed', statusVariant: 'success', name: 'Bernard Ng', avatar: 'https://avatars.githubusercontent.com/u/31113941?v=4', revenue: '$1,200,000' },
  { id: 2, date: 'Oct 21', status: 'Active', statusVariant: 'warning', name: 'Maya Patel', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=64&h=64&fit=crop&crop=faces&q=80', revenue: '$740,000' },
  { id: 3, date: 'Oct 15', status: 'Closed', statusVariant: 'success', name: 'Glodie Roy', avatar: 'https://avatars.githubusercontent.com/u/99137927?v=4', revenue: '$2,400,000' },
  { id: 4, date: 'Oct 12', status: 'Lost', statusVariant: 'danger', name: 'Theo Marsh', avatar: 'https://avatars.githubusercontent.com/u/68236786?v=4', revenue: '$620,000' },
]

const Badge = ({
  children,
  variant,
}: {
  children: React.ReactNode
  variant: 'success' | 'danger' | 'warning'
}) => {
  const styles =
    variant === 'success'
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
      : variant === 'danger'
        ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400'
        : 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'

  return <span className={cn('rounded-full px-2 py-1 text-xs font-medium', styles)}>{children}</span>
}

export default function CustomersTableCard({
  title = 'Your book of business',
  subtitle = 'Clients and deals, ranked by what needs you next.',
  customers = DEFAULT_CUSTOMERS,
  className,
}: CustomersTableCardProps) {
  return (
    <section
      className={cn(
        'relative w-full overflow-hidden rounded-2xl border border-border/60 bg-background shadow-md shadow-foreground/5 ring-1 ring-foreground/5',
        className,
      )}
      aria-label={title}
    >
      {/* Header */}
      <div className="space-y-1 border-b border-border/60 p-6">
        <div className="flex items-center gap-1.5">
          <span className="size-2 rounded-full border border-black/5 bg-muted" />
          <span className="size-2 rounded-full border border-black/5 bg-muted" />
          <span className="size-2 rounded-full border border-black/5 bg-muted" />
        </div>
        <h2 className="text-lg font-semibold leading-none tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      {/* Table wrapper for responsive overflow */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted/50 supports-[backdrop-filter]:backdrop-blur-sm">
            <tr className="text-muted-foreground *:px-3 *:py-3 *:text-left *:font-medium">
              <th className="w-12">#</th>
              <th className="min-w-[120px]">Date</th>
              <th className="min-w-[120px]">Status</th>
              <th className="min-w-[220px]">Client</th>
              <th className="min-w-[120px] pr-4 text-right">Deal value</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer, idx) => (
              <tr
                key={customer.id}
                className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/30 *:px-3 *:py-2"
              >
                <td className="text-muted-foreground">{idx + 1}</td>
                <td className="whitespace-nowrap">{customer.date}</td>
                <td>
                  <Badge variant={customer.statusVariant}>{customer.status}</Badge>
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="size-7 overflow-hidden rounded-full ring-1 ring-border/60">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={customer.avatar} alt={customer.name} width={28} height={28} loading="lazy" />
                    </div>
                    <span className="truncate font-medium text-foreground">{customer.name}</span>
                  </div>
                </td>
                <td className="pr-4 text-right font-medium tabular-nums">{customer.revenue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border/60 p-4 text-xs text-muted-foreground">
        <span>
          Showing <strong>{customers.length}</strong> {customers.length === 1 ? 'row' : 'rows'}
        </span>
        <span>Updated just now</span>
      </div>
    </section>
  )
}
