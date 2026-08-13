import { Skeleton } from '@/components/ui/skeleton';
import { BROKER_PAGE_WIDE, BROKER_PANEL } from '@/components/broker/premium';

/**
 * Loading skeleton for the broker deals board. Geometry mirrors the real
 * page exactly — same max width, the SECTION_RHYTHM (space-y-6) gap below the
 * header, and 72px columns with a header strip + stacked card blocks — so the
 * board does not reflow when the live data swaps in.
 */
export default function BrokerDealsLoading() {
  return (
    <div className={`${BROKER_PAGE_WIDE} animate-pulse`} aria-busy="true" data-broker-premium-state="loading">
      <span className="sr-only">Loading…</span>
      {/* Status-sentence header — eyebrow, serif title, status line. */}
      <header className="space-y-1.5">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-4 w-72" />
      </header>

      {/* Kanban columns — header row (dot + name + total) then card blocks. */}
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="w-72 flex-shrink-0">
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <Skeleton className="h-2 w-2 rounded-full" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-6 rounded-full" />
              </div>
              <Skeleton className="h-3 w-10" />
            </div>
            <div className={`${BROKER_PANEL} space-y-2 p-2`}>
              <Skeleton className="h-24 w-full rounded-md" />
              <Skeleton className="h-24 w-full rounded-md" />
              <Skeleton className="h-20 w-full rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
