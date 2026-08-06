'use client'

import { useConsent } from '@/components/consent/ConsentProvider'
import { CookieBanner } from '@/components/consent/CookieBanner'
import { CookiePreferencesModal } from '@/components/consent/CookiePreferencesModal'

export function ConsentManager() {
  const { isPreferencesOpen, closePreferences } = useConsent()

  return (
    <>
      <CookieBanner />
      <CookiePreferencesModal isOpen={isPreferencesOpen} onClose={closePreferences} />
    </>
  )
}
