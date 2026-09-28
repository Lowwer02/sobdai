'use client'

import { useConsent } from '@/components/consent/ConsentProvider'

export function CookieSettingsButton() {
  const { openPreferences } = useConsent()

  return (
    <button
      type="button"
      onClick={openPreferences}
      className="text-sm font-medium text-muted-foreground hover:text-brand transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
    >
      ตั้งค่าความเป็นส่วนตัว
    </button>
  )
}
