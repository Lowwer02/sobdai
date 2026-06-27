export default function Loading() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-4 bg-[#0F0B07]">
      <div className="relative w-16 h-16 mb-4">
        {/* Outer glowing ring */}
        <div className="absolute inset-0 border-2 border-[#D4AF37]/20 rounded-full animate-ping"></div>
        {/* Inner spinning ring */}
        <div className="absolute inset-0 border-t-2 border-r-2 border-[#D4AF37] rounded-full animate-spin"></div>
        {/* Center dot */}
        <div className="absolute inset-0 m-auto w-2 h-2 bg-[#F5E9D6] rounded-full animate-pulse"></div>
      </div>
      <div className="text-[#A1866B] text-sm font-medium animate-pulse font-display tracking-widest uppercase">
        กำลังโหลดข้อมูล...
      </div>
    </div>
  )
}
