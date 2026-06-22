/**
 * Loading skeleton for /apply/[slug].
 *
 * Mirrors the redesigned IntakeChatShell's silhouette: a full-bleed
 * brand-warm canvas with a single centered focal column — identity mark,
 * progress dots, then a serif-question-shaped block. No card, no purple
 * gradients, so the hand-off to the real surface reads as the same product.
 */
export default function ApplyLoading() {
  return (
    <div className="relative min-h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* Brand-warm wash */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 bg-gradient-to-br from-orange-50/70 via-background to-orange-50/50 dark:from-orange-500/[0.05] dark:via-background dark:to-orange-500/[0.03]"
      />
      {/* Paper grain */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.025] dark:opacity-[0.05]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
          backgroundSize: '26px 26px',
        }}
      />

      <div className="relative z-10 flex min-h-dvh flex-col">
        <main className="flex flex-1 flex-col justify-center px-6 py-20 sm:py-24">
          <div className="mx-auto w-full max-w-xl">
            {/* Identity mark */}
            <div className="mb-10 flex flex-col items-center sm:mb-12">
              <div className="h-14 w-14 animate-pulse rounded-full bg-muted/70" />
              <div className="mt-3 h-5 w-36 animate-pulse rounded bg-muted/70" />
            </div>

            {/* Progress dots */}
            <div className="mb-8 flex justify-center gap-1.5">
              <span className="h-1.5 w-6 rounded-full bg-foreground/15" />
              {Array.from({ length: 7 }).map((_, i) => (
                <span key={i} className="h-1.5 w-1.5 rounded-full bg-foreground/15" />
              ))}
            </div>

            {/* Focal question + answer */}
            <div className="flex flex-col items-center">
              <div className="h-9 w-4/5 animate-pulse rounded bg-muted/70" />
              <div className="mt-2 h-9 w-2/5 animate-pulse rounded bg-muted/70" />
              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <div className="h-14 w-36 animate-pulse rounded-2xl bg-muted/50" />
                <div className="h-14 w-36 animate-pulse rounded-2xl bg-muted/50" />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
