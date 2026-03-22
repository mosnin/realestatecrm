export default function AnalyticsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-28 bg-muted rounded-lg" />
        <div className="h-4 w-56 bg-muted rounded-lg" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-muted rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-64 bg-muted rounded-lg" />
        <div className="h-64 bg-muted rounded-lg" />
      </div>
      <div className="h-48 bg-muted rounded-lg" />
    </div>
  );
}
