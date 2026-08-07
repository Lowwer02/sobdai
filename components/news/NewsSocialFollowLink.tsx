'use client'

import { ExternalLink } from 'lucide-react'
import type { SocialPlatformKey } from '@/lib/socialFollowConfig'
import { trackSocialFollowClick } from '@/lib/analytics'

interface NewsSocialFollowLinkProps {
  platform: SocialPlatformKey
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
  url,
  buttonLabel,
  contentId,
  className,
}: NewsSocialFollowLinkProps) {
  const handleClick = () => {
    try {
      trackSocialFollowClick({
        platform,
        placement: 'news_detail_end',
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
