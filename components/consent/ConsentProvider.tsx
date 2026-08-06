'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import {
  ConsentPreferences,
  createConsentPreferences,
  readConsentFromDocumentCookie,
  writeConsentToDocumentCookie,
  clearConsentDocumentCookie,
  clearKnownAnalyticsCookiesFromDocument,
} from '@/lib/consent'

export type ConsentStatus = 'loading' | 'undecided' | 'accepted' | 'rejected'

export interface ConsentContextValue {
  status: ConsentStatus
  preferences: ConsentPreferences | null
  isReady: boolean
  hasAnalyticsConsent: boolean
  isPreferencesOpen: boolean
  acceptAnalytics: () => void
  rejectAnalytics: () => void
  clearConsent: () => void
  openPreferences: () => void
  closePreferences: () => void
}

const ConsentContext = createContext<ConsentContextValue | null>(null)

export function ConsentProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ConsentStatus>('loading')
  const [preferences, setPreferences] = useState<ConsentPreferences | null>(null)
  const [isPreferencesOpen, setIsPreferencesOpen] = useState<boolean>(false)

  useEffect(() => {
    const existingConsent = readConsentFromDocumentCookie()

    if (!existingConsent) {
      setStatus('undecided')
      setPreferences(null)
    } else if (existingConsent.analytics) {
      setStatus('accepted')
      setPreferences(existingConsent)
    } else {
      setStatus('rejected')
      setPreferences(existingConsent)
    }
  }, [])

  const acceptAnalytics = useCallback(() => {
    const nextPreferences = createConsentPreferences(true)
    writeConsentToDocumentCookie(nextPreferences)
    setPreferences(nextPreferences)
    setStatus('accepted')
  }, [])

  const rejectAnalytics = useCallback(() => {
    const wasAnalyticsActive = status === 'accepted'
    const nextPreferences = createConsentPreferences(false)
    writeConsentToDocumentCookie(nextPreferences)
    clearKnownAnalyticsCookiesFromDocument()
    setPreferences(nextPreferences)
    setStatus('rejected')

    if (wasAnalyticsActive && typeof window !== 'undefined') {
      window.location.reload()
    }
  }, [status])

  const clearConsent = useCallback(() => {
    const wasAnalyticsActive = status === 'accepted'
    clearConsentDocumentCookie()
    clearKnownAnalyticsCookiesFromDocument()
    setPreferences(null)
    setStatus('undecided')

    if (wasAnalyticsActive && typeof window !== 'undefined') {
      window.location.reload()
    }
  }, [status])

  const openPreferences = useCallback(() => {
    setIsPreferencesOpen(true)
  }, [])

  const closePreferences = useCallback(() => {
    setIsPreferencesOpen(false)
  }, [])

  const isReady = status !== 'loading'
  const hasAnalyticsConsent = status === 'accepted'

  const value = useMemo<ConsentContextValue>(
    () => ({
      status,
      preferences,
      isReady,
      hasAnalyticsConsent,
      isPreferencesOpen,
      acceptAnalytics,
      rejectAnalytics,
      clearConsent,
      openPreferences,
      closePreferences,
    }),
    [
      status,
      preferences,
      isReady,
      hasAnalyticsConsent,
      isPreferencesOpen,
      acceptAnalytics,
      rejectAnalytics,
      clearConsent,
      openPreferences,
      closePreferences,
    ]
  )

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>
}

export function useConsent(): ConsentContextValue {
  const context = useContext(ConsentContext)
  if (!context) {
    throw new Error('useConsent must be used within a ConsentProvider')
  }
  return context
}
