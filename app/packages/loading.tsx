/**
 * /packages route loading skeleton.
 *
 * Mirrors the per-route loading convention (app/news/loading.tsx): a
 * package-catalog-shaped skeleton so the global navbar/shell stays stable and
 * the layout doesn't jump when the server query lands. Pure presentational,
 * no data, no client-side fetching.
 */
export default function PackageCatalogLoading() {
  return (
    <div className="min-h-[70vh] bg-background">
      <div className="max-w-[1100px] mx-auto px-5 py-10 pb-20">
        {/* Hero skeleton */}
        <div className="text-center mb-10">
          <div className="h-10 md:h-12 w-80 mx-auto bg-card rounded-lg mb-3" />
          <div className="h-4 w-96 max-w-full mx-auto bg-card rounded" />
        </div>

        {/* Search + filter skeleton */}
        <div className="max-w-[600px] mx-auto mb-6 flex flex-col gap-4">
          <div className="h-12 w-full bg-card rounded-xl" />
          <div className="flex flex-wrap justify-center gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-9 w-20 bg-card rounded-lg" />
            ))}
          </div>
        </div>

        {/* Results count skeleton */}
        <div className="mb-4">
          <div className="h-4 w-40 bg-card rounded" />
        </div>

        {/* Package card grid skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-card border border-border-subtle rounded-2xl p-6 flex flex-col"
            >
              {/* Header: logo + year / badges */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 bg-surface-muted rounded-lg" />
                  <div className="h-3 w-14 bg-surface-muted rounded" />
                </div>
                <div className="flex gap-2">
                  <div className="h-5 w-14 bg-surface-muted rounded-full" />
                  <div className="h-5 w-12 bg-surface-muted rounded-full" />
                </div>
              </div>

              {/* Org name */}
              <div className="h-3 w-1/2 bg-surface-muted rounded mb-3" />

              {/* Position title */}
              <div className="h-5 w-3/4 bg-surface-muted rounded mb-2" />
              <div className="h-5 w-2/3 bg-surface-muted rounded mb-4" />

              {/* Description */}
              <div className="h-3 w-full bg-surface-muted rounded mb-2" />
              <div className="h-3 w-5/6 bg-surface-muted rounded mb-5" />

              {/* Footer: stats + price */}
              <div className="mt-auto flex items-center justify-between pt-4 border-t border-border-subtle">
                <div className="flex gap-4">
                  <div className="h-3 w-12 bg-surface-muted rounded" />
                  <div className="h-3 w-12 bg-surface-muted rounded" />
                </div>
                <div className="h-6 w-14 bg-surface-muted rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
