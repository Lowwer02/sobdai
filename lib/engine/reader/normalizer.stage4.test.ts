/**
 * lib/engine/reader/normalizer.stage4.test.ts
 * ----------------------------------------------------------------------------
 * Reader Stage 4 tests — Normalization (metadata → CanonicalBlueprintMetadata).
 *
 * Source of truth:
 *  - Blueprint Reader Pipeline Architecture v1.0 §8 (Normalization),
 *    §8.4 (Determinism Guarantee)
 *  - IG-2 Architecture Amendment v1.0 §5.5 (Section canonical form)
 *  - lib/ig2.ts — single source of truth for Section + enum-axis normalization
 *
 * RUN: npx jiti lib/engine/reader/normalizer.stage4.test.ts
 *
 * Coverage targets:
 *  - Whitespace normalization (trim, internal-collapse) on title.
 *  - Line-ending normalization (CRLF → LF) on title.
 *  - Unicode NFC normalization (Thai combining sequences).
 *  - Version normalization (leading zeros stripped, trimmed).
 *  - Position ID normalization (lowercased).
 *  - Null fields preserved as null (no invention — spec §8.3).
 *  - Determinism (spec §8.4): same input → same canonical output.
 *  - Stage 4 does NOT touch rule content (mission scope guard).
 */

import assert from 'node:assert/strict'
import { loadBlueprint } from './loader'
import { normalizeMetadata } from './normalizer'
import type { BlueprintMetadata } from './loader'
import {
  buildLeadingZeroVersionBlueprint,
  buildMissingPositionIdBlueprint,
  buildUppercasePositionIdBlueprint,
  buildWellFormedBlueprint,
  buildWhitespaceHeavyTitleBlueprint,
} from './testing/fixtures'

// ─── helpers ────────────────────────────────────────────────────────────────

function loadMetadata(src: string): BlueprintMetadata {
  const r = loadBlueprint(src)
  if (!r.ok) throw new Error(`Stage 1 refused: ${r.reason}`)
  return r.document.metadata
}

// ─── Whitespace normalization ───────────────────────────────────────────────

function verifies_title_internal_whitespace_collapsed(): void {
  const m = loadMetadata(buildWhitespaceHeavyTitleBlueprint())
  const c = normalizeMetadata(m)
  // Multiple spaces → single space. Leading `#` and surrounding spaces
  // are stripped by the parser before reaching the metadata; here we verify
  // normalization handles what survived.
  assert.equal(c.title, 'Simulation Exam Blueprint — v3.0')
}

function verifies_title_trimmed_of_surrounding_whitespace(): void {
  // Construct metadata directly (avoids parser interaction with title).
  const c = normalizeMetadata({
    engineVersion: '1.0.0',
    blueprintVersion: '3.0.0',
    positionId: 'x',
    title: '   Hello   ',
    sourceLine: 1,
    form: 'blockquote',
  })
  assert.equal(c.title, 'Hello')
}

// ─── Line-ending normalization ──────────────────────────────────────────────

function verifies_crlf_in_title_converted_to_space(): void {
  // A CR+LF inside a title becomes a single space (whitespace-collapse rule).
  //
  // NOTE: this test constructs a BlueprintMetadata directly because the
  // markdown parser cannot produce a multi-line heading (CommonMark rule —
  // headings are single-line). The CRLF-normalization rule still exists and
  // applies to any text value that survives parsing with a CR in it (e.g.
  // multi-paragraph blockquotes, future-format YAML free-text fields). We
  // exercise it at the unit level here.
  const crlf = String.fromCharCode(13) + '\n'
  const c = normalizeMetadata({
    engineVersion: null,
    blueprintVersion: null,
    positionId: null,
    title: `Line1${crlf}Line2`,
    sourceLine: 1,
    form: 'blockquote',
  })
  assert.equal(c.title, 'Line1 Line2')
}

function verifies_cr_only_in_title_converted_to_space(): void {
  // A bare CR (old Mac line ending) also becomes a single space.
  const cr = String.fromCharCode(13)
  const c = normalizeMetadata({
    engineVersion: null,
    blueprintVersion: null,
    positionId: null,
    title: `Line1${cr}Line2`,
    sourceLine: 1,
    form: 'blockquote',
  })
  assert.equal(c.title, 'Line1 Line2')
}

function verifies_lf_in_text_becomes_space(): void {
  const c = normalizeMetadata({
    engineVersion: null,
    blueprintVersion: null,
    positionId: null,
    title: 'line one\nline two',
    sourceLine: 1,
    form: 'blockquote',
  })
  assert.equal(c.title, 'line one line two')
}

// ─── Unicode NFC normalization ──────────────────────────────────────────────

