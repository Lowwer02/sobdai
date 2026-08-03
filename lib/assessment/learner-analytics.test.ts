/**
 * lib/assessment/learner-analytics.test.ts
 * ----------------------------------------------------------------------------
 * Self-test for the PURE analytics helpers (Phase 1D). No DB, no React, no
 * cookies, no Next request context. Uses Node's built-in test runner.
 *
 * RUN: npx jiti lib/assessment/learner-analytics.test.ts
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeLearningStatistics,
  deriveWeakTopics,
  computeLearnerAnalytics,
  sanitizeAttempt,
  ANALYTICS_WINDOW_LIMIT,
  WEAK_TOPIC_MIN_ENCOUNTERS,
  WEAK_TOPIC_MAX_RESULTS,
  type SanitizedAttempt,
} from './learner-analytics'

// ─── Test helpers ────────────────────────────────────────────────────────────

/** Build a sanitized attempt fixture (numeric fields already valid). */
function att(
  id: string,
  opts: Partial<SanitizedAttempt> & Pick<SanitizedAttempt, 'score' | 'total'>,
): SanitizedAttempt {
  return {
    id,
    score: opts.score,
    total: opts.total,
    answeredCount: opts.answeredCount ?? opts.score,
    accuracy: opts.accuracy ?? Math.round((opts.score / opts.total) * 100),
    passed: opts.passed ?? false,
    timeUsedSeconds: opts.timeUsedSeconds ?? 0,
    answerSummary: opts.answerSummary ?? [],
  }
}

// ─── 1. Empty attempt list ───────────────────────────────────────────────────

test('computeLearningStatistics: empty list yields zeroed statistics', () => {
  const s = computeLearningStatistics([])
  assert.equal(s.attempts, 0)
  assert.equal(s.overallAccuracy, 0)
  assert.equal(s.passRate, 0)
  assert.equal(s.totalAnswered, 0)
  assert.equal(s.totalTimeSeconds, 0)
})

test('computeLearnerAnalytics: empty list yields empty payload', () => {
  const { statistics, weakTopics } = computeLearnerAnalytics([])
  assert.equal(statistics.attempts, 0)
  assert.equal(weakTopics.length, 0)
})

// ─── 2. Weighted accuracy differs from average-of-percentages ────────────────

test('computeLearningStatistics: weighted accuracy ≠ average of percentages', () => {
  // Attempt A: 1/10 = 10%. Attempt B: 9/10 = 90%.
  // Average of percentages would be (10+90)/2 = 50%.
  // Weighted = (1+9)/(10+10) = 10/20 = 50% here (coincidence) — so pick a case
  // where the totals differ to prove weighting, not averaging.
  // Attempt A: 1/2 = 50%. Attempt B: 9/10 = 90%.
  // Average of percentages = (50+90)/2 = 70%.
  // Weighted = (1+9)/(2+10) = 10/12 = 83.33% → rounds to 83%.
  const s = computeLearningStatistics([
    att('a', { score: 1, total: 2 }),
    att('b', { score: 9, total: 10 }),
  ])
  assert.equal(s.overallAccuracy, 83) // weighted, NOT 70 (avg of %)
})

test('computeLearningStatistics: weighted accuracy matches Σscore/Σtotal', () => {
  // 3/5 + 2/5 → Σscore=5, Σtotal=10 → 50%.
  const s = computeLearningStatistics([
    att('a', { score: 3, total: 5 }),
    att('b', { score: 2, total: 5 }),
  ])
  assert.equal(s.overallAccuracy, 50)
})

// ─── 3. Negative/corrupt numeric values are sanitized ────────────────────────

test('sanitizeAttempt: drops row missing a valid id', () => {
  assert.equal(sanitizeAttempt({ score: 5, total: 10 }), null)
  assert.equal(sanitizeAttempt({ id: '', score: 5, total: 10 }), null)
  assert.equal(sanitizeAttempt({ id: 123, score: 5, total: 10 }), null)
})

test('sanitizeAttempt: clamps negative/corrupt numerics to safe values', () => {
  const s = sanitizeAttempt({
    id: 'x',
    score: -5, // negative → 0
    total: NaN, // NaN → 0
    answered_count: Infinity, // Infinity → 0 (truncated)
    accuracy: 150, // >100 → clamped to 100
    passed: 'yes', // non-bool → false
    time_used_seconds: -30, // negative → 0
    answer_summary: null,
  })
  assert.ok(s)
  assert.equal(s!.total, 0)
  assert.equal(s!.score, 0)
  assert.equal(s!.answeredCount, 0)
  assert.equal(s!.accuracy, 100)
  assert.equal(s!.passed, false)
  assert.equal(s!.timeUsedSeconds, 0)
})

