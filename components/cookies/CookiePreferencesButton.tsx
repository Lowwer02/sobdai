'use client'

import React from 'react'
import { useConsent } from '@/components/consent/ConsentProvider'

interface CookiePreferencesButtonProps {
  children?: React.ReactNode
  className?: string
  variant?: 'primary' | 'outline' | 'inline'
}

/**
 * CookiePreferencesButton — Small Client Island for /cookies
 *
 * CRITICAL ARCHITECTURE REQUIREMENT:
 * This is the ONLY client component on the /cookies route.
 * It connects directly to Sobdai's existing ConsentProvider and opens
 * the established CookiePreferencesModal without inventing a second consent store.
 */
export default function CookiePreferencesButton({
  children = 'จัดการความเป็นส่วนตัว',
  className = '',
  variant = 'primary',
}: CookiePreferencesButtonProps) {
  const { openPreferences } = useConsent()

  return (
    <button
      type="button"
      onClick={openPreferences}
      className={className}
      data-variant={variant}
      aria-haspopup="dialog"
    >
      {children}
    </button>
  )
}
