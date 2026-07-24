import Link from 'next/link'
import type { HomepagePromotion } from '@/lib/homepagePromotions'

interface AnnouncementBarProps {
  promotion: HomepagePromotion | null
}

const TYPE_LABELS: Record<string, string> = {
  announcement: 'ประกาศ',
  new_feature: 'ฟีเจอร์ใหม่',
  campaign: 'แคมเปญ',
  promotion: 'โปรโมชัน',
  maintenance: 'แจ้งเตือน',
}

export default function AnnouncementBar({ promotion }: AnnouncementBarProps) {
  if (!promotion) return null

  const isNewTab = promotion.link_type === 'external' && promotion.open_in_new_tab
  const hasLink = Boolean(promotion.button_link)
  const badgeLabel = TYPE_LABELS[promotion.type] || 'อัปเดต'

  const content = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        height: '44px',
        padding: '0 16px',
        borderRadius: '9999px',
        background: 'linear-gradient(135deg, rgba(212, 168, 67, 0.08) 0%, rgba(26, 18, 8, 0.95) 100%)',
        border: '1px solid rgba(212, 168, 67, 0.2)',
        maxWidth: '1100px',
        margin: '16px auto 0',
        boxSizing: 'border-box',
        cursor: hasLink ? 'pointer' : 'default',
      }}
      className="group transition-all duration-200 hover:border-[rgba(212,168,67,0.45)] hover:bg-[rgba(34,24,8,0.98)]"
    >
      {/* Badge */}
      <span
        style={{
          background: 'var(--gold-tint)',
          color: 'var(--gold-light)',
          border: '1px solid rgba(212, 168, 67, 0.3)',
          borderRadius: '9999px',
          padding: '2px 10px',
          fontSize: '11.5px',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {badgeLabel}
      </span>

      {/* Main Title */}
      <span
        style={{
          fontSize: '13.5px',
          color: 'var(--text-primary)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          fontWeight: 400,
        }}
      >
        {promotion.title}
      </span>

      {/* Optional Subtitle on desktop */}
      {promotion.subtitle && (
        <span
          className="hidden md:inline"
          style={{
            fontSize: '13px',
            color: 'var(--text-muted)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          · {promotion.subtitle}
        </span>
      )}

      {/* Action / Arrow indicator if clickable */}
      {hasLink && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            color: 'var(--gold-light)',
            fontSize: '12.5px',
            fontWeight: 500,
            flexShrink: 0,
            marginLeft: '4px',
          }}
        >
          {promotion.button_text && (
            <span className="hidden sm:inline" style={{ opacity: 0.9 }}>
              {promotion.button_text}
            </span>
          )}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-transform duration-200 ease-out group-hover:translate-x-1"
          >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </div>
      )}
    </div>
  )

  if (!hasLink || !promotion.button_link) {
    return (
      <div style={{ padding: '0 20px' }}>
        {content}
      </div>
    )
  }

  if (promotion.link_type === 'external') {
    return (
      <div style={{ padding: '0 20px' }}>
        <a
          href={promotion.button_link}
          target={isNewTab ? '_blank' : undefined}
          rel={isNewTab ? 'noopener noreferrer' : undefined}
          style={{ textDecoration: 'none', display: 'block' }}
        >
          {content}
        </a>
      </div>
    )
  }

  return (
    <div style={{ padding: '0 20px' }}>
      <Link href={promotion.button_link} style={{ textDecoration: 'none', display: 'block' }}>
        {content}
      </Link>
    </div>
  )
}
