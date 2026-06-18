/**
 * Contact detail loading skeleton.
 *
 * Mirrors the real detail layout so the page settles rather than lurches:
 *   back link → serif name + status line → action-pill row → quick contact
 *   bar → a few collapsed <details> section headers (hairline-divided).
 */
export default function ContactDetailLoading() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-pulse">
      {/* Back link */}
      <div className="h-4 w-32 bg-muted rounded" />

      {/* Name + status sentence */}
      <div className="space-y-2.5">
        <div className="h-9 w-56 bg-muted rounded-lg" />
        <div className="h-4 w-72 bg-muted/70 rounded" />
      </div>

      {/* Action pills */}
      <div className="flex flex-wrap gap-2">
        {[88, 72, 96, 64].map((w, i) => (
          <div key={i} className="h-9 bg-muted rounded-full" style={{ width: w }} />
        ))}
      </div>

      {/* Quick contact bar */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border/60 pt-4">
        {[180, 130, 200].map((w, i) => (
          <div key={i} className="h-4 bg-muted/70 rounded" style={{ width: w }} />
        ))}
      </div>

      {/* Collapsed section headers */}
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex items-center justify-between border-t border-border/60 pt-4"
        >
          <div className="h-4 w-32 bg-muted rounded" />
          <div className="h-3 w-10 bg-muted/70 rounded" />
        </div>
      ))}
    </div>
  );
}
