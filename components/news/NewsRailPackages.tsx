import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Package } from 'lucide-react'
import type { PackageCardData } from '@/components/PackageCard'

/**
 * Desktop-only compact rail presentation of the news article's related Sobdai
 * packages — the FIRST-PARTY conversion block that sits ABOVE the affiliate
 * rail in the news sidebar (order: Sobdai package → affiliate picks).
 *
 * Data contract: receives the SAME `getRelatedContent().packages` result the
 * bottom "เนื้อหาที่เกี่ยวข้อง" section renders — one query, two responsive
 * presentations, no re-selection of packages. The page's scoped CSS shows this
 * block only at the news sidebar breakpoint (>= 1180px) and hides the bottom
 * packages block there, so exactly one presentation is ever visible (and
 * exposed to assistive tech and crawlers) per breakpoint. Mobile keeps the
 * existing bottom `PackageCard` section untouched.
 *
 * Rendering contract (the AffiliateRail hide-when-empty semantics): renders
 * NOTHING when `packages` is empty, so the affiliate rail occupies the sidebar
 * alone and no empty shell or gap ever appears.
 *
 * This is a Server Component — no data fetching, no client JS.
 */

interface NewsRailPackagesProps {
  packages?: PackageCardData[]
}

/** Same Thai-baht formatting the bottom PackageCard footer shows. */
function formatPrice(val: number): string {
  return `฿${val.toLocaleString('th-TH')}`
}

export default function NewsRailPackages({
  packages = [],
}: NewsRailPackagesProps) {
  // No related packages → render nothing (never an empty box).
  if (packages.length === 0) return null

  return (
    <section aria-label="แพ็กเกจข้อสอบที่เกี่ยวข้อง" className="news-package-rail">
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
          แพ็กเกจข้อสอบที่เกี่ยวข้อง
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {packages.map((pkg) => {
            const orgName = pkg.organizations?.name || 'ไม่ระบุหน่วยงาน'
            const posName = pkg.positions?.name || 'ไม่ระบุตำแหน่ง'
            const logoUrl = pkg.logo_url || pkg.organizations?.logo_url
            const hasDiscount = pkg.original_price > pkg.current_price

            return (
              <Link
                key={pkg.id}
                href={`/package/${pkg.slug}`}
                className="group block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
              >
                <div
                  className="rounded-xl p-3 transition-colors duration-300 group-hover:border-[var(--gold-muted)]"
                  style={{
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-card-2)',
                  }}
                >
                  {/* Logo + title — the compact equivalent of the bottom
                      PackageCard header (org line above the position title). */}
                  <div className="flex items-start gap-2.5">
                    {logoUrl ? (
                      <div
                        className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border"
                        style={{
                          border: '1px solid var(--border)',
                          backgroundColor: 'white',
                        }}
                      >
                        <Image
                          src={logoUrl}
                          alt={orgName}
                          width={40}
                          height={40}
                          style={{ objectFit: 'contain' }}
                          unoptimized
                        />
                      </div>
                    ) : (
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                        style={{
                          border: '1px solid var(--border)',
                          backgroundColor: 'var(--gold-tint)',
                          color: 'var(--gold-light)',
                        }}
                      >
                        <Package size={18} aria-hidden />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p
                        className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]"
                        style={{ overflowWrap: 'anywhere' }}
                      >
                        {orgName}
                      </p>
                      <h3
                        className="mt-0.5 line-clamp-2 text-sm font-bold leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--gold-light)]"
                        style={{ overflowWrap: 'anywhere' }}
                      >
                        {posName}
                      </h3>
                    </div>
                  </div>

                  {pkg.description && (
                    <p
                      className="mt-2 line-clamp-2 text-xs leading-relaxed text-[var(--text-secondary)]"
                      style={{ overflowWrap: 'anywhere' }}
                    >
                      {pkg.description}
                    </p>
                  )}

                  {/* Price + CTA — same fields and formatting as the bottom
                      PackageCard footer. */}
                  <div
                    className="mt-2.5 flex items-center justify-between border-t pt-2"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-base font-extrabold text-[var(--gold-light)]">
                        {formatPrice(pkg.current_price)}
                      </span>
                      {hasDiscount && (
                        <span className="text-xs text-[var(--text-faint)] line-through">
                          {formatPrice(pkg.original_price)}
                        </span>
                      )}
                    </div>

                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--gold-light)] transition-transform group-hover:translate-x-1">
                      ดูแพ็กเกจ <ArrowRight size={14} aria-hidden />
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
