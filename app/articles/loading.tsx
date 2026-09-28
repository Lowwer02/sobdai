export default function ArticlesLoading() {
  return (
    <main className="min-h-screen bg-background text-foreground py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Hero Skeleton */}
        <div className="space-y-3 border-b border-brand/10 pb-6 animate-pulse">
          <div className="h-4 w-32 bg-card rounded-md" />
          <div className="h-8 w-64 bg-card rounded-lg" />
          <div className="h-4 w-96 max-w-full bg-card rounded-md" />
        </div>

        {/* Cards Grid Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-card border border-brand/10 rounded-xl overflow-hidden animate-pulse flex flex-col h-80"
            >
              <div className="aspect-video bg-surface-muted w-full" />
              <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="h-5 w-3/4 bg-surface-muted rounded" />
                  <div className="h-4 w-full bg-surface-muted rounded" />
                  <div className="h-4 w-2/3 bg-surface-muted rounded" />
                </div>
                <div className="h-4 w-1/3 bg-surface-muted rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
