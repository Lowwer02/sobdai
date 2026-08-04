import assert from 'node:assert/strict'
import test from 'node:test'

import type {
  SummaryLibrarySelectionReference,
} from './contracts'
import {
  setSummaryLibraryPageSelection,
  toggleSummaryLibrarySelection,
  validateSummaryLibraryComparisonSelection,
} from './summary-library-selection'

function reference(
  summaryId: string,
  revisionId: string | null = null
): SummaryLibrarySelectionReference {
  return { summaryId, revisionId }
}

function candidate(
  summaryId: string,
  options: { revisionId?: string | null; isAvailable?: boolean; isAuthorized?: boolean } = {}
) {
  return {
    summaryId,
    revisionId: options.revisionId ?? null,
    isAvailable: options.isAvailable ?? true,
    isAuthorized: options.isAuthorized ?? true,
  }
}

test('selection toggles by stable Summary ID and retains revision references', () => {
  const first = reference('summary-1', 'revision-1')
  const second = reference('summary-2', 'revision-2')

  const selected = toggleSummaryLibrarySelection([], first)
  assert.deepEqual(selected, [first])
  assert.deepEqual(toggleSummaryLibrarySelection(selected, second), [first, second])
  assert.deepEqual(toggleSummaryLibrarySelection([first, second], first), [second])
})

test('page selection changes only visible records and persists other pages', () => {
  const first = reference('summary-1')
  const second = reference('summary-2')
  const third = reference('summary-3')

  const selected = setSummaryLibraryPageSelection([first], [second, third], true)
  assert.deepEqual(selected, [first, second, third])
  assert.deepEqual(setSummaryLibraryPageSelection(selected, [second], false), [first, third])
})

test('comparison validation requires exactly two available and authorized records', () => {
  assert.deepEqual(
    validateSummaryLibraryComparisonSelection([candidate('summary-1')]),
    { valid: false, error: 'requires_two' }
  )
  assert.deepEqual(
    validateSummaryLibraryComparisonSelection([
      candidate('summary-1'),
      candidate('summary-2'),
      candidate('summary-3'),
    ]),
    { valid: false, error: 'too_many' }
  )
  assert.deepEqual(
    validateSummaryLibraryComparisonSelection([
      candidate('summary-1'),
      candidate('summary-1'),
    ]),
    { valid: false, error: 'duplicate' }
  )
  assert.deepEqual(
    validateSummaryLibraryComparisonSelection([
      candidate('summary-1'),
      candidate('summary-2', { isAvailable: false }),
    ]),
    { valid: false, error: 'unavailable' }
  )
  assert.deepEqual(
    validateSummaryLibraryComparisonSelection([
      candidate('summary-1'),
      candidate('summary-2', { isAuthorized: false }),
    ]),
    { valid: false, error: 'unauthorized' }
  )
})

test('comparison validation returns stable Summary and revision references', () => {
  const result = validateSummaryLibraryComparisonSelection([
    candidate('summary-1', { revisionId: 'revision-1' }),
    candidate('summary-2', { revisionId: null }),
  ])

  assert.equal(result.valid, true)
  if (result.valid) {
    assert.deepEqual(result.references, [
      reference('summary-1', 'revision-1'),
      reference('summary-2'),
    ])
  }
})
