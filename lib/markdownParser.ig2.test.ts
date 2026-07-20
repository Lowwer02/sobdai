/**
 * lib/markdownParser.ig2.test.ts
 * ----------------------------------------------------------------------------
 * Parser tests for IG-2 fields (QuestionPattern, Section) plus v2.1 backward
 * compatibility.
 *
 * Source of truth:
 *  - Content Template v2.2 Delta Amendment §3 (Question Markdown Patch)
 *  - IG-2 Architecture Amendment v1.0 §6.1 (Importer extension)
 *  - Implementation Planning v1.0 §6.4 (regression: existing importer must
 *    still work; IG-2 change is additive)
 *
 * RUN: npx jiti lib/markdownParser.ig2.test.ts
 *
 * Critical regression guard: a v2.1-authored Question (no QuestionPattern /
 * Section labels) MUST still parse with isValid=true and the new fields
 * defaulting to empty string. Otherwise existing content breaks on the new
 * parser.
 */

import assert from 'node:assert/strict'
import { parseMarkdownQuestions } from './markdownParser'

// ─── helpers ────────────────────────────────────────────────────────────────

/** Minimal valid Question body with the required core fields. */
const MIN_BODY = `
**Question:** placeholder question text?

A. choice one
B. choice two
C. choice three
D. choice four

**Answer:** A
`

/** Wrap a metadata fragment + the minimal body into a parseable chunk. */
function wrap(meta: string, body = MIN_BODY): string {
  return `${meta}\n${body}`
}

// ─── v2.2 extraction: QuestionPattern + Section ─────────────────────────────

function verifies_v22_question_pattern_extracted(): void {
  const md = wrap('**QuestionPattern:** Best Answer')
  const results = parseMarkdownQuestions(md)
  assert.equal(results.length, 1)
  assert.equal(results[0].isValid, true)
  assert.equal(results[0].data?.question_pattern, 'Best Answer')
}

function verifies_v22_section_extracted(): void {
  const md = wrap('**Section:** ม.6–8')
  const results = parseMarkdownQuestions(md)
  assert.equal(results.length, 1)
  assert.equal(results[0].isValid, true)
  assert.equal(results[0].data?.section, 'ม.6–8')
}

function verifies_v22_both_new_fields_extracted_together(): void {
  // Realistic v2.2-authored fragment with both new fields plus existing ones.
  const md = wrap(`**Blueprint:** Concept
**QuestionPattern:** Best Answer
**Section:** ม.10–14
**Difficulty:** Medium
**QuestionType:** MCQ4`)
  const results = parseMarkdownQuestions(md)
  assert.equal(results[0].data?.blueprint, 'Concept')
  assert.equal(results[0].data?.question_pattern, 'Best Answer')
  assert.equal(results[0].data?.section, 'ม.10–14')
  assert.equal(results[0].data?.difficulty, 'Medium')
  assert.equal(results[0].data?.question_type, 'MCQ4')
}

function verifies_v22_pattern_does_not_bleed_into_next_field(): void {
  // The point of KNOWN_LABELS is to stop one field from swallowing the next.
  // Adding QuestionPattern + Section to the boundary list must preserve this.
  const md = wrap(`**QuestionPattern:** Scenario
**Section:** ม.22`)
  const results = parseMarkdownQuestions(md)
  assert.equal(results[0].data?.question_pattern, 'Scenario')
  assert.equal(results[0].data?.section, 'ม.22')
  // Scenario must NOT have absorbed the Section label.
  assert.ok(!results[0].data!.question_pattern.includes('Section'))
}

// ─── v2.1 backward compatibility (the critical regression guard) ────────────

function verifies_v21_content_still_parses(): void {
  // v2.1 content: full metadata block, NO QuestionPattern / Section labels.
  // Must parse with isValid=true and the new fields defaulting to ''.
  const md = wrap(`**Blueprint:** Memory
**LearningObjective:** LO1
**Difficulty:** Easy
**QuestionType:** MCQ4
**ChoiceCount:** 4
**Subject:** law
**Document:** พ.ร.บ.การศึกษาแห่งชาติ 2542
**Topic:** หลักการจัดการศึกษา`)
  const results = parseMarkdownQuestions(md)
  assert.equal(results.length, 1)
  assert.equal(results[0].isValid, true, 'v2.1 content must still be valid')
  // Existing v2.1 fields unchanged.
  assert.equal(results[0].data?.blueprint, 'Memory')
  assert.equal(results[0].data?.learning_objective, 'LO1')
  assert.equal(results[0].data?.difficulty, 'Easy')
  assert.equal(results[0].data?.document, 'พ.ร.บ.การศึกษาแห่งชาติ 2542')
  // New v2.2 fields default to empty string (caller converts to NULL).
  assert.equal(results[0].data?.question_pattern, '')
  assert.equal(results[0].data?.section, '')
}

