import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationName = '060_kp_remove_legacy_summary_authority.sql'
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

  assert.equal(Math.max(...kpNumbered), 60)
  assert.equal(files.filter((name) => /^060_.+\.sql$/.test(name)).length, 1)
  assert.ok(files.includes('059_kp_cleanup_readiness_guards.sql'))
  assert.match(design, /## 060 — `060_kp_remove_legacy_summary_authority\.sql`/i)
  assert.match(
    design,
    /Remove Package ownership and mutable root content\/publication authority from Summary/i
  )
  assert.match(sql, /guarded legacy Summary-authority retirement/i)
  assert.match(sql, /physical retirement is exposed only through an explicit/i)
}

function verifiesDependenciesAndTargetReadSurface(): void {
  for (const prerequisite of [
    'public.summaries',
    'public.news_summaries',
    'public.package_summaries',
    'public.summary_versions',
    'public.summary_aliases',
    'public.summary_reference_documents',
    'public.summary_version_reference_documents',
    'kp_migration.reconcile_cleanup_readiness(uuid)',
    'kp_migration.assert_cleanup_readiness(uuid,boolean,boolean,boolean,boolean,text)',
    'public.kp_enforce_summary_cleanup_fence()',
    'public.kp_enforce_summary_writer_boundary()',
    'public.kp_read_summary_route(text,text)',
  ]) {
    assert.match(executable, new RegExp(escaped(prerequisite), 'i'))
  }

  const targetSurface = sql.match(
    /create\s+or\s+replace\s+view\s+public\.kp_read_admin_library[\s\S]*?create\s+or\s+replace\s+function\s+public\.kp_read_summary_route/i
  )?.[0]
  assert.ok(targetSurface)
  for (const projection of [
    'kp_read_admin_library',
    'kp_read_summary_picker',
    'kp_read_package_summaries',
    'kp_read_news_summaries',
    'kp_read_recommendation_store',
    'kp_read_summary_route',
  ]) {
    assert.match(targetSurface, new RegExp(projection, 'i'))
  }
  assert.doesNotMatch(targetSurface, /s\.title\b/i)
  assert.doesNotMatch(targetSurface, /s\.is_published\b/i)
  assert.match(targetSurface, /s\.canonical_title/i)
  assert.match(targetSurface, /s\.lifecycle_status\s*=\s*'active'/i)
}

function verifiesReadOnlyInstallationAndExplicitExecutor(): void {
  // No destructive DDL is a top-level migration statement. The only ALTER or
  // DROP text is inside the explicitly-invoked executor's dynamic DDL.
  assert.doesNotMatch(executable, /^\s*alter\s+table\b/im)
  assert.doesNotMatch(executable, /^\s*drop\s+(?:column|policy|index|trigger|function)\b/im)
  assert.doesNotMatch(executable, /^\s*(?:insert\s+into|update\s+|delete\s+from|truncate\b)\b/im)
  assert.doesNotMatch(executable, /perform\s+kp_migration\.execute_legacy_summary_authority_removal/i)
  assert.doesNotMatch(executable, /select\s+kp_migration\.execute_legacy_summary_authority_removal/i)
  assert.match(sql, /No Summary, SummaryVersion, PackageSummary, ReferenceDocument, Alias,\s+--\s+Package, News, or NewsSummary rows are inserted, updated, or deleted/i)
  assert.match(sql, /never uses CASCADE or a data-row DML statement/i)
  assert.match(executable, /create\s+or\s+replace\s+function\s+kp_migration\.execute_legacy_summary_authority_removal/i)
  assert.match(executable, /drop\s+column/i)
  assert.match(executable, /alter\s+table\s+public\.news_summaries\s+add\s+constraint/i)
  assert.match(executable, /on\s+delete\s+restrict/i)
  assert.match(executable, /p_document_removal_approved\s+boolean/i)
  assert.match(executable, /p_confirm_destructive\s+boolean/i)
  assert.match(executable, /domain_rows_changed.*false/i)
}

