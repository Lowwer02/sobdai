export default function PackageLoading() {
  return (
    <div className="min-h-screen bg-background pb-20 animate-pulse">
      <div className="max-w-[1360px] mx-auto px-4 py-6 md:py-8">
        {/* Back Link Skeleton */}
        <div className="w-24 h-5 bg-card rounded mb-6"></div>

        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Main Package Card Skeleton */}
            <div className="lg:col-span-7 bg-card border border-border-subtle rounded-[24px] p-6 md:p-8 flex flex-col gap-8">
              <div className="flex flex-col sm:flex-row gap-6">
                <div className="w-36 h-48 bg-surface-muted rounded-3xl flex-shrink-0 mx-auto sm:mx-0"></div>
                <div className="flex-1">
                  <div className="flex gap-2 mb-3">
                    <div className="w-20 h-5 bg-surface-muted rounded-full"></div>
                    <div className="w-16 h-5 bg-surface-muted rounded-full"></div>
                  </div>
                  <div className="w-3/4 h-10 bg-surface-muted rounded mb-5"></div>
                  <div className="w-full h-4 bg-surface-muted rounded mb-2"></div>
                  <div className="w-5/6 h-4 bg-surface-muted rounded mb-6"></div>
                  <div className="flex gap-2">
                    <div className="w-24 h-6 bg-surface-muted rounded-full"></div>
                    <div className="w-24 h-6 bg-surface-muted rounded-full"></div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-auto">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="bg-surface-muted h-24 rounded-2xl"></div>
                ))}
              </div>
            </div>

            {/* Total Questions Box Skeleton */}
            <div className="lg:col-span-2 bg-card border border-border-subtle rounded-[24px] p-6 flex flex-col items-center justify-center">
              <div className="w-12 h-12 bg-surface-muted rounded-full mb-4"></div>
              <div className="w-20 h-8 bg-surface-muted rounded mb-2"></div>
              <div className="w-16 h-4 bg-surface-muted rounded"></div>
            </div>

            {/* Pricing Sticky Skeleton */}
            <div className="lg:col-span-3 bg-card border border-border-subtle rounded-[24px] p-8">
              <div className="w-32 h-5 bg-surface-muted rounded mb-6"></div>
              <div className="w-16 h-4 bg-surface-muted rounded mb-2"></div>
              <div className="w-3/4 h-12 bg-surface-muted rounded mb-8"></div>
              <div className="space-y-4 mb-10">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-4 h-4 bg-surface-muted rounded-full"></div>
                    <div className="w-3/4 h-4 bg-surface-muted rounded"></div>
                  </div>
                ))}
              </div>
              <div className="w-full h-14 bg-surface-muted rounded-xl mb-4"></div>
              <div className="w-48 h-3 bg-surface-muted rounded mx-auto"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
