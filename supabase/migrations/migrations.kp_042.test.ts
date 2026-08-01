/**
 * Static contract tests for the first Knowledge Layer migration.
 *
 * The frozen responsibility formerly numbered 041 is reconciled to 042 because
 * 041_news_gp_exam_requirement.sql already occupies the production identity.
 *
 * Run:
 *   node --experimental-strip-types supabase/migrations/migrations.kp_042.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationName = '042_kp_summaries_expand.sql'
const migration = readFileSync(join(migrationDir, migrationName), 'utf8')
const sql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

function verifiesProductionSafeIdentityAndDependencies(): void {
  const files = readdirSync(migrationDir).filter((name) => name.endsWith('.sql'))
  for (const required of [
    '038_kp_reference_documents.sql',
    '039_kp_reference_document_versions.sql',
    '040_kp_reference_document_aliases.sql',
    '041_news_gp_exam_requirement.sql',
    migrationName,
  ]) {
    assert.ok(files.includes(required), `required migration is missing: ${required}`)
  }
  assert.ok(
    !files.includes('041_kp_summaries_expand.sql'),
    'Knowledge migration must not collide with production migration 041',
  )
  assert.match(sql, /set\s+local\s+lock_timeout\s*=\s*'5s'/i)
}

function verifiesSummaryRootScopeOnly(): void {
  assert.match(sql, /alter\s+table\s+public\.summaries/i)
  for (const forbiddenTable of [
    'summary_versions',
    'summary_aliases',
    'summary_reference_documents',
    'summary_version_reference_documents',
    'package_summaries',
  ]) {
    assert.ok(
      !new RegExp(`create\\s+table[\\s\\S]*?public\\.${forbiddenTable}\\b`, 'i').test(sql),
      `042 must not create later table public.${forbiddenTable}`,
    )
  }
  assert.ok(!/\binsert\s+into\b/i.test(sql), '042 must not insert or backfill domain data')
  assert.ok(!/\bupdate\s+public\.summaries\b/i.test(sql), '042 must not mutate existing Summary rows')
}

function verifiesPreservedUuidRootAndNullableExpansion(): void {
  assert.ok(migration.includes("pg_get_constraintdef(c.oid) = 'PRIMARY KEY (id)'"))
  for (const required of [
    /add\s+column\s+if\s+not\s+exists\s+summary_code\s+text\s*[,;]/i,
    /add\s+column\s+if\s+not\s+exists\s+canonical_slug\s+text\s*[,;]/i,
    /add\s+column\s+if\s+not\s+exists\s+canonical_title\s+text\s*[,;]/i,
    /add\s+column\s+if\s+not\s+exists\s+visibility\s+text\s*[,;]/i,
    /add\s+column\s+if\s+not\s+exists\s+lifecycle_status\s+text\s*[,;]/i,
    /add\s+column\s+if\s+not\s+exists\s+current_published_version_id\s+uuid\s*[,;]/i,
    /add\s+column\s+if\s+not\s+exists\s+created_by\s+uuid\s*[,;]/i,
    /add\s+column\s+if\s+not\s+exists\s+archived_by\s+uuid\s*[,;]/i,
    /add\s+column\s+if\s+not\s+exists\s+archived_at\s+timestamptz\s*[,;]/i,
  ]) {
    assert.match(sql, required)
  }
  assert.ok(!/add\s+column[\s\S]*?\bdefault\b/i.test(sql), 'expanded columns must have no defaults')
  for (const legacyColumn of ['package_id', 'slug', 'content_md', 'is_published', 'display_order']) {
    assert.ok(!new RegExp(`drop\\s+column(?:\\s+if\\s+exists)?\\s+${legacyColumn}\\b`, 'i').test(sql))
  }
}

function verifiesLifecycleOwnershipAndDeferredConstraints(): void {
  for (const value of [
    'public_indexable',
    'authenticated',
    'product_entitled',
    'active',
    'archived',
  ]) {
    assert.ok(migration.includes(`'${value}'`), `missing frozen value: ${value}`)
  }
  for (const constraint of [
    'summaries_summary_code_check',
    'summaries_canonical_slug_check',
    'summaries_canonical_title_check',
    'summaries_visibility_check',
    'summaries_lifecycle_status_check',
    'summaries_archive_check',
    'summaries_created_by_fkey',
    'summaries_archived_by_fkey',
  ]) {
    assert.ok(migration.includes(constraint), `missing Summary-root constraint: ${constraint}`)
  }
  assert.ok((sql.match(/not\s+valid/gi) ?? []).length >= 8, 'root constraints must be deferred')
  for (const actor of ['created_by', 'archived_by']) {
    assert.match(
      sql,
      new RegExp(`foreign\\s+key\\s*\\(${actor}\\)[\\s\\S]*?references\\s+public\\.profiles\\s*\\(id\\)[\\s\\S]*?on\\s+delete\\s+set\\s+null[\\s\\S]*?not\\s+valid`, 'i'),
    )
  }
  assert.ok(
    !/foreign\s+key\s*\([^)]*current_published_version_id/i.test(sql),
    'current pointer FK must wait for SummaryVersion',
  )
}

function verifiesAllocatorAndImmutability(): void {
  assert.match(sql, /create\s+sequence\s+if\s+not\s+exists\s+public\.summary_code_seq/i)
  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.format_summary_code\s*\(seq_value\s+bigint\)/i)
  assert.match(sql, /'SUM-'\s*\|\|\s*lpad\s*\(seq_value::text,\s*6,\s*'0'\)/i)
  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.allocate_summary_codes\s*\(n\s+integer\)/i)
  assert.match(sql, /old\.summary_code\s+is\s+not\s+null[\s\S]*?new\.summary_code\s+is\s+distinct\s+from\s+old\.summary_code/i)
  assert.match(sql, /create\s+trigger\s+protect_summary_code/i)
  assert.ok(
    !migration.includes("('handle_updated_at_summaries')"),
    '042 must not require the repository-only Summary audit trigger in production drift validation',
  )
}

function verifiesIndexesAreDeferred(): void {
  assert.ok(!/create\s+(?:unique\s+)?index/i.test(sql), '042 must defer populated-table indexes')
  assert.ok(!/\bunique\s*\(\s*summary_code\s*\)/i.test(sql), 'summary_code uniqueness waits for online indexes')
  assert.ok(!/\bunique\s*\(\s*canonical_slug\s*\)/i.test(sql), 'canonical slug uniqueness waits for online indexes')
}

function verifiesRlsIsPreservedWithoutPolicyDrift(): void {
  assert.ok(!/\bcreate\s+policy\b/i.test(sql), '042 must not create later RLS policies')
  assert.ok(!/\bdrop\s+policy\b/i.test(sql), '042 must not replace existing RLS policies')
  assert.ok(migration.includes("('Published summaries viewable by everyone.')"))
  assert.ok(migration.includes("('Content managers can manage summaries.')"))
  assert.ok(migration.includes('c.relrowsecurity'), 'migration must verify RLS remains enabled')
}

function verifiesCommentsAndFailClosedValidation(): void {
  for (const column of [
    'id',
    'summary_code',
    'canonical_slug',
    'canonical_title',
    'subject',
    'topic',
    'law',
    'visibility',
    'lifecycle_status',
    'current_published_version_id',
    'created_by',
    'created_at',
    'updated_at',
    'archived_by',
    'archived_at',
  ]) {
    assert.match(sql, new RegExp(`comment\\s+on\\s+column\\s+public\\.summaries\\.${column}\\s+is`, 'i'))
  }
  assert.ok(migration.includes('$kp_summary_root_prerequisites$'))
  assert.ok(migration.includes('$kp_summary_root_assertions$'))
  for (const catalog of [
    'information_schema.columns',
    'pg_constraint',
    'pg_sequence',
    'pg_trigger',
    'pg_policies',
    'c.relrowsecurity',
  ]) {
    assert.ok(migration.includes(catalog), `042 validation must inspect ${catalog}`)
  }
}

const tests: Array<{ name: string; run: () => void }> = [
  { name: 'production-safe identity and dependencies', run: verifiesProductionSafeIdentityAndDependencies },
  { name: 'Summary aggregate-root scope only', run: verifiesSummaryRootScopeOnly },
  { name: 'preserved UUID root and nullable expansion', run: verifiesPreservedUuidRootAndNullableExpansion },
  { name: 'lifecycle ownership and deferred constraints', run: verifiesLifecycleOwnershipAndDeferredConstraints },
  { name: 'allocator and immutable business identity', run: verifiesAllocatorAndImmutability },
  { name: 'populated-table indexes deferred', run: verifiesIndexesAreDeferred },
  { name: 'existing RLS preserved without policy drift', run: verifiesRlsIsPreservedWithoutPolicyDrift },
  { name: 'comments and fail-closed migration validation', run: verifiesCommentsAndFailClosedValidation },
]

for (const test of tests) {
  test.run()
  process.stdout.write(`✓ ${test.name}\n`)
}

process.stdout.write(`\n${tests.length} Knowledge Platform migration 042 tests passed.\n`)
