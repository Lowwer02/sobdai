// Unit tests for the shared Exam Set status metadata (Phase 4).
//
// Run with:  npx jiti lib/exam-set-status.test.ts
//
// Mirrors the style of the sibling exam-sets tests (node:test +
// node:assert/strict).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  ExamSetStatus,
  EXAM_SET_STATUS_VALUES,
  EXAM_SET_STATUS_OPTIONS,
  examSetStatusLabel,
} from './exam-set-status'

// ─── EXAM_SET_STATUS_VALUES ─────────────────────────────────────────────────
test('EXAM_SET_STATUS_VALUES is exactly draft/published/archived in order', () => {
  assert.deepEqual([...EXAM_SET_STATUS_VALUES], ['draft', 'published', 'archived'])
})

// ─── EXAM_SET_STATUS_OPTIONS ────────────────────────────────────────────────
test('EXAM_SET_STATUS_OPTIONS values match the canonical values', () => {
  assert.deepEqual(
    EXAM_SET_STATUS_OPTIONS.map((o) => o.value),
    [...EXAM_SET_STATUS_VALUES]
  )
})

test('EXAM_SET_STATUS_OPTIONS labels are non-empty', () => {
  for (const o of EXAM_SET_STATUS_OPTIONS) {
    assert.ok(typeof o.label === 'string' && o.label.length > 0, `empty label for ${o.value}`)
  }
})

test('EXAM_SET_STATUS_OPTIONS labels are unique', () => {
  const labels = EXAM_SET_STATUS_OPTIONS.map((o) => o.label)
  assert.equal(new Set(labels).size, labels.length)
})

test('EXAM_SET_STATUS_OPTIONS has expected Draft/Published/Archived labels', () => {
  const byValue = new Map(EXAM_SET_STATUS_OPTIONS.map((o) => [o.value, o.label]))
  assert.equal(byValue.get('draft'), 'Draft')
  assert.equal(byValue.get('published'), 'Published')
  assert.equal(byValue.get('archived'), 'Archived')
})

// ─── examSetStatusLabel ─────────────────────────────────────────────────────
test('examSetStatusLabel returns the label for each concrete status', () => {
  assert.equal(examSetStatusLabel('draft'), 'Draft')
  assert.equal(examSetStatusLabel('published'), 'Published')
  assert.equal(examSetStatusLabel('archived'), 'Archived')
})

test('examSetStatusLabel returns null for unknown / null / undefined', () => {
  assert.equal(examSetStatusLabel('random'), null)
  assert.equal(examSetStatusLabel(''), null)
  assert.equal(examSetStatusLabel(null), null)
  assert.equal(examSetStatusLabel(undefined), null)
})

// Compile-time sanity: ExamSetStatus is the expected union.
const _t: ExamSetStatus = 'draft'
void _t
