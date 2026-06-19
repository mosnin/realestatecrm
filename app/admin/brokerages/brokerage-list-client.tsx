'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Building2, X, CheckCircle2, XCircle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import { SECTION_LABEL } from '@/lib/typography';

type BrokerageRow = {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  owner: { id: string; name: string | null; email: string } | null;
  memberCount: number;
};

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
] as const;

export function BrokerageListClient({
  brokerages,
  query,
  filter,
  resultCount,
}: {
  brokerages: BrokerageRow[];
  query: string;
  filter: string;
  resultCount: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(query);

  function navigate(newQuery?: string, newFilter?: string) {
    const params = new URLSearchParams();
    const q = newQuery ?? search;
    const f = newFilter ?? filter;
    if (q) params.set('q', q);
    if (f && f !== 'all') params.set('filter', f);
    startTransition(() => {
      router.push(`/admin/brokerages?${params.toString()}`);
    });
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          navigate(search);
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by brokerage name or owner name/email…"
            className="pl-9 pr-8"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                navigate('', filter);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <Button type="submit" size="sm" disabled={isPending}>
          Search
        </Button>
      </form>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => navigate(search, f.value)}
            className={cn(
              'text-xs font-medium px-3 py-1.5 rounded-full border transition-colors duration-150',
              filter === f.value
                ? 'bg-foreground text-background border-foreground'
                : 'bg-card text-muted-foreground border-border/70 hover:bg-foreground/[0.04] hover:text-foreground',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Count */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>
          <strong className="text-foreground font-semibold">{resultCount}</strong>{' '}
          {resultCount === 1 ? 'brokerage' : 'brokerages'}
        </span>
        {isPending && <span className="text-xs animate-pulse">Loading…</span>}
      </div>

      {/* Empty state */}
      {brokerages.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No brokerages found."
          description={query ? 'Try a different search term.' : 'No brokerages match the current filter.'}
        />
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className={cn('text-left px-4 py-3', SECTION_LABEL)}>Brokerage</th>
                  <th className={cn('text-left px-4 py-3 hidden sm:table-cell', SECTION_LABEL)}>
                    Owner
                  </th>
                  <th className={cn('text-left px-4 py-3 hidden md:table-cell', SECTION_LABEL)}>
                    Members
                  </th>
                  <th className={cn('text-left px-4 py-3', SECTION_LABEL)}>Status</th>
                  <th className={cn('text-left px-4 py-3 hidden lg:table-cell', SECTION_LABEL)}>
                    Created
                  </th>
                  <th className={cn('text-right px-4 py-3', SECTION_LABEL)}>&nbsp;</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {brokerages.map((b) => {
                  const isActive = b.status === 'active';
                  return (
                    <tr
                      key={b.id}
                      className="hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => router.push(`/admin/brokerages/${b.id}`)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-foreground/[0.06] flex items-center justify-center flex-shrink-0">
                            <Building2 size={14} className="text-foreground/70" />
                          </div>
                          <p className="font-semibold truncate max-w-[200px]">{b.name}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {b.owner ? (
                          <Link
                            href={`/admin/users/${b.owner.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-primary hover:underline underline-offset-2"
                          >
                            {b.owner.name ?? b.owner.email}
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-sm">{b.memberCount}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5',
                            isActive
                              ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15'
                              : 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/15',
                          )}
                        >
                          {isActive ? <CheckCircle2 size={9} /> : <XCircle size={9} />}
                          {isActive ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(b.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/brokerages/${b.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                        >
                          View
                          <ChevronRight size={12} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
