export default function CheckoutLoading() {
  return (
    <div className="min-h-screen bg-background pb-20 animate-pulse">
      {/* Header Skeleton */}
      <div className="h-16 bg-card border-b border-border-subtle flex items-center px-4">
        <div className="max-w-2xl mx-auto w-full flex items-center gap-4">
          <div className="w-8 h-8 bg-surface-muted rounded-lg"></div>
          <div className="w-32 h-5 bg-surface-muted rounded"></div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 mt-8 space-y-6">
        {/* Order Summary Card Skeleton */}
        <div className="bg-card border border-border-subtle rounded-2xl p-6">
          <div className="w-24 h-4 bg-surface-muted rounded mb-6"></div>
          
          <div className="flex gap-4 items-start mb-6">
            <div className="w-12 h-12 rounded-xl bg-surface-muted"></div>
            <div className="flex-1 space-y-2">
              <div className="w-1/3 h-3 bg-surface-muted rounded"></div>
              <div className="w-2/3 h-5 bg-surface-muted rounded"></div>
              <div className="w-1/2 h-4 bg-surface-muted rounded"></div>
            </div>
          </div>

          <div className="h-px bg-surface-muted my-6" />

          <div className="flex justify-between items-end">
            <div className="w-24 h-5 bg-surface-muted rounded"></div>
            <div className="w-32 h-10 bg-surface-muted rounded"></div>
          </div>

          <div className="mt-6 h-16 bg-surface-muted rounded-xl"></div>
        </div>

        {/* Payment Method Card Skeleton */}
        <div className="bg-card border border-border-subtle rounded-2xl p-6">
          <div className="w-32 h-4 bg-surface-muted rounded mb-6"></div>
          <div className="flex gap-3 mb-6">
            <div className="flex-1 h-24 bg-surface-muted rounded-xl"></div>
            <div className="flex-1 h-24 bg-surface-muted rounded-xl"></div>
          </div>
          <div className="w-full h-14 bg-surface-muted rounded-xl"></div>
        </div>
      </div>
    </div>
  )
}
