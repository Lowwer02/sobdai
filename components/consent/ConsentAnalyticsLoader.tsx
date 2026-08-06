'use client'

import { GoogleTagManager } from '@next/third-parties/google'
import { useConsent } from '@/components/consent/ConsentProvider'

export interface ConsentAnalyticsLoaderProps {
  gtmId?: string
}

export function ConsentAnalyticsLoader({ gtmId }: ConsentAnalyticsLoaderProps) {
  const { isReady, hasAnalyticsConsent } = useConsent()

  if (!isReady || !hasAnalyticsConsent || !gtmId) {
    return null
  }

  return <GoogleTagManager gtmId={gtmId} />
}