test('sanitizeAttempt: clamps score and answered to total', () => {
  const s = sanitizeAttempt({
    id: 'x',
    score: 99, // > total(10) → 10
    total: 10,
    answered_count: 50, // > total(10) → 10
    accuracy: -5, // <0 → 0
    passed: true,
    time_used_seconds: 100,
    answer_summary: [],
  })
  assert.ok(s)
  assert.equal(s!.score, 10)
  assert.equal(s!.answeredCount, 10)
  assert.equal(s!.accuracy, 0)
})

test('computeLearningStatistics: tolerates sanitized corrupt inputs (no crash/NaN)', () => {
  // These come through sanitizeAttempt already-clamped; the pure layer trusts
  // them, but confirm totals never go negative / NaN even with edge values.
  const s = computeLearningStatistics([
    att('a', { score: 0, total: 0, accuracy: 0 }),
    att('b', { score: 5, total: 10 }),
  ])
  assert.equal(s.overallAccuracy, 50) // 5/10
  assert.equal(s.totalAnswered, 5) // 0 + 5
  assert.ok(Number.isFinite(s.totalTimeSeconds))
})

// ─── 4. Pass rate ────────────────────────────────────────────────────────────

test('computeLearningStatistics: pass rate = passed/valid × 100', () => {
  const s = computeLearningStatistics([
    att('a', { score: 6, total: 10, passed: true }),
    att('b', { score: 2, total: 10, passed: false }),
    att('c', { score: 7, total: 10, passed: true }),
    att('d', { score: 1, total: 10, passed: false }),
  ])
  assert.equal(s.attempts, 4)
  assert.equal(s.passRate, 50) // 2 of 4
})

test('computeLearningStatistics: all-passed → 100, none-passed → 0', () => {
  assert.equal(
    computeLearningStatistics([
      att('a', { score: 8, total: 10, passed: true }),
      att('b', { score: 9, total: 10, passed: true }),
    ]).passRate,
    100,
  )
  assert.equal(
    computeLearningStatistics([
      att('a', { score: 1, total: 10, passed: false }),
    ]).passRate,
    0,
  )
})

// ─── 5. Total answered clamping ──────────────────────────────────────────────

test('computeLearningStatistics: total answered is the sum of sanitized answered', () => {
  const s = computeLearningStatistics([
    att('a', { score: 5, total: 10, answeredCount: 7 }),
    att('b', { score: 3, total: 10, answeredCount: 4 }),
  ])
  assert.equal(s.totalAnswered, 11) // 7 + 4
})

// ─── 6. Duration aggregation ─────────────────────────────────────────────────

test('computeLearningStatistics: total time is the sum of per-attempt seconds', () => {
  const s = computeLearningStatistics([
    att('a', { score: 5, total: 10, timeUsedSeconds: 600 }),
    att('b', { score: 5, total: 10, timeUsedSeconds: 1200 }),
  ])
  assert.equal(s.totalTimeSeconds, 1800)
})

// ─── 7. Valid weak-topic grouping ────────────────────────────────────────────

test('deriveWeakTopics: groups entries by label and computes counts/accuracy', () => {
  const attempt: SanitizedAttempt = att('a', { score: 1, total: 4, answerSummary: [
    { questionId: 'q1', selected: 'A', correct: 'B', isCorrect: false, flagged: false, subject: null, law: null, topic: 'สัญญา' },
    { questionId: 'q2', selected: 'C', correct: 'C', isCorrect: true, flagged: false, subject: null, law: null, topic: 'สัญญา' },
    { questionId: 'q3', selected: 'D', correct: 'A', isCorrect: false, flagged: false, subject: null, law: null, topic: 'สัญญา' },
    { questionId: 'q4', selected: 'B', correct: 'B', isCorrect: true, flagged: false, subject: null, law: null, topic: 'อื่นๆ' },
  ] })
  const out = deriveWeakTopics([attempt])
  // 'สัญญา': 3 encountered, 1 correct, 2 incorrect → eligible (≥3 & has wrong).
  // 'อื่นๆ': 1 encountered → below threshold, excluded.
  assert.equal(out.length, 1)
  assert.equal(out[0].label, 'สัญญา')
  assert.equal(out[0].total, 3)
  assert.equal(out[0].correct, 1)
  assert.equal(out[0].incorrect, 2)
  assert.equal(out[0].unanswered, 0)
  assert.equal(out[0].accuracy, 33)
})

