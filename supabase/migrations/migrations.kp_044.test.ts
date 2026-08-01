/**
 * Static contract tests for Summary aliases and source relationships.
 *
 * Run:
 *   node --experimental-strip-types supabase/migrations/migrations.kp_044.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationName = '044_kp_summary_relationships.sql'
const migration = readFileSync(join(migrationDir, migrationName), 'utf8')
const sql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

function verifiesIdentityAndDependencies(): void {
  const files = readdirSync(migrationDir).filter((name) => name.endsWith('.sql'))
  for (const required of [
    '038_kp_reference_documents.sql',
    '039_kp_reference_document_versions.sql',
    '040_kp_reference_document_aliases.sql',
    '041_news_gp_exam_requirement.sql',
    '042_kp_summaries_expand.sql',
    '043_kp_summary_versions.sql',
    migrationName,
  ]) {
    assert.ok(files.includes(required), `required migration is missing: ${required}`)
  }
  assert.ok(!files.includes('043_kp_summary_relationships.sql'), 'relationship migration must not collide with production 043')
  assert.match(sql, /set\s+local\s+lock_timeout\s*=\s*'5s'/i)
  for (const dependency of ['summaries', 'summary_versions', 'reference_documents', 'reference_document_versions']) {
    assert.ok(migration.includes(`'${dependency}'`), `missing dependency guard: ${dependency}`)
  }
}

function verifiesExactlyThreeAssignedTables(): void {
  const createdTables = [...sql.matchAll(/create\s+table\s+if\s+not\s+exists\s+public\.(\w+)/gi)].map((match) => match[1])
  assert.deepEqual(createdTables, [
    'summary_aliases',
    'summary_reference_documents',
    'summary_version_reference_documents',
  ])
  assert.ok(!/\bpackage_summaries\s*\(/i.test(sql), '044 must not create PackageSummary')
  assert.ok(!/\bpackage_id\b/i.test(sql), '044 must not add Package integration')
  assert.ok(!/\binsert\s+into\b/i.test(sql), '044 must not backfill data')
  assert.ok(!/\bcreate\s+(?:or\s+replace\s+)?view\b/i.test(sql), '044 must not create read models')
  assert.ok(!/\bcreate\s+(?:or\s+replace\s+)?function\s+public\.(?:publish|attach_package|recommend)/i.test(sql), '044 must not add later workflows or integration')
}

function verifiesAliasContract(): void {
  for (const required of [
    /id\s+uuid\s+not\s+null\s+default\s+uuid_generate_v4\s*\(\s*\)/i,
    /summary_id\s+uuid\s+not\s+null/i,
    /slug\s+text\s+not\s+null/i,
    /redirect_type\s+text\s+not\s+null/i,
    /status\s+text\s+not\s+null\s+default\s+'active'/i,
    /reason\s+text\s+not\s+null/i,
    /created_by\s+uuid\s+not\s+null/i,
    /retired_by\s+uuid\b/i,
    /retired_at\s+timestamptz\b/i,
  ]) {
    assert.match(sql, required)
  }
  for (const value of ['permanent', 'temporary', 'active', 'retired', 'rename', 'merge', 'correction', 'migration']) {
    assert.ok(migration.includes(`'${value}'`), `missing alias vocabulary: ${value}`)
  }
  assert.match(sql, /unique\s*\(slug\)/i)
  assert.match(sql, /slug\s*=\s*lower\s*\(btrim\s*\(slug\)\)/i)
  assert.match(sql, /foreign\s+key\s*\(summary_id\)[\s\S]*?references\s+public\.summaries\s*\(id\)[\s\S]*?on\s+delete\s+restrict/i)
}

function verifiesLiveRelationshipContract(): void {
  for (const column of [
    'summary_id',
    'reference_document_id',
    'reference_document_version_id',
    'role',
    'coverage_note',
    'sort_order',
    'created_by',
    'created_at',
    'updated_at',
  ]) {
    assert.ok(migration.includes(`public.summary_reference_documents.${column}`), `missing live relationship comment: ${column}`)
  }
  assert.match(sql, /role\s+in\s*\('primary',\s*'supporting'\)/i)
  assert.match(
    sql,
    /foreign\s+key\s*\(reference_document_id,\s*reference_document_version_id\)[\s\S]*?references\s+public\.reference_document_versions\s*\(reference_document_id,\s*id\)[\s\S]*?on\s+delete\s+restrict[\s\S]*?deferrable\s+initially\s+deferred/i,
  )
  for (const index of [
    'summary_reference_documents_unpinned_key',
    'summary_reference_documents_pinned_key',
    'summary_reference_documents_summary_order_idx',
    'summary_reference_documents_document_summary_idx',
    'summary_reference_documents_version_idx',
    'summary_reference_documents_summary_role_idx',
  ]) {
    assert.ok(migration.includes(index), `missing live relationship index: ${index}`)
  }
}

function verifiesImmutableSnapshotContract(): void {
  assert.match(
    sql,
    /foreign\s+key\s*\(summary_version_id\)[\s\S]*?references\s+public\.summary_versions\s*\(id\)[\s\S]*?on\s+delete\s+cascade/i,
  )
  assert.match(
    sql,
    /foreign\s+key\s*\(reference_document_id,\s*reference_document_version_id\)[\s\S]*?references\s+public\.reference_document_versions\s*\(reference_document_id,\s*id\)[\s\S]*?on\s+delete\s+restrict/i,
  )
  assert.match(sql, /parent_status\s+in\s*\('published',\s*'retired'\)/i)
  assert.match(sql, /before\s+insert\s+or\s+update\s+or\s+delete\s+on\s+public\.summary_version_reference_documents/i)
  for (const index of [
    'summary_version_reference_documents_unpinned_key',
    'summary_version_reference_documents_pinned_key',
    'summary_version_reference_documents_version_order_idx',
    'summary_version_reference_documents_document_idx',
    'summary_version_reference_documents_source_version_idx',
  ]) {
    assert.ok(migration.includes(index), `missing snapshot index: ${index}`)
  }
}

function verifiesPinnedAndUnpinnedUniqueness(): void {
  for (const table of ['summary_reference_documents', 'summary_version_reference_documents']) {
    assert.match(
      sql,
      new RegExp(`create\\s+unique\\s+index[\\s\\S]*?${table}_unpinned_key[\\s\\S]*?where\\s+reference_document_version_id\\s+is\\s+null`, 'i'),
    )
    assert.match(
      sql,
      new RegExp(`create\\s+unique\\s+index[\\s\\S]*?${table}_pinned_key[\\s\\S]*?where\\s+reference_document_version_id\\s+is\\s+not\\s+null`, 'i'),
    )
  }
}

function verifiesAliasCollisionAndLifecycleGuards(): void {
  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.guard_summary_slug_namespace/i)
  assert.match(sql, /pg_advisory_xact_lock\s*\(hashtextextended\s*\(candidate_slug,\s*0\)\)/i)
  assert.match(sql, /from\s+public\.summaries[\s\S]*?canonical_slug\s*=\s*candidate_slug/i)
  assert.match(sql, /from\s+public\.summary_aliases[\s\S]*?slug\s*=\s*candidate_slug/i)
  for (const trigger of [
    'enforce_summary_alias_transition',
    'protect_summary_alias_identity',
    'guard_summary_alias_slug_namespace',
    'guard_summary_canonical_slug_namespace',
    'handle_updated_at_summary_aliases',
    'handle_updated_at_summary_reference_documents',
    'protect_summary_version_reference_document',
  ]) {
    assert.match(sql, new RegExp(`create\\s+trigger\\s+${trigger}`, 'i'))
  }
}

function verifiesDenyByDefaultRlsAndValidation(): void {
  for (const table of [
    'summary_aliases',
    'summary_reference_documents',
    'summary_version_reference_documents',
  ]) {
    assert.match(sql, new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, 'i'))
  }
  assert.ok(!/\bcreate\s+policy\b/i.test(sql), '044 must enable RLS without policies')
  assert.ok(migration.includes('$kp_summary_relationships_preflight$'))
  assert.ok(migration.includes('$kp_summary_relationships_assertions$'))
  for (const catalog of ['information_schema.columns', 'pg_constraint', 'pg_index', 'pg_trigger', 'pg_policies', 'c.relrowsecurity']) {
    assert.ok(migration.includes(catalog), `044 validation must inspect ${catalog}`)
  }
}

const tests: Array<{ name: string; run: () => void }> = [
  { name: 'production-safe identity and dependencies', run: verifiesIdentityAndDependencies },
  { name: 'exactly three assigned relationship tables', run: verifiesExactlyThreeAssignedTables },
  { name: 'SummaryAlias contract', run: verifiesAliasContract },
  { name: 'live source relationship contract', run: verifiesLiveRelationshipContract },
  { name: 'immutable revision snapshot contract', run: verifiesImmutableSnapshotContract },
  { name: 'pinned and unpinned uniqueness', run: verifiesPinnedAndUnpinnedUniqueness },
  { name: 'alias collision and lifecycle guards', run: verifiesAliasCollisionAndLifecycleGuards },
  { name: 'deny-by-default RLS and fail-closed validation', run: verifiesDenyByDefaultRlsAndValidation },
]

for (const test of tests) {
  test.run()
  process.stdout.write(`✓ ${test.name}\n`)
}

process.stdout.write(`\n${tests.length} Knowledge Platform migration 044 tests passed.\n`)
