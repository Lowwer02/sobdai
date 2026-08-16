import { ChevronRight } from 'lucide-react'
import type { CtaConfig, CtaButton } from '@/lib/news'
import { isValidInternalPath } from '@/lib/news'
import { getVerifiedSummaryHref, type PublicSummaryTarget } from '@/lib/summary-target'
import NewsCtaLink from './NewsCtaLink'

/**
 * Public "preparation CTA" box — rendered near the bottom of a news article
 * (app/news/[slug]/page.tsx inserts it between the Source section and the
 * Related section).
 *
 * Server Component (no 'use client'): the box markup + all destination
 * resolution run on the server, so the buttons are crawlable <Link>s. The only
 * client surface is the tiny NewsCtaLink leaf that fires the analytics event —
 * imported here, kept isolated.
 *
 * RESOLUTION RULES (the spec's hideWhenEmpty contract — single source here):
 *   - null config (legacy rows) → render nothing (Case 8).
 *   - config.enabled === false  → render nothing (Case 1).
 *   - Each enabled button resolves to a href, re-validated server-side:
 *       package  → /package/<slug>   (slug looked up from the live related set
 *                                     by targetId; if the related package was
 *                                     removed, the button drops — Case 5)
 *       summary  → the final href from the shared verified Summary target set
 *       exam     → the stored href, re-validated by isValidInternalPath
 *       internal → the stored href, re-validated by isValidInternalPath
 *   - A button with no resolvable href is dropped (never renders '#', never
 *     renders a button without a destination).
 *   - If hideWhenEmpty AND zero buttons survive → the whole box renders
 *     nothing (Case 2).
 *
 * Reuses the existing Sobdai design system: .card-gold + .btn-primary / outline
 * button classes + the gold eyebrow convention from the related-content H3s.
 * No new visual system.
 */

/** Minimal slice of a related package the box needs to resolve a CTA target. */
interface RelatedPackageLite {
  id: string
  slug: string
}
/** The CTA consumes only a href already verified by the shared resolver. */
type RelatedSummaryLite = Pick<PublicSummaryTarget, 'summaryId' | 'href'>

interface NewsCtaBoxProps {
  config: CtaConfig | null
  newsId: string
  newsSlug: string
  relatedPackages?: RelatedPackageLite[]
  relatedSummaries?: RelatedSummaryLite[]
}

/**
 * Resolve a single CtaButton to a final href (or null if it can't resolve).
 * Pure + total — never throws. Encapsulates the live-junction lookup + path
 * re-validation so the render below stays declarative.
 */
function resolveButtonHref(
  button: CtaButton,
  relatedPackages: RelatedPackageLite[],
  relatedSummaries: RelatedSummaryLite[]
): string | null {
  if (!button.enabled) return null

  switch (button.type) {
    case 'package': {
      if (!button.targetId) return null
      const pkg = relatedPackages.find(p => p.id === button.targetId)
      return pkg?.slug ? `/package/${pkg.slug}` : null
    }
    case 'summary': {
      if (!button.targetId) return null
      return getVerifiedSummaryHref(relatedSummaries, button.targetId)
    }
    case 'exam':
    case 'internal': {
      // Re-validate the stored path server-side. An admin may have saved a
      // valid path that was later broken, or an old/invalid value slipped
      // through — drop the button rather than render a broken link.
      const href = button.href?.trim()
      if (!href || !isValidInternalPath(href)) return null
      return href
    }
    default:
      return null
  }
}

export default function NewsCtaBox({
  config,
  newsId,
  newsSlug,
  relatedPackages = [],
  relatedSummaries = [],
}: NewsCtaBoxProps) {
  // Legacy rows + explicitly disabled → nothing. (Cases 1 + 8.)
  if (!config || !config.enabled) return null

  // Resolve each button; keep position so primary always leads when both show.
  const buttons: {
    position: 'primary' | 'secondary'
    button: CtaButton
    href: string
  }[] = []

  const primaryHref = resolveButtonHref(config.primary, relatedPackages, relatedSummaries)
  if (primaryHref) buttons.push({ position: 'primary', button: config.primary, href: primaryHref })

  const secondaryHref = resolveButtonHref(config.secondary, relatedPackages, relatedSummaries)
  if (secondaryHref) buttons.push({ position: 'secondary', button: config.secondary, href: secondaryHref })

  // hideWhenEmpty: zero valid buttons → hide the whole box (Case 2). Even when
  // hideWhenEmpty is false we still hide — rendering an empty box with no
  // buttons is never useful and the spec forbids a button-less CTA.
  if (buttons.length === 0) return null

  return (
    <section aria-label="กล่องแนะนำการเตรียมสอบ" style={{ marginTop: 40 }}>
      <div className="card-gold" style={{ padding: '32px 28px' }}>
        {/* Gold eyebrow — mirrors the uppercase gold-muted H3 convention used by
            the related-content labels on this same page. */}
        <p
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--gold-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: 10,
          }}
        >
          เตรียมสอบกับ Sobdai
        </p>
        <h2
          className="font-display"
          style={{ fontSize: 'clamp(20px, 3vw, 26px)', fontWeight: 700, marginBottom: 10 }}
        >
          {config.heading}
        </h2>
        {config.description && (
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 22 }}>
            {config.description}
          </p>
        )}

        {/* Buttons: stack on mobile, inline on ≥sm. Primary = gold (.btn-primary),
            secondary = outline (.btn-outline) — reuses the existing classes. */}
        <div className="flex flex-col sm:flex-row gap-3">
          {buttons.map(({ position, button, href }) => {
            const isPrimary = position === 'primary'
            return (
              <NewsCtaLink
                key={position}
                href={href}
                className={isPrimary ? 'btn-primary' : 'btn-outline'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '12px 24px',
                  fontSize: 15,
                  textDecoration: 'none',
                }}
                analytics={{
                  news_id: newsId,
                  news_slug: newsSlug,
                  cta_position: position,
                  destination_type: button.type,
                  destination_id: button.targetId || undefined,
                  destination_path: href,
                  button_label: button.label,
                }}
              >
                {button.label}
                <ChevronRight size={16} aria-hidden />
              </NewsCtaLink>
            )
          })}
        </div>
      </div>
    </section>
  )
}
