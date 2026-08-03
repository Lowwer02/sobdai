import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationName = '058_kp_restrict_direct_writes.sql'
const sql = readFileSync(join(migrationDir, migrationName), 'utf8')
const design = readFileSync(
  join(migrationDir, '..', '..', 'knowledge_platform_sql_migration_design_v1.md'),
  'utf8'
)

const protectedTables = [
  'summaries',
  'summary_versions',
  'summary_aliases',
  'summary_reference_documents',
  'summary_version_reference_documents',
  'package_summaries',
] as const

const persistenceFunctions = [
  'kp_persist_require_actor',
  'kp_persist_create_compatibility_summary',
  'kp_persist_update_compatibility_draft',
  'kp_persist_publish_compatibility_revision',
  'kp_persist_retire_compatibility_revision',
  'kp_persist_reassign_compatibility_package',
  'kp_persist_replace_summary_sources',
  'kp_persist_attach_package_summary',
  'kp_persist_detach_package_summary',
  'kp_persist_register_summary_alias',
] as const

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function verifiesIdentityAndFrozenResponsibility(): void {
  const files = readdirSync(migrationDir)
  const kpNumbered = files
    .filter((name) => /^\d+_kp_.+\.sql$/.test(name))
    .map((name) => Number(name.slice(0, 3)))

  assert.equal(Math.max(...kpNumbered), 58)
  assert.equal(files.filter((name) => /^058_.+\.sql$/.test(name)).length, 1)
  assert.ok(files.includes('057_kp_transactional_persistence_api.sql'))
  assert.match(design, /## 058 — `058_kp_restrict_direct_writes\.sql`/i)
  assert.match(design, /Enforce the single-writer rule after the dual-write application is live/i)
  assert.match(design, /Requires a short Summary editorial freeze/i)
  assert.match(sql, /coexistence writer-boundary enforcement/i)
}

function verifiesDependencyAndScope(): void {
  for (const prerequisite of [
    'public.summaries',
    'public.summary_versions',
    'public.summary_aliases',
    'public.summary_reference_documents',
    'public.summary_version_reference_documents',
    'public.package_summaries',
    'public.kp_can_read_package_summary(uuid,uuid)',
    'public.kp_can_read_summary_version(uuid,uuid)',
    'public.kp_read_summary_route(text,text)',
    'public.kp_persist_create_compatibility_summary',
    'public.kp_persist_publish_compatibility_revision',
  ]) {
    assert.match(sql, new RegExp(escaped(prerequisite), 'i'))
  }

  assert.doesNotMatch(sql, /create\s+table|alter\s+table|create\s+(?:unique\s+)?index/i)
  assert.doesNotMatch(sql, /\binsert\s+into\s+(?:public\.|kp_migration\.)/i)
  assert.doesNotMatch(sql, /\b(?:call|select)\s+public\.kp_persist_/i)
  assert.doesNotMatch(sql, /recommendation engine|assessment engine|cutover execution|legacy cleanup/i)
  assert.match(sql, /no tables, columns, indexes, domain rows, migration-ledger rows/i)
  assert.match(sql, /ReferenceDocument roots\/versions\/aliases remain/i)
}

function verifiesWriterFenceAndTriggers(): void {
  const guardBlock = sql.match(
    /create\s+or\s+replace\s+function\s+public\.kp_enforce_summary_writer_boundary\(\)[\s\S]*?as\s+\$function\$[\s\S]*?\$function\$/i
  )?.[0]
  assert.ok(guardBlock)
  assert.match(guardBlock, /returns\s+trigger/i)
  assert.match(guardBlock, /security\s+invoker/i)
  assert.match(guardBlock, /set\s+search_path\s*=\s*pg_catalog,\s*public,\s*pg_temp/i)
  assert.match(guardBlock, /set\s+lock_timeout\s*=\s*'5s'/i)
  assert.match(guardBlock, /service_role/i)
  assert.match(guardBlock, /insufficient_privilege/i)
  assert.match(guardBlock, /pg_get_userbyid\(p\.proowner\)/i)

  for (const tableName of protectedTables) {
    assert.match(
      sql,
      new RegExp(
        `create\\s+trigger\\s+kp_single_writer_boundary[\\s\\S]*?on\\s+public\\.${escaped(tableName)}[\\s\\S]*?execute\\s+function\\s+public\\.kp_enforce_summary_writer_boundary`,
        'i'
      )
    )
  }

  assert.match(sql, /drop\s+policy\s+if\s+exists\s+"Admins can manage summaries\."/i)
  assert.match(sql, /drop\s+policy\s+if\s+exists\s+"Content managers can manage summaries\."/i)
  assert.match(sql, /drop\s+policy\s+if\s+exists\s+kp_editor_insert/i)
  assert.match(sql, /drop\s+policy\s+if\s+exists\s+kp_editor_update/i)
  assert.match(sql, /revoke\s+insert,\s*update,\s*delete,\s*truncate[\s\S]*from\s+public,\s*anon,\s*authenticated/i)
  assert.match(sql, /grant\s+select,\s*insert,\s*update,\s*delete[\s\S]*to\s+service_role/i)
}

function verifiesReconciliationAndSecurity(): void {
  const reconcileBlock = sql.match(
    /create\s+or\s+replace\s+function\s+public\.kp_reconcile_writer_boundary\(\)[\s\S]*?as\s+\$function\$[\s\S]*?\$function\$/i
  )?.[0]
  assert.ok(reconcileBlock)
  assert.match(reconcileBlock, /returns\s+jsonb/i)
  assert.match(reconcileBlock, /language\s+sql/i)
  assert.match(reconcileBlock, /stable/i)
  assert.match(reconcileBlock, /security\s+definer/i)
  assert.match(reconcileBlock, /pg_policies/i)
  assert.match(reconcileBlock, /has_table_privilege/i)
  assert.match(reconcileBlock, /catalog-only/i)

  assert.match(sql, /revoke\s+all\s+on\s+function\s+public\.kp_reconcile_writer_boundary\(\)[\s\S]*from\s+public,\s*anon,\s*authenticated/i)
  assert.match(sql, /grant\s+execute\s+on\s+function\s+public\.kp_reconcile_writer_boundary\(\)[\s\S]*to\s+service_role/i)
  assert.match(sql, /provolatile\s*=\s*'s'/i)
  assert.match(sql, /notify\s+pgrst,\s*'reload schema'/i)

  for (const functionName of persistenceFunctions) {
    assert.match(sql, new RegExp(escaped(functionName), 'i'))
  }
  assert.match(sql, /service-role-only persistence execution/i)
  assert.match(sql, /SECURITY DEFINER commands and controlled migration operators remain allowed/i)
}

function verifiesFeatureGateAndNoApplicationDrift(): void {
  assert.match(sql, /kp_dual_write_summary/i)
  assert.match(sql, /kp_dual_write_publish/i)
  assert.match(sql, /target-only reuse/i)
  assert.match(sql, /zero unexplained drift/i)
  assert.match(sql, /Flags are application-owned/i)
  assert.match(sql, /are deliberately not stored or toggled by SQL/i)
  assert.match(sql, /Application Layer/i)
  assert.match(sql, /ReferenceDocument persistence command/i)
}

const tests = [
  ['identity and frozen responsibility', verifiesIdentityAndFrozenResponsibility],
  ['dependency and scope', verifiesDependencyAndScope],
  ['writer fence and triggers', verifiesWriterFenceAndTriggers],
  ['reconciliation and security', verifiesReconciliationAndSecurity],
  ['feature gates and application boundary', verifiesFeatureGateAndNoApplicationDrift],
] as const

for (const [name, run] of tests) {
  run()
  process.stdout.write(`✓ ${name}\n`)
}

process.stdout.write(`\n${tests.length} Knowledge Platform migration 058 tests passed.\n`)
