'use client'

/**
 * FloatingSupport — Global floating action button for the Support system.
 *
 * Placed in the root layout so it appears site-wide without per-page
 * duplication. Manages its own isOpen state and renders its own SupportModal
 * instance, consistent with the pattern used by SupportCard and Footer.
 *
 * Exclusion paths (hidden completely):
 *   /login            — auth flow
 *   /reset-password   — auth flow
 *   /auth/{...}       — auth callback
 *   /package/{slug}/exam/{...} — immersive exam/assessment mode
 *   /assessment/{...} — assessment analytics (distraction-free)
 *
 * Admin pages are excluded automatically because app/admin/layout.tsx is a
 * completely separate layout tree that never renders this component.
 *
 * Visibility: only shown when supportConfig.enabled === true.
 */

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Heart } from 'lucide-react'
import SupportModal from '@/components/SupportModal'
import type { SupportConfig } from '@/lib/homepageConfig'

interface FloatingSupportProps {
  supportConfig: SupportConfig
}

/** Route prefixes where the floating button must never appear. */
const EXCLUDED_PREFIXES = ['/admin', '/login', '/register', '/auth', '/api']

/** Specific regex patterns where the floating button must never appear. */
const EXCLUDED_PATH_PATTERNS = [
  /^\/reset-password$/,
  /^\/package\/[^/]+\/exam\//,
  /^\/assessment\//,
]

function isExcludedPath(pathname: string): boolean {
  if (!pathname) return false
  if (EXCLUDED_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    return true
  }
  return EXCLUDED_PATH_PATTERNS.some(pattern => pattern.test(pathname))
}

export default function FloatingSupport({ supportConfig }: FloatingSupportProps) {
  const pathname = usePathname()
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Hide if support is disabled or if current page is in the exclusion list
  if (!supportConfig.enabled || isExcludedPath(pathname)) {
    return null
  }

  return (
    <>
      {/* Floating Action Button — bottom-right, safe-area aware */}
      <div
        className="fixed z-40"
        style={{
          bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
          right: 'calc(1.5rem + env(safe-area-inset-right, 0px))',
        }}
      >
        <button
          id="floating-support-button"
          type="button"
          aria-label="สนับสนุน Sobdai — เปิด Support"
          aria-haspopup="dialog"
          aria-expanded={isModalOpen}
          onClick={() => setIsModalOpen(true)}
          className="group flex items-center gap-2 rounded-full font-bold text-[13px] text-[#1A140E] transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F0B07] active:scale-95"
          style={{
            // Collapsed pill: icon only on mobile, expands on hover (desktop)
            background: 'linear-gradient(135deg, #D4AF37 0%, #F1D17A 100%)',
            boxShadow: '0 4px 24px rgba(212,175,55,0.35), 0 1px 4px rgba(0,0,0,0.4)',
            padding: '12px 18px',
            minHeight: '48px',
            minWidth: '48px',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.boxShadow =
              '0 6px 32px rgba(212,175,55,0.55), 0 2px 6px rgba(0,0,0,0.4)'
            ;(e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.04) translateY(-1px)'
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.boxShadow =
              '0 4px 24px rgba(212,175,55,0.35), 0 1px 4px rgba(0,0,0,0.4)'
            ;(e.currentTarget as HTMLButtonElement).style.transform = ''
          }}
        >
          <Heart size={17} className="fill-[#1A140E]/70 text-[#1A140E] flex-shrink-0" />
          {/* Label — visible on desktop, hidden on mobile to keep it compact */}
          <span className="hidden sm:inline whitespace-nowrap">
            {supportConfig.button_label || 'สนับสนุน Sobdai'}
          </span>
        </button>
      </div>

      {/* Reusable SupportModal — same component as Footer and SupportCard */}
      <SupportModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={supportConfig.title}
        description={supportConfig.description}
        qr_image_url={supportConfig.qr_image_url}
        promptpay_name={supportConfig.promptpay_name}
        bank_name={supportConfig.bank_name}
        account_number={supportConfig.account_number}
        footer_message={supportConfig.footer_message}
      />
    </>
  )
}
