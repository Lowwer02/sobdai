import { GP_EXAM_REQUIREMENT_LABELS, type GpExamRequirement } from '@/lib/news'

/**
 * Compact badge for the ภาค ก. (ก.พ.) exam requirement — reused by the News
 * Card and the News Detail page so the two surfaces stay consistent.
 *
 * Visual design:
 *   - Both 'required' ("ต้องผ่าน ก.พ.") and 'not_required' ("ไม่ต้องผ่าน ก.พ.")
 *     use Sobdai's premium gold badge styling (`badge badge-gold`), inheriting
 *     the configured Supermarket font, gold text, dark translucent gold background,
 *     and gold border.
 *   - 'unspecified' renders nothing.
 */
export default function GpExamRequirementBadge({
  value,
  className,
}: {
  value: GpExamRequirement
  className?: string
}) {
  if (value === 'unspecified') return null

  return (
    <span
      className={`badge badge-gold shrink-0 ${className || ''}`.trim()}
      style={{
        lineHeight: 1.2,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
      }}
    >
      {GP_EXAM_REQUIREMENT_LABELS[value]}
    </span>
  )
}
