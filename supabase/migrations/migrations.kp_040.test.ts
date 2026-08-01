/**
 * Static contract tests for Knowledge Platform migration 040.
 *
 * Run:
 *   node --experimental-strip-types supabase/migrations/migrations.kp_040.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationName = '040_kp_reference_document_aliases.sql'
const migration = readFileSync(join(migrationDir, migrationName), 'utf8')
const sql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

function verifiesSequentialIdentityAndDependencies(): void {
  const files = readdirSync(migrationDir).filter((name) => name.endsWith('.sql'))
  for (const required of [
    '038_kp_reference_documents.sql',
    '039_kp_reference_document_versions.sql',
    migrationName,
  ]) {
    assert.ok(files.includes(required), `required migration is missing: ${required}`)
  }
  assert.match(sql, /to_regclass\s*\(\s*'public\.reference_documents'\s*\)/i)
  assert.match(sql, /to_regclass\s*\(\s*'public\.reference_document_versions'\s*\)/i)
}

function verifies040ScopeOnly(): void {
  assert.match(sql, /create\s+table\s+if\s+not\s+exists\s+public\.reference_document_aliases/i)
  for (const forbiddenTable of [
    'summaries',
    'summary_versions',
    'summary_aliases',
    'summary_reference_documents',
    'package_summaries',
  ]) {
    assert.ok(
      !new RegExp(`create\\s+table[\\s\\S]*?public\\.${forbiddenTable}\\b`, 'i').test(sql),
      `040 must not create migration 041+ table public.${forbiddenTable}`,
    )
  }
  assert.ok(!/\binsert\s+into\b/i.test(sql), '040 must not insert aliases')
  assert.ok(!/alter\s+table\s+public\.reference_documents\b/i.test(sql), '040 must not modify migration 038')
  assert.ok(!/alter\s+table\s+public\.reference_document_versions\b/i.test(sql), '040 must not modify migration 039')
}

function verifiesFrozenAliasColumns(): void {
  for (const required of [
    /id\s+uuid\s+not\s+null\s+default\s+uuid_generate_v4\s*\(\s*\)/i,
    /reference_document_id\s+uuid\s+not\s+null/i,
    /alias_type\s+text\s+not\s+null/i,
    /alias_value\s+text\s+not\s+null/i,
    /normalized_value\s+text\s+not\s+null/i,
    /status\s+text\s+not\s+null\s+default\s+'active'/i,
    /reason\s+text\s+not\s+null/i,
    /created_by\s+uuid\s+not\s+null/i,
    /created_at\s+timestamptz\s+not\s+null\s+default\s+now\s*\(\s*\)/i,
    /updated_at\s+timestamptz\s+not\s+null\s+default\s+now\s*\(\s*\)/i,
    /retired_by\s+uuid\b/i,
    /retired_at\s+timestamptz\b/i,
  ]) {
    assert.match(sql, required)
  }
}

function verifiesDirectTargetAndActorFks(): void {
  assert.match(
    sql,
    /foreign\s+key\s*\(reference_document_id\)[\s\S]*?references\s+public\.reference_documents\s*\(id\)[\s\S]*?on\s+delete\s+restrict/i,
  )
  for (const actor of ['created_by', 'retired_by']) {
    assert.match(
      sql,
      new RegExp(`foreign\\s+key\\s*\\(${actor}\\)[\\s\\S]*?references\\s+public\\.profiles\\s*\\(id\\)[\\s\\S]*?on\\s+delete\\s+set\\s+null`, 'i'),
    )
  }
  assert.ok(!/alias_(?:target|parent)_id/i.test(sql), 'alias chains must not be representable')
  assert.ok(!/references\s+public\.reference_document_aliases/i.test(sql), 'aliases must target documents directly')
}

function verifiesCanonicalAliasRules(): void {
  for (const aliasType of ['code', 'title', 'legacy_key']) {
    assert.ok(migration.includes(`'${aliasType}'`), `missing alias type: ${aliasType}`)
  }
  for (const status of ['active', 'retired']) {
    assert.ok(migration.includes(`'${status}'`), `missing alias lifecycle state: ${status}`)
  }
  for (const constraint of [
    'reference_document_aliases_pkey',
    'reference_document_aliases_type_normalized_key',
    'reference_document_aliases_type_check',
    'reference_document_aliases_status_check',
    'reference_document_aliases_required_text_check',
    'reference_document_aliases_normalized_value_check',
    'reference_document_aliases_retirement_check',
  ]) {
    assert.ok(migration.includes(constraint), `missing alias constraint: ${constraint}`)
  }
  assert.match(sql, /unique\s*\(alias_type,\s*normalized_value\)/i)
  assert.match(sql, /normalized_value\s*=\s*lower\s*\(btrim\s*\(normalized_value\)\)/i)
}

function verifiesStableLocatorAndRetirementTriggers(): void {
  assert.match(sql, /old\.status\s*=\s*'active'\s+and\s+new\.status\s*=\s*'retired'/i)
  for (const immutableField of [
    'new.reference_document_id',
    'new.alias_type',
    'new.normalized_value',
    'new.created_by',
    'new.created_at',
  ]) {
    assert.ok(migration.includes(immutableField), `immutable alias field missing: ${immutableField}`)
  }
  assert.match(sql, /old\.status\s*=\s*'retired'[\s\S]*?new\.retired_by[\s\S]*?new\.retired_at/i)
  for (const trigger of [
    'enforce_reference_document_alias_transition',
    'protect_reference_document_alias_identity',
    'handle_updated_at_reference_document_aliases',
  ]) {
    assert.match(sql, new RegExp(`create\\s+trigger\\s+${trigger}`, 'i'))
  }
}

function verifiesIndexesAndNonReuse(): void {
  for (const index of [
    'reference_document_aliases_type_normalized_key',
    'reference_document_aliases_document_status_idx',
  ]) {
    assert.ok(migration.includes(index), `missing frozen alias index: ${index}`)
  }
  assert.match(sql, /x\.indisunique[\s\S]*?x\.indpred\s+is\s+null/i)
  assert.ok(
    !/create\s+unique\s+index[\s\S]*?where\s+status\s*=\s*'active'/i.test(sql),
    'retired aliases must remain inside the uniqueness boundary',
  )
}

function verifiesDenyByDefaultRlsAndValidation(): void {
  assert.match(
    sql,
    /alter\s+table\s+public\.reference_document_aliases\s+enable\s+row\s+level\s+security/i,
  )
  assert.ok(!/\bcreate\s+policy\b/i.test(sql), '040 must enable RLS without policies')
  assert.match(
    sql,
    /revoke\s+all\s+on\s+table\s+public\.reference_document_aliases\s+from\s+public,\s*anon,\s*authenticated/i,
  )
  assert.ok(migration.includes('$kp_reference_aliases_assertions$'))
  for (const catalog of [
    'information_schema.columns',
    'pg_constraint',
    'pg_index',
    'pg_trigger',
    'pg_policies',
    'c.relrowsecurity',
  ]) {
    assert.ok(migration.includes(catalog), `040 validation must inspect ${catalog}`)
  }
}

const tests: Array<{ name: string; run: () => void }> = [
  { name: 'sequential identity and dependencies', run: verifiesSequentialIdentityAndDependencies },
  { name: '040 scope only', run: verifies040ScopeOnly },
  { name: 'frozen alias columns', run: verifiesFrozenAliasColumns },
  { name: 'direct target and actor FKs', run: verifiesDirectTargetAndActorFks },
  { name: 'canonical alias rules', run: verifiesCanonicalAliasRules },
  { name: 'stable locator and retirement triggers', run: verifiesStableLocatorAndRetirementTriggers },
  { name: 'indexes and locator non-reuse', run: verifiesIndexesAndNonReuse },
  { name: 'deny-by-default RLS and validation', run: verifiesDenyByDefaultRlsAndValidation },
]

for (const test of tests) {
  test.run()
  process.stdout.write(`✓ ${test.name}\n`)
}

process.stdout.write(`\n${tests.length} Knowledge Platform migration 040 tests passed.\n`)
