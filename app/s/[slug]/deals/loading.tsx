/**
 * Pipeline loading skeleton.
 *
 * Mirrors the real board's rhythm — serif-scale title block, a four-cell stat
 * strip, then staggered kanban columns each with a header and a couple of
 * card-height placeholders. Matching the live geometry means the first paint
 * doesn't jump when data arrives; the skeleton dissolves into the board
 * instead of being replaced by a different shape.
 */
export default function DealsLoading() {
  return (
    <div className="space-y-8 max-w-[1500px] mx-auto pb-12">
      {/* Header — H1-scale title placeholder + the "Tell Chippi" pill cluster. */}
      <div className="flex items-end justify-between gap-4">
        <div className="h-9 w-28 rounded-lg bg-foreground/[0.06] animate-pulse" />
        <div className="flex flex-col items-end gap-1.5">
          <div className="h-9 w-32 rounded-full bg-foreground/[0.06] animate-pulse" />
          <div className="h-3 w-20 rounded bg-foreground/[0.04] animate-pulse" />
        </div>
      </div>

      {/* Four-cell stat strip — same hairline-divided grid as PipelineSummary. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border/70 rounded-xl overflow-hidden border border-border/70">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-background p-5 space-y-2.5">
            <div className="h-7 w-12 rounded-md bg-foreground/[0.06] animate-pulse" />
            <div className="h-3.5 w-24 rounded bg-foreground/[0.05] animate-pulse" />
            <div className="h-3 w-16 rounded bg-foreground/[0.035] animate-pulse" />
          </div>
        ))}
      </div>

      {/* Kanban columns — header + drop-zone with a couple of card ghosts.
          A faint left-to-right fade-in stagger so the columns feel like
          they're arriving, not just sitting blank. */}
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 4 }).map((_, col) => (
          <div
            key={col}
            className="w-72 flex-shrink-0 space-y-3"
            style={{ animationDelay: `${col * 60}ms` }}
          >
            <div className="flex items-center justify-between px-1">
              <div className="h-4 w-24 rounded bg-foreground/[0.06] animate-pulse" />
              <div className="h-3 w-8 rounded bg-foreground/[0.04] animate-pulse" />
            </div>
            <div className="rounded-lg border border-border/70 bg-foreground/[0.02] p-2 space-y-2">
              {Array.from({ length: col % 2 === 0 ? 3 : 2 }).map((_, card) => (
                <div
                  key={card}
                  className="rounded-md border border-border/70 bg-background p-3 space-y-2 animate-pulse"
                  style={{ animationDelay: `${col * 60 + card * 40}ms` }}
                >
                  <div className="h-3.5 w-3/4 rounded bg-foreground/[0.06]" />
                  <div className="h-4 w-16 rounded bg-foreground/[0.05]" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
