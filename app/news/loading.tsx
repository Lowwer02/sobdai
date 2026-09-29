/**
 * /news route loading skeleton.
 *
 * Mirrors the global app/loading.tsx spinner (same gold/cream tokens) and the
 * per-route convention used by app/package/[slug]/loading.tsx. Renders a news-
 * shaped skeleton grid so the layout doesn't jump when the server query lands.
 */
export default function NewsLoading() {
  return (
    <div className="min-h-[70vh] bg-background">
      <div className="max-w-[1100px] mx-auto px-5 py-10">
        {/* Hero skeleton */}
        <div className="text-center mb-9">
          <div className="h-10 md:h-12 w-72 mx-auto bg-card rounded-lg mb-3" />
          <div className="h-4 w-80 mx-auto bg-card rounded" />
        </div>

        {/* Controls skeleton */}
        <div className="max-w-[600px] mx-auto mb-8 flex flex-col gap-4">
          <div className="h-12 w-full bg-card rounded-xl" />
          <div className="h-10 w-48 mx-auto bg-card rounded-xl" />
        </div>

        {/* Card grid skeleton — matches PAGE_SIZE (9) so the layout doesn't
            jump when the server query lands. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 animate-pulse">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="bg-card border border-border-subtle rounded-2xl overflow-hidden"
            >
              <div className="aspect-video bg-surface-muted" />
              <div className="p-5 space-y-3">
                <div className="h-3 w-24 bg-surface-muted rounded" />
                <div className="h-5 w-full bg-surface-muted rounded" />
                <div className="h-5 w-2/3 bg-surface-muted rounded" />
                <div className="h-3 w-full bg-surface-muted rounded" />
                <div className="h-3 w-1/2 bg-surface-muted rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
