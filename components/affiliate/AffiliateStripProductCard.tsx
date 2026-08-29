'use client'

import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { trackAffiliateClick } from '@/lib/analytics'
import { merchantLabel, type AffiliateRailProduct } from '@/lib/affiliate'

/**
 * The ONE client island inside the server-rendered AffiliateListingStrip —
 * the M1 AffiliateProductCard pattern re-shaped for a horizontal strip cell
 * (vertical compact card: image on top, name + cue + CTA below).
 *
 * UNCHANGED M1 CONTRACTS:
 *   - sponsored semantics: target="_blank" rel="nofollow sponsored noopener
 *     noreferrer"; href comes straight from the server-validated product row
 *   - analytics fires ONLY in the click handler, wrapped in try/catch, never
 *     blocking navigation
 *   - plain <img> + onError fallback in a reserved box (no layout shift)
 *
 * M2 DIFFERENCE: placement is the STABLE 'listing_strip' (no viewport match —
 * the strip has one presentation at every breakpoint), and the source surface
 * rides in via contentType/contentSlug ('news'/'news-list' vs
 * 'article'/'articles-list') so affiliate_click identifies the listing.
 */

interface AffiliateStripProductCardProps {
  product: AffiliateRailProduct
  collectionId: string | null
  contentType: 'news' | 'article'
  contentSlug: string
}

export default function AffiliateStripProductCard({
  product,
  collectionId,
  contentType,
  contentSlug,
}: AffiliateStripProductCardProps) {
  const [imageFailed, setImageFailed] = useState(false)

  const handleClick = () => {
    // Never let analytics break the outbound click. Fire-and-forget.
    try {
      trackAffiliateClick({
        merchant: product.merchant,
        product_id: product.id,
        collection_id: collectionId,
        content_type: contentType,
        content_slug: contentSlug,
        placement: 'listing_strip',
      })
    } catch {
      /* swallow — analytics must not block the click */
    }
  }

  return (
    <a
      href={product.affiliate_url}
      target="_blank"
      rel="nofollow sponsored noopener noreferrer"
      onClick={handleClick}
      className="affiliate-strip-product-card affiliate-strip-card focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] rounded-xl"
      style={{
        borderRadius: 12,
        border: '1px solid var(--border-card)',
        backgroundColor: 'var(--bg-card-2)',
        textDecoration: 'none',
        transition: 'border-color 0.2s, background-color 0.2s',
      }}
    >
      {/* Thumbnail: reserved 1:1 box (affiliate-listing-strip.css), lazy, never
          LCP-priority (the listing's editorial cards own the LCP). Mobile keeps
          the approved image-top layout; lg+ flips this card horizontal. */}
      <span
        aria-hidden
        className="affiliate-strip-thumb"
        style={{
          borderRadius: 8,
          overflow: 'hidden',
          backgroundColor: 'var(--bg-card)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {product.image_url && !imageFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image_url}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <ExternalLink size={18} style={{ color: 'var(--text-faint)' }} />
        )}
      </span>

      <span className="affiliate-strip-info">
        <span
          className="line-clamp-2"
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            fontSize: 12.5,
            fontWeight: 600,
            lineHeight: 1.4,
            color: 'var(--text-primary)',
            overflowWrap: 'anywhere',
          }}
        >
          {product.name}
        </span>

        {product.short_description && (
          <span
            className="line-clamp-2"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              fontSize: 11,
              lineHeight: 1.5,
              color: 'var(--text-secondary)',
              marginTop: 3,
              overflowWrap: 'anywhere',
            }}
          >
            {product.short_description}
          </span>
        )}

        {/* Merchant chip stays visually secondary; the gold CTA defers pricing
            to the merchant page (no volatile prices stored — M1 contract). */}
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 7,
            fontSize: 11.5,
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontSize: 9.5,
              padding: '1px 6px',
              borderRadius: 999,
              border: '1px solid var(--border-card)',
              color: 'var(--text-muted)',
              whiteSpace: 'nowrap',
            }}
          >
            {merchantLabel(product.merchant)}
          </span>
          <span
            style={{
              color: 'var(--gold-light)',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            ดูราคาล่าสุด
            <ExternalLink size={11} aria-hidden />
          </span>
        </span>
      </span>
    </a>
  )
}
