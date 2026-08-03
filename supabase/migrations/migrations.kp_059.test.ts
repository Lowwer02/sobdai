import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationName = '059_kp_cleanup_readiness_guards.sql'
const sql = readFileSync(join(migrationDir, migrationName), 'utf8')
const design = readFileSync(
  join(migrationDir, '..', '..', 'knowledge_platform_sql_migration_design_v1.md'),
  'utf8'
)
const executable = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function verifiesIdentityAndFrozenResponsibility(): void {
  const files = readdirSync(migrationDir)
  const kpNumbered = files
    .filter((name) => /^\d+_kp_.+\.sql$/.test(name))
    .map((name) => Number(name.slice(0, 3)))

  assert.equal(Math.max(...kpNumbered), 59)
  assert.equal(files.filter((name) => /^059_.+\.sql$/.test(name)).length, 1)
  assert.ok(files.includes('058_kp_restrict_direct_writes.sql'))
  assert.match(design, /## 059 — `059_kp_cleanup_readiness_guards\.sql`/i)
  assert.match(design, /Abort cleanup unless target authority, zero legacy dependency, URL parity, and reconciliation criteria are proven/i)
  assert.match(sql, /fail-closed evidence surface/i)
}

function verifiesDependenciesAndReadOnlyScope(): void {
  for (const prerequisite of [
    'kp_migration.migration_runs',
    'kp_migration.summary_ledger',
    'kp_migration.batch_progress',
    'public.summaries',
    'public.package_summaries',
    'public.summary_versions',
    'public.summary_aliases',
    'public.kp_read_summary_route(text,text)',
    'public.kp_enforce_summary_writer_boundary()',
    'public.kp_reconcile_writer_boundary()',
    'kp_migration.reconcile_final_unique_indexes()',
    'kp_migration.reconcile_curated_reference_documents(uuid)',
    'kp_migration.reconcile_initial_summary_versions(uuid)',
    'kp_migration.reconcile_current_summary_pointers(uuid)',
    'kp_migration.reconcile_package_summary_placements(uuid)',
    'kp_migration.reconcile_curated_summary_aliases(uuid)',
  ]) {
    assert.match(executable, new RegExp(escaped(prerequisite), 'i'))
  }

  for (const projection of [
    'kp_read_admin_library',
    'kp_read_summary_picker',
    'kp_read_package_summaries',
    'kp_read_news_summaries',
    'kp_read_recommendation_store',
  ]) {
    assert.match(executable, new RegExp(projection, 'i'))
  }

  assert.doesNotMatch(executable, /create\s+table|alter\s+table|create\s+(?:unique\s+)?index|create\s+policy/i)
  assert.match(executable, /create\s+trigger\s+kp_cleanup_legacy_summary_write_fence[\s\S]*?on\s+public\.summaries[\s\S]*?execute\s+function\s+public\.kp_enforce_summary_cleanup_fence/i)
  assert.doesNotMatch(executable, /\b(?:insert\s+into|update\s+(?:public\.|kp_migration\.)|delete\s+from|truncate\s+)/i)
  assert.doesNotMatch(executable, /\b(?:drop\s+table|drop\s+column|drop\s+index|drop\s+policy)/i)
  assert.doesNotMatch(executable, /\b(?:call|select)\s+(?:public\.)?kp_(?:persist|apply)_/i)
  assert.match(sql, /No domain tables, columns, indexes, rows, or policies are created/i)
  assert.match(sql, /assigned cleanup write-fence trigger/i)
  assert.match(sql, /Feature flags are server-side Application Layer state/i)
}

function verifiesReconciliationEvidenceSurface(): void {
  const reconcileBlock = sql.match(
    /create\s+or\s+replace\s+function\s+kp_migration\.reconcile_cleanup_readiness\([\s\S]*?as\s+\$function\$[\s\S]*?\$function\$/i
  )?.[0]
  assert.ok(reconcileBlock)
  assert.match(reconcileBlock, /returns\s+table\s*\([\s\S]*?legacy_route_mismatch_total\s+bigint/i)
  assert.match(reconcileBlock, /target_only_summary_total\s+bigint/i)
  assert.match(reconcileBlock, /target_only_placement_total\s+bigint/i)
  assert.match(reconcileBlock, /unknown_legacy_catalog_dependency_total\s+bigint/i)
  assert.match(reconcileBlock, /cleanup_write_fence_present\s+boolean/i)
  assert.match(reconcileBlock, /cleanup_prerequisites_clear\s+boolean/i)
  assert.match(reconcileBlock, /mismatch_total\s+bigint/i)
  assert.match(reconcileBlock, /language\s+plpgsql/i)
  assert.match(reconcileBlock, /stable/i)
  assert.match(reconcileBlock, /security\s+definer/i)
  assert.match(reconcileBlock, /set\s+search_path\s*=\s*pg_catalog,\s*public,\s*kp_migration,\s*pg_temp/i)
  assert.match(reconcileBlock, /set\s+lock_timeout\s*=\s*'5s'/i)
  assert.match(reconcileBlock, /pg_catalog\.pg_depend/i)
  assert.match(reconcileBlock, /legacy_columns/i)
  assert.match(reconcileBlock, /package_summaries\s+ps/i)
  assert.match(reconcileBlock, /legacy_slug/i)
  assert.match(reconcileBlock, /kp_reconcile_writer_boundary\(\)/i)
  assert.match(reconcileBlock, /reconcile_final_unique_indexes\(\)/i)
  assert.match(reconcileBlock, /state\s+not\s+in\s*\('succeeded',\s*'skipped'\)/i)
  assert.match(reconcileBlock, /state\s*<>\s*'completed'/i)
}

function verifiesExplicitFailClosedGate(): void {
  const assertionBlock = sql.match(
    /create\s+or\s+replace\s+function\s+kp_migration\.assert_cleanup_readiness\([\s\S]*?as\s+\$function\$[\s\S]*?\$function\$/i
  )?.[0]
  assert.ok(assertionBlock)
  assert.match(assertionBlock, /p_target_authority_enabled\s+boolean/i)
  assert.match(assertionBlock, /p_rollback_window_closed\s+boolean/i)
  assert.match(assertionBlock, /p_target_only_approved\s+boolean/i)
  assert.match(assertionBlock, /p_legacy_dependency_confirmed\s+boolean/i)
  assert.match(assertionBlock, /p_operator_attestation\s+text/i)
  assert.match(assertionBlock, /security\s+definer/i)
  assert.match(assertionBlock, /set\s+search_path\s*=\s*pg_catalog,\s*public,\s*kp_migration,\s*pg_temp/i)
  assert.match(assertionBlock, /set\s+lock_timeout\s*=\s*'5s'/i)
  assert.match(assertionBlock, /cleanup_prerequisites_clear/i)
  assert.match(assertionBlock, /raise\s+exception\s+using/i)
  assert.match(assertionBlock, /errcode\s*=\s*'check_violation'/i)
  assert.match(assertionBlock, /btrim\(p_operator_attestation\)/i)
  assert.match(sql, /migration 060 must invoke/i)
  assert.match(sql, /target-only approval/i)
}

function verifiesSecurityAndBoundedGrants(): void {
  for (const signature of [
    'public.kp_enforce_summary_cleanup_fence()',
    'kp_migration.reconcile_cleanup_readiness(uuid)',
    'kp_migration.assert_cleanup_readiness(uuid, boolean, boolean, boolean, boolean, text)',
  ]) {
    assert.match(executable, new RegExp(`revoke\\s+all\\s+on\\s+function\\s+${escaped(signature)}[\\s\\S]*?from\\s+public,\\s*anon,\\s*authenticated`, 'i'))
    assert.match(executable, new RegExp(`grant\\s+execute\\s+on\\s+function\\s+${escaped(signature)}[\\s\\S]*?to\\s+service_role`, 'i'))
  }

  assert.match(executable, /prosecdef/i)
  assert.match(executable, /proconfig/i)
  assert.match(executable, /has_function_privilege\('public'/i)
  assert.match(executable, /has_function_privilege\('anon'/i)
  assert.match(executable, /has_function_privilege\('authenticated'/i)
  assert.match(executable, /has_function_privilege\('service_role'/i)
  assert.match(sql, /no PostgREST surface is introduced/i)
  assert.match(executable, /security\s+invoker[\s\S]*?kp_enforce_summary_cleanup_fence/i)
}

function verifiesNoExecutionOrApplicationDrift(): void {
  assert.match(sql, /dormant until migration 060 calls it/i)
  assert.match(sql, /not repair data/i)
  assert.match(sql, /advance a ledger/i)
  assert.match(sql, /remove a writer fence/i)
  assert.match(sql, /perform\s*\n?\s*--\s*cutover/i)
  assert.match(sql, /Boolean arguments/i)
  assert.match(sql, /non-empty operator attestation/i)
  assert.match(sql, /Target-only Summary\/Package states are reported for audit/i)
  assert.doesNotMatch(executable, /kp_migration\.(?:apply|execute|advance|remove_legacy)/i)
  assert.doesNotMatch(executable, /notify\s+pgrst/i)
  assert.doesNotMatch(executable, /alter\s+table|drop\s+column|drop\s+table/i)
  assert.match(executable, /legacy authority fields/i)
  assert.match(sql, /Application Layer/i)
  assert.match(sql, /migration 061/i)
}

const tests = [
  ['identity and frozen responsibility', verifiesIdentityAndFrozenResponsibility],
  ['dependencies and read-only scope', verifiesDependenciesAndReadOnlyScope],
  ['reconciliation evidence surface', verifiesReconciliationEvidenceSurface],
  ['explicit fail-closed gate', verifiesExplicitFailClosedGate],
  ['security and bounded grants', verifiesSecurityAndBoundedGrants],
  ['no execution or application drift', verifiesNoExecutionOrApplicationDrift],
] as const

for (const [name, run] of tests) {
  run()
  process.stdout.write(`✓ ${name}\n`)
}

process.stdout.write(`\n${tests.length} Knowledge Platform migration 059 tests passed.\n`)
