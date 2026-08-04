export default function ArticlesLoading() {
  return (
    <main className="min-h-screen bg-[#0F0B07] text-[#F5E9D6] py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Hero Skeleton */}
        <div className="space-y-3 border-b border-[#D4AF37]/10 pb-6 animate-pulse">
          <div className="h-4 w-32 bg-[#1A140E] rounded-md" />
          <div className="h-8 w-64 bg-[#1A140E] rounded-lg" />
          <div className="h-4 w-96 max-w-full bg-[#1A140E] rounded-md" />
        </div>

        {/* Cards Grid Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-[#1A140E] border border-[#D4AF37]/10 rounded-xl overflow-hidden animate-pulse flex flex-col h-80"
            >
              <div className="aspect-video bg-[#15100B] w-full" />
              <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="h-5 w-3/4 bg-[#15100B] rounded" />
                  <div className="h-4 w-full bg-[#15100B] rounded" />
                  <div className="h-4 w-2/3 bg-[#15100B] rounded" />
                </div>
                <div className="h-4 w-1/3 bg-[#15100B] rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
