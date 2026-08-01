import { GP_EXAM_REQUIREMENT_LABELS, type GpExamRequirement } from '@/lib/news'

/**
 * Compact badge for the ภาค ก. (ก.พ.) exam requirement — reused by the News
 * Card and the News Detail page so the two surfaces can never disagree.
 *
 * Rendering rules (frozen):
 *   required     → gold badge (the load-bearing answer applicants look for)
 *   not_required → muted outline badge (still informative, deliberately quiet)
 *   unspecified  → renders NOTHING on cards; on detail the caller shows a muted
 *                  inline note instead (this component returns null here so the
 *                  "no badge when unspecified" card rule is enforced centrally)
 *
 * Reuses the existing Sobdai gold token (`#D4AF37`, the same literal the news
 * detail page uses for its focus rings / badges) — no new design system.
 */
export default function GpExamRequirementBadge({
  value,
}: {
  value: GpExamRequirement
}) {
  // unspecified never renders a badge — the detail page handles its own muted
  // note, and the card shows nothing.
  if (value === 'unspecified') return null

  const isRequired = value === 'required'

  return (
    <span
      className={isRequired ? 'badge badge-gold' : undefined}
      style={
        isRequired
          ? undefined
          : {
              display: 'inline-flex',
              alignItems: 'center',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-muted)',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: '999px',
              padding: '3px 10px',
            }
      }
    >
      {GP_EXAM_REQUIREMENT_LABELS[value]}
    </span>
  )
}
