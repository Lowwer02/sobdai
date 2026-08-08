import { isValidDateOnly, isApplicationExpired } from '@/lib/news'

const THAI_MONTHS_SHORT = [
  '',
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
]

/**
 * Format a YYYY-MM-DD date string into Thai short date (e.g. 2026-08-31 → 31 ส.ค. 2569)
 * without timezone conversions or Date object parsing. Safely handles both Gregorian
 * (2026) and legacy Buddhist Era (2569) inputs to avoid double-adding 543.
 */
export function formatThaiDateOnly(dateStr: string): string {
  if (!isValidDateOnly(dateStr)) return ''
  const [yStr, mStr, dStr] = dateStr.trim().split('-')
  let y = parseInt(yStr, 10)
  if (y < 2400) {
    y += 543
  }
  const m = parseInt(mStr, 10)
  const d = parseInt(dStr, 10)
  return `${d} ${THAI_MONTHS_SHORT[m]} ${y}`
}

export interface RecruitmentStatusBadgeProps {
  deadline: string | null | undefined
  className?: string
}

/**
 * Server-compatible compact recruitment status badge for NewsCard and News Detail page.
 * Displays "เปิดรับสมัครถึง {date}" when open, "ปิดรับสมัครแล้ว" when expired, or null when absent.
 */
export default function RecruitmentStatusBadge({
  deadline,
  className = '',
}: RecruitmentStatusBadgeProps) {
  if (!deadline || !isValidDateOnly(deadline)) return null

  const expired = isApplicationExpired(deadline)
  const formattedDate = formatThaiDateOnly(deadline)

  if (expired) {
    return (
      <span
        className={`badge badge-red shrink-0 ${className}`.trim()}
        style={{
          lineHeight: 1.2,
          letterSpacing: '0.02em',
          whiteSpace: 'nowrap',
        }}
      >
        ปิดรับสมัครแล้ว
      </span>
    )
  }

  return (
    <span
      className={`badge badge-green shrink-0 ${className}`.trim()}
      style={{
        lineHeight: 1.2,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
      }}
    >
      เปิดรับสมัครถึง {formattedDate}
    </span>
  )
}
