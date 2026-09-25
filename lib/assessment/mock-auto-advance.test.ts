/**
 * Mock auto-advance guard tests.
 *
 * RUN: npx jiti lib/assessment/mock-auto-advance.test.ts
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveMockAutoAdvanceTarget } from './mock-auto-advance'

const base = {
  mode: 'simulation' as const,
  status: 'IN_PROGRESS' as const,
  currentIndex: 1,
  sourceIndex: 1,
  questionCount: 4,
  isMounted: true,
  hasPendingTimer: false,
}

test('middle Mock answer resolves exactly one next target', () => {
  assert.equal(resolveMockAutoAdvanceTarget(base), 2)
})

test('a repeated selection cannot queue another pending advance', () => {
  assert.equal(resolveMockAutoAdvanceTarget({ ...base, hasPendingTimer: true }), null)
})

test('manual Next before the timer fires invalidates the captured source', () => {
  assert.equal(resolveMockAutoAdvanceTarget({ ...base, currentIndex: 2 }), null)
})

test('a palette jump before the timer fires invalidates the captured source', () => {
  assert.equal(resolveMockAutoAdvanceTarget({ ...base, currentIndex: 3 }), null)
})

test('the final Mock question never auto-advances', () => {
  assert.equal(
    resolveMockAutoAdvanceTarget({ ...base, currentIndex: 3, sourceIndex: 3 }),
    null,
  )
})

test('status, mode, and mount guards prevent stale movement', () => {
  assert.equal(resolveMockAutoAdvanceTarget({ ...base, status: 'REVIEW' }), null)
  assert.equal(resolveMockAutoAdvanceTarget({ ...base, mode: 'practice' }), null)
  assert.equal(resolveMockAutoAdvanceTarget({ ...base, isMounted: false }), null)
})
