/**
 * Promotion section for the Homepage (RENDERING ONLY).
 *
 * Server Component. It receives promotions already fetched by the page — no
 * client fetch, no client-side data logic. Renders a horizontal scroll-snap
 * banner (desktop) that doubles as swipeable cards (mobile), via a single
 * overflow container. No carousel library (none is installed); CSS scroll-snap
 * gives native touch swipe + keyboard/scroll affordance with zero JS.
 *
 * Hidden entirely when there are no promotions — the caller gates on
 * `promotions.length > 0`, and this component also short-circuits as a guard.
 *
 * Image: fixed aspect-ratio wrapper (no CLS), always-present `alt`, graceful
 * fallback to a solid gold band if image_url is missing or fails to load
 * (handled in the client PromotionImage subcomponent).
 *
 * Button: rendered only when BOTH `button_text` and `button_link` are present.
 * Internal links use <Link>; external links use <a>. New tab is opened ONLY
 * when `open_in_new_tab === true`, with the standard safe rel attributes.
 */

import Link from 'next/link'
import type { HomepagePromotion } from '@/lib/homepagePromotions'
import PromotionImage from './PromotionImage'

function PromotionButton({ promo }: { promo: HomepagePromotion }) {
  // Render only when BOTH button_text and button_link exist.
  if (!promo.button_text || !promo.button_link) return null

  // New tab ONLY when explicitly configured. Internal links never open in a
  // new tab (matches the promotion validator, which forces this off for
  // link_type === 'internal').
  const isNewTab = promo.link_type === 'external' && promo.open_in_new_tab

  const className = 'btn-primary'
  const style: React.CSSProperties = {
    padding: '11px 24px',
    fontSize: '14px',
    display: 'inline-block',
  }

  if (promo.link_type === 'external') {
    return (
      <a
        href={promo.button_link}
        target={isNewTab ? '_blank' : undefined}
        rel={isNewTab ? 'noopener noreferrer' : undefined}
        className={className}
        style={style}
      >
        {promo.button_text}
      </a>
    )
  }

  return (
    <Link href={promo.button_link} className={className} style={style}>
      {promo.button_text}
    </Link>
  )
}

export default function PromotionSection({
  promotions,
}: {
  promotions: HomepagePromotion[]
}) {
  if (!promotions || promotions.length === 0) return null

  return (
    <section
      aria-label="โปรโมชัน"
      style={{ padding: '32px 0 8px', maxWidth: '1100px', margin: '0 auto' }}
    >
      {/* Horizontal scroll-snap container: desktop banner row + mobile
          swipeable cards share this one element. hide-scrollbar (globals.css)
          hides the horizontal track on desktop while keeping native swipe. */}
      <div
        className="hide-scrollbar"
        style={{
          display: 'flex',
          gap: '16px',
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollSnapType: 'x mandatory',
          // Negative side margin lets cards bleed to the viewport edge on
          // mobile (full-bleed swipe) while staying within the 1100px column
          // on desktop. Inner padding compensates so content isn't clipped.
          margin: '0 -20px',
          padding: '0 20px 8px',
        }}
      >
        {promotions.map((promo, i) => (
          <article
            key={promo.id}
            style={{
              position: 'relative',
              flex: '0 0 auto',
              // Desktop: a wide banner. Mobile: ~88vw card.
              width: 'min(560px, 88vw)',
              scrollSnapAlign: 'start',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
              border: '1px solid var(--border-card)',
              // Fixed aspect ratio reserves space BEFORE the image loads ->
              // zero CLS.
              aspectRatio: '16 / 7',
              // Gradient fallback shows through if image is missing/fails.
              background:
                'linear-gradient(135deg, rgba(212, 168, 67, 0.10) 0%, var(--bg-card) 70%)',
              animation: `fadeInUp 0.4s ease ${i * 0.07}s both`,
            }}
          >
            {promo.image_url ? (
              <PromotionImage src={promo.image_url} alt={promo.title} />
            ) : null}

            {/* Overlay content — sits above the image with a readable scrim. */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                gap: '10px',
                padding: '20px 22px',
                background:
                  'linear-gradient(180deg, transparent 30%, rgba(15, 11, 8, 0.82) 100%)',
              }}
            >
              <h3
                className="font-display"
                style={{
                  fontSize: 'clamp(17px, 2.4vw, 22px)',
                  margin: 0,
                  color: 'var(--gold-light)',
                  lineHeight: 1.25,
                }}
              >
                {promo.title}
              </h3>

              {promo.subtitle ? (
                <p
                  style={{
                    margin: 0,
                    fontSize: '13.5px',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.5,
                  }}
                >
                  {promo.subtitle}
                </p>
              ) : null}

              <PromotionButton promo={promo} />
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