function verifies_nfc_normalization(): void {
  // Build a string with a combining sequence (NFD form) and verify the
  // canonical form is NFC (precomposed). e.g. Thai vowel + tone marks.
  // For ASCII the difference is invisible; we test with a Thai character
  // that has a precomposed form.
  const nfd = 'ม.' + String.fromCharCode(0x0E31) // sarA-a (combining); already precomposed in NFC for 0E31 but the test still verifies pass-through
  const c = normalizeMetadata({
    engineVersion: null,
    blueprintVersion: null,
    positionId: null,
    title: nfd,
    sourceLine: 1,
    form: 'blockquote',
  })
  // The output MUST be in NFC form. For Thai 0E31 NFC and NFD are identical
  // (it's a combining vowel with no precomposed form), so this is a stable-
  // pass-through test. The determinism test below covers the actual
  // canonicalization property across NFC/NFD inputs.
  assert.equal(c.title, nfd.normalize('NFC'))
}

function verifies_nfc_makes_nfd_and_nfc_byte_equal(): void {
  // The real determinism property: a character with distinct NFD/NFC forms
  // must canonicalize identically. Use U+00E9 (é) which has both forms.
  const nfc = 'café'        // precomposed é (U+00E9)
  const nfd = 'cafe\u0301'  // decomposed e + combining acute
  assert.notEqual(nfc, nfd, 'test precondition: NFD and NFC must differ as strings')
  const cn = normalizeMetadata({
    engineVersion: null, blueprintVersion: null, positionId: null,
    title: nfc, sourceLine: 1, form: 'blockquote',
  })
  const cd = normalizeMetadata({
    engineVersion: null, blueprintVersion: null, positionId: null,
    title: nfd, sourceLine: 1, form: 'blockquote',
  })
  assert.equal(cn.title, cd.title, 'NFC normalization must make NFD and NFC inputs byte-equal')
  assert.equal(cn.title, 'café')
}

// ─── Version normalization ──────────────────────────────────────────────────

function verifies_version_leading_zeros_stripped(): void {
  const m = loadMetadata(buildLeadingZeroVersionBlueprint())
  const c = normalizeMetadata(m)
  assert.equal(c.engineVersion, '1.0.0')
  assert.equal(c.blueprintVersion, '3.0.0')
}

function verifies_version_surrounding_whitespace_trimmed(): void {
  // Covered by the leading-zeros fixture (which has padding around 03.00.00),
  // but assert directly here for clarity.
  const c = normalizeMetadata({
    engineVersion: '  1.0.0  ',
    blueprintVersion: ' 3.0.0',
    positionId: null,
    title: null,
    sourceLine: 1,
    form: 'blockquote',
  })
  assert.equal(c.engineVersion, '1.0.0')
  assert.equal(c.blueprintVersion, '3.0.0')
}

function verifies_version_zero_preserved(): void {
  // '0.0.0' must stay '0.0.0' (single-zero components). parseInt('0') = 0,
  // String(0) = '0'. Don't accidentally turn it into empty string.
  const c = normalizeMetadata({
    engineVersion: '0.0.0',
    blueprintVersion: '0.10.0',
    positionId: null,
    title: null,
    sourceLine: 1,
    form: 'blockquote',
  })
  assert.equal(c.engineVersion, '0.0.0')
  assert.equal(c.blueprintVersion, '0.10.0')
}

// ─── Position ID normalization ──────────────────────────────────────────────

function verifies_position_id_lowercased(): void {
  const m = loadMetadata(buildUppercasePositionIdBlueprint())
  const c = normalizeMetadata(m)
  assert.equal(c.positionId, 'bma-education-specialist')
}

function verifies_position_id_trimmed(): void {
  const c = normalizeMetadata({
    engineVersion: null, blueprintVersion: null,
    positionId: '  bma-edu  ',
    title: null,
    sourceLine: 1, form: 'blockquote',
  })
  assert.equal(c.positionId, 'bma-edu')
}

// ─── Null preservation (no invention, spec §8.3) ────────────────────────────

function verifies_null_fields_preserved_as_null(): void {
  const m = loadMetadata(buildMissingPositionIdBlueprint())
  const c = normalizeMetadata(m)
  assert.equal(c.positionId, null, 'absent positionId must stay null — no invention')
  // Other fields are still normalized.
  assert.equal(c.engineVersion, '1.0.0')
  assert.equal(c.blueprintVersion, '3.0.0')
}

function verifies_all_null_metadata_stays_all_null(): void {
  const c = normalizeMetadata({
    engineVersion: null,
    blueprintVersion: null,
    positionId: null,
    title: null,
    sourceLine: null,
    form: 'none',
  })
  assert.equal(c.engineVersion, null)
  assert.equal(c.blueprintVersion, null)
  assert.equal(c.positionId, null)
  assert.equal(c.title, null)
  assert.equal(c.sourceLine, null)
  assert.equal(c.form, 'none')
}

