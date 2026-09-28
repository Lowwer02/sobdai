'use client'

import Link from 'next/link'
import { useConsent } from '@/components/consent/ConsentProvider'

export function CookieBanner() {
  const { status, acceptAnalytics, openPreferences } = useConsent()

  if (status !== 'undecided') {
    return null
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-banner-title"
      aria-describedby="cookie-banner-description"
      className="fixed bottom-0 inset-x-0 z-50 bg-surface-raised border-t border-border shadow-2xl"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-3.5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 lg:gap-6">
        <div className="flex-1 text-xs sm:text-sm text-muted-foreground leading-normal">
          <span id="cookie-banner-title" className="font-bold text-brand mr-2">
            เราให้ความสำคัญกับความเป็นส่วนตัวของคุณ:
          </span>
          <span id="cookie-banner-description">
            Sobdai ใช้คุกกี้ที่จำเป็นเพื่อให้เว็บไซต์ทำงาน และใช้คุกกี้วิเคราะห์เมื่อคุณยินยอมเพื่อช่วยปรับปรุงบริการ ตัวเลือกโฆษณาของ Google จัดการแยกต่างหากเมื่อมีการแสดงโฆษณา{' '}
            <Link
              href="/cookies"
              className="text-brand underline hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
            >
              อ่านนโยบายคุกกี้
            </Link>
          </span>
        </div>

        <div className="w-full lg:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={openPreferences}
            className="w-full sm:w-auto px-3.5 py-2 text-xs font-semibold text-foreground bg-surface-muted hover:bg-muted border border-border rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            ตั้งค่าความเป็นส่วนตัว
          </button>
          <button
            type="button"
            onClick={acceptAnalytics}
            className="w-full sm:w-auto px-3.5 py-2 text-xs font-bold text-brand-foreground bg-brand-solid hover:bg-brand-hover rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand shadow-sm"
          >
            ยอมรับคุกกี้วิเคราะห์
          </button>
        </div>
      </div>
    </div>
  )
}
