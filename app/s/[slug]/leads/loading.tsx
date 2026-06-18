/**
 * Leads (Applications) loading skeleton.
 *
 * Mirrors the real surface — header + People tabs + tier-summary bar + list
 * rows — so the page settles rather than lurches into place.
 */
export default function LeadsLoading() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12 animate-pulse">
      {/* Header */}
      <div className="space-y-2">
        <div className="h-3.5 w-16 bg-muted/70 rounded" />
        <div className="h-9 w-48 bg-muted rounded-lg" />
        <div className="h-4 w-64 bg-muted/70 rounded" />
      </div>

      {/* People tabs */}
      <div className="flex gap-2">
        {[72, 64, 80].map((w, i) => (
          <div key={i} className="h-8 bg-muted rounded-full" style={{ width: w }} />
        ))}
      </div>

      {/* Tier summary bar */}
      <div className="h-12 bg-muted/60 rounded-xl" />

      {/* List rows */}
      <div className="rounded-xl border border-border/70 divide-y divide-border/60 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-4">
            <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 bg-muted rounded" style={{ width: `${46 + ((i * 13) % 32)}%` }} />
              <div className="h-2.5 w-2/5 bg-muted/70 rounded" />
            </div>
            <div className="h-5 w-14 bg-muted/70 rounded-full shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
