export default function ArticleDetailLoading() {
  return (
    <main className="min-h-screen bg-[#0F0B07] text-[#F5E9D6] py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8 animate-pulse">
        {/* Back Link Skeleton */}
        <div className="h-4 w-36 bg-[#1A140E] rounded-md" />

        {/* Header Skeleton */}
        <div className="space-y-4 border-b border-[#D4AF37]/10 pb-6">
          <div className="h-5 w-24 bg-[#1A140E] rounded-md" />
          <div className="h-9 w-3/4 bg-[#1A140E] rounded-lg" />
          <div className="h-4 w-full bg-[#1A140E] rounded-md" />
          <div className="flex gap-4 pt-2">
            <div className="h-4 w-32 bg-[#1A140E] rounded-md" />
            <div className="h-4 w-28 bg-[#1A140E] rounded-md" />
          </div>
        </div>

        {/* Cover Skeleton */}
        <div className="aspect-video w-full bg-[#1A140E] rounded-2xl" />

        {/* Body Skeleton */}
        <div className="bg-[#1A140E]/60 border border-[#D4AF37]/10 rounded-2xl p-6 space-y-4">
          <div className="h-4 w-full bg-[#15100B] rounded" />
          <div className="h-4 w-11/12 bg-[#15100B] rounded" />
          <div className="h-4 w-4/5 bg-[#15100B] rounded" />
          <div className="h-4 w-full bg-[#15100B] rounded" />
          <div className="h-4 w-2/3 bg-[#15100B] rounded" />
        </div>
      </div>
    </main>
  )
}
