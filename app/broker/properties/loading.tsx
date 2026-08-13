import { Skeleton } from '@/components/ui/skeleton';
import { BROKER_PAGE_READING, BROKER_PANEL, BROKER_ROW } from '@/components/broker/premium';

export default function BrokerPropertiesLoading() {
  return (
    <div className={`${BROKER_PAGE_READING} animate-pulse`} aria-busy="true" data-broker-premium-state="loading">
      <span className="sr-only">Loading…</span>
      {/* Header + add button */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>

      {/* Search bar */}
      <Skeleton className="h-9 w-full rounded-lg" />

      {/* Property rows: thumbnail + meta */}
      <div className={BROKER_PANEL}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={`${BROKER_ROW} items-center gap-4`}>
            <Skeleton className="w-[128px] aspect-[4/3] rounded-md flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <div className="text-right space-y-2 flex-shrink-0">
              <Skeleton className="h-5 w-24 ml-auto" />
              <Skeleton className="h-3 w-16 ml-auto" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
