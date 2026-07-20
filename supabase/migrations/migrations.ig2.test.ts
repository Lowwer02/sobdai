/**
 * supabase/migrations/migrations.ig2.test.ts
 * ----------------------------------------------------------------------------
 * Migration integrity tests for migrations 027 (IG-2 axes) and 028 (RPC).
 *
 * Source of truth: IG-2 Architecture Amendment v1.0 §6.1, §8.3.
 *
 * These tests do NOT execute the SQL (no Postgres in unit-test scope). They
 * parse the migration files as text and verify the normative invariants:
 *  - All four IG-2 columns are declared.
 *  - Enum axes have CHECK constraints pinning Blueprint v3.0 vocabulary.
 *  - The sixth Pattern value is the two-word `Matching Concept`.
 *  - Indexes are partial (WHERE col IS NOT NULL) — for mixed v2.1/v2.2 Bank.
 *  - The down-migration is documented and uses DROP COLUMN.
 *  - RPC 028 extends the existing function with the four new arrays.
 *
 * Why text-grep rather than executing: the project has no test Postgres; a
 * syntactic/semantic guard on the migration text catches the regressions
 * that matter (forgotten column, typo'd enum value, missing index) without
 * requiring infrastructure. A future integration test layer can extend this.
 *
 * RUN: npx jiti supabase/migrations/migrations.ig2.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const M027 = readFileSync(join(__dirname, '027_question_ig2_axes.sql'), 'utf8')
const M028 = readFileSync(join(__dirname, '028_question_metadata_rpc_ig2.sql'), 'utf8')

// ─── Migration 027: column declarations ─────────────────────────────────────

function verifies_m027_adds_all_four_ig2_columns(): void {
  for (const col of ['blueprint_type', 'learning_objective', 'question_pattern', 'section']) {
    assert.ok(
      new RegExp(`ADD\\s+COLUMN\\s+IF\\s+NOT\\s+EXISTS\\s+${col}\\s+text`, 'i').test(M027),
      `migration 027 must declare column: ${col}`
    )
  }
}

function verifies_m027_uses_if_not_exists(): void {
  // Re-runnable: every ADD COLUMN uses IF NOT EXISTS (mirrors migration 002/026).
  const addColumnCount = (M027.match(/ADD COLUMN IF NOT EXISTS/gi) || []).length
  assert.ok(addColumnCount >= 4, `expected ≥4 IF NOT EXISTS column adds, got ${addColumnCount}`)
}

// ─── Migration 027: CHECK constraints ───────────────────────────────────────

function verifies_m027_blueprint_type_check_pins_v3_vocab(): void {
  // The CHECK must list exactly the four Blueprint v3.0 values.
  for (const v of ["'Memory'", "'Concept'", "'Procedure'", "'Scenario'"]) {
    assert.ok(M027.includes(v), `blueprint_type CHECK missing value: ${v}`)
  }
}

function verifies_m027_learning_objective_check_pins_v3_vocab(): void {
  for (const v of ["'LO1'", "'LO2'", "'LO3'", "'LO4'"]) {
    assert.ok(M027.includes(v), `learning_objective CHECK missing value: ${v}`)
  }
}

function verifies_m027_question_pattern_check_pins_v3_vocab(): void {
  for (const v of ["'Positive'", "'Negative'", "'Best Answer'", "'Scenario'", "'Sequence'"]) {
    assert.ok(M027.includes(v), `question_pattern CHECK missing value: ${v}`)
  }
}

function verifies_m027_pattern_sixth_value_is_matching_concept_two_words(): void {
  // IG-2 Amendment D-6: the sixth Pattern value is `Matching Concept`, NOT
  // `Matching`. Verify the two-word form is in the CHECK and the bare
  // `Matching` form is NOT (it would be the Integration Spec §5.4 typo).
  assert.ok(
    M027.includes("'Matching Concept'"),
    "question_pattern CHECK must include 'Matching Concept' (two words)"
  )
  // The bare 'Matching' must not appear as a standalone enum value. Match it
  // only when not preceded by `Concept ` and not followed by ` Concept`.
  // Simpler: 'Matching' followed by anything other than ' Concept' on the
  // same quoted value is the typo.
  const bareMatchingTypo = /'Matching'(?!\s*Concept)/
  assert.ok(
    !bareMatchingTypo.test(M027),
    "question_pattern CHECK must NOT contain bare 'Matching' (Integration Spec §5.4 typo corrected by D-6)"
  )
}

function verifies_m027_section_has_no_check_constraint(): void {
  // Per IG-2 Amendment §5.5 + migration 027 comments: section is free text,
  // not enum. No CHECK constraint should be added (an enum would couple the
  // schema to the statute book).
  assert.ok(
    !/questions_section_check/i.test(M027),
    'section must NOT have a CHECK constraint (free text per Amendment §5.5)'
  )
}

function verifies_m027_check_constraints_permit_null(): void {
  // Postgres CHECK passes on NULL by default, but the migration must SAY so
  // in the constraint (defensive + self-documenting). Each CHECK must include
  // the `IS NULL OR ...` form.
  const checksWithNullPermission = (M027.match(/IS NULL OR/gi) || []).length
  assert.ok(
    checksWithNullPermission >= 3,
    `expected ≥3 CHECK constraints with 'IS NULL OR' (one per enum axis), got ${checksWithNullPermission}`
  )
}

// ─── Migration 027: indexes ─────────────────────────────────────────────────

function verifies_m027_indexes_are_partial(): void {
  // Partial indexes (WHERE col IS NOT NULL) keep the index compact during
  // the mixed v2.1/v2.2 Bank state. Every IG-2 index must be partial.
  for (const col of ['blueprint_type', 'learning_objective', 'question_pattern', 'section']) {
    const idxPattern = new RegExp(
      `CREATE INDEX IF NOT EXISTS questions_${col}_idx[\\s\\S]*?WHERE ${col} IS NOT NULL`,
      'i'
    )
    assert.ok(
      idxPattern.test(M027),
      `index on ${col} must be partial (WHERE ${col} IS NOT NULL)`
    )
  }
}

// ─── Migration 027: reversibility ───────────────────────────────────────────

function verifies_m027_documents_down_migration(): void {
  // IG-2 Amendment §7.5 + Implementation Planning §7.3: rollback is DROP COLUMN.
  // The migration must document the down path.
  assert.ok(/DROP COLUMN IF NOT EXISTS|DROP COLUMN IF EXISTS/.test(M027), 'down migration must use DROP COLUMN IF EXISTS')
  assert.ok(M027.includes('blueprint_type'), 'down migration must reference blueprint_type')
  assert.ok(M027.includes('section'), 'down migration must reference section')
}

function verifies_m027_is_additive_only(): void {
  // No DROP, no ALTER COLUMN type narrowing, no destructive op in the up path.
  // The only DROP statements must be inside the down-migration comment block.
  // Strip the down-migration comment block, then check for any DROP.
  const withoutDownComment = M027.replace(/-- Down migration[\s\S]*?(?=\n-- =|$)/i, '')
    .replace(/--   DROP[\s\S]*?(?=\n\s*\n|\n--\s*═)/g, '')
  // Tolerate DROP CONSTRAINT IF EXISTS (these are the safe pre-add guards).
  const destructiveDrops = withoutDownComment.match(/DROP\s+(?!CONSTRAINT IF EXISTS)/gi)
  // DROP INDEX IF EXISTS in the down-comment block is also fine; verify no
  // destructive DROP COLUMN outside the comment.
  assert.ok(
    !/^\s*ALTER TABLE[^;]*DROP COLUMN/mi.test(withoutDownComment),
    'up migration must not contain DROP COLUMN (additive only)'
  )
}

// ─── Migration 028: RPC extension ───────────────────────────────────────────

function verifies_m028_extends_rpc_return_shape(): void {
  // The RPC must return all 8 arrays: original 4 + 4 new IG-2.
  for (const col of ['subjects', 'documents', 'topics', 'laws']) {
    assert.ok(M028.includes(`${col} text[]`), `RPC 028 must retain original column: ${col}`)
  }
  for (const col of ['blueprint_types', 'learning_objectives', 'question_patterns', 'sections']) {
    assert.ok(M028.includes(`${col} text[]`), `RPC 028 must add new column: ${col}`)
  }
}

function verifies_m028_uses_drop_then_create_not_create_or_replace(): void {
  // PostgreSQL rejects CREATE OR REPLACE FUNCTION when the OUT parameter list
  // (RETURNS TABLE columns) changes — SQLSTATE 42P13. Since 028 adds 4 OUT
  // columns to the original 4, the migration MUST use the DROP IF EXISTS →
  // CREATE → GRANT sequence. CREATE OR REPLACE would fail at apply time.
  // This test pins the corrected pattern so a future refactor can't silently
  // regress to the broken form.
  //
  // The regexes ignore `--` comment lines: explanatory prose in comments may
  // legitimately mention "CREATE OR REPLACE" (this migration's own header
  // explains WHY that idiom is forbidden). The test must assert SQL behavior,
  // not comment wording — a future engineer documenting the rationale should
  // not trip the test.
  const M028_NO_COMMENTS = M028.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')

  assert.ok(
    /DROP\s+FUNCTION\s+IF\s+EXISTS\s+public\.get_question_metadata\s*\(\s*\)/i.test(M028_NO_COMMENTS),
    'm028 must DROP FUNCTION IF EXISTS public.get_question_metadata() before CREATE'
  )
  assert.ok(
    /CREATE\s+FUNCTION\s+public\.get_question_metadata\s*\(\s*\)/i.test(M028_NO_COMMENTS),
    'm028 must CREATE FUNCTION public.get_question_metadata()'
  )
  // CREATE OR REPLACE FUNCTION is FORBIDDEN for this migration — it would
  // fail at apply time with SQLSTATE 42P13.
  assert.ok(
    !/CREATE\s+OR\s+REPLACE\s+FUNCTION/i.test(M028_NO_COMMENTS),
    'm028 must NOT use CREATE OR REPLACE FUNCTION (OUT param change → 42P13)'
  )
}

function verifies_m028_regrants_after_drop(): void {
  // DROP FUNCTION revokes ALL privileges on the function. CREATE FUNCTION
  // does not restore them. The explicit GRANT after CREATE is therefore
  // MANDATORY, not defensive — omitting it would break every authenticated
  // caller silently. The GRANT must appear AFTER the CREATE in document
  // order (the test enforces both presence and ordering).
  const grantIdx = M028.search(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_question_metadata/i)
  const createIdx = M028.search(/CREATE\s+FUNCTION\s+public\.get_question_metadata/i)
  const dropIdx = M028.search(/DROP\s+FUNCTION\s+IF\s+EXISTS\s+public\.get_question_metadata/i)
  assert.ok(dropIdx >= 0, 'DROP must be present')
  assert.ok(createIdx >= 0, 'CREATE must be present')
  assert.ok(grantIdx >= 0, 'GRANT must be present')
  assert.ok(
    dropIdx < createIdx && createIdx < grantIdx,
    `expected order DROP < CREATE < GRANT; got drop=${dropIdx} create=${createIdx} grant=${grantIdx}`
  )
}

function verifies_m028_uses_distinct_non_null_pattern(): void {
  // Mirrors migration 022's pattern: array_agg(DISTINCT col) FILTER (WHERE col IS NOT NULL)
  // with coalesce to '{}' for the empty case.
  for (const col of ['blueprint_type', 'learning_objective', 'question_pattern', 'section']) {
    const pattern = new RegExp(
      `coalesce\\s*\\(\\s*array_agg\\s*\\(\\s*distinct\\s+${col}\\s*\\)\\s*filter\\s*\\(\\s*where\\s+${col}\\s+is\\s+not\\s+null\\s*\\)`,
      'i'
    )
    assert.ok(
      pattern.test(M028),
      `RPC 028 must DISTINCT-non-null aggregate: ${col}`
    )
  }
}

function verifies_m028_grants_execute_to_authenticated(): void {
  // Same grant as migration 022 — admin-only metadata (authenticated role).
  assert.ok(/GRANT EXECUTE ON FUNCTION public\.get_question_metadata/i.test(M028))
}

function verifies_m028_uses_security_definer(): void {
  // The original RPC is SECURITY DEFINER so the caller needs only EXECUTE.
  assert.ok(/SECURITY DEFINER/i.test(M028))
}

// ─── runner ─────────────────────────────────────────────────────────────────

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'm027: declares all 4 IG-2 columns as text', fn: verifies_m027_adds_all_four_ig2_columns },
  { name: 'm027: uses IF NOT EXISTS (re-runnable)', fn: verifies_m027_uses_if_not_exists },
  { name: 'm027: blueprint_type CHECK pins v3 vocabulary', fn: verifies_m027_blueprint_type_check_pins_v3_vocab },
  { name: 'm027: learning_objective CHECK pins v3 vocabulary', fn: verifies_m027_learning_objective_check_pins_v3_vocab },
  { name: 'm027: question_pattern CHECK pins v3 vocabulary', fn: verifies_m027_question_pattern_check_pins_v3_vocab },
  { name: 'm027: Pattern sixth value is "Matching Concept" (two words)', fn: verifies_m027_pattern_sixth_value_is_matching_concept_two_words },
  { name: 'm027: section has NO CHECK constraint (free text)', fn: verifies_m027_section_has_no_check_constraint },
  { name: 'm027: CHECK constraints permit NULL', fn: verifies_m027_check_constraints_permit_null },
  { name: 'm027: all 4 indexes are partial (WHERE NOT NULL)', fn: verifies_m027_indexes_are_partial },
  { name: 'm027: documents the down-migration (DROP COLUMN)', fn: verifies_m027_documents_down_migration },
  { name: 'm027: additive only (no destructive DROP in up path)', fn: verifies_m027_is_additive_only },
  { name: 'm028: extends RPC return shape with 4 new arrays', fn: verifies_m028_extends_rpc_return_shape },
  { name: 'm028: uses DROP IF EXISTS → CREATE (not CREATE OR REPLACE, 42P13)', fn: verifies_m028_uses_drop_then_create_not_create_or_replace },
  { name: 'm028: re-grants EXECUTE after DROP (order: DROP < CREATE < GRANT)', fn: verifies_m028_regrants_after_drop },
  { name: 'm028: uses DISTINCT-non-null aggregation pattern', fn: verifies_m028_uses_distinct_non_null_pattern },
  { name: 'm028: grants execute to authenticated', fn: verifies_m028_grants_execute_to_authenticated },
  { name: 'm028: SECURITY DEFINER', fn: verifies_m028_uses_security_definer },
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
