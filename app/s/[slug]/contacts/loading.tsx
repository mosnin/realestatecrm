/**
 * Contacts loading skeleton mirrors the premium overview composition:
 * generous page header, one quiet summary band, then one dense paper list.
 * Keeping the exact macro geometry prevents the authenticated canvas from
 * lurching when the client-owned contacts data arrives.
 */
export default function ContactsLoading() {
  return (
    <div className="chippi-dashboard-canvas mx-auto min-h-[calc(100vh-10rem)] w-full max-w-6xl animate-pulse pb-12 pt-3 sm:pt-5">
      <div className="space-y-10 sm:space-y-12">
        <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <div className="h-3.5 w-14 rounded bg-muted" />
            <div className="h-12 w-72 max-w-[78vw] rounded-lg bg-muted" />
            <div className="h-3.5 w-36 rounded bg-muted/80" />
          </div>
          <div className="h-9 w-28 rounded-full bg-muted" />
        </header>

        <section className="chippi-dashboard-panel overflow-hidden rounded-[1.75rem]">
          <div className="grid grid-cols-1 divide-y divide-border/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="space-y-3 px-5 py-5 sm:px-7 sm:py-6 lg:px-8">
                <div className="h-2.5 w-24 rounded bg-muted" />
                <div className="h-9 w-20 rounded-lg bg-muted" />
              </div>
            ))}
          </div>
        </section>

        <section className="chippi-dashboard-panel overflow-hidden rounded-[1.75rem] p-4 sm:p-6 lg:p-8">
          <div className="flex gap-5 border-b border-border/70 pb-3">
            {[16, 14, 17, 15].map((width, index) => (
              <div
                key={index}
                className="h-4 rounded bg-muted"
                style={{ width: `${width * 4}px` }}
              />
            ))}
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="h-9 w-full rounded-full bg-muted sm:max-w-sm" />
            <div className="flex gap-2 overflow-hidden">
              <div className="h-9 w-28 shrink-0 rounded-full bg-muted" />
              <div className="h-9 w-32 shrink-0 rounded-full bg-muted" />
              <div className="h-9 w-20 shrink-0 rounded-full bg-muted" />
            </div>
          </div>
          <div className="mt-6 hidden grid-cols-[minmax(0,1.25fr)_minmax(0,1.25fr)_7rem_5rem_7rem_6rem] gap-4 border-b border-border/60 pb-2 lg:grid">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-2.5 w-12 rounded bg-muted/80" />
            ))}
          </div>
          <div className="divide-y divide-border/60">
            {Array.from({ length: 7 }).map((_, index) => (
              <div
                key={index}
                className="grid grid-cols-1 gap-2 py-3.5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1.25fr)_7rem_5rem_7rem_6rem] lg:items-center lg:gap-4"
              >
                <div className="space-y-1.5">
                  <div
                    className="h-3.5 rounded bg-muted"
                    style={{ width: `${112 + index * 7}px` }}
                  />
                  <div className="h-3 w-40 rounded bg-muted/70 lg:hidden" />
                </div>
                <div className="hidden h-3 w-44 rounded bg-muted/70 lg:block" />
                <div className="hidden h-5 w-16 rounded-full bg-muted/70 lg:block" />
                <div className="hidden h-3 w-10 rounded bg-muted/70 lg:block" />
                <div className="hidden h-3 w-16 rounded bg-muted/70 lg:block" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
