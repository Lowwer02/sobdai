'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { trackExamsEvent } from '@/lib/analytics'

/**
 * components/exams/TrackedLink.tsx
 * ----------------------------------------------------------------------------
 * Learning Analytics UX V1 — a minimal client wrapper around next/link that
 * fires ONE consent-gated GTM event in onClick, then lets the navigation
 * proceed naturally (the default is never blocked, no custom routing). Server
 * components render it directly; the link itself stays a real next/link so
 * prefetching/behavior is unchanged.
 */
export default function TrackedLink({
  href,
  eventName,
  className,
  style,
  children,
}: {
  href: string
  eventName: Parameters<typeof trackExamsEvent>[0]
  className?: string
  style?: React.CSSProperties
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      className={className}
      style={style}
      onClick={() => trackExamsEvent(eventName)}
    >
      {children}
    </Link>
  )
}
