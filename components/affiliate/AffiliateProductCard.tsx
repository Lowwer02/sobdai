'use client'

import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { trackAffiliateClick } from '@/lib/analytics'
import { merchantLabel, type AffiliateRailProduct } from '@/lib/affiliate'

/**
 * The ONE client island inside the otherwise server-rendered AffiliateRail —
 * the NewsCtaLink pattern applied to an outbound anchor.
 *
 * Why client at all: the spec requires firing an affiliate_click event
 * immediately before the outbound navigation (plus a broken-image fallback via
 * onError), and both need a real event handler. Everything else in the rail is
 * server-rendered, so hydration cost stays at this small card.
 *
 * SPONSORED-LINK SEMANTICS (frozen by the ui-contract test): the anchor always
 * carries target="_blank" rel="nofollow sponsored noopener noreferrer". The
 * href itself was already re-validated as HTTPS server-side by
 * getAffiliateRailProducts, so no javascript:/data: vector can reach the DOM.
 *
 * Analytics NEVER blocks navigation: the push is wrapped in try/catch and the
 * browser owns the tab open. The handler only ever runs on a real user click —
 * never during render or hydration — so there are no duplicate events.
 *
 * placement is resolved at CLICK time from the live viewport, matching the CSS
 * breakpoint the surface passes in (the desktop sidebar vs the mobile inline
 * block are the same DOM, repositioned by CSS — so one click = one event with
 * the placement the visitor actually saw).
 */

interface AffiliateProductCardProps {
  product: AffiliateRailProduct
  collectionId: string | null
  contentType: 'news' | 'article'
  contentSlug: string
  /** Viewport width where the surface switches to the desktop sidebar. */
  sidebarMinWidthPx: number
}

export default function AffiliateProductCard({
  product,
  collectionId,
  contentType,
  contentSlug,
  sidebarMinWidthPx,
}: AffiliateProductCardProps) {
  // PromotionImage pattern: plain <img> + onError hide, so an arbitrary
  // admin-supplied external image degrades to the wrapper's reserved
  // aspect-ratio box (no layout shift, no broken-image icon).
  const [imageFailed, setImageFailed] = useState(false)

  const handleClick = () => {
    // Never let analytics break the outbound click. Fire-and-forget.
    try {
      const placement =
        typeof window !== 'undefined' &&
        window.matchMedia(`(min-width: ${sidebarMinWidthPx}px)`).matches
          ? 'sidebar'
          : 'inline_mobile'
      trackAffiliateClick({
        merchant: product.merchant,
        product_id: product.id,
        collection_id: collectionId,
        content_type: contentType,
        content_slug: contentSlug,
        placement,
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
      className="affiliate-product-card focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] rounded-xl"
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        padding: 10,
        borderRadius: 12,
        border: '1px solid var(--border-card)',
        backgroundColor: 'var(--bg-card-2)',
        textDecoration: 'none',
        transition: 'border-color 0.2s, background-color 0.2s',
      }}
    >
      {/* Thumbnail: fixed 1:1 reserved box, lazy, never LCP-priority. */}
      <span
        aria-hidden
        style={{
          position: 'relative',
          width: 72,
          height: 72,
          flexShrink: 0,
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
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <ExternalLink size={18} style={{ color: 'var(--text-faint)' }} />
        )}
      </span>

      <span style={{ minWidth: 0, flex: 1, display: 'block' }}>
        <span
          className="line-clamp-2"
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            fontSize: 13,
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
              fontSize: 11.5,
              lineHeight: 1.5,
              color: 'var(--text-secondary)',
              marginTop: 2,
              overflowWrap: 'anywhere',
            }}
          >
            {product.short_description}
          </span>
        )}

        {/* Merchant label stays visually secondary; CTA defers pricing to the
            merchant page ("ดูราคาล่าสุด" — no volatile prices stored). */}
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 6,
            fontSize: 12,
          }}
        >
          <span
            style={{
              fontSize: 10,
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
