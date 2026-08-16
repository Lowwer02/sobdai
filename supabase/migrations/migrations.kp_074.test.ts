import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationName = '074_kp_schema_qualified_uuid_generation.sql'
const sql = readFileSync(join(migrationDir, migrationName), 'utf8')
const earlierMigrations = [
  '067_kp_summary_bank_compatibility_marker.sql',
  '068_kp_summary_bank_compatibility_writer_core.sql',
  '069_kp_summary_bank_compatibility_publication.sql',
  '070_kp_summary_bank_compatibility_delete.sql',
  '071_kp_summary_bank_compatibility_import.sql',
  '072_kp_summary_bank_compatibility_edit.sql',
  '073_kp_summary_admin_staff_read.sql',
].map((name) => readFileSync(join(migrationDir, name), 'utf8'))

const affectedSignatures = [
  'public.kp_persist_publish_compatibility_revision(uuid,uuid,uuid,jsonb)',
  'public.kp_persist_register_summary_alias(uuid,text,text,text,uuid)',
  'public.kp_persist_replace_compatibility_summary(uuid,uuid,text,uuid,text,text,text,text,text,text,text,integer,text,text,text,uuid,integer,integer,boolean)',
  'public.kp_persist_replace_summary_sources(uuid,jsonb,uuid)',
  'public.kp_persist_update_compatibility_summary(uuid,uuid,text,text,text,text,text,text,text,text,integer,text,text,text,uuid,integer,integer,text,uuid[])',
]

function verifiesMigrationAndPrerequisites(): void {
  const files = readdirSync(migrationDir)
  assert.equal(files.filter((name) => name === migrationName).length, 1)
  assert.match(sql, /to_regnamespace\('extensions'\)/i)
  assert.match(sql, /to_regprocedure\('extensions\.uuid_generate_v4\(\)'\)/i)
  assert.match(sql, /kp_uuid_generation_preflight/i)
  assert.match(sql, /kp_uuid_generation_postflight/i)
}

function verifiesExactAffectedSurface(): void {
  for (const signature of affectedSignatures) {
    const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    assert.match(sql, new RegExp(escaped, 'i'), `074 omitted ${signature}`)
  }

  assert.match(sql, /'public\.uuid_generate_v4\(\)'\s*,\s*'__KP_074_UUID_GENERATOR__'/i)
  assert.match(sql, /'uuid_generate_v4\(\)'\s*,\s*'__KP_074_UUID_GENERATOR__'/i)
  assert.match(sql, /'__KP_074_UUID_GENERATOR__'\s*,\s*'extensions\.uuid_generate_v4\(\)'/i)
  assert.match(sql, /pg_catalog\.pg_get_functiondef\(to_regprocedure\(v_signature\)\)/i)
  assert.match(sql, /execute\s+pg_catalog\.replace/i)
  assert.doesNotMatch(sql, /create\s+(?:or\s+replace\s+)?function\s+public\./i)
}

function verifiesLockedSecurityAndGrantContract(): void {
  assert.match(sql, /p\.proowner\s*=\s*v_api_owner/i)
  assert.match(sql, /p\.prosecdef/i)
  assert.match(sql, /search_path=pg_catalog, public, pg_temp/i)
  assert.match(sql, /lock_timeout=5s/i)
  assert.match(sql, /has_function_privilege\('public'/i)
  assert.match(sql, /has_function_privilege\('anon'/i)
  assert.match(sql, /has_function_privilege\('authenticated'/i)
  assert.match(sql, /has_function_privilege\('service_role'/i)
  assert.doesNotMatch(sql, /search_path[^;\n]*extensions/i)
}

function verifiesNoUnqualifiedPostflightSurfaceOrDml(): void {
  assert.match(sql, /extensions\.uuid_generate_v4\(\)/i)
  assert.match(sql, /v_unqualified_definition/i)
  assert.match(sql, /kp_persist_%/i)
  assert.doesNotMatch(sql, /insert\s+into\s+public\./i)
  assert.doesNotMatch(sql, /update\s+public\./i)
  assert.doesNotMatch(sql, /delete\s+from\s+public\./i)
  assert.doesNotMatch(sql, /alter\s+table/i)
  assert.doesNotMatch(sql, /create\s+(?:table|index)/i)
}

function verifiesEarlierMigrationsRemainOutside074Scope(): void {
  for (const earlierMigration of earlierMigrations) {
    assert.doesNotMatch(earlierMigration, /kp_uuid_generation_(?:preflight|replace|postflight)/i)
  }

  // The latest authoritative definitions remain owned by their original
  // migrations; 074 only resolves the installed catalog definitions forward.
  assert.match(earlierMigrations[1]!, /kp_persist_replace_summary_sources|kp_persist_register_summary_alias/i)
  assert.match(earlierMigrations[2]!, /kp_persist_publish_compatibility_revision/i)
  assert.match(earlierMigrations[4]!, /kp_persist_replace_compatibility_summary/i)
  assert.match(earlierMigrations[5]!, /kp_persist_update_compatibility_summary/i)
}

const tests = [
  ['migration and prerequisites', verifiesMigrationAndPrerequisites],
  ['exact affected surface', verifiesExactAffectedSurface],
  ['locked security and grant contract', verifiesLockedSecurityAndGrantContract],
  ['no remaining unqualified surface or DML', verifiesNoUnqualifiedPostflightSurfaceOrDml],
  ['067-073 remain outside 074 scope', verifiesEarlierMigrationsRemainOutside074Scope],
] as const

for (const [name, run] of tests) {
  run()
  process.stdout.write(`✓ ${name}\n`)
}

process.stdout.write(`\n${tests.length} Knowledge Platform migration 074 tests passed.\n`)
