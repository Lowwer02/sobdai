import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationName = '054_kp_backfill_aliases_curated.sql'
const sql = readFileSync(join(migrationDir, migrationName), 'utf8')
const design = readFileSync(join(migrationDir, '..', '..', 'knowledge_platform_sql_migration_design_v1.md'), 'utf8')
const executable = sql.split('\n').filter((line) => !line.trimStart().startsWith('--')).join('\n')
const deploymentSql = executable.replace(/create\s+or\s+replace\s+function[\s\S]*?\$function\$;/gi, '')

function verifiesIdentityAndFrozenResponsibility(): void {
  const files = readdirSync(migrationDir)
  const kpNumbered = files.filter((name) => /^\d+_kp_.+\.sql$/.test(name)).map((name) => Number(name.slice(0, 3)))
  assert.equal(Math.max(...kpNumbered), 54)
  assert.equal(files.filter((name) => /^054_.+\.sql$/.test(name)).length, 1)
  assert.ok(files.includes('053_kp_backfill_package_summaries.sql'))
  assert.match(sql, /reconciled frozen Migration 052 responsibility/i)
  assert.match(design, /## 052 — `052_kp_backfill_aliases_curated\.sql`/i)
  assert.match(design, /If a manifest has zero approved rows, the file performs validation only/i)
}

function verifiesDeploymentIsDataInert(): void {
  assert.doesNotMatch(deploymentSql, /\b(?:insert\s+into|update|delete\s+from)\s+public\./i)
  assert.doesNotMatch(deploymentSql, /\b(?:select|call)\s+kp_migration\.(?:approve|apply|confirm)/i)
  assert.doesNotMatch(executable, /update\s+public\.(?:summaries|summary_versions|package_summaries|reference_documents|news_summaries)/i)
  assert.doesNotMatch(executable, /delete\s+from\s+public\./i)
  assert.doesNotMatch(executable, /insert\s+into\s+public\.(?:summaries|summary_versions|package_summaries|reference_documents|news_summaries)/i)
}

function verifiesPrivateHumanReviewedManifest(): void {
  assert.match(executable, /create\s+table\s+if\s+not\s+exists\s+kp_migration\.summary_alias_manifest/i)
  assert.match(executable, /alias_origin\s+text\s+not\s+null/i)
  assert.match(executable, /approval_note\s+text\s+not\s+null/i)
  assert.match(executable, /alias_origin\s*=\s*'former_global'/i)
  assert.match(executable, /alias_origin\s*=\s*'approved_merge'/i)
  assert.match(executable, /source_summary_id\s*<>\s*target_summary_id/i)
  assert.match(executable, /foreign\s+key\s*\(migration_run_id,\s*target_summary_id\)[\s\S]*?summary_ledger/i)
  assert.match(executable, /foreign\s+key\s*\(migration_run_id,\s*source_summary_id\)[\s\S]*?summary_ledger/i)
  assert.match(executable, /alter\s+table\s+kp_migration\.summary_alias_manifest\s+enable\s+row\s+level\s+security/i)
  assert.doesNotMatch(executable, /create\s+policy/i)
}

function verifiesApprovalAndDependencyGate(): void {
  assert.match(executable, /approve_curated_summary_alias_manifest/i)
  assert.match(executable, /reconcile_package_summary_placements\(p_migration_run_id\)/i)
  assert.match(executable, /complete zero-mismatch migration 053 placement reconciliation/i)
  assert.match(executable, /p\.role\s+in\s*\('owner',\s*'admin',\s*'editor'\)/i)
  assert.match(executable, /target_summary_code/i)
  assert.match(executable, /target_canonical_slug/i)
  assert.match(executable, /source_summary_code/i)
  assert.match(executable, /combined canonical\/alias namespace/i)
  assert.match(executable, /guard_summary_alias_manifest/i)
}

function verifiesControlledAliasApplication(): void {
  const apply = executable.match(/create\s+or\s+replace\s+function\s+kp_migration\.apply_curated_summary_alias_unit[\s\S]*?as\s+\$function\$([\s\S]*?)\$function\$;/i)
  assert.ok(apply)
  const body = apply[1]
  assert.match(body, /insert\s+into\s+public\.summary_aliases/i)
  assert.match(body, /v_manifest\.target_summary_id/i)
  assert.match(body, /v_manifest\.slug/i)
  assert.match(body, /v_manifest\.redirect_type/i)
  assert.match(body, /v_manifest\.reason/i)
  assert.match(body, /pg_advisory_xact_lock\(hashtextextended\(v_manifest\.slug,\s*0\)\)/i)
  assert.match(body, /curated_summary_aliases/i)
  assert.match(body, /insert\s+into\s+kp_migration\.batch_progress/i)
  assert.doesNotMatch(body, /(?:update|delete\s+from)\s+public\./i)
  assert.doesNotMatch(body, /insert\s+into\s+public\.(?:summaries|summary_versions|package_summaries|news_summaries)/i)
}

function verifiesExplicitEmptyAndReconciliation(): void {
  assert.match(executable, /confirm_empty_curated_summary_alias_manifest/i)
  assert.match(executable, /'approved_empty'/i)
  assert.match(executable, /'curated_summary_aliases'/i)
  assert.match(executable, /reconcile_curated_summary_aliases/i)
  assert.match(executable, /namespace_collision_total\s+bigint/i)
  assert.match(executable, /unmanifested_alias_total\s+bigint/i)
  assert.match(executable, /empty_confirmed\s+boolean/i)
  assert.match(executable, /join\s+public\.summary_aliases\s+a\s+on\s+a\.slug\s*=\s*s\.canonical_slug/i)
}

function verifiesPermissionsAndSecurityConfiguration(): void {
  assert.match(executable, /revoke\s+all\s+on\s+table\s+kp_migration\.summary_alias_manifest[\s\S]*?from\s+public,\s*anon,\s*authenticated/i)
  assert.match(executable, /grant\s+select,\s*insert,\s*update,\s*delete[\s\S]*?to\s+service_role/i)
  assert.match(executable, /revoke\s+all\s+on\s+function[\s\S]*?from\s+public,\s*anon,\s*authenticated/i)
  assert.match(executable, /grant\s+execute\s+on\s+function[\s\S]*?to\s+service_role/i)
  assert.match(executable, /security\s+definer[\s\S]*?set\s+search_path\s*=\s*pg_catalog,\s*public,\s*kp_migration,\s*pg_temp/i)
  assert.match(executable, /has_function_privilege\('anon'/i)
}

function verifiesScopeExclusions(): void {
  assert.doesNotMatch(executable, /\b(?:recommend|assessment|cutover|legacy cleanup)\w*\b/i)
  assert.doesNotMatch(executable, /create\s+(?:unique\s+)?index[\s\S]{0,120}\bon\s+public\./i)
  assert.doesNotMatch(executable, /create\s+trigger[\s\S]{0,160}\bon\s+public\./i)
  assert.doesNotMatch(executable, /alter\s+table\s+public\./i)
  assert.doesNotMatch(executable, /\bnotify\s+pgrst\b/i)
}

const tests = [
  ['identity and frozen responsibility', verifiesIdentityAndFrozenResponsibility],
  ['deployment is data-inert', verifiesDeploymentIsDataInert],
  ['private human-reviewed manifest', verifiesPrivateHumanReviewedManifest],
  ['approval and dependency gate', verifiesApprovalAndDependencyGate],
  ['controlled alias application', verifiesControlledAliasApplication],
  ['explicit empty and reconciliation', verifiesExplicitEmptyAndReconciliation],
  ['permissions and security configuration', verifiesPermissionsAndSecurityConfiguration],
  ['scope exclusions', verifiesScopeExclusions],
] as const

for (const [name, run] of tests) {
  run()
  process.stdout.write(`✓ ${name}\n`)
}

process.stdout.write(`\n${tests.length} Knowledge Platform migration 054 tests passed.\n`)

