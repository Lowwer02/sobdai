import { Info } from 'lucide-react'
import type {
  AffiliateContentType,
  AffiliateRailProduct,
} from '@/lib/affiliate'
import AffiliateProductCard from './AffiliateProductCard'

/**
 * Public affiliate recommendation rail — Server Component (no 'use client').
 *
 * The M1 rendering contract (the NewsCtaBox hide-when-empty semantics):
 *   - renders NOTHING when `products` is empty — the caller already skips the
 *     query when affiliate is disabled/no collection, and the query itself
 *     returns [] when the collection has no published products; this guard is
 *     the last line of defense so an empty box can never appear
 *   - products arrive pre-capped at AFFILIATE_MAX_RAIL_PRODUCTS (5) and
 *     re-validated server-side (HTTPS URLs), so this component only renders
 *   - Sobdai's own CTAs always outrank it: the rail is placed AFTER the CTA
 *     zone in DOM order on every surface, styled visually secondary, and the
 *     merchant branding is a muted chip rather than a banner
 *
 * The <aside> wrapper + sticky positioning is owned by the surfaces (news /
 * article detail pages) via their scoped layout CSS — this component renders
 * the section content only, so the same markup serves the desktop sidebar and
 * the mobile inline block (one DOM, CSS decides).
 */

/** Subtle Thai affiliate disclosure (frozen by the ui-contract test). */
export const AFFILIATE_DISCLOSURE_TEXT =
  'ลิงก์ในส่วนนี้เป็นลิงก์พันธมิตร (Affiliate) หากคุณซื้อสินค้าผ่านลิงก์ Sobdai อาจได้รับค่าคอมมิชชัน โดยราคาสินค้าที่คุณจ่ายไม่เปลี่ยนแปลง'

interface AffiliateRailProps {
  products: AffiliateRailProduct[]
  collectionId: string | null
  contentType: AffiliateContentType
  contentSlug: string
  /** Viewport width where the surface switches to the desktop sidebar. */
  sidebarMinWidthPx?: number
  /** Fixed Daily completion placement; ordinary rails remain viewport-aware. */
  clickPlacement?: 'daily_complete'
  heading?: string
  eyebrow?: string
}

export default function AffiliateRail({
  products,
  collectionId,
  contentType,
  contentSlug,
  sidebarMinWidthPx,
  clickPlacement,
  heading = 'อุปกรณ์ที่อาจช่วยการเตรียมสอบ',
  eyebrow = 'แนะนำจากพันธมิตร',
}: AffiliateRailProps) {
  // No products → render nothing (never an empty box).
  if (products.length === 0) return null

  return (
    <section aria-label="สินค้าแนะนำจากพันธมิตร" className="affiliate-rail">
      <div
        style={{
          padding: '20px 16px 14px',
          borderRadius: 16,
          border: '1px solid var(--border)',
          backgroundColor: 'var(--bg-card)',
        }}
      >
        {/* Gold eyebrow — the same uppercase muted-gold convention the news
            detail page uses for section labels. */}
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
          {eyebrow}
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
          {heading}
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {products.map((product) => (
            <AffiliateProductCard
              key={product.id}
              product={product}
              collectionId={collectionId}
              contentType={contentType}
              contentSlug={contentSlug}
              sidebarMinWidthPx={sidebarMinWidthPx}
              fixedPlacement={clickPlacement}
            />
          ))}
        </div>

        {/* Subtle disclosure: small, muted, but clearly present. */}
        <p
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 6,
            marginTop: 12,
            paddingTop: 10,
            borderTop: '1px solid var(--border-card)',
            fontSize: 10.5,
            lineHeight: 1.5,
            color: 'var(--text-muted)',
          }}
        >
          <Info size={12} aria-hidden style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{AFFILIATE_DISCLOSURE_TEXT}</span>
        </p>
      </div>
    </section>
  )
}
