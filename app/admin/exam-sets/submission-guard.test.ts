// app/admin/exam-sets/submission-guard.test.ts
// ----------------------------------------------------------------------------
// Unit tests for the Exam Set submission-guard helpers.
//
// Run with:  npx jiti app/admin/exam-sets/submission-guard.test.ts
//
// Mirrors the style of ./bulk-status.test.ts and ./exam-set-selection.test.ts
// (node:test + node:assert/strict, no Jest/Vitest). The guard exists to make
// duplicate Exam Set parents impossible even under rapid Save double-clicks;
// these tests pin the synchronous state transitions that ExamSetForm relies on.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  canSubmit,
  nextSubmissionState,
  editRouteForCreate,
  type SubmissionState,
} from './submission-guard'

test('canSubmit: first submit is allowed from idle', () => {
  // Test point 1 — first submit allowed.
  assert.equal(canSubmit('idle'), true)
})

test('canSubmit: second concurrent submit is rejected', () => {
  // Test point 2 — a submit already in flight blocks a concurrent one.
  assert.equal(canSubmit('submitting'), false)
})

test('canSubmit: the created lock rejects further submits', () => {
  // A successful Create must stay locked until navigation completes, so a
  // second Save in the same workflow can never re-INSERT a parent.
  assert.equal(canSubmit('created'), false)
})

test('nextSubmissionState: failed submit returns to idle (retry allowed)', () => {
  // Test point 3 — a failed submit releases the lock so the Admin can retry.
  assert.equal(nextSubmissionState(true, false), 'idle')
  assert.equal(nextSubmissionState(false, false), 'idle')
})

test('nextSubmissionState: successful Create enters the created lock', () => {
  // Test point 4 — after a successful Create, the form may not Create again
  // before navigation to /edit. The only Create-success state is 'created'.
  assert.equal(nextSubmissionState(true, true), 'created')
})

test('nextSubmissionState: successful Update returns to idle (Edit stays re-savable)', () => {
  // Edit workflow must allow later saves after a completed update.
  assert.equal(nextSubmissionState(false, true), 'idle')
})

test('editRouteForCreate: uses the returned id for the Edit destination', () => {
  // Test point 5 — Create success uses the returned id to build the Edit route.
  assert.equal(editRouteForCreate('abc-123'), '/admin/exam-sets/abc-123/edit')
})

test('editRouteForCreate: returns null when no id was returned', () => {
  // Caller must NOT navigate when the create did not surface an id.
  assert.equal(editRouteForCreate(null), null)
  assert.equal(editRouteForCreate(undefined), null)
  assert.equal(editRouteForCreate(''), null)
  assert.equal(editRouteForCreate('   '), null)
})

// End-to-end state sequence the form performs on the happy path, exercised as
// a pure state transition to lock in the intended Create lifecycle.
test('lifecycle: idle → submitting → created cannot return to idle within one Create workflow', () => {
  const afterCreate: SubmissionState = nextSubmissionState(true, true)
  assert.equal(afterCreate, 'created')
  // Once locked on 'created', no further submit is permitted until the form
  // unmounts on navigation. This is what prevents the second INSERT.
  assert.equal(canSubmit(afterCreate), false)
})
