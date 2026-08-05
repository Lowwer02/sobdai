import Link from 'next/link'
import Image from 'next/image'
import { Package, ArrowRight, AlertTriangle } from 'lucide-react'
import type { PublicRelatedPackage } from '@/lib/articles-public'

interface ArticleRelatedPackagesProps {
  packages?: PublicRelatedPackage[]
  error?: string
}

function formatPrice(val: number | null): string {
  if (val === null || val === undefined) return ''
  return `฿${val.toLocaleString('th-TH')}`
}

export default function ArticleRelatedPackages({
  packages = [],
  error,
}: ArticleRelatedPackagesProps) {
  // Safe Thai error state if relation query failed
  if (error) {
    return (
      <section className="max-w-4xl mx-auto mt-12 pt-8 border-t border-[#D4AF37]/15">
        <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-xl text-center space-y-1">
          <div className="flex items-center justify-center gap-2 text-xs font-semibold text-red-300">
            <AlertTriangle size={16} />
            <span>{error || 'ไม่สามารถโหลดแพ็กเกจที่เกี่ยวข้องได้'}</span>
          </div>
        </div>
      </section>
    )
  }

  // Omit entire section if empty
  if (!packages || packages.length === 0) {
    return null
  }

  return (
    <section className="max-w-4xl mx-auto mt-12 pt-8 border-t border-[#D4AF37]/15 space-y-6">
      <div className="flex items-center gap-2 text-lg sm:text-xl font-bold text-[#F5E9D6]">
        <Package className="text-[#D4AF37]" size={22} />
        <h2>แพ็กเกจเตรียมสอบที่เกี่ยวข้อง</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {packages.map((pkg, idx) => {
          const href = `/package/${pkg.slug}`
          const hasDiscount =
            pkg.original_price !== null &&
            pkg.current_price !== null &&
            pkg.original_price > pkg.current_price

          return (
            <Link
              key={pkg.id}
              href={href}
              className="group block h-full focus:outline-none focus:ring-2 focus:ring-[#D4AF37] rounded-xl"
            >
              <div
                className="bg-[#1A140E] border border-[#D4AF37]/20 hover:border-[#D4AF37]/60 rounded-xl overflow-hidden shadow-lg transition-all duration-300 hover:-translate-y-1 flex flex-col h-full p-4 sm:p-5 justify-between space-y-4"
                style={{
                  animation: `fadeInUp 0.4s ease ${idx * 0.05}s both`,
                }}
              >
                {/* Header info */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    {pkg.logo_url || pkg.cover_image_url ? (
                      <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-[#0F0B07] border border-[#D4AF37]/30 shrink-0">
                        <Image
                          src={pkg.logo_url || pkg.cover_image_url || ''}
                          alt={pkg.name}
                          fill
                          sizes="40px"
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-[#0F0B07] border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37] shrink-0">
                        <Package size={20} />
                      </div>
                    )}
                    <h3 className="text-base font-bold text-[#F5E9D6] group-hover:text-[#D4AF37] transition-colors line-clamp-2 leading-snug">
                      {pkg.name}
                    </h3>
                  </div>

                  {pkg.description && (
                    <p className="text-xs text-[#A1866B] line-clamp-3 leading-relaxed">
                      {pkg.description}
                    </p>
                  )}
                </div>

                {/* Price & CTA */}
                <div className="pt-3 border-t border-[#D4AF37]/10 flex items-center justify-between">
                  <div className="flex items-baseline gap-1.5">
                    {pkg.current_price !== null ? (
                      <span className="text-base font-extrabold text-[#D4AF37]">
                        {formatPrice(pkg.current_price)}
                      </span>
                    ) : (
                      <span className="text-xs text-[#A1866B]">ดูรายละเอียด</span>
                    )}

                    {hasDiscount && (
                      <span className="text-xs text-[#A1866B]/60 line-through">
                        {formatPrice(pkg.original_price)}
                      </span>
                    )}
                  </div>

                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#D4AF37] group-hover:translate-x-1 transition-transform">
                    ดูแพ็กเกจ <ArrowRight size={14} />
                  </span>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
