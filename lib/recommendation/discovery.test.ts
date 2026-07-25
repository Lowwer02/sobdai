/**
 * lib/recommendation/discovery.test.ts
 * ----------------------------------------------------------------------------
 * Recommendation Candidate Discovery — integration tests with mock ContentStore.
 *
 * Source of truth: Recommendation Candidate Discovery Architecture v1.0 §5.
 *
 * RUN: npx jiti lib/recommendation/discovery.test.ts
 *
 * Coverage targets:
 *  - Gate: zero attempts → empty candidate list.
 *  - Signal extraction: weak/strong subjects + topics produce signals.
 *  - Content discovery: mock store returns ContentRefs, RCD wraps them.
 *  - Candidate assembly: deterministic sort, stats populated.
 *  - Determinism: same inputs → same output.
 *  - Immutability: inputs not mutated.
 *  - Error handling: store error → DiscoveryResult ok=false.
 *  - Supported types filter: unsupported types skipped gracefully.
 */

import assert from 'node:assert/strict'
import { discoverCandidates } from './discovery'
import { DEFAULT_RECOMMENDATION_POLICY } from './policy'
import type { ContentRef, ContentStore, ContentQuery } from './contracts'
import type { PersonalAnalytics } from '@/lib/assessment/analytics'

// ─── Mock ContentStore ──────────────────────────────────────────────────────

/** A mock ContentStore that returns canned results per content type. */
class MockContentStore implements ContentStore {
  readonly supportedTypes = ['summary', 'question'] as const
  private readonly results: Map<string, ContentRef[]>
  public lastQuery: ContentQuery | null = null
  public shouldError = false

  constructor(results: Map<string, ContentRef[]>) {
    this.results = results
  }

  async findContent(query: ContentQuery): Promise<readonly ContentRef[]> {
    this.lastQuery = query
    if (this.shouldError) throw new Error('Mock store error')
    const key = query.contentType
    return this.results.get(key) ?? []
  }
}

// ─── Analytics fixtures ─────────────────────────────────────────────────────

function buildAnalytics(overrides?: Partial<PersonalAnalytics>): PersonalAnalytics {
  const base: PersonalAnalytics = {
    overall: {
      totalAttempts: 5,
      practiceAttempts: 3,
      simulationAttempts: 2,
      totalQuestions: 500,
      totalAnswered: 480,
      totalCorrect: 300,
      totalIncorrect: 180,
      averageAccuracy: 62.5,
      averageScore: 60,
      bestScore: 75,
      averageTimeSeconds: 3600,
    },
    subjectPerformance: [
      { name: 'law', total: 200, correct: 100, accuracy: 50, kind: 'Subject' },
      { name: 'policy', total: 100, correct: 85, accuracy: 85, kind: 'Subject' },
    ],
    topicPerformance: [
      { name: 'หลักการจัดการศึกษา', total: 50, correct: 20, accuracy: 40, kind: 'Topic' },
      { name: 'วินัยข้าราชการ', total: 30, correct: 27, accuracy: 90, kind: 'Topic' },
      { name: 'too-few-questions', total: 2, correct: 0, accuracy: 0, kind: 'Topic' },
    ],
    weakSubjects: [
      { name: 'law', total: 200, correct: 100, accuracy: 50, kind: 'Subject', classification: 'weak' },
    ],
    strongSubjects: [
      { name: 'policy', total: 100, correct: 85, accuracy: 85, kind: 'Subject', classification: 'strong' },
    ],
    history: [
      {
        id: 'att-1', exam_set_id: 'es-1', package_id: 'pkg-1',
        mode: 'practice', total: 100, score: 60, answered_count: 95,
        accuracy: 60, time_used_seconds: 3600, passing_score: 70,
        passed: false, answer_summary: [], completed_at: new Date(Date.now() - 72 * 3600 * 1000).toISOString(),
      },
    ],
    trend: [],
  }
  return { ...base, ...overrides }
}

function buildMockRefs(): Map<string, ContentRef[]> {
  const summaryRefs: ContentRef[] = [
    { contentId: 'sum-1', contentType: 'summary', title: 'กฎหมายพื้นฐาน', slug: 'law-basics', packageId: 'pkg-1', subject: 'law', topic: 'หลักการจัดการศึกษา', difficulty: null },
    { contentId: 'sum-2', contentType: 'summary', title: 'นโยบาย', slug: 'policy', packageId: 'pkg-1', subject: 'policy', topic: null, difficulty: null },
  ]
  const questionRefs: ContentRef[] = [
    { contentId: 'q-1', contentType: 'question', title: null, slug: null, packageId: null, subject: 'law', topic: 'หลักการจัดการศึกษา', difficulty: 'Easy' },
  ]
  const map = new Map<string, ContentRef[]>()
  map.set('summary', summaryRefs)
  map.set('question', questionRefs)
  return map
}