// ─── 8. Group-label priority: topic > law > subject ──────────────────────────

test('deriveWeakTopics: label priority is topic > law > subject', () => {
  const attempt: SanitizedAttempt = att('a', { score: 0, total: 3, answerSummary: [
    { questionId: 'q1', selected: 'A', correct: 'B', isCorrect: false, flagged: false, subject: 'วิชาA', law: 'กฎหมายA', topic: 'หัวข้อA' },
    { questionId: 'q2', selected: 'A', correct: 'B', isCorrect: false, flagged: false, subject: 'วิชาA', law: 'กฎหมายA', topic: 'หัวข้อA' },
    { questionId: 'q3', selected: 'A', correct: 'B', isCorrect: false, flagged: false, subject: 'วิชาA', law: 'กฎหมายA', topic: 'หัวข้อA' },
  ] })
  const out = deriveWeakTopics([attempt])
  assert.equal(out.length, 1)
  assert.equal(out[0].label, 'หัวข้อA') // topic wins
  assert.equal(out[0].labelKind, 'topic')
})

test('deriveWeakTopics: falls back to law when topic absent', () => {
  const attempt: SanitizedAttempt = att('a', { score: 0, total: 3, answerSummary: [
    { questionId: 'q1', selected: 'A', correct: 'B', isCorrect: false, flagged: false, subject: 'วิชาA', law: 'กฎหมายA', topic: null },
    { questionId: 'q2', selected: 'A', correct: 'B', isCorrect: false, flagged: false, subject: 'วิชาA', law: 'กฎหมายA', topic: null },
    { questionId: 'q3', selected: 'A', correct: 'B', isCorrect: false, flagged: false, subject: 'วิชาA', law: 'กฎหมายA', topic: null },
  ] })
  const out = deriveWeakTopics([attempt])
  assert.equal(out.length, 1)
  assert.equal(out[0].label, 'กฎหมายA')
  assert.equal(out[0].labelKind, 'law')
})

test('deriveWeakTopics: falls back to subject when topic+law absent', () => {
  const attempt: SanitizedAttempt = att('a', { score: 0, total: 3, answerSummary: [
    { questionId: 'q1', selected: 'A', correct: 'B', isCorrect: false, flagged: false, subject: 'วิชาA', law: null, topic: null },
    { questionId: 'q2', selected: 'A', correct: 'B', isCorrect: false, flagged: false, subject: 'วิชาA', law: null, topic: null },
    { questionId: 'q3', selected: 'A', correct: 'B', isCorrect: false, flagged: false, subject: 'วิชาA', law: null, topic: null },
  ] })
  const out = deriveWeakTopics([attempt])
  assert.equal(out.length, 1)
  assert.equal(out[0].label, 'วิชาA')
  assert.equal(out[0].labelKind, 'subject')
})

// ─── 9. Malformed summary entries skipped ────────────────────────────────────

test('deriveWeakTopics: corrupt answer_summary does not crash and skips junk', () => {
  const attempt: SanitizedAttempt = att('a', { score: 0, total: 1, answerSummary: 'not-an-array' })
  const out = deriveWeakTopics([attempt])
  assert.deepEqual(out, [])

  // Mix of garbage + valid entries: only valid ones count.
  const attempt2: SanitizedAttempt = att('b', { score: 0, total: 4, answerSummary: [
    'garbage',
    null,
    { questionId: '', correct: 'A', isCorrect: false, flagged: false }, // empty id
    { questionId: 'q1', correct: 'X', isCorrect: false, flagged: false }, // bad correct
    { questionId: 'q2', selected: 'A', correct: 'B', isCorrect: false, flagged: false, topic: 'T' },
    { questionId: 'q3', selected: 'A', correct: 'B', isCorrect: false, flagged: false, topic: 'T' },
    { questionId: 'q4', selected: 'A', correct: 'B', isCorrect: false, flagged: false, topic: 'T' },
  ] })
  const out2 = deriveWeakTopics([attempt2])
  assert.equal(out2.length, 1)
  assert.equal(out2[0].label, 'T')
  assert.equal(out2[0].total, 3)
})

// ─── 10. Duplicate question IDs within one attempt deduplicated ──────────────

