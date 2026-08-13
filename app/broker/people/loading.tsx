import { Skeleton } from '@/components/ui/skeleton';
import { BROKER_PAGE_WIDE, BROKER_PANEL, BROKER_ROW } from '@/components/broker/premium';

export default function BrokerPeopleLoading() {
  return (
    <div className={`${BROKER_PAGE_WIDE} animate-pulse`} aria-busy="true" data-broker-premium-state="loading">
      <span className="sr-only">Loading…</span>
      {/* Header + search bar row */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-9 w-28" />
      </div>

      {/* Search + filter row */}
      <div className="flex gap-3">
        <Skeleton className="h-9 flex-1 rounded-lg" />
        <Skeleton className="h-9 w-32 rounded-lg" />
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>

      {/* Divide-y contact rows */}
      <div className={BROKER_PANEL}>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className={`${BROKER_ROW} items-center gap-4`}>
            <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
            <div className="flex-1 min-w-0 space-y-1.5">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="h-5 w-14 rounded-full hidden sm:block" />
            <Skeleton className="h-5 w-16 rounded-full hidden md:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
