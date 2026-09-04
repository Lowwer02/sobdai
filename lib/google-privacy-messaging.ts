/**
 * Small bridge to Google's Privacy & messaging API.
 *
 * Google owns the advertising-consent record and the consent UI. This module
 * only uses Google's documented callback queue so Sobdai never creates a
 * second advertising-consent store, TCF string, geo detector, or ad authority.
 * The existing AdSense tag is what loads Google's Privacy & messaging flow
 * after a message has been published in AdSense.
 */

type GooglePrivacyCallback = () => void
type GooglePrivacyQueueEntry =
  | GooglePrivacyCallback
  | { CONSENT_API_READY?: GooglePrivacyCallback }

interface GooglePrivacyMessagingNamespace {
  callbackQueue?: GooglePrivacyQueueEntry[]
  showRevocationMessage?: () => void
}

export interface GooglePrivacyChoiceActivationGuard {
  current: boolean
}

export type GooglePrivacyChoiceActivationResult = 'queued' | 'in-progress' | 'unavailable'

declare global {
  interface Window {
    googlefc?: GooglePrivacyMessagingNamespace
  }
}

function getGooglePrivacyMessagingNamespace(): GooglePrivacyMessagingNamespace | null {
  if (typeof window === 'undefined') return null

  const googlefc = window.googlefc ?? {}
  window.googlefc = googlefc
  googlefc.callbackQueue ??= []
  return googlefc
}

/**
 * Subscribes to Google's documented readiness callback without blocking the
 * page when the CMP is not configured or cannot be loaded.
 */
export function subscribeToGooglePrivacyMessaging(onReady: () => void): () => void {
  const googlefc = getGooglePrivacyMessagingNamespace()
  if (!googlefc) return () => {}

  if (typeof googlefc.showRevocationMessage === 'function') {
    onReady()
    return () => {}
  }

  let active = true
  googlefc.callbackQueue!.push({
    CONSENT_API_READY: () => {
      if (active) onReady()
    },
  })

  return () => {
    active = false
  }
}

/**
 * Queues Google's own consent-revocation flow. Returns false when the Google
 * API is unavailable so callers can fail closed without throwing or creating
 * a local replacement UI.
 */
export function queueGooglePrivacyChoices(): boolean {
  const googlefc = getGooglePrivacyMessagingNamespace()
  if (!googlefc || typeof googlefc.showRevocationMessage !== 'function') return false

  try {
    googlefc.callbackQueue!.push(googlefc.showRevocationMessage)
    return true
  } catch {
    return false
  }
}

/**
 * Prevents duplicate revocation requests during one modal interaction. This is
 * only a transient click guard; Google remains the owner of all ad-consent
 * state. An unavailable API releases the guard immediately so callers can
 * safely retry after Google Privacy & messaging becomes ready.
 */
export function queueGooglePrivacyChoicesOnce(
  guard: GooglePrivacyChoiceActivationGuard,
): GooglePrivacyChoiceActivationResult {
  if (guard.current) return 'in-progress'

  guard.current = true
  if (queueGooglePrivacyChoices()) return 'queued'

  guard.current = false
  return 'unavailable'
}
