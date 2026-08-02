'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { trackHomepageNewsViewAllClick } from '@/lib/analytics'

interface HomepageNewsViewAllLinkProps {
  label: string
}

export default function HomepageNewsViewAllLink({ label }: HomepageNewsViewAllLinkProps) {
  const handleClick = () => {
    try {
      trackHomepageNewsViewAllClick({
        section_location: 'homepage_latest_news',
        destination_url: 'https://sobdai.com/news',
      })
    } catch {
      /* swallow analytics errors */
    }
  }

  return (
    <Link
      href="/news"
      onClick={handleClick}
      className="group"
      style={{
        textDecoration: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        color: 'var(--gold-light)',
        fontSize: '14px',
        fontWeight: 600,
      }}
    >
      <span>{label}</span>
      <ArrowRight
        size={15}
        className="transition-transform duration-200 group-hover:translate-x-1"
        aria-hidden
      />
    </Link>
  )
}
