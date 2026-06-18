/**
 * Contacts loading skeleton.
 *
 * Mirrors the REAL surface so the page settles into place instead of lurching:
 *   - the three-up performance strip that sits above the table
 *   - the search + filter toolbar
 *   - list rows (the default view is list, not the card grid) — each row is an
 *     avatar dot + two stacked text lines, the shape ContactTable renders.
 */
export default function ContactsLoading() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12 animate-pulse">
      {/* Performance strip — three numbers above the book */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border/70 bg-card p-4 space-y-2">
            <div className="h-2.5 w-20 bg-muted rounded" />
            <div className="h-7 w-16 bg-muted rounded-lg" />
          </div>
        ))}
      </div>

      {/* Title + add */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 bg-muted rounded-lg" />
        <div className="h-9 w-28 bg-muted rounded-full" />
      </div>

      {/* Search + filters */}
      <div className="flex gap-3">
        <div className="h-9 flex-1 bg-muted rounded-lg" />
        <div className="h-9 w-28 bg-muted rounded-lg" />
      </div>

      {/* List rows */}
      <div className="rounded-xl border border-border/70 divide-y divide-border/60 overflow-hidden">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 bg-muted rounded" style={{ width: `${48 + ((i * 11) % 30)}%` }} />
              <div className="h-2.5 w-1/3 bg-muted/70 rounded" />
            </div>
            <div className="h-5 w-12 bg-muted/70 rounded-full shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
