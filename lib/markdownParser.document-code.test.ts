/**
 * lib/markdownParser.document-code.test.ts
 * ----------------------------------------------------------------------------
 * Document Code Intake V1 — focused tests for **DocumentCode:** intake.
 *
 * Covers the ten required proofs:
 *   1. parser reads DocumentCode
 *   2. exact value survives parse
 *   3. valid format passes
 *   4. invalid format fails (field-level diagnostic)
 *   5. legacy missing field passes
 *   6. partially-coded multi-question file fails
 *   7. fully-coded file passes (different codes per question are fine)
 *   8. import payload contains document_code
 *   9. persisted mapping does not substitute Document text for DocumentCode
 *  10. unrelated update path does not erase existing document_code
 *
 * Proof 8 uses buildQuestionInsertRow (the exact mapper the import action
 * feeds into supabase.insert); proof 10 is a source-text contract on the
 * question edit action (PostgREST .update() patches ONLY the supplied
 * columns, so a payload without document_code can never clear it).
 *
 * RUN: npx jiti lib/markdownParser.document-code.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseMarkdownQuestions, isValidDocumentCode } from './markdownParser'
import { buildQuestionInsertRow } from './question-import-row'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── representative metadata from the Document Code Intake V1 spec ──────────

const SPEC_DOCUMENT_CODE = 'DOC-ACT-STATE-ADMIN-2534'
const SPEC_DOCUMENT = 'พรบ.ระเบียบบริหารราชการแผ่นดิน พ.ศ. 2534 และที่แก้ไขเพิ่มเติม'

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

// ─── 1. parser reads DocumentCode ───────────────────────────────────────────

function proof1_parser_reads_document_code(): void {
  const md = wrap(`**Category:** ความรู้พื้นฐานในการปฏิบัติงาน
**Subject:** กฎหมาย
**DocumentCode:** ${SPEC_DOCUMENT_CODE}
**Document:** ${SPEC_DOCUMENT}
**DocumentType:** พระราชบัญญัติ
**Topic:** หลักการบริหารราชการ
**LearningObjective:** LO1
**KnowledgeCoverage:** มาตรา 3`)
  const results = parseMarkdownQuestions(md)
  assert.equal(results.length, 1)
  assert.equal(results[0].isValid, true, 'representative metadata must parse valid')
  assert.ok('document_code' in (results[0].data ?? {}), 'parsed model must carry document_code')
  assert.equal(results[0].data?.document_code, SPEC_DOCUMENT_CODE)
}

// ─── 2. exact value survives parse ──────────────────────────────────────────

function proof2_exact_value_survives_parse(): void {
  // Outer whitespace is trimmed; the value itself is never rewritten.
  const md = wrap(`**DocumentCode:**    ${SPEC_DOCUMENT_CODE}   `)
  const results = parseMarkdownQuestions(md)
  assert.equal(results[0].data?.document_code, SPEC_DOCUMENT_CODE)

  // Suffixed variant (same stable identity, new version) is preserved too.
  const mdV2 = wrap('**DocumentCode:** DOC-ACT-STATE-ADMIN-2534-V2')
  const resultsV2 = parseMarkdownQuestions(mdV2)
  assert.equal(resultsV2[0].data?.document_code, 'DOC-ACT-STATE-ADMIN-2534-V2')

  // Determinism: same input → same output.
  assert.deepEqual(parseMarkdownQuestions(md), parseMarkdownQuestions(md))
}

// ─── 3. valid format passes ─────────────────────────────────────────────────

function proof3_valid_format_passes(): void {
  for (const code of ['DOC-ACT-STATE-ADMIN-2534', 'DOC-OAG-ORGANIC-ACT-2561']) {
    assert.equal(isValidDocumentCode(code), true, `${code} must be valid`)
    const results = parseMarkdownQuestions(wrap(`**DocumentCode:** ${code}`))
    assert.equal(results[0].isValid, true, `${code} must parse as valid`)
    assert.equal(results[0].data?.document_code, code)
  }
}

// ─── 4. invalid format fails ────────────────────────────────────────────────

function proof4_invalid_format_fails(): void {
  for (const bad of ['พรบ-2534', 'doc act 2534', 'DOC/ACT/2534']) {
    assert.equal(isValidDocumentCode(bad), false, `"${bad}" must be invalid`)
    const results = parseMarkdownQuestions(wrap(`**DocumentCode:** ${bad}`))
    assert.equal(results[0].isValid, false, `"${bad}" must fail validation`)
    assert.equal(results[0].data, null)
    assert.ok(
      results[0].errors.some((e) => e.includes('**DocumentCode:**')),
      `diagnostic must name the field for "${bad}": ${JSON.stringify(results[0].errors)}`
    )
    // The offending value is echoed in the diagnostic for the admin.
    assert.ok(
      results[0].errors.some((e) => e.includes(bad)),
      'diagnostic must include the offending value'
    )
  }
}

// ─── 5. legacy missing field passes ─────────────────────────────────────────

function proof5_legacy_missing_field_passes(): void {
  // Full v2.1 metadata block WITHOUT DocumentCode — the existing KSB/legacy
  // shape must keep parsing as valid, with document_code defaulting to ''.
  const md = wrap(`**Subject:** กฎหมาย
**Document:** พ.ร.บ.การศึกษาแห่งชาติ 2542
**Topic:** หลักการจัดการศึกษา`)
  const results = parseMarkdownQuestions(md)
  assert.equal(results[0].isValid, true, 'legacy file without DocumentCode must stay valid')
  assert.equal(results[0].data?.document_code, '')
  // Existing Document extraction is unchanged.
  assert.equal(results[0].data?.document, 'พ.ร.บ.การศึกษาแห่งชาติ 2542')

  // Bare minimum body too.
  const minimal = parseMarkdownQuestions(MIN_BODY)
  assert.equal(minimal[0].isValid, true)
  assert.equal(minimal[0].data?.document_code, '')
}

// ─── 6. partially-coded multi-question file fails ───────────────────────────

function proof6_partially_coded_file_fails(): void {
  const md = `${wrap(`**DocumentCode:** ${SPEC_DOCUMENT_CODE}`)}

---

${wrap('**Subject:** กฎหมาย')}`
  const results = parseMarkdownQuestions(md)
  assert.equal(results.length, 2)
  for (const r of results) {
    assert.equal(r.isValid, false, 'every question in a partially-coded file must fail')
    assert.equal(r.data, null)
    assert.ok(
      r.errors.some((e) => e.includes('Partially-coded file')),
      `expected partial-file diagnostic on #${r.index}: ${JSON.stringify(r.errors)}`
    )
  }
}

// ─── 7. fully-coded file passes ─────────────────────────────────────────────

function proof7_fully_coded_file_passes(): void {
  // Different codes per question are legitimate (multi-document file).
  const md = `${wrap(`**DocumentCode:** ${SPEC_DOCUMENT_CODE}`)}

---

${wrap('**DocumentCode:** DOC-OAG-ORGANIC-ACT-2561')}`
  const results = parseMarkdownQuestions(md)
  assert.equal(results.length, 2)
  assert.equal(results[0].isValid, true)
  assert.equal(results[1].isValid, true)
  assert.equal(results[0].data?.document_code, SPEC_DOCUMENT_CODE)
  assert.equal(results[1].data?.document_code, 'DOC-OAG-ORGANIC-ACT-2561')

  // A legacy file with NO codes at all also passes unchanged.
  const legacy = parseMarkdownQuestions(`${wrap('**Subject:** a')}\n\n---\n\n${wrap('**Subject:** b')}`)
  assert.equal(legacy.length, 2)
  assert.equal(legacy[0].isValid, true)
  assert.equal(legacy[1].isValid, true)
}

// ─── 8. import payload contains document_code ───────────────────────────────

function proof8_import_payload_contains_document_code(): void {
  const parsed = parseMarkdownQuestions(wrap(`**DocumentCode:** ${SPEC_DOCUMENT_CODE}
**Document:** ${SPEC_DOCUMENT}`))
  const row = buildQuestionInsertRow(parsed[0].data!, 'Q-000001')
  assert.equal(row.document_code, SPEC_DOCUMENT_CODE, 'payload must carry document_code verbatim')

  // Legacy (no code) → NULL, not empty string.
  const legacyParsed = parseMarkdownQuestions(wrap('**Subject:** กฎหมาย'))
  const legacyRow = buildQuestionInsertRow(legacyParsed[0].data!, 'Q-000002')
  assert.equal(legacyRow.document_code, null)

  // The import action must wire the tested mapper into its insert payload.
  const actionSource = readFileSync(join(__dirname, '../app/admin/import/actions.ts'), 'utf8')
  assert.match(
    actionSource,
    /buildQuestionInsertRow/,
    'import action must build its insert payload via buildQuestionInsertRow'
  )
}

// ─── 9. mapping never substitutes Document text for DocumentCode ────────────

function proof9_no_document_text_substitution(): void {
  const parsed = parseMarkdownQuestions(wrap(`**DocumentCode:** ${SPEC_DOCUMENT_CODE}
**Document:** ${SPEC_DOCUMENT}`))
  const row = buildQuestionInsertRow(parsed[0].data!, 'Q-000001')
  assert.equal(row.document_code, SPEC_DOCUMENT_CODE)
  assert.equal(row.document, SPEC_DOCUMENT, 'Document display text must persist unchanged')
  assert.notEqual(row.document_code, row.document, 'code and display text are distinct identities')
}

// ─── 10. unrelated update path does not erase document_code ─────────────────

function proof10_update_path_does_not_erase_document_code(): void {
  // PostgREST .update() patches ONLY the columns present in the payload, so
  // the contract is: the question edit action's payload must NOT include
  // document_code (it may only ever write it deliberately) while still
  // handling the sibling `document` field as before.
  const editAction = readFileSync(join(__dirname, '../app/admin/questions/actions.ts'), 'utf8')
  assert.match(editAction, /document:/, 'edit action keeps handling the document field')
  assert.doesNotMatch(
    editAction,
    /document_code/,
    'edit action payload must not write document_code (partial update ⇒ stored value is preserved)'
  )
}

// ─── runner ─────────────────────────────────────────────────────────────────

const tests: Array<{ name: string; fn: () => void }> = [
  { name: '1. parser reads DocumentCode', fn: proof1_parser_reads_document_code },
  { name: '2. exact value survives parse', fn: proof2_exact_value_survives_parse },
  { name: '3. valid format passes', fn: proof3_valid_format_passes },
  { name: '4. invalid format fails with field-level diagnostic', fn: proof4_invalid_format_fails },
  { name: '5. legacy file without DocumentCode passes', fn: proof5_legacy_missing_field_passes },
  { name: '6. partially-coded multi-question file fails', fn: proof6_partially_coded_file_fails },
  { name: '7. fully-coded file passes', fn: proof7_fully_coded_file_passes },
  { name: '8. import payload contains document_code', fn: proof8_import_payload_contains_document_code },
  { name: '9. mapping does not substitute Document text for DocumentCode', fn: proof9_no_document_text_substitution },
  { name: '10. unrelated update path does not erase existing document_code', fn: proof10_update_path_does_not_erase_document_code },
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
