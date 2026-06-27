export default function SummaryLoading() {
  return (
    <div className="min-h-screen bg-[#0F0B07] pb-20 animate-pulse">
      {/* Navbar Skeleton */}
      <div className="h-16 bg-[#1A140E] border-b border-[rgba(255,255,255,0.05)] flex items-center px-4 md:px-8">
        <div className="w-32 h-5 bg-[#0F0B07] rounded"></div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-10 flex flex-col lg:flex-row gap-12 items-start">
        {/* Main Content Skeleton */}
        <main className="flex-1 w-full max-w-3xl mx-auto lg:mx-0">
          <header className="mb-12">
            <div className="flex gap-2 mb-6">
              <div className="w-16 h-6 bg-[#1A140E] rounded-full"></div>
              <div className="w-20 h-6 bg-[#1A140E] rounded-full"></div>
            </div>
            <div className="w-3/4 h-12 bg-[#1A140E] rounded mb-6"></div>
            <div className="flex gap-6">
              <div className="w-24 h-4 bg-[#1A140E] rounded"></div>
              <div className="w-32 h-4 bg-[#1A140E] rounded"></div>
            </div>
          </header>

          <article className="space-y-6">
            <div className="w-full h-4 bg-[#1A140E] rounded"></div>
            <div className="w-5/6 h-4 bg-[#1A140E] rounded"></div>
            <div className="w-full h-4 bg-[#1A140E] rounded"></div>
            <div className="w-2/3 h-4 bg-[#1A140E] rounded"></div>
            
            <div className="w-1/2 h-8 bg-[#1A140E] rounded mt-12 mb-6"></div>
            <div className="w-full h-32 bg-[#1A140E] rounded-xl mb-6"></div>
            <div className="w-full h-4 bg-[#1A140E] rounded"></div>
            <div className="w-4/5 h-4 bg-[#1A140E] rounded"></div>
          </article>
        </main>

        {/* Sidebar TOC Skeleton */}
        <aside className="hidden lg:block w-64 flex-shrink-0 sticky top-24">
          <div className="bg-[#1A140E] rounded-2xl p-5 border border-[rgba(255,255,255,0.05)]">
            <div className="w-24 h-4 bg-[#0F0B07] rounded mb-6"></div>
            <div className="space-y-3">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="w-full h-3 bg-[#0F0B07] rounded"></div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
