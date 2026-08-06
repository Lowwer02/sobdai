/**
 * app/admin/exam-sets/exam-set-selection.test.ts
 * ----------------------------------------------------------------------------
 * Unit tests for the Exam Set multi-selection pure helpers (Phase 2).
 *
 * Pure module: imports only from ./exam-set-selection (no React, no Supabase,
 * no browser). The behavioral/integration checks (header tri-state rendered
 * correctly, reset-on-filter visually firing, click does not trigger row
 * actions, mobile no overflow) are covered by Browser QA — the page has no
 * component-test harness.
 *
 * RUN: npx jiti app/admin/exam-sets/exam-set-selection.test.ts
 *
 * Coverage targets:
 *  - toggleExamSetSelection: add / remove / idempotence / immutability
 *  - setExamSetPageSelection: select-all / clear, both directions, drops off-page ids
 *  - getExamSetPageSelectionState: empty page, none/some/all selected, off-page ignored
 *  - invariants: no off-page id survives; empty page never checked/indeterminate;
 *    duplicate ids do not affect the count; React state never mutated
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  toggleExamSetSelection,
  setExamSetPageSelection,
  getExamSetPageSelectionState,
} from './exam-set-selection'

// ---------------------------------------------------------------------------
// toggleExamSetSelection
// ---------------------------------------------------------------------------

test('toggle adds an id when absent', () => {
  assert.deepEqual(
    Array.from(toggleExamSetSelection(new Set(['a']), 'b')).sort(),
    ['a', 'b']
  )
})

test('toggle removes an id when present', () => {
  assert.deepEqual(
    Array.from(toggleExamSetSelection(new Set(['a', 'b']), 'a')).sort(),
    ['b']
  )
})

test('toggle of the same id twice is idempotent', () => {
  const s = new Set(['a'])
  const toggled = toggleExamSetSelection(s, 'b')
  const toggledAgain = toggleExamSetSelection(toggled, 'b')
  assert.deepEqual(Array.from(toggledAgain).sort(), ['a'])
})

test('toggle never mutates the input Set (React state safety)', () => {
  const original = new Set(['a'])
  const snapshot = Array.from(original)
  toggleExamSetSelection(original, 'b') // result discarded on purpose
  assert.deepEqual(Array.from(original), snapshot)
  assert.equal(original.size, 1)
})

test('toggle returns a NEW Set instance', () => {
  const original = new Set(['a'])
  const result = toggleExamSetSelection(original, 'a')
  assert.notEqual(result, original)
})

// ---------------------------------------------------------------------------
// setExamSetPageSelection — header checkbox, both directions
// ---------------------------------------------------------------------------

test('page select-all adds every current-page id', () => {
  const result = setExamSetPageSelection(new Set(), ['a', 'b', 'c'], true)
  assert.deepEqual(Array.from(result).sort(), ['a', 'b', 'c'])
})

test('page select-all DROPS off-page ids (invariant: no id survives off-page)', () => {
  // 'z' was selected but is not on this page → must not survive a header action.
  const result = setExamSetPageSelection(new Set(['z']), ['a', 'b'], true)
  assert.deepEqual(Array.from(result).sort(), ['a', 'b'])
  assert.ok(!result.has('z'))
})

test('page clear (checked → deselect) empties the Set', () => {
  const result = setExamSetPageSelection(new Set(['a', 'b']), ['a', 'b'], false)
  assert.equal(result.size, 0)
})

test('page clear also drops off-page ids (invariant holds in both directions)', () => {
  const result = setExamSetPageSelection(new Set(['a', 'z']), ['a', 'b'], false)
  assert.equal(result.size, 0)
  assert.ok(!result.has('z'))
})

test('page select-all on an empty page yields an empty Set', () => {
  assert.equal(setExamSetPageSelection(new Set(['a']), [], true).size, 0)
})

test('setExamSetPageSelection never mutates the input Set', () => {
  const original = new Set(['z'])
  const snapshot = Array.from(original)
  setExamSetPageSelection(original, ['a', 'b'], true) // discarded
  assert.deepEqual(Array.from(original), snapshot)
})

test('setExamSetPageSelection de-duplicates ids on the page', () => {
  const result = setExamSetPageSelection(new Set(), ['a', 'a', 'b'], true)
  assert.equal(result.size, 2)
})

// ---------------------------------------------------------------------------
// getExamSetPageSelectionState — drives header tri-state + Selected N
// ---------------------------------------------------------------------------

test('empty page → 0 selected, not checked, not indeterminate', () => {
  assert.deepEqual(getExamSetPageSelectionState(new Set(['a']), []), {
    selectedCount: 0,
    allSelected: false,
    someSelected: false,
  })
})

test('non-empty page, none selected → unchecked, not indeterminate', () => {
  assert.deepEqual(getExamSetPageSelectionState(new Set(), ['a', 'b']), {
    selectedCount: 0,
    allSelected: false,
    someSelected: false,
  })
})

test('partial selection → indeterminate (someSelected true)', () => {
  assert.deepEqual(getExamSetPageSelectionState(new Set(['a']), ['a', 'b']), {
    selectedCount: 1,
    allSelected: false,
    someSelected: true,
  })
})

test('full selection → checked (allSelected true), not indeterminate', () => {
  assert.deepEqual(
    getExamSetPageSelectionState(new Set(['a', 'b']), ['a', 'b']),
    {
      selectedCount: 2,
      allSelected: true,
      someSelected: false,
    }
  )
})

test('selectedCount counts ONLY current-page ids, ignoring off-page ids', () => {
  // 'z' is selected but not on this page — must not inflate the count or state.
  assert.deepEqual(getExamSetPageSelectionState(new Set(['a', 'z']), ['a']), {
    selectedCount: 1,
    allSelected: true,
    someSelected: false,
  })
})

test('duplicate page ids do not affect selectedCount', () => {
  // The page list should not contain duplicates in practice, but the helper
  // must remain correct if it ever does.
  assert.deepEqual(
    getExamSetPageSelectionState(new Set(['a']), ['a', 'a', 'b']),
    {
      selectedCount: 1, // 'a' counted once even though listed twice
      allSelected: false,
      someSelected: true,
    }
  )
})

test('getExamSetPageSelectionState never mutates the input Set', () => {
  const original = new Set(['a', 'z'])
  const snapshot = Array.from(original)
  getExamSetPageSelectionState(original, ['a']) // discarded
  assert.deepEqual(Array.from(original), snapshot)
})
