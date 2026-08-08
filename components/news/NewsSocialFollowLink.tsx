'use client'

import { ExternalLink } from 'lucide-react'
import type { SocialPlatformKey } from '@/lib/socialFollowConfig'
import { trackSocialFollowClick } from '@/lib/analytics'

interface NewsSocialFollowLinkProps {
  platform: SocialPlatformKey
  placement: 'news_detail_end' | 'news_list_banner'
  url: string
  buttonLabel: string
  contentId: string
  className?: string
}

/**
 * Client island wrapper for a Social Follow CTA link.
 * Fires social_follow_click analytics on click without blocking external navigation.
 */
export default function NewsSocialFollowLink({
  platform,
  placement,
  url,
  buttonLabel,
  contentId,
  className,
}: NewsSocialFollowLinkProps) {
  const handleClick = () => {
    try {
      trackSocialFollowClick({
        platform,
        placement,
        content_id: contentId,
      })
    } catch {
      /* swallow — analytics must not block navigation */
    }
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={handleClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '12px 24px',
        fontSize: 15,
        textDecoration: 'none',
      }}
    >
      <span>{buttonLabel}</span>
      <ExternalLink size={15} aria-hidden />
    </a>
  )
}
