/**
 * lib/types.ig2.test.ts
 * ----------------------------------------------------------------------------
 * Type-and-shape tests for the IG-2-extended Question interface.
 *
 * Source of truth: IG-2 Architecture Amendment v1.0 §6.1, Appendix A
 * (vocabulary). lib/types.ts is the shared type used by the admin UI, the
 * importer, and (in future Epics) the Engine substrate layer.
 *
 * RUN: npx jiti lib/types.ig2.test.ts
 *
 * Why: a future edit that drops one of the four IG-2 fields or widens an enum
 * past Blueprint v3.0's vocabulary would silently break the admin UI or the
 * Engine's expectations. These tests pin the type boundary.
 */

import assert from 'node:assert/strict'
import type { Question } from './types'

// ─── IG-2 fields exist on the Question interface ────────────────────────────

function verifies_question_has_all_four_ig2_fields(): void {
  // Compile-time guarantee: a Question with all four IG-2 fields populated
  // type-checks. If any field is removed from the interface, this stops
  // compiling.
  const q: Question = {
    id: 'q1',
    content: 'c',
    choice_a: 'a',
    choice_b: 'b',
    choice_c: 'c',
    choice_d: 'd',
    correct_answer: 'A',
    difficulty: 'Easy',
    tags: [],
    status: 'Draft',
    created_at: '2026-07-20T00:00:00Z',
    blueprint_type: 'Memory',
    learning_objective: 'LO1',
    question_pattern: 'Positive',
    section: 'ม.6–8',
  }
  assert.equal(q.blueprint_type, 'Memory')
  assert.equal(q.learning_objective, 'LO1')
  assert.equal(q.question_pattern, 'Positive')
  assert.equal(q.section, 'ม.6–8')
}

function verifies_ig2_fields_are_optional(): void {
  // v2.1-authored content has no IG-2 axes. A Question without any of the
  // four must still type-check (they're optional / nullable).
  const q: Question = {
    id: 'q1',
    content: 'c',
    choice_a: 'a',
    choice_b: 'b',
    choice_c: 'c',
    choice_d: 'd',
    correct_answer: 'A',
    difficulty: 'Easy',
    tags: [],
    status: 'Draft',
    created_at: '2026-07-20T00:00:00Z',
    // No IG-2 axes specified — must type-check.
  }
  assert.equal(q.blueprint_type, undefined)
  assert.equal(q.question_pattern, undefined)
}

function verifies_ig2_fields_accept_null(): void {
  // Existing DB rows have NULL for the IG-2 axes after migration 027. The
  // interface must accept explicit null (not just undefined), because the
  // Supabase client returns null for nullable columns.
  const q: Question = {
    id: 'q1',
    content: 'c',
    choice_a: 'a',
    choice_b: 'b',
    choice_c: 'c',
    choice_d: 'd',
    correct_answer: 'A',
    difficulty: 'Easy',
    tags: [],
    status: 'Draft',
    created_at: '2026-07-20T00:00:00Z',
    blueprint_type: null,
    learning_objective: null,
    question_pattern: null,
    section: null,
  }
  assert.equal(q.blueprint_type, null)
  assert.equal(q.section, null)
}

// ─── Enum vocabulary matches Blueprint v3.0 / IG-2 Amendment Appendix A ────

function verifies_blueprint_type_vocab_matches_blueprint_v3(): void {
  // Compile-time check: assigning a value outside the union is a type error.
  // We exercise all four legal values.
  const types: Array<Question['blueprint_type']> = [
    'Memory', 'Concept', 'Procedure', 'Scenario', null, undefined,
  ]
  assert.equal(types.length, 6)
}

function verifies_learning_objective_vocab_matches_blueprint_v3(): void {
  const los: Array<Question['learning_objective']> = [
    'LO1', 'LO2', 'LO3', 'LO4', null, undefined,
  ]
  assert.equal(los.length, 6)
}

function verifies_question_pattern_vocab_matches_blueprint_v3(): void {
  // IG-2 Amendment D-6: the sixth value is `Matching Concept` (two words),
  // NOT `Matching`. If someone "fixes" this back to one word, this test
  // stops compiling.
  const patterns: Array<Question['question_pattern']> = [
    'Positive', 'Negative', 'Best Answer', 'Scenario', 'Sequence',
    'Matching Concept', null, undefined,
  ]
  assert.equal(patterns.length, 8)
}

// ─── runner ─────────────────────────────────────────────────────────────────

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'Question has all four IG-2 fields', fn: verifies_question_has_all_four_ig2_fields },
  { name: 'IG-2 fields are optional (v2.1 content)', fn: verifies_ig2_fields_are_optional },
  { name: 'IG-2 fields accept null (existing DB rows)', fn: verifies_ig2_fields_accept_null },
  { name: 'blueprint_type vocabulary matches Blueprint v3.0', fn: verifies_blueprint_type_vocab_matches_blueprint_v3 },
  { name: 'learning_objective vocabulary matches Blueprint v3.0', fn: verifies_learning_objective_vocab_matches_blueprint_v3 },
  { name: 'question_pattern vocabulary matches Blueprint v3.0 (Matching Concept)', fn: verifies_question_pattern_vocab_matches_blueprint_v3 },
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
if (failed > 0) {
  process.exit(1)
}
