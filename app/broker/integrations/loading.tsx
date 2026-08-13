import { Skeleton } from '@/components/ui/skeleton';
import { BROKER_PAGE_READING, BROKER_PANEL, BROKER_ROW } from '@/components/broker/premium';

export default function BrokerIntegrationsLoading() {
  return (
    <div className={`${BROKER_PAGE_READING} max-w-prose animate-pulse`} aria-busy="true" data-broker-premium-state="loading">
      <span className="sr-only">Loading…</span>
      {/* Status-sentence header */}
      <header className="space-y-1.5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-72" />
      </header>

      {/* Integration card rows */}
      <div className={BROKER_PANEL}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={`${BROKER_ROW} items-center gap-4`}
          >
            <Skeleton className="h-9 w-9 rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-52" />
            </div>
            <Skeleton className="h-8 w-20 rounded-lg flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
