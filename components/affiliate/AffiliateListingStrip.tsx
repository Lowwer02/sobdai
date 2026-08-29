import { Info } from 'lucide-react'
import type { AffiliateRailProduct } from '@/lib/affiliate'
import { AFFILIATE_LISTING_CONTENT, type AffiliateListingKey } from '@/lib/affiliate-listing'
import AffiliateStripProductCard from './AffiliateStripProductCard'
import { AFFILIATE_DISCLOSURE_TEXT } from './AffiliateRail'

/**
 * M2 — the ONE editorial affiliate strip for the public listing pages
 * (/news, /articles). Server Component (no 'use client'); the only client
 * islands are the per-product anchors.
 *
 * CONTRACT (frozen in code, not config):
 *   - the caller renders it AT MOST ONCE per listing page, between item #6 and
 *     item #7 of the card grid, and only when ≥7 editorial items render
 *   - hide-when-empty: no products (unpublished/empty/invalid collection, or
 *     URL re-validation dropped everything) → render NOTHING, never a gap
 *   - visually SECONDARY to the editorial grid: its own bordered panel with
 *     breathing room, NOT a fake news/article card inside the grid, and no
 *     sticky/floating behavior on listings
 *
 * Reuses the M1 rail's disclosure text and product validation pipeline
 * (getAffiliateRailProducts) — this is a presentation variant, not a new
 * data path.
 */

interface AffiliateListingStripProps {
  products: AffiliateRailProduct[]
  collectionId: string | null
  /** Which listing rendered the strip — drives affiliate_click context. */
  listing: AffiliateListingKey
}

export default function AffiliateListingStrip({
  products,
  collectionId,
  listing,
}: AffiliateListingStripProps) {
  // No products → render nothing (never an empty box).
  if (products.length === 0) return null

  const { contentType, contentSlug } = AFFILIATE_LISTING_CONTENT[listing]

  return (
    <aside
      aria-label="Sobdai Picks — สินค้าแนะนำจากพันธมิตร"
      className="affiliate-listing-strip"
      style={{ margin: '24px 0 8px' }}
    >
      <div
        style={{
          padding: '18px 16px 14px',
          borderRadius: 16,
          border: '1px solid var(--border)',
          backgroundColor: 'var(--bg-card)',
        }}
      >
        {/* Brand eyebrow + concept heading: “Sobdai Picks /
            อุปกรณ์สำหรับคนเตรียมสอบ” — muted gold, editorial, not marketplace. */}
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--gold-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: 4,
          }}
        >
          Sobdai Picks
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
          อุปกรณ์สำหรับคนเตรียมสอบ
        </h2>

        {/* Horizontal strip cells: auto-fit keeps 3–5 compact products on one
            row on desktop and wraps naturally on mobile. */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 10,
          }}
        >
          {products.map((product) => (
            <AffiliateStripProductCard
              key={product.id}
              product={product}
              collectionId={collectionId}
              contentType={contentType}
              contentSlug={contentSlug}
            />
          ))}
        </div>

        {/* Same subtle disclosure as the M1 rail: small, muted, clearly present. */}
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
    </aside>
  )
}
