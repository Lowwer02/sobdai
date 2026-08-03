import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationName = '053_kp_backfill_package_summaries.sql'
const sql = readFileSync(join(migrationDir, migrationName), 'utf8')
const design = readFileSync(join(migrationDir, '..', '..', 'knowledge_platform_sql_migration_design_v1.md'), 'utf8')
const executable = sql.split('\n').filter((line) => !line.trimStart().startsWith('--')).join('\n')
const deploymentSql = executable.replace(/create\s+or\s+replace\s+function[\s\S]*?\$function\$;/gi, '')

function verifiesIdentityAndFrozenResponsibility(): void {
  const files = readdirSync(migrationDir)
  const kpNumbered = files.filter((name) => /^\d+_kp_.+\.sql$/.test(name)).map((name) => Number(name.slice(0, 3)))
  assert.equal(Math.max(...kpNumbered), 53)
  assert.equal(files.filter((name) => /^053_.+\.sql$/.test(name)).length, 1)
  assert.ok(files.includes('052_kp_backfill_current_pointers.sql'))
  assert.match(sql, /reconciled frozen Migration 051 responsibility/i)
  assert.match(design, /## 051 — `051_kp_backfill_package_summaries\.sql`/i)
}

function verifiesDeploymentIsDataInert(): void {
  assert.doesNotMatch(deploymentSql, /\b(?:insert\s+into|update|delete\s+from)\s+public\./i)
  assert.doesNotMatch(deploymentSql, /\b(?:select|call)\s+kp_migration\.apply_package_summary_placement_unit/i)
  assert.doesNotMatch(executable, /update\s+public\.(?:summaries|summary_versions|package_summaries)/i)
  assert.doesNotMatch(executable, /insert\s+into\s+public\.(?:summaries|summary_versions)/i)
  assert.doesNotMatch(executable, /delete\s+from\s+public\./i)
}

function verifiesFrozenDependenciesAndPointerGate(): void {
  assert.match(executable, /package_summaries_package_legacy_slug_key/i)
  assert.match(executable, /reconcile_current_summary_pointers\(p_migration_run_id\)/i)
  assert.match(executable, /complete zero-mismatch migration 052 pointer reconciliation/i)
  assert.match(executable, /pointer_required_total\s*<>\s*v_pointer_reconciliation\.target_pointer_total/i)
  assert.match(executable, /requires production migration 052 current-pointer helpers/i)
}

function verifiesExactCompatibilityPlacement(): void {
  const apply = executable.match(/create\s+or\s+replace\s+function\s+kp_migration\.apply_package_summary_placement_unit[\s\S]*?as\s+\$function\$([\s\S]*?)\$function\$;/i)
  assert.ok(apply)
  const body = apply[1]
  assert.match(body, /insert\s+into\s+public\.package_summaries/i)
  assert.match(body, /v_summary\.package_id/i)
  assert.match(body, /v_summary\.slug/i)
  assert.match(body, /v_summary\.sort_order/i)
  assert.match(body, /v_summary\.display_order/i)
  assert.match(body, /v_summary\.released_at/i)
  assert.match(body, /'latest_published'/i)
  assert.match(body, /v_expected_status\s*:=\s*'active'/i)
  assert.match(body, /v_expected_status\s*:=\s*'draft'/i)
  assert.match(body, /exactly one placement per legacy Summary/i)
  assert.doesNotMatch(body, /update\s+public\./i)
}

function verifiesLedgerCompletionAndIdempotency(): void {
  assert.match(executable, /v_final_ledger_state\s*:=\s*case/i)
  assert.match(executable, /then\s+'skipped'[\s\S]*?else\s+'succeeded'/i)
  assert.match(executable, /target_package_id\s*=\s*v_summary\.package_id/i)
  assert.match(executable, /target_legacy_slug\s*=\s*v_summary\.slug/i)
  assert.match(executable, /provenance\s*\?\s*'package_summary_placement'/i)
  assert.match(executable, /recorded PackageSummary placement provenance does not reconcile/i)
  assert.match(executable, /insert\s+into\s+kp_migration\.batch_progress/i)
  assert.match(executable, /'package_summary_placements'/i)
}

function verifiesReconciliationAndPermissions(): void {
  assert.match(executable, /create\s+or\s+replace\s+function\s+kp_migration\.reconcile_package_summary_placements/i)
  assert.match(executable, /placement_total\s+bigint/i)
  assert.match(executable, /active_total\s+bigint/i)
  assert.match(executable, /draft_total\s+bigint/i)
  assert.match(executable, /mismatch_total\s+bigint/i)
  assert.match(executable, /ps\.sort_order\s*=\s*s\.sort_order/i)
  assert.match(executable, /ps\.legacy_slug\s*=\s*s\.slug/i)
  assert.match(executable, /revoke\s+all\s+on\s+function[\s\S]*?from\s+public,\s*anon,\s*authenticated/i)
  assert.match(executable, /grant\s+execute\s+on\s+function[\s\S]*?to\s+service_role/i)
  assert.match(executable, /security\s+definer[\s\S]*?set\s+search_path\s*=\s*pg_catalog,\s*public,\s*kp_migration,\s*pg_temp/i)
}

function verifiesScopeExclusions(): void {
  assert.doesNotMatch(executable, /\bsummary_aliases\b/i)
  assert.doesNotMatch(executable, /\b(?:recommend|assessment|cutover|legacy cleanup)\w*\b/i)
  assert.doesNotMatch(executable, /create\s+(?:unique\s+)?index/i)
  assert.doesNotMatch(executable, /create\s+trigger/i)
  assert.doesNotMatch(executable, /create\s+policy/i)
  assert.doesNotMatch(executable, /alter\s+table\s+public\.(?:summaries|summary_versions|package_summaries)/i)
}

const tests = [
  ['identity and frozen responsibility', verifiesIdentityAndFrozenResponsibility],
  ['deployment is data-inert', verifiesDeploymentIsDataInert],
  ['frozen dependencies and pointer gate', verifiesFrozenDependenciesAndPointerGate],
  ['exact compatibility placement', verifiesExactCompatibilityPlacement],
  ['ledger completion and idempotency', verifiesLedgerCompletionAndIdempotency],
  ['reconciliation and permissions', verifiesReconciliationAndPermissions],
  ['scope exclusions', verifiesScopeExclusions],
] as const

for (const [name, run] of tests) {
  run()
  process.stdout.write(`✓ ${name}\n`)
}

process.stdout.write(`\n${tests.length} Knowledge Platform migration 053 tests passed.\n`)
