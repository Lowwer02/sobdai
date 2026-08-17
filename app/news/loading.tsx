/**
 * /news route loading skeleton.
 *
 * Mirrors the global app/loading.tsx spinner (same gold/cream tokens) and the
 * per-route convention used by app/package/[slug]/loading.tsx. Renders a news-
 * shaped skeleton grid so the layout doesn't jump when the server query lands.
 */
export default function NewsLoading() {
  return (
    <div className="min-h-[70vh] bg-[#0F0B07]">
      <div className="max-w-[1100px] mx-auto px-5 py-10">
        {/* Hero skeleton */}
        <div className="text-center mb-9">
          <div className="h-10 md:h-12 w-72 mx-auto bg-[#1A140E] rounded-lg mb-3" />
          <div className="h-4 w-80 mx-auto bg-[#1A140E] rounded" />
        </div>

        {/* Controls skeleton */}
        <div className="max-w-[600px] mx-auto mb-8 flex flex-col gap-4">
          <div className="h-12 w-full bg-[#1A140E] rounded-xl" />
          <div className="h-10 w-48 mx-auto bg-[#1A140E] rounded-xl" />
        </div>

        {/* Card grid skeleton — matches PAGE_SIZE (9) so the layout doesn't
            jump when the server query lands. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 animate-pulse">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="bg-[#1A140E] border border-[rgba(255,255,255,0.05)] rounded-2xl overflow-hidden"
            >
              <div className="aspect-video bg-[#0F0B07]" />
              <div className="p-5 space-y-3">
                <div className="h-3 w-24 bg-[#0F0B07] rounded" />
                <div className="h-5 w-full bg-[#0F0B07] rounded" />
                <div className="h-5 w-2/3 bg-[#0F0B07] rounded" />
                <div className="h-3 w-full bg-[#0F0B07] rounded" />
                <div className="h-3 w-1/2 bg-[#0F0B07] rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
