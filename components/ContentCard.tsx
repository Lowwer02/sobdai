import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'

/**
 * ContentCard — shared card for the Summary and Exam navigation columns on
 * the Package Detail page.
 *
 * Why this exists:
 *   SummaryNavigation and ExamNavigation previously rendered nearly-identical
 *   cards with separately-maintained markup, spacing, and responsive rules.
 *   That duplication caused visual drift (different padding / radius / title
 *   weight) and a specific mobile bug in the Summary card where the metadata
 *   row ("3 นาที • topic พร้อมเรียน") wrapped onto two lines. This component
 *   is the single source of truth for both cards so they share one design
 *   system and one set of responsive fixes.
 *
 * Presentation only. It does NOT touch search / filter / accordion / runtime
 * logic — those remain in the navigation components. The card simply renders
 * a title, optional description, a metadata row, an optional badge, and wraps
 * itself in a <Link> to a route.
 */

export interface ContentCardMeta {
  /** Short, non-wrapping label, e.g. "3 นาที" or "12 ข้อ". */
  icon?: ReactNode
  text: string
}

export interface ContentCardProps {
  href: string
  title: string
  description?: string
  /**
   * Metadata shown in the footer row, left-aligned. The first item is the
   * "primary" one and is allowed to take available space (its trailing text
   * truncates); subsequent items are fixed-width and never wrap.
   */
  meta: ContentCardMeta[]
  /**
   * Right-aligned status pill, e.g. "พร้อมเรียน" or "ตัวอย่าง".
   * Rendered with the given tone.
   */
  badge?: { label: string; tone: 'success' | 'gold' }
  /** Optional corner badge (e.g. sample ribbon). Shown top-right absolute. */
  cornerBadge?: string
}

const TONES: Record<'success' | 'gold', { bg: string; color: string }> = {
  success: { bg: 'rgba(34,197,94,0.1)', color: '#22C55E' },
  gold: { bg: 'rgba(212,175,55,0.1)', color: '#D4AF37' },
}

// Shared card shell. Unifies the two previous cards onto:
//   bg rgba(255,255,255,0.02), border rgba(255,255,255,0.05),
//   radius 12px, padding 14px 16px — the Summary card's values (the more
//   refined of the two). Hover lifts border to gold.
const CARD_CLASS =
  'hover:border-[rgba(212,175,55,0.3)] hover:bg-[rgba(212,175,55,0.03)] group'

const CARD_STYLE: CSSProperties = {
  backgroundColor: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: '12px',
  padding: '14px 16px',
  transition: 'border-color 0.2s, background-color 0.2s',
}

// Footer metadata row. Uses flex with a fixed (non-shrinking) badge and a
// truncating left side so the row NEVER wraps on narrow screens.
const FOOTER_STYLE: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '8px',
  marginTop: '10px',
}

export default function ContentCard({
  href,
  title,
  description,
  meta,
  badge,
  cornerBadge,
}: ContentCardProps) {
  const tone = badge ? TONES[badge.tone] : null

  return (
    <Link href={href} className="block">
      <div className={`${CARD_CLASS} relative overflow-hidden`} style={CARD_STYLE}>
        {cornerBadge && (
          <div className="absolute top-0 right-0 bg-[#D4AF37] text-[#1A140E] text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">
            {cornerBadge}
          </div>
        )}

        {/* Title — unified typography: 14px / 600, room for corner badge */}
        <h4
          className="group-hover:text-[#D4AF37]"
          style={{
            fontSize: '14px',
            fontWeight: '600',
            color: '#F5E9D6',
            marginBottom: description ? '4px' : '0',
            lineHeight: 1.45,
            paddingRight: cornerBadge ? '40px' : '0',
            transition: 'color 0.2s',
          }}
        >
          {title}
        </h4>

        {/* Description — exam sets have one; summaries do not */}
        {description && (
          <p
            className="line-clamp-2"
            style={{
              color: '#A1866B',
              fontSize: '12px',
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            {description}
          </p>
        )}

        {/* Footer metadata row — fixed badge on the right; on the left the
            leading meta items (e.g. "3 นาที") are fixed-width and never
            truncate, while the LAST meta item (e.g. topic) absorbs leftover
            space and ellipsifies. This guarantees time never wraps/clips. */}
        <div style={FOOTER_STYLE}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              color: '#A1866B',
              fontSize: '11px',
              minWidth: 0,
              flex: '1 1 auto',
              flexWrap: 'nowrap',
              overflow: 'hidden',
            }}
          >
            {meta.map((m, i) => (
              // The final meta entry is the truncating one; all earlier ones
              // (time, count) are fixed and fully visible.
              <MetaItem key={i} meta={m} truncate={i === meta.length - 1} />
            ))}
          </div>

          {/* Right badge — never shrinks, never wraps */}
          {badge && tone && (
            <span
              style={{
                backgroundColor: tone.bg,
                color: tone.color,
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {badge.label}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

/**
 * One metadata chip. When `truncate` is true (the trailing/last meta item,
 * e.g. a topic), the chip absorbs leftover space and ellipsifies on overflow.
 * Non-truncating chips (time, count) are fixed-width and always fully visible.
 */
function MetaItem({ meta, truncate }: { meta: ContentCardMeta; truncate: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        whiteSpace: 'nowrap',
        flex: truncate ? '1 1 auto' : '0 0 auto',
        minWidth: truncate ? 0 : 'auto',
        overflow: truncate ? 'hidden' : 'visible',
      }}
    >
      {meta.icon}
      <span
        style={{
          overflow: truncate ? 'hidden' : 'visible',
          textOverflow: truncate ? 'ellipsis' : 'clip',
        }}
      >
        {meta.text}
      </span>
    </span>
  )
}
