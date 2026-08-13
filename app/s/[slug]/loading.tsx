export default function WorkspaceLoading() {
  return (
    <div data-realtor-page="today" className="chippi-dashboard-canvas min-h-[calc(100vh-10rem)] space-y-8 animate-pulse pb-12 pt-3 sm:pt-5" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="h-8 w-48 rounded-lg bg-muted" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="chippi-dashboard-panel h-24 rounded-[1.75rem]" />
        ))}
      </div>
      <div className="chippi-dashboard-panel h-20 rounded-[1.75rem]" />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="chippi-dashboard-panel h-16 rounded-2xl" />
          ))}
        </div>
        <div className="chippi-dashboard-panel lg:col-span-2 h-48 rounded-[1.75rem]" />
      </div>
    </div>
  );
}