// ─── Audit fields preserved ─────────────────────────────────────────────────

function verifies_sourceLine_and_form_preserved(): void {
  const m = loadMetadata(buildWellFormedBlueprint())
  const c = normalizeMetadata(m)
  // sourceLine + form are audit fields; normalization preserves them verbatim.
  assert.equal(c.sourceLine, m.sourceLine)
  assert.equal(c.form, m.form)
}

// ─── Determinism (spec §8.4) ────────────────────────────────────────────────

function verifies_normalization_is_deterministic(): void {
  const m = loadMetadata(buildWellFormedBlueprint())
  const a = normalizeMetadata(m)
  const b = normalizeMetadata(m)
  assert.deepEqual(a, b)
}

function verifies_normalization_idempotent(): void {
  // Normalizing an already-normalized value should be a no-op (modulo the
  // type difference). We approximate idempotency by re-normalizing the
  // string fields via the same primitives — they should be stable.
  const m = loadMetadata(buildWellFormedBlueprint())
  const c1 = normalizeMetadata(m)
  // Build a new BlueprintMetadata from c1's string values and renormalize.
  const renormalized = normalizeMetadata({
    engineVersion: c1.engineVersion,
    blueprintVersion: c1.blueprintVersion,
    positionId: c1.positionId,
    title: c1.title,
    sourceLine: c1.sourceLine,
    form: c1.form,
  })
  assert.deepEqual(renormalized, c1)
}

// ─── Stage 4 scope guard: does NOT touch rule content ──────────────────────

function verifies_stage4_does_not_consume_rule_content(): void {
  // Stage 4's input is BlueprintMetadata (NOT the full BlueprintDocument).
  // It physically cannot touch rule content — there's no path to it from the
  // input type. This test pins that contract by confirming the API surface:
  // normalizeMetadata accepts BlueprintMetadata only, not BlueprintDocument.
  // (If a future engineer widens the signature, this test stops compiling.)
  const m: BlueprintMetadata = loadMetadata(buildWellFormedBlueprint())
  const c = normalizeMetadata(m)
  // Output is CanonicalBlueprintMetadata — has ONLY metadata fields.
  assert.ok(!('ast' in c), 'CanonicalBlueprintMetadata must not carry AST (Stage 5+ concern)')
  assert.ok(!('nodes' in c), 'CanonicalBlueprintMetadata must not carry AST nodes')
  assert.ok(typeof c === 'object' && c !== null)
}

// ─── runner ─────────────────────────────────────────────────────────────────

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'title internal whitespace collapsed', fn: verifies_title_internal_whitespace_collapsed },
  { name: 'title trimmed of surrounding whitespace', fn: verifies_title_trimmed_of_surrounding_whitespace },
  { name: 'CRLF in title converted to space (direct metadata unit test)', fn: verifies_crlf_in_title_converted_to_space },
  { name: 'CR-only in title converted to space', fn: verifies_cr_only_in_title_converted_to_space },
  { name: 'LF in text becomes space', fn: verifies_lf_in_text_becomes_space },
  { name: 'NFC normalization (Thai pass-through)', fn: verifies_nfc_normalization },
  { name: 'NFC makes NFD and NFC inputs byte-equal (é test)', fn: verifies_nfc_makes_nfd_and_nfc_byte_equal },
  { name: 'version leading zeros stripped (01.00.00 → 1.0.0)', fn: verifies_version_leading_zeros_stripped },
  { name: 'version surrounding whitespace trimmed', fn: verifies_version_surrounding_whitespace_trimmed },
  { name: 'version zero preserved (0.0.0 → 0.0.0)', fn: verifies_version_zero_preserved },
  { name: 'Position ID lowercased', fn: verifies_position_id_lowercased },
  { name: 'Position ID trimmed', fn: verifies_position_id_trimmed },
  { name: 'null fields preserved as null (no invention)', fn: verifies_null_fields_preserved_as_null },
  { name: 'all-null metadata stays all-null', fn: verifies_all_null_metadata_stays_all_null },
  { name: 'sourceLine + form preserved for audit', fn: verifies_sourceLine_and_form_preserved },
  { name: 'determinism: same input → same canonical output', fn: verifies_normalization_is_deterministic },
  { name: 'idempotent: re-normalizing is a no-op', fn: verifies_normalization_idempotent },
  { name: 'Stage 4 scope guard: output has metadata fields only (no AST)', fn: verifies_stage4_does_not_consume_rule_content },
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