test('deriveWeakTopics: duplicate questionId within an attempt counts once (first wins)', () => {
  const attempt: SanitizedAttempt = att('a', { score: 0, total: 3, answerSummary: [
    { questionId: 'q1', selected: 'A', correct: 'B', isCorrect: false, flagged: false, topic: 'T' },
    { questionId: 'q1', selected: 'C', correct: 'C', isCorrect: true, flagged: false, topic: 'T' }, // dup id
    { questionId: 'q2', selected: 'A', correct: 'B', isCorrect: false, flagged: false, topic: 'T' },
    { questionId: 'q3', selected: 'A', correct: 'B', isCorrect: false, flagged: false, topic: 'T' },
  ] })
  const out = deriveWeakTopics([attempt])
  // q1 deduped → 3 unique (q1,q2,q3). q1 is the FIRST occurrence (incorrect),
  // so correct=0, incorrect=3, accuracy=0.
  assert.equal(out.length, 1)
  assert.equal(out[0].total, 3)
  assert.equal(out[0].correct, 0)
  assert.equal(out[0].incorrect, 3)
})

// ─── 11. Minimum sample threshold ────────────────────────────────────────────

test('deriveWeakTopics: groups below MIN_ENCOUNTERS are excluded', () => {
  // Only 2 entries under 'T' → below WEAK_TOPIC_MIN_ENCOUNTERS (3).
  const attempt: SanitizedAttempt = att('a', { score: 0, total: 2, answerSummary: [
    { questionId: 'q1', selected: 'A', correct: 'B', isCorrect: false, flagged: false, topic: 'T' },
    { questionId: 'q2', selected: 'A', correct: 'B', isCorrect: false, flagged: false, topic: 'T' },
  ] })
  const out = deriveWeakTopics([attempt])
  assert.equal(out.length, 0)
  // Sanity: the threshold really is 3.
  assert.equal(WEAK_TOPIC_MIN_ENCOUNTERS, 3)
})

test('deriveWeakTopics: group with no incorrect/unanswered is excluded', () => {
  // 3 correct → meets encounter threshold but has no wrong/unanswered item.
  const attempt: SanitizedAttempt = att('a', { score: 3, total: 3, answerSummary: [
    { questionId: 'q1', selected: 'A', correct: 'A', isCorrect: true, flagged: false, topic: 'T' },
    { questionId: 'q2', selected: 'A', correct: 'A', isCorrect: true, flagged: false, topic: 'T' },
    { questionId: 'q3', selected: 'A', correct: 'A', isCorrect: true, flagged: false, topic: 'T' },
  ] })
  const out = deriveWeakTopics([attempt])
  assert.equal(out.length, 0)
})

// ─── 12. Ranking: lowest accuracy then larger sample ─────────────────────────

test('deriveWeakTopics: ranks lowest accuracy first, then larger sample', () => {
  const attempt: SanitizedAttempt = att('a', { score: 0, total: 10, answerSummary: [
    // 'Lo': 4 encountered, 0 correct → 0% accuracy
    { questionId: 'q1', selected: 'A', correct: 'B', isCorrect: false, flagged: false, topic: 'Lo' },
    { questionId: 'q2', selected: 'A', correct: 'B', isCorrect: false, flagged: false, topic: 'Lo' },
    { questionId: 'q3', selected: 'A', correct: 'B', isCorrect: false, flagged: false, topic: 'Lo' },
    { questionId: 'q4', selected: 'A', correct: 'B', isCorrect: false, flagged: false, topic: 'Lo' },
    // 'Hi': 4 encountered, 1 correct → 25%
    { questionId: 'q5', selected: 'A', correct: 'B', isCorrect: false, flagged: false, topic: 'Hi' },
    { questionId: 'q6', selected: 'A', correct: 'B', isCorrect: false, flagged: false, topic: 'Hi' },
    { questionId: 'q7', selected: 'A', correct: 'B', isCorrect: false, flagged: false, topic: 'Hi' },
    { questionId: 'q8', selected: 'A', correct: 'A', isCorrect: true, flagged: false, topic: 'Hi' },
  ] })
  const out = deriveWeakTopics([attempt])
  assert.deepEqual(out.map((g) => g.label), ['Lo', 'Hi'])
  assert.equal(out[0].accuracy, 0)
  assert.equal(out[1].accuracy, 25)
})

