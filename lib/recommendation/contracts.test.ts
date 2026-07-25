/**
 * lib/recommendation/contracts.test.ts
 * ----------------------------------------------------------------------------
 * Recommendation Candidate Discovery — contract tests.
 *
 * Source of truth: Recommendation Candidate Discovery Architecture v1.0.
 *
 * RUN: npx jiti lib/recommendation/contracts.test.ts
 */

import assert from 'node:assert/strict'
import {
  candidateId,
  type ContentFilters,
  type ContentQuery,
  type ContentRef,
  type ContentStore,
  type ContentProvider,
  type RecommendationCandidate,
  type RecommendationContentType,
  type DiscoverySignal,
  type RecommendationPolicy,
  type CandidateList,
  type DiscoveryResult,
} from './contracts'

// ═══ Vocabulary stability ═══════════════════════════════════════════════

function verifies_content_type_vocab_v1(): void {
  const types: RecommendationContentType[] = ['summary', 'question', 'exam_set', 'package']
  assert.equal(types.length, 4)
}

function verifies_discovery_signal_vocab(): void {
  const signals: DiscoverySignal[] = [
    'weak_subject', 'weak_topic', 'strong_subject', 'strong_topic',
    'retry_simulation', 'continue_practice', 'coverage_gap',
  ]
  assert.equal(signals.length, 7)
}

// ═══ Candidate ID determinism (D5) ══════════════════════════════════════

function verifies_candidate_id_deterministic(): void {
  const a = candidateId('summary', 'sum-001', 'weak_subject')
  const b = candidateId('summary', 'sum-001', 'weak_subject')
  assert.equal(a, b)
  assert.ok(a.startsWith('rc-'), 'candidate id should start with rc-')
}

function verifies_candidate_id_differs_on_signal(): void {
  // Same content, different signal → different id (Engine picks winner).
  const a = candidateId('summary', 'sum-001', 'weak_subject')
  const b = candidateId('summary', 'sum-001', 'strong_subject')
  assert.notEqual(a, b)
}

function verifies_candidate_id_differs_on_content(): void {
  const a = candidateId('summary', 'sum-001', 'weak_subject')
  const b = candidateId('summary', 'sum-002', 'weak_subject')
  assert.notEqual(a, b)
}

function verifies_candidate_id_differs_on_type(): void {
  const a = candidateId('summary', 'id-1', 'weak_subject')
  const b = candidateId('question', 'id-1', 'weak_subject')
  assert.notEqual(a, b)
}

// ═══ Discriminated union narrowing ══════════════════════════════════════

function verifies_discovery_result_narrows_on_ok(): void {
  const success: DiscoveryResult = {
    ok: true,
    list: { candidates: [], isEmpty: true, stats: { totalCandidates: 0, bySignal: new Map(), byType: new Map() } },
  }
  const failure: DiscoveryResult = { ok: false, error: 'test error' }
  if (success.ok) assert.ok(success.list)
  if (!failure.ok) assert.ok(failure.error.length > 0)
}

// ═══ Immutability (compile-time) ════════════════════════════════════════

function verifies_candidate_fields_readonly(): void {
  const c: RecommendationCandidate = {
    id: 'rc-test',
    type: 'summary',
    content: { kind: 'summary', contentId: 's1', title: 'T', slug: 's', packageId: 'p1' },
    signal: 'weak_subject',
    reason: 'test',
    evidence: { subject: 'law', topic: null, accuracy: 40, attemptCount: 5 },
    metadata: { subject: 'law', topic: null, difficulty: null },
  }
  // @ts-expect-error — id is readonly; directive presence proves the type error.
  c.id = 'changed'
  // @ts-expect-error — content.contentId is readonly
  c.content.contentId = 'changed'
  assert.ok(true, 'readonly type errors confirmed by @ts-expect-error directives')
}

function verifies_content_filters_readonly(): void {
  const f: ContentFilters = { subjects: ['law'] }
  // @ts-expect-error — subjects is readonly; directive presence proves the error.
  f.subjects = ['policy']
  assert.ok(true, 'readonly type error confirmed by @ts-expect-error directive')
}

// ═══ ContentStore interface shape ═══════════════════════════════════════

function verifies_content_store_has_find_content_and_supported_types(): void {
  // Compile-time: a valid ContentStore implementation.
  const store: ContentStore = {
    supportedTypes: ['summary', 'question'],
    async findContent(_query: ContentQuery): Promise<readonly ContentRef[]> {
      return []
    },
  }
  assert.ok(store.supportedTypes.length > 0)
  assert.equal(typeof store.findContent, 'function')
}

function verifies_content_provider_interface(): void {
  const provider: ContentProvider = {
    contentType: 'summary',
    async find(_query: ContentQuery): Promise<readonly ContentRef[]> {
      return [{ contentId: 's1', contentType: 'summary', title: 'T', slug: 's', packageId: 'p', subject: 'law', topic: null, difficulty: null }]
    },
  }
  assert.equal(provider.contentType, 'summary')
}

// ═══ runner ════════════════════════════════════════════════════════════

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'ContentType vocab has 4 v1 values', fn: verifies_content_type_vocab_v1 },
  { name: 'DiscoverySignal vocab has 7 values', fn: verifies_discovery_signal_vocab },
  { name: 'candidateId deterministic (same inputs → same id)', fn: verifies_candidate_id_deterministic },
  { name: 'candidateId differs on signal (Engine picks winner)', fn: verifies_candidate_id_differs_on_signal },
  { name: 'candidateId differs on contentId', fn: verifies_candidate_id_differs_on_content },
  { name: 'candidateId differs on type', fn: verifies_candidate_id_differs_on_type },
  { name: 'DiscoveryResult narrows on ok', fn: verifies_discovery_result_narrows_on_ok },
  { name: 'RecommendationCandidate fields readonly', fn: verifies_candidate_fields_readonly },
  { name: 'ContentFilters readonly', fn: verifies_content_filters_readonly },
  { name: 'ContentStore has findContent + supportedTypes', fn: verifies_content_store_has_find_content_and_supported_types },
  { name: 'ContentProvider interface shape', fn: verifies_content_provider_interface },
]

let passed = 0
let failed = 0
for (const t of tests) {
  try {
    t.fn()
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
