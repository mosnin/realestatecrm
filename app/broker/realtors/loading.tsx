import { Skeleton } from '@/components/ui/skeleton';
import { BROKER_PAGE_READING, BROKER_PANEL, BROKER_ROW } from '@/components/broker/premium';

export default function BrokerRealtorsLoading() {
  return (
    <div className={`${BROKER_PAGE_READING} max-w-3xl animate-pulse`} aria-busy="true" data-broker-premium-state="loading">
      <span className="sr-only">Loading…</span>
      {/* Status-sentence header */}
      <header className="space-y-1.5">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </header>

      {/* Realtor rows with avatar + health pill */}
      <ul className={BROKER_PANEL}>
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i} className={`${BROKER_ROW} items-center gap-3`}>
            <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
            <div className="flex-1 min-w-0 space-y-1.5">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="h-5 w-24 rounded-full flex-shrink-0 hidden sm:block" />
            <Skeleton className="h-5 w-16 rounded-full flex-shrink-0 hidden md:block" />
          </li>
        ))}
      </ul>
    </div>
  );
}
