export default function CheckoutLoading() {
  return (
    <div className="min-h-screen bg-[#0F0B07] pb-20 animate-pulse">
      {/* Header Skeleton */}
      <div className="h-16 bg-[#1A140E] border-b border-[rgba(255,255,255,0.05)] flex items-center px-4">
        <div className="max-w-2xl mx-auto w-full flex items-center gap-4">
          <div className="w-8 h-8 bg-[#0F0B07] rounded-lg"></div>
          <div className="w-32 h-5 bg-[#0F0B07] rounded"></div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 mt-8 space-y-6">
        {/* Order Summary Card Skeleton */}
        <div className="bg-[#1A140E] border border-[rgba(255,255,255,0.05)] rounded-2xl p-6">
          <div className="w-24 h-4 bg-[#0F0B07] rounded mb-6"></div>
          
          <div className="flex gap-4 items-start mb-6">
            <div className="w-12 h-12 rounded-xl bg-[#0F0B07]"></div>
            <div className="flex-1 space-y-2">
              <div className="w-1/3 h-3 bg-[#0F0B07] rounded"></div>
              <div className="w-2/3 h-5 bg-[#0F0B07] rounded"></div>
              <div className="w-1/2 h-4 bg-[#0F0B07] rounded"></div>
            </div>
          </div>

          <div className="h-px bg-[#0F0B07] my-6" />

          <div className="flex justify-between items-end">
            <div className="w-24 h-5 bg-[#0F0B07] rounded"></div>
            <div className="w-32 h-10 bg-[#0F0B07] rounded"></div>
          </div>

          <div className="mt-6 h-16 bg-[#0F0B07] rounded-xl"></div>
        </div>

        {/* Payment Method Card Skeleton */}
        <div className="bg-[#1A140E] border border-[rgba(255,255,255,0.05)] rounded-2xl p-6">
          <div className="w-32 h-4 bg-[#0F0B07] rounded mb-6"></div>
          <div className="flex gap-3 mb-6">
            <div className="flex-1 h-24 bg-[#0F0B07] rounded-xl"></div>
            <div className="flex-1 h-24 bg-[#0F0B07] rounded-xl"></div>
          </div>
          <div className="w-full h-14 bg-[#0F0B07] rounded-xl"></div>
        </div>
      </div>
    </div>
  )
}