function verifiesReconciliationAndApprovalGate(): void {
  const reconcileBlock = sql.match(
    /create\s+or\s+replace\s+function\s+kp_migration\.reconcile_legacy_summary_authority\([\s\S]*?as\s+\$function\$[\s\S]*?\$function\$/i
  )?.[0]
  assert.ok(reconcileBlock)
  for (const field of [
    'required_legacy_column_count bigint',
    'legacy_policy_count bigint',
    'summary_package_cascade_fk_count bigint',
    'news_summary_cascade_fk_count bigint',
    'target_read_surface_ready boolean',
    'unknown_legacy_catalog_dependency_count bigint',
    'retirement_prerequisites_clear boolean',
    'retirement_complete boolean',
    'mismatch_total bigint',
  ]) {
    assert.match(reconcileBlock, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
  }
  assert.match(reconcileBlock, /security\s+definer/i)
  assert.match(reconcileBlock, /stable/i)
  assert.match(reconcileBlock, /set\s+search_path\s*=\s*pg_catalog,\s*public,\s*kp_migration,\s*pg_temp/i)
  assert.match(reconcileBlock, /pg_catalog\.pg_depend/i)
  assert.match(reconcileBlock, /pg_catalog\.pg_policies/i)

  const assertionBlock = sql.match(
    /create\s+or\s+replace\s+function\s+kp_migration\.assert_legacy_summary_authority_removal\([\s\S]*?as\s+\$function\$[\s\S]*?\$function\$/i
  )?.[0]
  assert.ok(assertionBlock)
  for (const argument of [
    'p_target_authority_enabled boolean',
    'p_rollback_window_closed boolean',
    'p_target_only_approved boolean',
    'p_legacy_dependency_confirmed boolean',
    'p_backup_restore_verified boolean',
    'p_editorial_freeze_confirmed boolean',
    'p_document_removal_approved boolean',
    'p_operator_attestation text',
    'p_confirm_destructive boolean',
  ]) {
    assert.match(assertionBlock, new RegExp(argument.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
  }
  assert.match(assertionBlock, /kp_migration\.assert_cleanup_readiness/i)
  assert.match(assertionBlock, /raise\s+exception\s+using/i)
  assert.match(assertionBlock, /errcode\s*=\s*'check_violation'/i)
  assert.match(assertionBlock, /btrim\(p_operator_attestation\)/i)
  assert.match(sql, /Migration deployment never calls either function/i)
}

function verifiesSecurityAndBoundedGrants(): void {
  for (const signature of [
    'kp_migration.reconcile_legacy_summary_authority(uuid)',
    'kp_migration.assert_legacy_summary_authority_removal(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text, boolean)',
    'kp_migration.execute_legacy_summary_authority_removal(uuid, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text, boolean)',
  ]) {
    assert.match(
      executable,
      new RegExp(`revoke\\s+all\\s+on\\s+function\\s+${escaped(signature)}[\\s\\S]*?from\\s+public,\\s*anon,\\s*authenticated`, 'i')
    )
    assert.match(
      executable,
      new RegExp(`grant\\s+execute\\s+on\\s+function\\s+${escaped(signature)}[\\s\\S]*?to\\s+service_role`, 'i')
    )
  }
  assert.match(executable, /security\s+definer/i)
  assert.match(executable, /set\s+lock_timeout\s*=\s*'5s'/i)
  assert.match(executable, /has_function_privilege\('public'/i)
  assert.match(executable, /has_function_privilege\('anon'/i)
  assert.match(executable, /has_function_privilege\('authenticated'/i)
  assert.match(executable, /has_function_privilege\('service_role'/i)
  assert.match(sql, /No PostgREST surface is introduced/i)
}

const tests = [
  ['identity and frozen responsibility', verifiesIdentityAndFrozenResponsibility],
  ['dependencies and target read surface', verifiesDependenciesAndTargetReadSurface],
  ['read-only installation and explicit executor', verifiesReadOnlyInstallationAndExplicitExecutor],
  ['reconciliation and approval gate', verifiesReconciliationAndApprovalGate],
  ['security and bounded grants', verifiesSecurityAndBoundedGrants],
] as const

for (const [name, run] of tests) {
  run()
  process.stdout.write(`✓ ${name}\n`)
}

process.stdout.write(`\n${tests.length} Knowledge Platform migration 060 tests passed.\n`)
