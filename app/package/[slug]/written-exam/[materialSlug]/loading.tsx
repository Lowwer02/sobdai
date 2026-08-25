export default function WrittenExamLoading() {
  return (
    <div className="min-h-screen animate-pulse bg-[#0F0B07] px-4 py-8 text-[#F5E9D6] md:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="h-16 border-b border-[rgba(255,255,255,0.06)]" />
        <div className="max-w-3xl py-10">
          <div className="mb-4 h-6 w-36 rounded-full bg-[#1A140E]" />
          <div className="h-12 w-3/4 rounded-xl bg-[#1A140E]" />
          <div className="mt-4 h-5 w-full max-w-xl rounded bg-[#1A140E]" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
          <div className="h-56 rounded-2xl bg-[#1A140E]" />
          <div className="space-y-5">
            <div className="h-56 rounded-2xl bg-[#1A140E]" />
            <div className="h-72 rounded-2xl bg-[#1A140E]" />
          </div>
        </div>
      </div>
    </div>
  )
}
