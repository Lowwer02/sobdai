export default function ExamRuntimeLoading() {
  return (
    <div className="min-h-screen bg-[#0F0B07] animate-pulse">
      {/* Header Skeleton */}
      <div className="h-16 bg-[#1A140E] border-b border-[rgba(255,255,255,0.05)] flex items-center px-4">
        <div className="max-w-4xl mx-auto w-full flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 bg-[#0F0B07] rounded-lg"></div>
            <div>
              <div className="w-24 h-3 bg-[#0F0B07] rounded mb-1"></div>
              <div className="w-16 h-4 bg-[#0F0B07] rounded"></div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-20 h-8 bg-[#0F0B07] rounded-lg"></div>
            <div className="hidden sm:block w-24 h-8 bg-[#0F0B07] rounded-lg"></div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Question Content Skeleton */}
        <div className="mb-8 flex justify-between items-start">
          <div className="w-20 h-6 bg-[#1A140E] rounded-md"></div>
          <div className="w-24 h-6 bg-[#1A140E] rounded-md"></div>
        </div>
        
        <div className="space-y-3 mb-10">
          <div className="w-full h-6 bg-[#1A140E] rounded"></div>
          <div className="w-5/6 h-6 bg-[#1A140E] rounded"></div>
          <div className="w-3/4 h-6 bg-[#1A140E] rounded"></div>
        </div>

        {/* Choices Skeleton */}
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="w-full h-16 bg-[#1A140E] rounded-xl flex items-center px-4 gap-4">
              <div className="w-8 h-8 rounded-full bg-[#0F0B07]"></div>
              <div className="flex-1 space-y-2">
                <div className="w-3/4 h-3 bg-[#0F0B07] rounded"></div>
                <div className="w-1/2 h-3 bg-[#0F0B07] rounded"></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Nav Skeleton */}
      <div className="fixed bottom-0 left-0 w-full h-16 bg-[#1A140E] border-t border-[rgba(255,255,255,0.05)]"></div>
    </div>
  )
}
