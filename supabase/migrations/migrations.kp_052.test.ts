import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationName = '052_kp_backfill_current_pointers.sql'
const sql = readFileSync(join(migrationDir, migrationName), 'utf8')
const design = readFileSync(join(migrationDir, '..', '..', 'knowledge_platform_sql_migration_design_v1.md'), 'utf8')
const executable = sql.split('\n').filter((line) => !line.trimStart().startsWith('--')).join('\n')
const deploymentSql = executable.replace(/create\s+or\s+replace\s+function[\s\S]*?\$function\$;/gi, '')

function verifiesIdentityAndFrozenResponsibility(): void {
  const files = readdirSync(migrationDir)
  const numbered = files.filter((name) => /^\d+_.+\.sql$/.test(name)).map((name) => Number(name.slice(0, 3)))
  assert.equal(Math.max(...numbered), 52)
  assert.equal(files.filter((name) => /^052_.+\.sql$/.test(name)).length, 1)
  assert.ok(files.includes('051_kp_backfill_initial_summary_versions.sql'))
  assert.match(sql, /reconciled frozen Migration 050 responsibility/i)
  assert.match(design, /## 050 — `050_kp_backfill_current_pointers\.sql`/i)
}

function verifiesDeploymentIsDataInert(): void {
  assert.doesNotMatch(deploymentSql, /\b(?:insert\s+into|update|delete\s+from)\s+public\./i)
  assert.doesNotMatch(deploymentSql, /\b(?:select|call)\s+kp_migration\.apply_current_summary_pointer_unit/i)
  assert.doesNotMatch(executable, /insert\s+into\s+public\.summary_versions/i)
  assert.doesNotMatch(executable, /delete\s+from\s+public\./i)
  assert.doesNotMatch(executable, /alter\s+table\s+public\.summaries\s+drop/i)
}

function verifiesFrozenDependenciesAndGate(): void {
  assert.match(executable, /summaries_current_published_version_fkey/i)
  assert.match(executable, /summaries_current_published_version_idx/i)
  assert.match(executable, /reconcile_initial_summary_versions\(p_migration_run_id\)/i)
  assert.match(executable, /complete zero-mismatch migration 051 reconciliation/i)
  assert.match(executable, /m\.state\s*<>\s*'applied'/i)
  assert.match(executable, /exactly cover the live Summary inventory and revision manifest/i)
}

function verifiesLedgerAddressedPointerOnly(): void {
  const apply = executable.match(/create\s+or\s+replace\s+function\s+kp_migration\.apply_current_summary_pointer_unit[\s\S]*?as\s+\$function\$([\s\S]*?)\$function\$;/i)
  assert.ok(apply)
  const body = apply[1]
  assert.match(body, /v_expected_pointer_id\s*:=\s*v_ledger\.target_revision_id/i)
  assert.match(body, /v_revision\.summary_id\s+is\s+distinct\s+from\s+v_summary\.id/i)
  assert.match(body, /v_revision\.status\s*<>\s*'published'/i)
  assert.match(body, /mapping_status\s+in\s*\('draft',\s*'quarantined'\)/i)
  assert.match(body, /set\s+current_published_version_id\s*=\s*v_expected_pointer_id/i)
  assert.doesNotMatch(body, /max\s*\(\s*(?:revision_number|published_at)/i)
  assert.doesNotMatch(body, /order\s+by\s+(?:revision_number|published_at)/i)

  const summaryUpdate = body.match(/update\s+public\.summaries\s+set([\s\S]*?)where\s+id\s*=\s*p_source_summary_id/i)
  assert.ok(summaryUpdate)
  assert.match(summaryUpdate[1], /^\s*current_published_version_id\s*=\s*v_expected_pointer_id\s*$/i)
}

function verifiesLedgerProgressAndIdempotency(): void {
  assert.match(executable, /provenance\s*\?\s*'current_summary_pointer'/i)
  assert.match(executable, /'expected_pointer_id',\s*v_expected_pointer_id/i)
  assert.match(executable, /'pointer_required',\s*v_expected_pointer_id is not null/i)
  assert.match(executable, /recorded current Summary pointer provenance does not reconcile/i)
  assert.match(executable, /update\s+kp_migration\.summary_ledger/i)
  assert.match(executable, /insert\s+into\s+kp_migration\.batch_progress/i)
  assert.match(executable, /'current_summary_pointers'/i)
}

function verifiesReconciliationAndPermissions(): void {
  assert.match(executable, /create\s+or\s+replace\s+function\s+kp_migration\.reconcile_current_summary_pointers/i)
  assert.match(executable, /pointer_required_total\s+bigint/i)
  assert.match(executable, /pointer_excluded_total\s+bigint/i)
  assert.match(executable, /mismatch_total\s+bigint/i)
  assert.match(executable, /from\s+public\.summaries\s+s[\s\S]*?left\s+join\s+ledger\s+l[\s\S]*?l\.source_summary_id\s+is\s+null/i)
  assert.match(executable, /s\.current_published_version_id\s+is\s+not\s+distinct\s+from\s+case/i)
  assert.match(executable, /revoke\s+all\s+on\s+function[\s\S]*?from\s+public,\s*anon,\s*authenticated/i)
  assert.match(executable, /grant\s+execute\s+on\s+function[\s\S]*?to\s+service_role/i)
}

function verifiesScopeExclusions(): void {
  assert.doesNotMatch(executable, /\bpackage_summaries\b/i)
  assert.doesNotMatch(executable, /\bsummary_aliases\b/i)
  assert.doesNotMatch(executable, /\b(?:recommend|assessment|cutover|legacy cleanup)\w*\b/i)
  assert.doesNotMatch(executable, /create\s+(?:unique\s+)?index/i)
  assert.doesNotMatch(executable, /create\s+trigger/i)
  assert.doesNotMatch(executable, /create\s+policy/i)
}

const tests = [
  ['identity and frozen responsibility', verifiesIdentityAndFrozenResponsibility],
  ['deployment is data-inert', verifiesDeploymentIsDataInert],
  ['frozen dependencies and initial-version gate', verifiesFrozenDependenciesAndGate],
  ['ledger-addressed pointer only', verifiesLedgerAddressedPointerOnly],
  ['ledger progress and idempotency', verifiesLedgerProgressAndIdempotency],
  ['reconciliation and permissions', verifiesReconciliationAndPermissions],
  ['scope exclusions', verifiesScopeExclusions],
] as const

for (const [name, run] of tests) {
  run()
  process.stdout.write(`✓ ${name}\n`)
}

process.stdout.write(`\n${tests.length} Knowledge Platform migration 052 tests passed.\n`)
