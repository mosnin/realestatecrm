export default function WorkspaceLoading() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="h-8 w-48 bg-card rounded-3xl" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 bg-card rounded-3xl" />
        ))}
      </div>
      <div className="h-20 bg-card rounded-3xl" />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 bg-card rounded-3xl" />
          ))}
        </div>
        <div className="lg:col-span-2 h-48 bg-card rounded-3xl" />
      </div>
    </div>
  );
}
