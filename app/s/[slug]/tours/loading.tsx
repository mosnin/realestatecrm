import { PAGE_RHYTHM } from '@/lib/typography';

/**
 * Tours loading skeleton — shaped to the real page (title, stats strip,
 * tab rail, agenda rows) so the layout settles into itself instead of
 * flashing a generic block. A single shimmer sweep keeps it calm.
 */
export default function ToursLoading() {
  return (
    <div className={PAGE_RHYTHM} aria-busy="true">
      <span className="sr-only">Loading tours…</span>

      {/* Header */}
      <div className="flex items-end justify-between gap-4 animate-pulse">
        <div className="h-8 w-24 rounded-lg bg-muted" />
        <div className="h-8 w-20 rounded-md bg-muted/70" />
      </div>

      {/* Search */}
      <div className="h-9 w-full max-w-sm rounded-lg bg-muted/60 animate-pulse" />

      {/* Stats strip — four instruments */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-border/70 bg-background p-5 space-y-2 animate-pulse"
          >
            <div className="h-7 w-14 rounded bg-muted" />
            <div className="h-3 w-16 rounded bg-muted/60" />
          </div>
        ))}
      </div>

      {/* Tab rail */}
      <div className="flex items-center gap-4 border-b border-border/70 pb-3 animate-pulse">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-4 w-16 rounded bg-muted/70" />
        ))}
      </div>

      {/* Agenda rows */}
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-border/80 bg-card p-4 animate-pulse"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-muted shrink-0" />
              <div className="hidden sm:block space-y-1.5 sm:min-w-[150px]">
                <div className="h-3.5 w-28 rounded bg-muted/70" />
                <div className="h-2.5 w-36 rounded bg-muted/50" />
              </div>
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-40 rounded bg-muted/70" />
                <div className="h-2.5 w-3/4 rounded bg-muted/50" />
              </div>
              <div className="h-7 w-7 rounded-md bg-muted/60 shrink-0" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
