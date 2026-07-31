/**
 * /news/[slug] route loading skeleton.
 *
 * Mirrors the per-route convention (app/package/[slug]/loading.tsx): a
 * news-detail-shaped skeleton so the layout doesn't jump when the server query
 * + markdown render land. Pure presentational, no data.
 */
export default function NewsDetailLoading() {
  return (
    <div className="min-h-[70vh] bg-[#0F0B07] animate-pulse">
      <div className="max-w-[800px] mx-auto px-5 py-8">
        {/* Breadcrumb skeleton */}
        <div className="flex items-center gap-2 mb-7">
          <div className="h-3 w-12 bg-[#1A140E] rounded" />
          <div className="h-3 w-3 bg-[#1A140E] rounded" />
          <div className="h-3 w-14 bg-[#1A140E] rounded" />
          <div className="h-3 w-3 bg-[#1A140E] rounded" />
          <div className="h-3 w-40 bg-[#1A140E] rounded" />
        </div>

        {/* Badges */}
        <div className="flex items-center gap-2 mb-4">
          <div className="h-5 w-20 bg-[#0F0B07] rounded-full border border-[rgba(255,255,255,0.05)]" />
          <div className="h-5 w-16 bg-[#0F0B07] rounded-full border border-[rgba(255,255,255,0.05)]" />
          <div className="h-5 w-24 bg-[#0F0B07] rounded-full border border-[rgba(255,255,255,0.05)]" />
        </div>

        {/* Title */}
        <div className="h-9 w-full bg-[#1A140E] rounded mb-3" />
        <div className="h-9 w-2/3 bg-[#1A140E] rounded mb-5" />

        {/* Date row */}
        <div className="flex items-center gap-5 mb-7">
          <div className="h-3 w-32 bg-[#1A140E] rounded" />
          <div className="h-3 w-28 bg-[#1A140E] rounded" />
        </div>

        {/* Cover */}
        <div className="w-full aspect-video bg-[#1A140E] rounded-2xl mb-8" />

        {/* Body lines */}
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-3 bg-[#1A140E] rounded"
              style={{ width: i === 7 ? '60%' : '100%' }}
            />
          ))}
        </div>

        {/* Prev/next skeleton */}
        <div className="mt-10 pt-6 border-t border-[rgba(255,255,255,0.05)] grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="h-16 bg-[#1A140E] rounded-xl" />
          <div className="h-16 bg-[#1A140E] rounded-xl" />
        </div>
      </div>
    </div>
  )
}