test('deriveWeakTopics: ties on accuracy break by larger sample then label', () => {
  // Both 'A' and 'B' at 0%, but 'A' has 4 and 'B' has 3 → 'A' first.
  const attempt: SanitizedAttempt = att('a', { score: 0, total: 7, answerSummary: [
    { questionId: 'q1', selected: 'A', correct: 'B', isCorrect: false, flagged: false, topic: 'A' },
    { questionId: 'q2', selected: 'A', correct: 'B', isCorrect: false, flagged: false, topic: 'A' },
    { questionId: 'q3', selected: 'A', correct: 'B', isCorrect: false, flagged: false, topic: 'A' },
    { questionId: 'q4', selected: 'A', correct: 'B', isCorrect: false, flagged: false, topic: 'A' },
    { questionId: 'q5', selected: 'A', correct: 'B', isCorrect: false, flagged: false, topic: 'B' },
    { questionId: 'q6', selected: 'A', correct: 'B', isCorrect: false, flagged: false, topic: 'B' },
    { questionId: 'q7', selected: 'A', correct: 'B', isCorrect: false, flagged: false, topic: 'B' },
  ] })
  const out = deriveWeakTopics([attempt])
  assert.equal(out[0].label, 'A') // larger sample
  assert.equal(out[0].total, 4)
  assert.equal(out[1].label, 'B')
  assert.equal(out[1].total, 3)
})

// ─── 13. Maximum five weak topics ────────────────────────────────────────────

test('deriveWeakTopics: returns at most MAX_RESULTS (5) weak topics', () => {
  // Build 7 groups, each with 3 wrong entries → all eligible. Only 5 returned.
  const summary: any[] = []
  for (let g = 0; g < 7; g++) {
    for (let i = 0; i < 3; i++) {
      summary.push({
        questionId: `g${g}-q${i}`,
        selected: 'A',
        correct: 'B',
        isCorrect: false,
        flagged: false,
        topic: `Topic${g}`,
      })
    }
  }
  const attempt: SanitizedAttempt = att('a', { score: 0, total: 21, answerSummary: summary })
  const out = deriveWeakTopics([attempt])
  assert.equal(out.length, WEAK_TOPIC_MAX_RESULTS)
  assert.equal(WEAK_TOPIC_MAX_RESULTS, 5)
})

// ─── 14. Unanswered counted separately ───────────────────────────────────────

test('deriveWeakTopics: unanswered (selected null) counted as unanswered, not incorrect', () => {
  const attempt: SanitizedAttempt = att('a', { score: 0, total: 3, answerSummary: [
    { questionId: 'q1', selected: null, correct: 'B', isCorrect: false, flagged: false, topic: 'T' },
    { questionId: 'q2', selected: null, correct: 'B', isCorrect: false, flagged: false, topic: 'T' },
    { questionId: 'q3', selected: 'A', correct: 'B', isCorrect: false, flagged: false, topic: 'T' },
  ] })
  const out = deriveWeakTopics([attempt])
  assert.equal(out.length, 1)
  assert.equal(out[0].unanswered, 2)
  assert.equal(out[0].incorrect, 1)
  assert.equal(out[0].correct, 0)
  assert.equal(out[0].total, 3)
})

// ─── 15. No labels produces no weak topics ───────────────────────────────────

test('deriveWeakTopics: entries with no topic/law/subject produce no groups', () => {
  const attempt: SanitizedAttempt = att('a', { score: 0, total: 5, answerSummary: [
    { questionId: 'q1', selected: 'A', correct: 'B', isCorrect: false, flagged: false, subject: null, law: null, topic: null },
    { questionId: 'q2', selected: 'A', correct: 'B', isCorrect: false, flagged: false, subject: '', law: '  ', topic: '' },
    { questionId: 'q3', selected: null, correct: 'B', isCorrect: false, flagged: false, subject: null, law: null, topic: null },
    { questionId: 'q4', selected: 'A', correct: 'B', isCorrect: false, flagged: false, subject: null, law: null, topic: null },
    { questionId: 'q5', selected: 'A', correct: 'B', isCorrect: false, flagged: false, subject: null, law: null, topic: null },
  ] })
  const out = deriveWeakTopics([attempt])
  assert.equal(out.length, 0)
})

// ─── Window constant sanity ──────────────────────────────────────────────────

test('ANALYTICS_WINDOW_LIMIT is 20 (recent window contract)', () => {
  assert.equal(ANALYTICS_WINDOW_LIMIT, 20)
})
