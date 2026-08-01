/**
 * Static contract tests for Knowledge Platform migration 038.
 *
 * The repository has no local Supabase/PostgreSQL runtime, so these tests pin
 * the frozen SQL shape, access boundary, and migration scope without executing
 * the migration against a database.
 *
 * Run:
 *   node --experimental-strip-types supabase/migrations/migrations.kp_038.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationName = '038_kp_reference_documents.sql'
const migration = readFileSync(join(migrationDir, migrationName), 'utf8')
const sql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

function verifiesSequentialIdentityAndPrerequisites(): void {
  const files = readdirSync(migrationDir).filter((name) => name.endsWith('.sql'))
  for (const predecessor of [
    '035_kp_preflight_guards.sql',
    '036_kp_migration_control.sql',
    '037_news_cta_config.sql',
  ]) {
    assert.ok(files.includes(predecessor), `required predecessor is missing: ${predecessor}`)
  }
  assert.ok(files.includes(migrationName), 'migration 038 must use its canonical sequential identity')
}

function verifies038ScopeOnly(): void {
  assert.match(sql, /create\s+table\s+if\s+not\s+exists\s+public\.reference_documents/i)
  for (const forbiddenTable of [
    'reference_document_versions',
    'reference_document_aliases',
    'summaries',
    'summary_versions',
    'package_summaries',
  ]) {
    assert.ok(
      !new RegExp(`create\\s+table[\\s\\S]*?public\\.${forbiddenTable}\\b`, 'i').test(sql),
      `038 must not create future table public.${forbiddenTable}`,
    )
  }
  assert.ok(!/\binsert\s+into\b/i.test(sql), '038 must not insert domain data')
}

function verifiesFrozenColumnsAndAuditShape(): void {
  for (const required of [
    /id\s+uuid\s+not\s+null\s+default\s+uuid_generate_v4\s*\(\s*\)/i,
    /document_code\s+text\s+not\s+null/i,
    /canonical_title\s+text\s+not\s+null/i,
    /short_title\s+text\b/i,
    /document_type\s+text\s+not\s+null/i,
    /issuer\s+text\s+not\s+null/i,
    /jurisdiction\s+text\s+not\s+null/i,
    /source_homepage_url\s+text\b/i,
    /lifecycle_status\s+text\s+not\s+null\s+default\s+'active'/i,
    /superseded_by_document_id\s+uuid\b/i,
    /created_by\s+uuid\s+not\s+null/i,
    /created_at\s+timestamptz\s+not\s+null\s+default\s+now\s*\(\s*\)/i,
    /updated_at\s+timestamptz\s+not\s+null\s+default\s+now\s*\(\s*\)/i,
    /archived_at\s+timestamptz\b/i,
    /archived_by\s+uuid\b/i,
  ]) {
    assert.match(sql, required)
  }
}

function verifiesKeysAndLifecycleConstraints(): void {
  for (const constraint of [
    'reference_documents_pkey',
    'reference_documents_document_code_key',
    'reference_documents_document_code_check',
    'reference_documents_required_text_check',
    'reference_documents_lifecycle_status_check',
    'reference_documents_not_self_superseding_check',
    'reference_documents_supersession_check',
    'reference_documents_archive_check',
  ]) {
    assert.ok(migration.includes(constraint), `missing frozen constraint: ${constraint}`)
  }

  for (const status of ['active', 'superseded', 'repealed', 'archived']) {
    assert.ok(migration.includes(`'${status}'`), `missing ReferenceDocument lifecycle value: ${status}`)
  }

  assert.match(
    sql,
    /foreign\s+key\s*\(superseded_by_document_id\)[\s\S]*?references\s+public\.reference_documents\s*\(id\)[\s\S]*?on\s+delete\s+restrict[\s\S]*?deferrable\s+initially\s+deferred/i,
  )
  for (const actor of ['created_by', 'archived_by']) {
    assert.match(
      sql,
      new RegExp(`foreign\\s+key\\s*\\(${actor}\\)[\\s\\S]*?references\\s+public\\.profiles\\s*\\(id\\)[\\s\\S]*?on\\s+delete\\s+set\\s+null`, 'i'),
    )
  }
}

function verifiesFrozenIndexes(): void {
  for (const index of [
    'reference_documents_document_code_key',
    'reference_documents_lifecycle_type_idx',
    'reference_documents_issuer_lifecycle_idx',
    'reference_documents_superseded_by_idx',
  ]) {
    assert.ok(migration.includes(index), `missing frozen index: ${index}`)
  }
  assert.match(
    sql,
    /reference_documents_superseded_by_idx[\s\S]*?where\s+superseded_by_document_id\s+is\s+not\s+null/i,
  )
}

function verifiesAllocatorAndImmutability(): void {
  assert.match(sql, /create\s+sequence\s+if\s+not\s+exists\s+public\.reference_document_code_seq/i)
  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.format_reference_document_code\s*\(seq_value\s+bigint\)/i)
  assert.match(sql, /'DOC-'\s*\|\|\s*lpad\s*\(seq_value::text,\s*6,\s*'0'\)/i)
  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.allocate_reference_document_codes\s*\(n\s+integer\)/i)
  assert.match(sql, /create\s+trigger\s+protect_reference_document_code/i)
  assert.match(sql, /new\.document_code\s+is\s+distinct\s+from\s+old\.document_code/i)
  assert.match(sql, /create\s+trigger\s+handle_updated_at_reference_documents/i)
}

function verifiesDenyByDefaultRls(): void {
  assert.match(
    sql,
    /alter\s+table\s+public\.reference_documents\s+enable\s+row\s+level\s+security/i,
  )
  assert.ok(!/\bcreate\s+policy\b/i.test(sql), '038 must enable RLS without creating policies')
  assert.match(
    sql,
    /revoke\s+all\s+on\s+table\s+public\.reference_documents\s+from\s+public,\s*anon,\s*authenticated/i,
  )
  assert.ok(
    !/grant[\s\S]*?\bto\s+(?:anon|authenticated)\b/i.test(sql),
    '038 must not grant dormant ReferenceDocument access to browser roles',
  )
}

function verifiesFailClosedValidation(): void {
  assert.ok(migration.includes('$kp_reference_documents_assertions$'))
  for (const requiredCatalog of [
    'information_schema.columns',
    'pg_constraint',
    'pg_index',
    'pg_sequence',
    'pg_trigger',
    'pg_policies',
    'c.relrowsecurity',
  ]) {
    assert.ok(migration.includes(requiredCatalog), `migration validation must inspect ${requiredCatalog}`)
  }
}

const tests: Array<{ name: string; run: () => void }> = [
  { name: 'sequential identity and prerequisites', run: verifiesSequentialIdentityAndPrerequisites },
  { name: '038 scope only', run: verifies038ScopeOnly },
  { name: 'frozen columns and audit shape', run: verifiesFrozenColumnsAndAuditShape },
  { name: 'keys and lifecycle constraints', run: verifiesKeysAndLifecycleConstraints },
  { name: 'frozen indexes', run: verifiesFrozenIndexes },
  { name: 'allocator and immutability', run: verifiesAllocatorAndImmutability },
  { name: 'deny-by-default RLS', run: verifiesDenyByDefaultRls },
  { name: 'fail-closed validation', run: verifiesFailClosedValidation },
]

for (const test of tests) {
  test.run()
  process.stdout.write(`✓ ${test.name}\n`)
}

process.stdout.write(`\n${tests.length} Knowledge Platform migration 038 tests passed.\n`)
