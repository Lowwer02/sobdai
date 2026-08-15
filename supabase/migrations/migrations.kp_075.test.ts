import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationName = '075_kp_public_summary_discovery.sql'
const sql = readFileSync(join(migrationDir, migrationName), 'utf8')
const migration056 = readFileSync(join(migrationDir, '056_kp_read_projections.sql'), 'utf8')
const earlierMigrations = [
  '067_kp_summary_bank_compatibility_marker.sql',
  '068_kp_summary_bank_compatibility_writer_core.sql',
  '069_kp_summary_bank_compatibility_publication.sql',
  '070_kp_summary_bank_compatibility_delete.sql',
  '071_kp_summary_bank_compatibility_import.sql',
  '072_kp_summary_bank_compatibility_edit.sql',
  '073_kp_summary_admin_staff_read.sql',
  '074_kp_schema_qualified_uuid_generation.sql',
].map((name) => readFileSync(join(migrationDir, name), 'utf8'))

const discoveryFunction = sql.match(
  /create\s+function\s+public\.kp_read_package_summary_cards\([\s\S]*?\)\s*returns[\s\S]*?comment\s+on\s+function\s+public\.kp_read_package_summary_cards\(uuid\)/i,
)?.[0] ?? ''
const routeFunction = sql.match(
  /create\s+or\s+replace\s+function\s+public\.kp_read_summary_route\(\s*p_slug[\s\S]*?\$function\$;/i,
)?.[0] ?? ''
const preflightBlock = sql.match(
  /do \$kp_public_summary_discovery_preflight\$[\s\S]*?\$kp_public_summary_discovery_preflight\$;/i,
)?.[0] ?? ''
const postflightBlock = sql.match(
  /do \$kp_public_summary_discovery_postflight\$[\s\S]*?\$kp_public_summary_discovery_postflight\$;/i,
)?.[0] ?? ''
const routePreflightGuard = preflightBlock.match(
  /if not exists \(\s*select 1\s+from pg_catalog\.pg_proc p[\s\S]*?message = 'Knowledge Platform migration 075 found a missing or weakened protected Summary route contract\.'\s*;/i,
)?.[0] ?? ''

function verifiesIdentityAndPrerequisites(): void {
  const files = readdirSync(migrationDir)
  assert.equal(files.filter((name) => name === migrationName).length, 1)
  assert.match(sql, /to_regprocedure\('public\.kp_persist_require_actor\(uuid\)'\)/i)
  assert.match(sql, /to_regprocedure\('public\.kp_read_summary_route\(text,text\)'\)/i)
  assert.match(sql, /summaries_canonical_slug_final_key/i)
  assert.match(sql, /package_summaries_bank_compatibility_slug_check/i)
  assert.match(sql, /package_summaries_one_bank_compatibility_key/i)
  assert.match(sql, /kp_f4_4_summary_staff_read/i)
  assert.match(sql, /extensions\.uuid_generate_v4\(\)/i)
}

function verifiesMetadataOnlyDiscoveryRpc(): void {
  assert.ok(discoveryFunction)
  assert.match(discoveryFunction, /create\s+function\s+public\.kp_read_package_summary_cards\(\s*p_package_id\s+uuid\s*\)/i)
  assert.match(discoveryFunction, /returns\s+table\s*\([\s\S]*?summary_slug\s+text[\s\S]*?published_at\s+timestamptz/i)
  assert.match(discoveryFunction, /language\s+sql[\s\S]*?stable[\s\S]*?security\s+definer/i)
  assert.match(discoveryFunction, /set\s+search_path\s*=\s*pg_catalog,\s*public,\s*pg_temp/i)
  assert.match(discoveryFunction, /coalesce\(ps\.legacy_slug,\s*s\.canonical_slug\)/i)
  assert.match(discoveryFunction, /ps\.package_id\s*=\s*p_package_id/i)
  assert.match(discoveryFunction, /ps\.status\s*=\s*'active'/i)
  assert.match(discoveryFunction, /p\.is_published\s*=\s*true/i)
  assert.match(discoveryFunction, /s\.summary_code\s+is\s+not\s+null/i)
  assert.match(discoveryFunction, /s\.is_published\s*=\s*true/i)
  assert.match(discoveryFunction, /s\.lifecycle_status\s*=\s*'active'/i)
  assert.match(discoveryFunction, /sv\.id\s*=\s*s\.current_published_version_id/i)
  assert.match(discoveryFunction, /sv\.status\s*=\s*'published'/i)
  assert.match(discoveryFunction, /ps\.pinned_summary_version_id\s*=\s*s\.current_published_version_id/i)
  assert.doesNotMatch(discoveryFunction, /kp_can_read_package_summary|kp_can_read_summary_version/i)
  const returnContract = discoveryFunction.match(/returns\s+table\s*\([\s\S]*?\)/i)?.[0] ?? ''
  assert.doesNotMatch(returnContract, /content_md|source_citations|reference_documents|law_snapshot|revision_number|pinned_summary_version_id|version_policy|actor_id|change_note|visibility/i)
  assert.doesNotMatch(discoveryFunction, /\b(?:insert\s+into|update\s+public\.|delete\s+from|truncate|execute)\b/i)
}

function verifiesDiscoveryGrantsAndPostflight(): void {
  assert.match(sql, /revoke\s+all\s+on\s+function\s+public\.kp_read_package_summary_cards\(uuid\)[\s\S]*?from\s+public,\s*anon,\s*authenticated/i)
  assert.match(sql, /grant\s+execute\s+on\s+function\s+public\.kp_read_package_summary_cards\(uuid\)[\s\S]*?to\s+anon,\s*authenticated,\s*service_role/i)
  assert.match(sql, /proowner\s*=\s*v_api_owner/i)
  assert.match(sql, /prosecdef/i)
  assert.match(sql, /provolatile\s*=\s*'s'/i)
  assert.match(sql, /proargdefaults\s+is\s+null/i)
  assert.match(sql, /pg_get_function_result\(v_function\)/i)
  assert.match(sql, /metadata-only, entitlement-independent/i)
}

function verifiesProtectedRouteFallbackAndSecurity(): void {
  assert.ok(routeFunction)
  assert.match(routeFunction, /returns\s+table\s*\([\s\S]*?content_md\s+text[\s\S]*?source_citations\s+jsonb/i)
  assert.match(routeFunction, /public\.kp_can_read_package_summary\(ps\.package_id,\s*ps\.summary_id\)/i)
  assert.match(routeFunction, /public\.kp_can_read_summary_version\(ps\.summary_id,\s*sv\.id\)/i)
  assert.match(routeFunction, /s\.is_published\s*=\s*true/i)
  assert.match(routeFunction, /p\.slug\s*=\s*btrim\(p_package_slug\)/i)
  assert.match(routeFunction, /ps\.legacy_slug\s+is\s+null[\s\S]*?s\.canonical_slug\s*=\s*lower\(btrim\(p_slug\)\)/i)
  assert.match(routeFunction, /coalesce\(ps\.legacy_slug,\s*s\.canonical_slug\)/i)
  assert.match(routeFunction, /deduplicated/i)
  assert.doesNotMatch(routeFunction, /kp_read_package_summary_cards/i)
  assert.match(sql, /revoke\s+all\s+on\s+function\s+public\.kp_read_summary_route\(text,\s*text\)[\s\S]*?from\s+public,\s*anon,\s*authenticated/i)
  assert.match(sql, /grant\s+execute\s+on\s+function\s+public\.kp_read_summary_route\(text,\s*text\)[\s\S]*?to\s+anon,\s*authenticated,\s*service_role/i)
}

function verifiesRealPre075RouteUpgradeAndFailClosedPreflight(): void {
  assert.ok(preflightBlock)
  assert.ok(postflightBlock)
  assert.ok(routePreflightGuard)

  // The real pre-075 protected route has the helper/content/package-scope
  // contract but does not yet contain the post-075 publication predicate.
  // That predicate is installed by 075 and remains strict in postflight.
  assert.doesNotMatch(
    preflightBlock,
    /position\(\s*'s\.is_published'\s+in\s+lower\(v_route_definition\)\s*\)\s*=\s*0/i,
  )
  assert.match(routePreflightGuard, /p\.proowner\s*=\s*v_api_owner/i)
  assert.match(routePreflightGuard, /p\.prosecdef/i)
  assert.match(routePreflightGuard, /search_path=pg_catalog, public, pg_temp/i)
  assert.match(routePreflightGuard, /position\(\s*'public\.kp_can_read_package_summary\('\s+in\s+v_route_definition\)\s*=\s*0/i)
  assert.match(routePreflightGuard, /position\(\s*'public\.kp_can_read_summary_version\('\s+in\s+v_route_definition\)\s*=\s*0/i)
  assert.match(routePreflightGuard, /position\(\s*'content_md'\s+in\s+lower\(v_route_definition\)\s*\)\s*=\s*0/i)
  assert.match(routePreflightGuard, /position\(\s*'p_package_slug'\s+in\s+lower\(v_route_definition\)\s*\)\s*=\s*0/i)
  assert.match(routePreflightGuard, /raise exception using/i)

  // Owner, SECURITY DEFINER, locked search_path, and grants remain part of
  // the same fail-closed preflight guard.
  assert.match(preflightBlock, /raise exception using[\s\S]*?protected Summary route contract/i)
  assert.match(preflightBlock, /has_function_privilege\('public',\s*v_route,\s*'EXECUTE'\)/i)

  assert.match(routeFunction, /s\.is_published\s*=\s*true/i)
  assert.match(postflightBlock, /position\(\s*'s\.is_published = true'\s+in\s+v_definition\s*\)\s*=\s*0/i)
}

function verifiesCollisionAndNoSchemaOrDataMutation(): void {
  assert.match(sql, /group\s+by\s+ps\.package_id,\s*coalesce\(ps\.legacy_slug,\s*s\.canonical_slug\)/i)
  assert.match(sql, /having\s+count\(\*\)\s*>\s*1/i)
  assert.match(sql, /ambiguous effective Package-scoped KP Summary slugs/i)
  assert.doesNotMatch(sql, /create\s+(?:or\s+replace\s+)?view\s+public\.kp_read_package_summaries/i)
  assert.doesNotMatch(sql, /\b(?:insert\s+into|update\s+public\.|delete\s+from|truncate\s+table)\b/i)
  assert.doesNotMatch(sql, /create\s+table|create\s+index|alter\s+table|create\s+policy/i)
}

function verifiesProtectedProjectionAndEarlierMigrationsStayOutsideScope(): void {
  assert.doesNotMatch(sql, /create\s+or\s+replace\s+view\s+public\.kp_read_package_summaries/i)
  assert.match(sql, /kp_read_package_summaries/i)
  assert.match(migration056, /create\s+or\s+replace\s+function\s+public\.kp_read_summary_route/i)
  assert.match(migration056, /s\.is_published\s*=\s*true/i)
  for (const earlierMigration of earlierMigrations) {
    assert.doesNotMatch(earlierMigration, /kp_read_package_summary_cards/i)
  }
}

const tests = [
  ['identity and prerequisites', verifiesIdentityAndPrerequisites],
  ['metadata-only discovery RPC', verifiesMetadataOnlyDiscoveryRpc],
  ['discovery grants and postflight', verifiesDiscoveryGrantsAndPostflight],
  ['protected route fallback and security', verifiesProtectedRouteFallbackAndSecurity],
  ['real pre-075 route upgrade and fail-closed preflight', verifiesRealPre075RouteUpgradeAndFailClosedPreflight],
  ['collision and no schema/data mutation', verifiesCollisionAndNoSchemaOrDataMutation],
  ['protected projection and earlier migrations remain outside scope', verifiesProtectedProjectionAndEarlierMigrationsStayOutsideScope],
] as const

for (const [name, run] of tests) {
  run()
  process.stdout.write(`✓ ${name}\n`)
}

process.stdout.write(`\n${tests.length} Knowledge Platform migration 075 tests passed.\n`)
