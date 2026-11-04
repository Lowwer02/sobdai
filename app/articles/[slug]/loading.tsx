export default function ArticleDetailLoading() {
  return (
    <main className="min-h-screen bg-background text-foreground py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8 animate-pulse">
        {/* Back Link Skeleton */}
        <div className="h-4 w-36 bg-card rounded-md" />

        {/* Header Skeleton */}
        <div className="space-y-4 border-b border-border-subtle pb-6">
          <div className="h-5 w-24 bg-card rounded-md" />
          <div className="h-9 w-3/4 bg-card rounded-lg" />
          <div className="h-4 w-full bg-card rounded-md" />
          <div className="flex gap-4 pt-2">
            <div className="h-4 w-32 bg-card rounded-md" />
            <div className="h-4 w-28 bg-card rounded-md" />
          </div>
        </div>

        {/* Cover Skeleton */}
        <div className="aspect-video w-full bg-card rounded-2xl" />

        {/* Body Skeleton */}
        <div className="bg-card/60 border border-border-subtle rounded-2xl p-6 space-y-4">
          <div className="h-4 w-full bg-surface-muted rounded" />
          <div className="h-4 w-11/12 bg-surface-muted rounded" />
          <div className="h-4 w-4/5 bg-surface-muted rounded" />
          <div className="h-4 w-full bg-surface-muted rounded" />
          <div className="h-4 w-2/3 bg-surface-muted rounded" />
        </div>
      </div>
    </main>
  )
}
