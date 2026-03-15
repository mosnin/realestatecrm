export default function DealsLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 w-24 bg-muted rounded-lg" />
        <div className="h-9 w-24 bg-muted rounded-lg" />
      </div>
      <div className="flex gap-4 overflow-x-hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex-shrink-0 w-72 space-y-3">
            <div className="h-10 bg-muted rounded-xl" />
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="h-24 bg-muted rounded-xl" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