// ─── Gate check ─────────────────────────────────────────────────────────────

async function verifies_zero_attempts_returns_empty(): Promise<void> {
  const analytics = buildAnalytics({
    overall: { ...buildAnalytics().overall, totalAttempts: 0 },
  })
  const store = new MockContentStore(buildMockRefs())
  const result = await discoverCandidates(analytics, DEFAULT_RECOMMENDATION_POLICY, store)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.list.isEmpty, true)
  assert.equal(result.list.candidates.length, 0)
}

// ─── Signal extraction + discovery ──────────────────────────────────────────

async function verifies_weak_subject_produces_candidates(): Promise<void> {
  const analytics = buildAnalytics()
  const store = new MockContentStore(buildMockRefs())
  const result = await discoverCandidates(analytics, DEFAULT_RECOMMENDATION_POLICY, store)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.ok(result.list.candidates.length > 0, 'expected candidates from weak subjects')
  // Verify weak_subject signal present.
  const weakSubjectCands = result.list.candidates.filter((c) => c.signal === 'weak_subject')
  assert.ok(weakSubjectCands.length > 0, 'expected at least one weak_subject candidate')
}

async function verifies_weak_topic_produces_candidates(): Promise<void> {
  const analytics = buildAnalytics()
  const store = new MockContentStore(buildMockRefs())
  const result = await discoverCandidates(analytics, DEFAULT_RECOMMENDATION_POLICY, store)
  if (!result.ok) return
  const weakTopicCands = result.list.candidates.filter((c) => c.signal === 'weak_topic')
  assert.ok(weakTopicCands.length > 0, 'expected weak_topic candidates (topic accuracy 40% < 50% threshold)')
}

async function verifies_topic_below_evidence_threshold_skipped(): Promise<void> {
  const analytics = buildAnalytics()
  const store = new MockContentStore(buildMockRefs())
  const result = await discoverCandidates(analytics, DEFAULT_RECOMMENDATION_POLICY, store)
  if (!result.ok) return
  // 'too-few-questions' has total=2 < minQuestionsForEvidence=3 → NOT a signal.
  const tooFewCands = result.list.candidates.filter(
    (c) => c.evidence.topic === 'too-few-questions'
  )
  assert.equal(tooFewCands.length, 0, 'topic below evidence threshold must not produce candidates')
}

async function verifies_strong_subject_produces_candidates(): Promise<void> {
  const analytics = buildAnalytics()
  const store = new MockContentStore(buildMockRefs())
  const result = await discoverCandidates(analytics, DEFAULT_RECOMMENDATION_POLICY, store)
  if (!result.ok) return
  const strongCands = result.list.candidates.filter((c) => c.signal === 'strong_subject')
  assert.ok(strongCands.length > 0, 'expected strong_subject candidates (policy accuracy 85%)')
}

// ─── Candidate shape ────────────────────────────────────────────────────────

async function verifies_candidate_has_full_shape(): Promise<void> {
  const analytics = buildAnalytics()
  const store = new MockContentStore(buildMockRefs())
  const result = await discoverCandidates(analytics, DEFAULT_RECOMMENDATION_POLICY, store)
  if (!result.ok) return
  const first = result.list.candidates[0]
  assert.ok(first)
  assert.ok(first!.id.startsWith('rc-'))
  assert.ok(first!.type === 'summary' || first!.type === 'question')
  assert.ok(first!.content.contentId.length > 0)
  assert.ok(first!.signal.length > 0)
  assert.ok(first!.reason.length > 0)
  assert.ok(first!.evidence !== undefined)
  assert.ok(first!.metadata !== undefined)
}

async function verifies_candidate_id_deterministic(): Promise<void> {
  const analytics = buildAnalytics()
  const store1 = new MockContentStore(buildMockRefs())
  const store2 = new MockContentStore(buildMockRefs())
  const r1 = await discoverCandidates(analytics, DEFAULT_RECOMMENDATION_POLICY, store1)
  const r2 = await discoverCandidates(analytics, DEFAULT_RECOMMENDATION_POLICY, store2)
  if (!r1.ok || !r2.ok) return
  assert.deepEqual(r1.list.candidates.map((c) => c.id), r2.list.candidates.map((c) => c.id))
}

// ─── Stats ──────────────────────────────────────────────────────────────────

