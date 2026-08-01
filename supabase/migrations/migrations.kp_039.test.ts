/**
 * Static contract tests for Knowledge Platform migration 039.
 *
 * Run:
 *   node --experimental-strip-types supabase/migrations/migrations.kp_039.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationName = '039_kp_reference_document_versions.sql'
const migration = readFileSync(join(migrationDir, migrationName), 'utf8')
const sql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

function verifiesSequentialIdentityAnd038Dependency(): void {
  const files = readdirSync(migrationDir).filter((name) => name.endsWith('.sql'))
  for (const required of [
    '037_news_cta_config.sql',
    '038_kp_reference_documents.sql',
    migrationName,
  ]) {
    assert.ok(files.includes(required), `required migration is missing: ${required}`)
  }
  assert.match(sql, /to_regclass\s*\(\s*'public\.reference_documents'\s*\)/i)
  assert.ok(migration.includes('reference_documents_pkey'))
}

function verifies039ScopeOnly(): void {
  assert.match(sql, /create\s+table\s+if\s+not\s+exists\s+public\.reference_document_versions/i)
  for (const forbiddenTable of [
    'reference_document_aliases',
    'summaries',
    'summary_versions',
    'summary_reference_documents',
    'package_summaries',
  ]) {
    assert.ok(
      !new RegExp(`create\\s+table[\\s\\S]*?public\\.${forbiddenTable}\\b`, 'i').test(sql),
      `039 must not create future table public.${forbiddenTable}`,
    )
  }
  assert.ok(!/\binsert\s+into\b/i.test(sql), '039 must not insert source-version data')
  assert.ok(!/alter\s+table\s+public\.reference_documents\b/i.test(sql), '039 must not modify migration 038')
}

function verifiesFrozenVersionColumns(): void {
  for (const required of [
    /id\s+uuid\s+not\s+null\s+default\s+uuid_generate_v4\s*\(\s*\)/i,
    /reference_document_id\s+uuid\s+not\s+null/i,
    /version_label\s+text\s+not\s+null/i,
    /status\s+text\s+not\s+null\s+default\s+'draft'/i,
    /publication_date\s+date\b/i,
    /effective_from_date\s+date\b/i,
    /effective_to_date\s+date\b/i,
    /source_url\s+text\b/i,
    /storage_bucket\s+text\b/i,
    /storage_path\s+text\b/i,
    /media_type\s+text\b/i,
    /byte_size\s+bigint\b/i,
    /content_checksum\s+text\b/i,
    /supersedes_version_id\s+uuid\b/i,
    /verification_method\s+text\b/i,
    /verified_by\s+uuid\b/i,
    /verified_at\s+timestamptz\b/i,
    /created_by\s+uuid\s+not\s+null/i,
    /created_at\s+timestamptz\s+not\s+null\s+default\s+now\s*\(\s*\)/i,
    /updated_at\s+timestamptz\s+not\s+null\s+default\s+now\s*\(\s*\)/i,
    /withdrawn_by\s+uuid\b/i,
    /withdrawn_at\s+timestamptz\b/i,
    /withdrawal_reason\s+text\b/i,
  ]) {
    assert.match(sql, required)
  }
}

function verifiesKeysAndSameParentRelationships(): void {
  for (const constraint of [
    'reference_document_versions_pkey',
    'reference_document_versions_parent_label_key',
    'reference_document_versions_parent_id_key',
    'reference_document_versions_parent_fkey',
    'reference_document_versions_supersedes_fkey',
  ]) {
    assert.ok(migration.includes(constraint), `missing relationship constraint: ${constraint}`)
  }
  assert.match(sql, /unique\s*\(reference_document_id,\s*version_label\)/i)
  assert.match(sql, /unique\s*\(reference_document_id,\s*id\)/i)
  assert.match(
    sql,
    /foreign\s+key\s*\(reference_document_id\)[\s\S]*?references\s+public\.reference_documents\s*\(id\)[\s\S]*?on\s+delete\s+restrict/i,
  )
  assert.match(
    sql,
    /foreign\s+key\s*\(reference_document_id,\s*supersedes_version_id\)[\s\S]*?references\s+public\.reference_document_versions\s*\(reference_document_id,\s*id\)[\s\S]*?on\s+delete\s+restrict[\s\S]*?deferrable\s+initially\s+deferred/i,
  )
  for (const actor of ['verified_by', 'created_by', 'withdrawn_by']) {
    assert.match(
      sql,
      new RegExp(`foreign\\s+key\\s*\\(${actor}\\)[\\s\\S]*?references\\s+public\\.profiles\\s*\\(id\\)[\\s\\S]*?on\\s+delete\\s+set\\s+null`, 'i'),
    )
  }
}

function verifiesLifecycleAndVerificationSemantics(): void {
  for (const status of ['draft', 'verified', 'superseded', 'withdrawn']) {
    assert.ok(migration.includes(`'${status}'`), `missing version status: ${status}`)
  }
  for (const constraint of [
    'reference_document_versions_status_check',
    'reference_document_versions_effective_dates_check',
    'reference_document_versions_storage_pair_check',
    'reference_document_versions_storage_metadata_check',
    'reference_document_versions_verification_audit_check',
    'reference_document_versions_verified_semantics_check',
    'reference_document_versions_not_self_superseding_check',
    'reference_document_versions_withdrawal_check',
  ]) {
    assert.ok(migration.includes(constraint), `missing lifecycle constraint: ${constraint}`)
  }
  for (const requiredEvidence of [
    'content_checksum is not null',
    'verification_method is not null',
    'verified_by is not null',
    'verified_at is not null',
  ]) {
    assert.ok(migration.includes(requiredEvidence), `verified source evidence missing: ${requiredEvidence}`)
  }
}

function verifiesImmutableVersionTriggers(): void {
  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.enforce_reference_document_version_transition/i)
  for (const transition of [
    /old\.status\s*=\s*'draft'\s+and\s+new\.status\s+in\s*\('verified',\s*'withdrawn'\)/i,
    /old\.status\s*=\s*'verified'\s+and\s+new\.status\s+in\s*\('superseded',\s*'withdrawn'\)/i,
    /old\.status\s*=\s*'superseded'\s+and\s+new\.status\s*=\s*'withdrawn'/i,
  ]) {
    assert.match(sql, transition)
  }
  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.protect_reference_document_version/i)
  assert.match(sql, /old\.status\s+in\s*\('verified',\s*'superseded',\s*'withdrawn'\)/i)
  for (const protectedField of [
    'new.reference_document_id',
    'new.version_label',
    'new.storage_path',
    'new.content_checksum',
    'new.supersedes_version_id',
    'new.verification_method',
    'new.verified_by',
    'new.verified_at',
  ]) {
    assert.ok(migration.includes(protectedField), `immutable field missing from trigger: ${protectedField}`)
  }
  for (const trigger of [
    'enforce_reference_document_version_transition',
    'protect_reference_document_version',
    'handle_updated_at_reference_document_versions',
  ]) {
    assert.match(sql, new RegExp(`create\\s+trigger\\s+${trigger}`, 'i'))
  }
}

function verifiesFrozenIndexes(): void {
  for (const index of [
    'reference_document_versions_parent_label_key',
    'reference_document_versions_parent_id_key',
    'reference_document_versions_parent_status_effective_idx',
    'reference_document_versions_supersedes_idx',
    'reference_document_versions_checksum_idx',
    'reference_document_versions_status_verified_idx',
  ]) {
    assert.ok(migration.includes(index), `missing frozen version index: ${index}`)
  }
  assert.match(sql, /reference_document_versions_checksum_idx[\s\S]*?where\s+content_checksum\s+is\s+not\s+null/i)
  assert.ok(!/create\s+unique\s+index[\s\S]*?content_checksum/i.test(sql), 'checksum index must not be unique')
}

function verifiesDenyByDefaultRlsAndValidation(): void {
  assert.match(
    sql,
    /alter\s+table\s+public\.reference_document_versions\s+enable\s+row\s+level\s+security/i,
  )
  assert.ok(!/\bcreate\s+policy\b/i.test(sql), '039 must enable RLS without policies')
  assert.match(
    sql,
    /revoke\s+all\s+on\s+table\s+public\.reference_document_versions\s+from\s+public,\s*anon,\s*authenticated/i,
  )
  assert.ok(migration.includes('$kp_reference_versions_assertions$'))
  for (const catalog of [
    'information_schema.columns',
    'pg_constraint',
    'pg_index',
    'pg_trigger',
    'pg_policies',
    'c.relrowsecurity',
  ]) {
    assert.ok(migration.includes(catalog), `039 validation must inspect ${catalog}`)
  }
}

const tests: Array<{ name: string; run: () => void }> = [
  { name: 'sequential identity and 038 dependency', run: verifiesSequentialIdentityAnd038Dependency },
  { name: '039 scope only', run: verifies039ScopeOnly },
  { name: 'frozen version columns', run: verifiesFrozenVersionColumns },
  { name: 'keys and same-parent relationships', run: verifiesKeysAndSameParentRelationships },
  { name: 'lifecycle and verification semantics', run: verifiesLifecycleAndVerificationSemantics },
  { name: 'immutable version triggers', run: verifiesImmutableVersionTriggers },
  { name: 'frozen indexes', run: verifiesFrozenIndexes },
  { name: 'deny-by-default RLS and validation', run: verifiesDenyByDefaultRlsAndValidation },
]

for (const test of tests) {
  test.run()
  process.stdout.write(`✓ ${test.name}\n`)
}

process.stdout.write(`\n${tests.length} Knowledge Platform migration 039 tests passed.\n`)
