import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Package } from 'lucide-react'
import type { PublicRelatedPackage } from '@/lib/articles-public'
import { formatPrice } from './ArticleRelatedPackages'

/**
 * Desktop-only compact rail presentation of the article's related Sobdai
 * packages — the FIRST-PARTY conversion block that sits ABOVE the affiliate
 * rail in the article sidebar (order: Sobdai package → affiliate picks).
 *
 * Data contract: receives the SAME `getPublishedArticleRelatedPackages` result
 * the bottom section renders — one query, two responsive presentations, no
 * re-selection of packages. The page's scoped CSS shows this block only at the
 * article sidebar breakpoint (>= 1300px) and hides the bottom section there,
 * so exactly one presentation is ever visible (and exposed to assistive tech
 * and crawlers) per breakpoint. Mobile keeps the existing bottom
 * `ArticleRelatedPackages` section untouched.
 *
 * Rendering contract (the AffiliateRail hide-when-empty semantics): renders
 * NOTHING when `packages` is empty, so the affiliate rail occupies the sidebar
 * alone and no empty shell or gap ever appears.
 *
 * This is a Server Component — no data fetching, no client JS.
 */

interface ArticleRailPackagesProps {
  packages?: PublicRelatedPackage[]
}

export default function ArticleRailPackages({
  packages = [],
}: ArticleRailPackagesProps) {
  // No related packages → render nothing (never an empty box).
  if (packages.length === 0) return null

  return (
    <section aria-label="แพ็กเกจเตรียมสอบที่เกี่ยวข้อง" className="article-package-rail">
      <div
        style={{
          padding: '20px 16px 16px',
          borderRadius: 16,
          border: '1px solid var(--border)',
          backgroundColor: 'var(--bg-card)',
        }}
      >
        {/* First-party eyebrow — mirrors the affiliate rail's "แนะนำจากพันธมิตร"
            convention, marking this block as Sobdai's own package so it reads
            as the primary (first-party) pick above the partner picks. */}
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--gold-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: 6,
          }}
        >
          จาก Sobdai
        </p>
        <h2
          className="font-display"
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--text-primary)',
            marginBottom: 14,
            lineHeight: 1.4,
          }}
        >
          แพ็กเกจเตรียมสอบที่เกี่ยวข้อง
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {packages.map((pkg) => {
            const hasDiscount =
              pkg.original_price !== null &&
              pkg.current_price !== null &&
              pkg.original_price > pkg.current_price

            return (
              <Link
                key={pkg.id}
                href={`/package/${pkg.slug}`}
                className="group block rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
              >
                <div className="rounded-xl border border-[#D4AF37]/20 bg-[#1A140E] p-3 transition-colors duration-300 group-hover:border-[#D4AF37]/60">
                  {/* Logo + title — the compact equivalent of the bottom
                      section's card header. */}
                  <div className="flex items-start gap-2.5">
                    {pkg.logo_url || pkg.cover_image_url ? (
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-[#D4AF37]/30 bg-[#0F0B07]">
                        <Image
                          src={pkg.logo_url || pkg.cover_image_url || ''}
                          alt={pkg.name}
                          fill
                          sizes="40px"
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#D4AF37]/30 bg-[#0F0B07] text-[#D4AF37]">
                        <Package size={20} />
                      </div>
                    )}
                    <h3
                      className="line-clamp-2 text-sm font-bold leading-snug text-[#F5E9D6] transition-colors group-hover:text-[#D4AF37]"
                      style={{ overflowWrap: 'anywhere' }}
                    >
                      {pkg.name}
                    </h3>
                  </div>

                  {pkg.description && (
                    <p
                      className="mt-2 line-clamp-2 text-xs leading-relaxed text-[#A1866B]"
                      style={{ overflowWrap: 'anywhere' }}
                    >
                      {pkg.description}
                    </p>
                  )}

                  {/* Price + CTA — same fields and formatting as the bottom
                      section's card footer. */}
                  <div className="mt-2.5 flex items-center justify-between border-t border-[#D4AF37]/10 pt-2">
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

                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#D4AF37] transition-transform group-hover:translate-x-1">
                      ดูแพ็กเกจ <ArrowRight size={14} />
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}