function verifies_v21_minimal_content_still_parses(): void {
  // The absolute minimum: just the Question + 4 choices + Answer. No metadata
  // at all. Must remain valid.
  const results = parseMarkdownQuestions(MIN_BODY)
  assert.equal(results.length, 1)
  assert.equal(results[0].isValid, true)
  // All metadata fields default to empty/null, including the new ones.
  assert.equal(results[0].data?.question_pattern, '')
  assert.equal(results[0].data?.section, '')
  assert.equal(results[0].data?.blueprint, '')
}

// ─── Mixed repository: v2.1 and v2.2 Questions in one document ──────────────

function verifies_mixed_v21_v22_document_parses_independently(): void {
  // The Bank will hold mixed v2.1 / v2.2 content during the multi-month
  // backfill window. A single Markdown document may contain both. Each chunk
  // (split by ---) parses independently.
  const md = `**Question:** v2.2 question with full IG-2 axes?

A. one
B. two
C. three
D. four

**Answer:** A
**Blueprint:** Concept
**QuestionPattern:** Positive
**Section:** ม.6–8

---

**Question:** v2.1 question without IG-2 axes?

A. one
B. two
C. three
D. four

**Answer:** B
**Blueprint:** Memory`
  const results = parseMarkdownQuestions(md)
  assert.equal(results.length, 2, 'expected two questions')
  // First: v2.2 with all axes.
  assert.equal(results[0].data?.question_pattern, 'Positive')
  assert.equal(results[0].data?.section, 'ม.6–8')
  // Second: v2.1 with empty new fields.
  assert.equal(results[1].data?.question_pattern, '')
  assert.equal(results[1].data?.section, '')
  assert.equal(results[1].data?.blueprint, 'Memory')
}

// ─── Determinism: same input → same parsed output ───────────────────────────

function verifies_parser_is_deterministic(): void {
  // Implementation Planning §6.6: parse must be deterministic. Same input →
  // same output, byte-for-byte.
  const md = wrap(`**QuestionPattern:** Sequence
**Section:** ม.47–51`)
  const a = parseMarkdownQuestions(md)
  const b = parseMarkdownQuestions(md)
  assert.deepEqual(a, b)
}

// ─── Pattern × Type cross-table consistency (informational) ─────────────────
// The parser does NOT validate Pattern × Type correspondence (that's the
// Engine's job via the Solver). It just extracts. This test pins that contract:
// an "impossible" pairing like Sequence + Memory still parses fine.

function verifies_parser_does_not_enforce_pattern_x_type(): void {
  const md = wrap(`**Blueprint:** Memory
**QuestionPattern:** Sequence`)
  const results = parseMarkdownQuestions(md)
  assert.equal(results[0].isValid, true, 'parser must not enforce Pattern×Type')
  assert.equal(results[0].data?.blueprint, 'Memory')
  assert.equal(results[0].data?.question_pattern, 'Sequence')
}

// ─── runner ─────────────────────────────────────────────────────────────────

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'v2.2: QuestionPattern extracted', fn: verifies_v22_question_pattern_extracted },
  { name: 'v2.2: Section extracted', fn: verifies_v22_section_extracted },
  { name: 'v2.2: both new fields extracted with existing fields', fn: verifies_v22_both_new_fields_extracted_together },
  { name: 'v2.2: QuestionPattern does not bleed into Section', fn: verifies_v22_pattern_does_not_bleed_into_next_field },
  { name: 'v2.1 backward compat: full v2.1 metadata block still parses', fn: verifies_v21_content_still_parses },
  { name: 'v2.1 backward compat: minimal Question still parses', fn: verifies_v21_minimal_content_still_parses },
  { name: 'mixed repository: v2.1 and v2.2 in one document parse independently', fn: verifies_mixed_v21_v22_document_parses_independently },
  { name: 'determinism: same input → same output', fn: verifies_parser_is_deterministic },
  { name: 'parser does not enforce Pattern×Type cross-table (Engine concern)', fn: verifies_parser_does_not_enforce_pattern_x_type },
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
