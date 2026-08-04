/**
 * lib/assessment/activity-timeline.test.ts
 * ----------------------------------------------------------------------------
 * Self-test for the PURE timeline helpers (Phase 1E). No DB, no React, no
 * cookies, no Next request context. Uses Node's built-in test runner.
 *
 * RUN: npx jiti lib/assessment/activity-timeline.test.ts
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  sanitizeCompletedEvent,
  sanitizeProgressEvent,
  mergeTimeline,
  TIMELINE_MAX_ITEMS,
  type TimelineEvent,
} from './activity-timeline'

// ─── Test factories ──────────────────────────────────────────────────────────

const NAMES = {
  exam_sets: { name: 'ชุดที่ 1' },
  packages: { name: 'แพ็กเกจ A', slug: 'pkg-a', is_published: true },
}

function completed(
  id: string,
  ts: string,
  overrides: Partial<TimelineEvent> = {},
): TimelineEvent {
  return {
    kind: 'completed',
    ts: new Date(ts).getTime(),
    id,
    mode: 'simulation',
    examSetId: 'es-1',
    packageName: 'แพ็กเกจ A',
    packageSlug: 'pkg-a',
    examSetName: 'ชุดที่ 1',
    timestamp: ts,
    score: 7,
    total: 10,
    passed: true,
    answeredCount: 0,
    totalQuestions: 0,
    ...overrides,
  }
}

function progress(
  id: string,
  ts: string,
  overrides: Partial<TimelineEvent> = {},
): TimelineEvent {
  return {
    kind: 'progress',
    ts: new Date(ts).getTime(),
    id,
    mode: 'practice',
    examSetId: 'es-1',
    packageName: 'แพ็กเกจ A',
    packageSlug: 'pkg-a',
    examSetName: 'ชุดที่ 1',
    timestamp: ts,
    score: 0,
    total: 0,
    passed: false,
    answeredCount: 3,
    totalQuestions: 10,
    ...overrides,
  }
}

// ─── mergeTimeline: ordering ─────────────────────────────────────────────────

test('mergeTimeline: orders newest-first by timestamp', () => {
  const out = mergeTimeline(
    [completed('a', '2026-08-01T10:00:00Z'), completed('b', '2026-08-03T10:00:00Z')],
    [progress('c', '2026-08-02T10:00:00Z')],
  )
  assert.deepEqual(
    out.map((e) => e.id),
    ['b', 'c', 'a'],
  )
})

test('mergeTimeline: caps at TIMELINE_MAX_ITEMS (10)', () => {
  const many: TimelineEvent[] = []
  for (let i = 0; i < 15; i++) {
    // distinct timestamps so ordering is unambiguous
    many.push(completed(`c${i}`, `2026-08-${(i + 1).toString().padStart(2, '0')}T10:00:00Z`))
  }
  const out = mergeTimeline(many, [])
  assert.equal(out.length, TIMELINE_MAX_ITEMS)
  assert.equal(TIMELINE_MAX_ITEMS, 10)
  // newest 10 of c0..c14 retained, descending → c14 (newest) … c5 (10th-newest);
  // the 5 oldest (c0..c4) are dropped.
  assert.equal(out[0].id, 'c14')
  assert.equal(out[9].id, 'c5')
})

test('mergeTimeline: handles empty inputs', () => {
  assert.deepEqual(mergeTimeline([], []), [])
})

test('mergeTimeline: tie on timestamp → completed before progress', () => {
  const ts = '2026-08-03T10:00:00Z'
  const out = mergeTimeline(
    [completed('a', ts)],
    [progress('b', ts)],
  )
  assert.equal(out[0].kind, 'completed')
  assert.equal(out[1].kind, 'progress')
})

test('mergeTimeline: stable id tie-break for same-kind same-ts events', () => {
  const ts = '2026-08-03T10:00:00Z'
  // Deliberately pass them out of id order to prove the tie-break is stable.
  const out = mergeTimeline(
    [completed('zzz', ts), completed('aaa', ts)],
    [],
  )
  assert.deepEqual(out.map((e) => e.id), ['aaa', 'zzz'])
})

test('mergeTimeline: does not mutate input arrays', () => {
  const c = [completed('a', '2026-08-01T10:00:00Z')]
  const p = [progress('b', '2026-08-02T10:00:00Z')]
  const cBefore = c.map((e) => e.id)
  const pBefore = p.map((e) => e.id)
  mergeTimeline(c, p)
  assert.deepEqual(c.map((e) => e.id), cBefore)
  assert.deepEqual(p.map((e) => e.id), pBefore)
})

// ─── sanitizeCompletedEvent ──────────────────────────────────────────────────

test('sanitizeCompletedEvent: maps a valid row with clamped numerics', () => {
  const e = sanitizeCompletedEvent({
    id: 'att-1',
    exam_set_id: 'es-1',
    mode: 'practice',
    score: 8,
    total: 10,
    passed: true,
    completed_at: '2026-08-03T09:00:00Z',
    ...NAMES,
  })
  assert.ok(e)
  assert.equal(e!.kind, 'completed')
  assert.equal(e!.score, 8)
  assert.equal(e!.total, 10)
  assert.equal(e!.passed, true)
  assert.equal(e!.mode, 'practice')
  assert.equal(e!.examSetId, 'es-1')
  assert.equal(e!.packageName, 'แพ็กเกจ A')
  assert.equal(e!.packageSlug, 'pkg-a')
  assert.equal(e!.examSetName, 'ชุดที่ 1')
  assert.equal(e!.timestamp, '2026-08-03T09:00:00Z')
})

test('sanitizeCompletedEvent: returns null when exam_set_id is missing', () => {
  // No exam_set_id → cannot build a resume URL → dropped.
  const e = sanitizeCompletedEvent({
    id: 'att-x',
    mode: 'practice',
    score: 8,
    total: 10,
    passed: true,
    completed_at: '2026-08-03T09:00:00Z',
    ...NAMES,
  })
  assert.equal(e, null)
})

test('sanitizeCompletedEvent: returns null for missing id / relationships', () => {
  assert.equal(sanitizeCompletedEvent({ ...NAMES } as any), null) // no id
  assert.equal(
    sanitizeCompletedEvent({ id: 'x', completed_at: 't', exam_sets: null, packages: NAMES.packages } as any),
    null,
  ) // no exam set
  assert.equal(
    sanitizeCompletedEvent({ id: 'x', completed_at: 't', exam_sets: NAMES.exam_sets, packages: null } as any),
    null,
  ) // no package
  assert.equal(
    sanitizeCompletedEvent({
      id: 'x',
      completed_at: 't',
      exam_sets: { name: '' },
      packages: NAMES.packages,
    } as any),
    null,
  ) // empty exam-set name
})

test('sanitizeCompletedEvent: clamps corrupt numerics (NaN/Infinity/negative)', () => {
  const e = sanitizeCompletedEvent({
    id: 'att-2',
    exam_set_id: 'es-1',
    mode: 'simulation',
    score: -5, // → 0
    total: NaN, // → 0
    passed: 'yes', // non-bool → false
    completed_at: '2026-08-03T09:00:00Z',
    ...NAMES,
  })
  assert.ok(e)
  assert.equal(e!.score, 0)
  assert.equal(e!.total, 0)
  assert.equal(e!.passed, false)
})

test('sanitizeCompletedEvent: clamps score to total', () => {
  const e = sanitizeCompletedEvent({
    id: 'att-3',
    exam_set_id: 'es-1',
    mode: 'simulation',
    score: 99, // > total(10) → 10
    total: 10,
    passed: true,
    completed_at: '2026-08-03T09:00:00Z',
    ...NAMES,
  })
  assert.ok(e)
  assert.equal(e!.score, 10)
})

test('sanitizeCompletedEvent: maps unknown mode to simulation', () => {
  const e = sanitizeCompletedEvent({
    id: 'att-4',
    exam_set_id: 'es-1',
    mode: 'mock', // not 'practice' → simulation
    score: 1,
    total: 10,
    passed: false,
    completed_at: '2026-08-03T09:00:00Z',
    ...NAMES,
  })
  assert.equal(e!.mode, 'simulation')
})

// ─── sanitizeProgressEvent ───────────────────────────────────────────────────

test('sanitizeProgressEvent: counts valid A/B/C/D answers only', () => {
  const e = sanitizeProgressEvent(
    {
      id: 'ses-1',
      exam_set_id: 'es-1',
      mode: 'practice',
      answers: { q1: 'A', q2: 'C', q3: 'Z', q4: 'AB', q5: null, q6: 1 }, // only A,C valid
      updated_at: '2026-08-03T08:00:00Z',
      ...NAMES,
    },
    { 'es-1': 10 },
  )
  assert.ok(e)
  assert.equal(e!.answeredCount, 2) // only q1,q2
  assert.equal(e!.totalQuestions, 10)
})

test('sanitizeProgressEvent: tolerates invalid answers JSON (non-object / array / null)', () => {
  for (const bad of ['not-an-object', [], null, undefined, 42]) {
    const e = sanitizeProgressEvent(
      { id: 'ses-2', exam_set_id: 'es-1', mode: 'practice', answers: bad, updated_at: 't', ...NAMES },
      {},
    )
    assert.ok(e, `should not throw for ${JSON.stringify(bad)}`)
    assert.equal(e!.answeredCount, 0)
  }
})

test('sanitizeProgressEvent: falls back to 0 total when exam_set_id missing from count map', () => {
  const e = sanitizeProgressEvent(
    {
      id: 'ses-3',
      exam_set_id: 'unknown-set',
      mode: 'practice',
      answers: { q1: 'A' },
      updated_at: '2026-08-03T08:00:00Z',
      ...NAMES,
    },
    { 'other-set': 10 }, // map lacks 'unknown-set'
  )
  assert.ok(e)
  assert.equal(e!.totalQuestions, 0)
  assert.equal(e!.answeredCount, 1)
})

test('sanitizeProgressEvent: returns null for missing id / relationships', () => {
  assert.equal(sanitizeProgressEvent({ ...NAMES } as any, {}), null) // no id
  assert.equal(
    sanitizeProgressEvent({ id: 'x', answers: {}, updated_at: 't', exam_sets: null, packages: NAMES.packages } as any, {}),
    null,
  )
})

// ─── End-to-end: both kinds merged ───────────────────────────────────────────

test('mergeTimeline: blends completed + progress, newest-first', () => {
  const out = mergeTimeline(
    [
      completed('c1', '2026-08-01T00:00:00Z'),
      completed('c2', '2026-08-03T00:00:00Z'),
    ],
    [progress('p1', '2026-08-02T00:00:00Z')],
  )
  assert.deepEqual(
    out.map((e) => ({ id: e.id, kind: e.kind })),
    [
      { id: 'c2', kind: 'completed' },
      { id: 'p1', kind: 'progress' },
      { id: 'c1', kind: 'completed' },
    ],
  )
})