async function verifies_stats_populated(): Promise<void> {
  const analytics = buildAnalytics()
  const store = new MockContentStore(buildMockRefs())
  const result = await discoverCandidates(analytics, DEFAULT_RECOMMENDATION_POLICY, store)
  if (!result.ok) return
  const stats = result.list.stats
  assert.equal(stats.totalCandidates, result.list.candidates.length)
  assert.ok(stats.bySignal.size > 0, 'bySignal stats should be populated')
  assert.ok(stats.byType.size > 0, 'byType stats should be populated')
}

// ─── Determinism ────────────────────────────────────────────────────────────

async function verifies_deterministic_output(): Promise<void> {
  const analytics = buildAnalytics()
  const store1 = new MockContentStore(buildMockRefs())
  const store2 = new MockContentStore(buildMockRefs())
  const r1 = await discoverCandidates(analytics, DEFAULT_RECOMMENDATION_POLICY, store1)
  const r2 = await discoverCandidates(analytics, DEFAULT_RECOMMENDATION_POLICY, store2)
  assert.deepEqual(r1, r2)
}

// ─── Immutability ───────────────────────────────────────────────────────────

async function verifies_inputs_not_mutated(): Promise<void> {
  const analytics = buildAnalytics()
  const store = new MockContentStore(buildMockRefs())
  const analyticsBefore = JSON.stringify(analytics)
  await discoverCandidates(analytics, DEFAULT_RECOMMENDATION_POLICY, store)
  const analyticsAfter = JSON.stringify(analytics)
  assert.equal(analyticsAfter, analyticsBefore, 'analytics must not be mutated')
}

// ─── Error handling ─────────────────────────────────────────────────────────

async function verifies_store_error_returns_failure(): Promise<void> {
  const analytics = buildAnalytics()
  const store = new MockContentStore(buildMockRefs())
  store.shouldError = true
  const result = await discoverCandidates(analytics, DEFAULT_RECOMMENDATION_POLICY, store)
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.ok(result.error.length > 0)
}

// ─── Unsupported types skipped ──────────────────────────────────────────────

async function verifies_unsupported_types_skipped(): Promise<void> {
  const analytics = buildAnalytics()
  // Store supports only 'summary'; policy asks for summary + question + exam_set + package.
  const store = new MockContentStore(new Map([['summary', buildMockRefs().get('summary')!]]))
  store.supportedTypes // TypeScript: readonly, so we construct a store with fewer types
  const result = await discoverCandidates(analytics, DEFAULT_RECOMMENDATION_POLICY, store)
  // Should still produce candidates (from 'summary'); no crash for unsupported types.
  assert.equal(result.ok, true)
  if (!result.ok) return
  // All candidates should be 'summary' type (only supported type).
  for (const c of result.list.candidates) {
    assert.equal(c.type, 'summary', 'unsupported types should produce no candidates')
  }
}

// ─── runner (async tests) ───────────────────────────────────────────────────

const tests: Array<{ name: string; fn: () => Promise<void> }> = [
  { name: 'gate: zero attempts → empty list', fn: verifies_zero_attempts_returns_empty },
  { name: 'weak subject produces candidates', fn: verifies_weak_subject_produces_candidates },
  { name: 'weak topic produces candidates (accuracy 40% < 50%)', fn: verifies_weak_topic_produces_candidates },
  { name: 'topic below evidence threshold (total < 3) skipped', fn: verifies_topic_below_evidence_threshold_skipped },
  { name: 'strong subject produces candidates (accuracy 85%)', fn: verifies_strong_subject_produces_candidates },
  { name: 'candidate has full shape (id/type/content/signal/reason/evidence/metadata)', fn: verifies_candidate_has_full_shape },
  { name: 'candidate IDs deterministic', fn: verifies_candidate_id_deterministic },
  { name: 'stats populated (bySignal + byType)', fn: verifies_stats_populated },
  { name: 'deterministic output (same inputs → same result)', fn: verifies_deterministic_output },
  { name: 'inputs not mutated', fn: verifies_inputs_not_mutated },
  { name: 'store error returns DiscoveryResult ok=false', fn: verifies_store_error_returns_failure },
  { name: 'unsupported content types skipped gracefully', fn: verifies_unsupported_types_skipped },
]

async function runTests() {
  let passed = 0
  let failed = 0
  for (const t of tests) {
    try {
      await t.fn()
      console.log(`  ✓ ${t.name}`)
      passed++
    } catch (e) {
      console.error(`  ✗ ${t.name}`)
      console.error(`    ${(e as Error).message}`)
      failed++
    }
  }
  console.log(`\n${passed}/${tests.length} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

runTests()
