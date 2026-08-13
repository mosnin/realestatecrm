import { Skeleton } from '@/components/ui/skeleton';
import { RealtorPage } from '../_components/realtor-page';

/**
 * Loading skeleton for the property wall. Mirrors the real grid's geometry —
 * header block + a grid of cover-first cards — so the route fades into its
 * own shape instead of flashing an empty page, then a reflow.
 */
export default function PropertiesLoading() {
  return (
    <RealtorPage width="wide" className="animate-pulse">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-3.5 w-40" />
        </div>
        <Skeleton className="h-9 w-32 rounded-full" />
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="chippi-dashboard-panel flex flex-col overflow-hidden rounded-[1.75rem]"
          >
            <Skeleton className="aspect-[4/3] w-full rounded-none" />
            <div className="space-y-3 p-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <div className="flex items-center justify-between pt-1">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-6 w-14 rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </RealtorPage>
  );
}
