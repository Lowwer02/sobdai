'use client'

import Link from 'next/link'
import { trackCtaClick } from '@/lib/analytics'

/**
 * The one client island inside the otherwise server-rendered NewsCtaBox.
 *
 * Why this exists: the spec requires firing a news_cta_click event immediately
 * before navigation, but forbids making the whole CTA box a client component
 * (it must stay server-rendered for crawlable internal links + no hydration
 * cost). The established codebase pattern for "analytics on click before
 * navigate" lives only inside large client components (e.g. PackageClient) —
 * there was no small, dedicated analytics-link. This is it.
 *
 * Renders a plain Next.js <Link> (semantic, crawlable internal navigation) and
 * pushes the event in onClick. Navigation is NEVER blocked: analytics failure
 * is swallowed (try/catch), and because <Link> handles the navigation itself,
 * the click proceeds regardless of the dataLayer push. Mirrors the spec's "fire
 * immediately before navigation, do not block if analytics fails."
 */
interface NewsCtaLinkProps {
  href: string
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
  /** Analytics payload — all of news_cta_click's required fields. */
  analytics: {
    news_id: string
    news_slug: string
    cta_position: 'primary' | 'secondary'
    destination_type: 'package' | 'summary' | 'exam' | 'internal'
    destination_id?: string | null
    destination_path: string
    button_label: string
  }
}

export default function NewsCtaLink({ href, className, style, children, analytics }: NewsCtaLinkProps) {
  const handleClick = () => {
    // Never let analytics break navigation. The push is best-effort; <Link>
    // owns the route change so this only needs to fire-and-forget.
    try {
      trackCtaClick(analytics)
    } catch {
      /* swallow — analytics must not block the click */
    }
  }

  return (
    <Link href={href} className={className} style={style} onClick={handleClick}>
      {children}
    </Link>
  )
}
