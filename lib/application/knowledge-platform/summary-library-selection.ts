import type { SummaryLibrarySelectionReference } from './contracts'

export const SUMMARY_LIBRARY_COMPARE_SELECTION_LIMIT = 2

export interface SummaryLibrarySelectionCandidate
  extends SummaryLibrarySelectionReference {
  /** The record is still available in the current read projection. */
  readonly isAvailable: boolean
  /** Authorization was established by the server-side library read. */
  readonly isAuthorized: boolean
}

export type SummaryLibraryComparisonSelectionError =
  | 'requires_two'
  | 'too_many'
  | 'duplicate'
  | 'unavailable'
  | 'unauthorized'

export type SummaryLibraryComparisonSelectionResult =
  | {
      readonly valid: true
      readonly references: readonly SummaryLibrarySelectionReference[]
    }
  | {
      readonly valid: false
      readonly error: SummaryLibraryComparisonSelectionError
    }

/**
 * Toggle one stable Summary reference without coupling selection state to a
 * paginated result set. This is deliberately client-safe and persistence-free.
 */
export function toggleSummaryLibrarySelection(
  current: readonly SummaryLibrarySelectionReference[],
  candidate: SummaryLibrarySelectionReference
): readonly SummaryLibrarySelectionReference[] {
  const existingIndex = current.findIndex(
    (reference) => reference.summaryId === candidate.summaryId
  )

  if (existingIndex >= 0) {
    return current.filter((_, index) => index !== existingIndex)
  }

  return [...current, candidate]
}

/**
 * Select or clear the visible page while retaining selections from other
 * pages. The stable Summary ID is the only selection key.
 */
export function setSummaryLibraryPageSelection(
  current: readonly SummaryLibrarySelectionReference[],
  page: readonly SummaryLibrarySelectionReference[],
  selected: boolean
): readonly SummaryLibrarySelectionReference[] {
  const next = new Map(
    current.map((reference) => [reference.summaryId, reference])
  )

  for (const reference of page) {
    if (selected) next.set(reference.summaryId, reference)
    else next.delete(reference.summaryId)
  }

  return [...next.values()]
}

/**
 * Validate the non-destructive comparison entry point. Actual revision
 * comparison belongs to the later Revision phase; this guard ensures that a
 * future caller cannot compare more than two records or use a stale/unauthorized
 * row reference.
 */
export function validateSummaryLibraryComparisonSelection(
  candidates: readonly SummaryLibrarySelectionCandidate[]
): SummaryLibraryComparisonSelectionResult {
  if (candidates.length < SUMMARY_LIBRARY_COMPARE_SELECTION_LIMIT) {
    return { valid: false, error: 'requires_two' }
  }

  if (candidates.length > SUMMARY_LIBRARY_COMPARE_SELECTION_LIMIT) {
    return { valid: false, error: 'too_many' }
  }

  const seen = new Set<string>()
  for (const candidate of candidates) {
    if (seen.has(candidate.summaryId)) {
      return { valid: false, error: 'duplicate' }
    }
    seen.add(candidate.summaryId)

    if (!candidate.isAvailable) {
      return { valid: false, error: 'unavailable' }
    }

    if (!candidate.isAuthorized) {
      return { valid: false, error: 'unauthorized' }
    }
  }

  return {
    valid: true,
    references: candidates.map(({ summaryId, revisionId }) => ({
      summaryId,
      revisionId,
    })),
  }
}
