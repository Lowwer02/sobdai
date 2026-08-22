/**
 * Static contract tests for SEC profile RBAC baseline hardening (079).
 *
 * These tests intentionally do not connect to a database. They verify the
 * migration's executable SQL and the application mutation paths. Staging
 * should additionally run adversarial authenticated/anonymous integration
 * tests after applying 079.
 *
 * Run with:
 *   node --experimental-strip-types supabase/migrations/migrations.079.test.ts
 */

import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationName = '079_sec_profile_rbac_baseline_hardening.sql'
const migration = readFileSync(join(migrationDir, migrationName), 'utf8')
const executableSql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

const appRoot = join(migrationDir, '..', '..')
const settingsActions = readFileSync(join(appRoot, 'app/settings/actions.ts'), 'utf8')
const userActions = readFileSync(join(appRoot, 'app/admin/users/actions.ts'), 'utf8')
const serverProtect = readFileSync(join(appRoot, 'lib/auth/server-protect.ts'), 'utf8')

function functionBlock(name: string): string {
  const match = executableSql.match(
    new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}[\\s\\S]*?\\$function\\$[\\s\\S]*?\\$function\\$`, 'i'),
  )
  assert.ok(match, `function ${name} exists`)
  return match[0]!
}

test('079 exists as a unique migration', () => {
  const files = readdirSync(migrationDir)
  assert.equal(files.filter((name) => /^079_.+\.sql$/.test(name)).length, 1)
  assert.equal(files.filter((name) => /^078_sec_profile_rbac_baseline_hardening\.sql$/.test(name)).length, 0)
})

test('079 bootstraps only the verified missing-status Production baseline', () => {
  assert.match(executableSql, /v_status_exists\s+boolean/i)
  assert.match(executableSql, /v_status_baseline\s+text/i)
  assert.match(executableSql, /if\s+not\s+v_status_exists\s+then/i)
  assert.match(
    executableSql,
    /deleted_at\s+is\s+not\s+null[\s\S]*?deleted_reason\s+is\s+not\s+null[\s\S]*?banned_at\s+is\s+not\s+null[\s\S]*?banned_reason\s+is\s+not\s+null/i,
  )
  assert.match(
    executableSql,
    /alter\s+table\s+public\.profiles[\s\S]*?add\s+column\s+status\s+text\s+not\s+null\s+default\s+'active'[\s\S]*?check\s*\(status\s+in\s*\(\s*'active'\s*,\s*'banned'\s*\)\)/i,
  )
  assert.match(executableSql, /set_config\(\s*'sobdai\.sec079_status_baseline'/i)
  assert.match(executableSql, /array\[\s*'admin',\s*'editor',\s*'owner',\s*'support',\s*'user'\s*\]::text\[\]/i)
  assert.match(executableSql, /role',\s*'text',\s*'NO',\s*'''user''::text'/i)
})

test('079 fails closed on incompatible status definitions and unsafe legacy state', () => {
  assert.match(executableSql, /actual_column\.data_type\s*<>\s*'text'/i)
  assert.match(executableSql, /actual_column\.is_nullable\s*<>\s*'NO'/i)
  assert.match(executableSql, /actual_column\.column_default\s*<>\s*'''active''::text'/i)
  assert.match(executableSql, /v_legacy_unsafe_count\s*>\s*0/i)
  assert.match(executableSql, /status bootstrap refuses to normalize/i)
})

test('authenticated profile writes are limited to legitimate self-service columns', () => {
  assert.match(executableSql, /revoke\s+all\s+on\s+table\s+public\.profiles\s+from\s+public,\s*anon,\s*authenticated/i)
  assert.match(executableSql, /grant\s+select\s+on\s+table\s+public\.profiles\s+to\s+authenticated/i)
  assert.match(
    executableSql,
    /grant\s+update\s*\(\s*display_name,\s*occupation,\s*phone,\s*avatar_url,\s*last_seen_at\s*\)\s*on\s+table\s+public\.profiles\s+to\s+authenticated/i,
  )
  assert.doesNotMatch(
    executableSql,
    /grant\s+update\s*\([^)]*\b(?:role|status|banned_|deleted_)/i,
  )
})

test('profiles has non-public RLS reads and an owner-scoped update policy', () => {
  assert.match(executableSql, /alter\s+table\s+public\.profiles\s+enable\s+row\s+level\s+security/i)
  assert.match(executableSql, /drop\s+policy\s+if\s+exists\s+"Public profiles are viewable by everyone\."/i)
  assert.match(executableSql, /create\s+policy\s+profiles_select_own[\s\S]*?for\s+select[\s\S]*?to\s+authenticated[\s\S]*?using\s*\(\s*auth\.uid\(\)\s*=\s*id\s*\)/i)
  assert.match(executableSql, /create\s+policy\s+profiles_select_managers[\s\S]*?public\.profile_actor_is_manager\(\)/i)
  assert.match(executableSql, /create\s+policy\s+profiles_update_self[\s\S]*?for\s+update[\s\S]*?to\s+authenticated[\s\S]*?using\s*\([\s\S]*?auth\.uid\(\)\s*=\s*id[\s\S]*?\)[\s\S]*?with\s+check\s*\([\s\S]*?auth\.uid\(\)\s*=\s*id[\s\S]*?\)/i)
  assert.match(executableSql, /create\s+policy\s+profiles_update_self[\s\S]*?status\s*=\s*'active'[\s\S]*?deleted_at\s+is\s+null/i)
  assert.doesNotMatch(executableSql, /create\s+policy[^\n]*for\s+select[^\n]*to\s+anon/i)
})

test('manager predicate is non-recursive and locked down', () => {
  const block = functionBlock('profile_actor_is_manager\\(\\)')
  assert.match(block, /stable/i)
  assert.match(block, /security\s+definer/i)
  assert.match(block, /set\s+search_path\s*=\s*pg_catalog,\s*public,\s*auth,\s*pg_temp/i)
  assert.match(block, /auth\.uid\(\)/i)
  assert.match(block, /role\s+in\s*\(\s*'owner',\s*'admin',\s*'support'\s*\)/i)
  assert.match(block, /status\s*=\s*'active'/i)
  assert.match(block, /deleted_at\s+is\s+null/i)
  assert.match(executableSql, /revoke\s+all\s+on\s+function\s+public\.profile_actor_is_manager\(\)\s+from\s+public/i)
  assert.match(executableSql, /grant\s+execute\s+on\s+function\s+public\.profile_actor_is_manager\(\)\s+to\s+authenticated/i)
})

test('SEC RPCs explicitly fence Supabase default service_role EXECUTE grants', () => {
  for (const signature of [
    'profile_actor_is_manager\\(\\)',
    'admin_update_profile_role\\(uuid,\\s*text\\)',
    'admin_update_profile_status\\(uuid,\\s*text,\\s*text\\)',
    'deactivate_my_profile\\(\\)',
    'kp_is_content_editor\\(\\)',
  ]) {
    assert.match(
      executableSql,
      new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${signature}\\s+from\\s+(?:PUBLIC,\\s*)?anon,\\s*authenticated,\\s*service_role`, 'i'),
      `${signature} fences service_role EXECUTE`,
    )
  }

  assert.match(
    executableSql,
    /revoke\s+all\s+on\s+function\s+public\.protect_profile_security_fields\(\)\s+from\s+public,\s*anon,\s*authenticated/i,
  )
  assert.doesNotMatch(
    executableSql,
    /revoke\s+all\s+on\s+function\s+public\.protect_profile_security_fields\(\)[^;]*service_role/i,
  )
})

test('trusted role/status transitions derive the actor and are authenticated-only RPCs', () => {
  const roleBlock = functionBlock('admin_update_profile_role\\(')
  const statusBlock = functionBlock('admin_update_profile_status\\(')

  for (const block of [roleBlock, statusBlock]) {
    assert.match(block, /security\s+definer/i)
    assert.match(block, /set\s+search_path\s*=\s*pg_catalog,\s*public,\s*auth,\s*pg_temp/i)
    assert.match(block, /auth\.uid\(\)/i)
    assert.match(block, /p\.status\s*=\s*'active'/i)
    assert.match(block, /p\.deleted_at\s+is\s+null/i)
  }

  assert.match(roleBlock, /p_new_role\s+not\s+in\s*\(\s*'user',\s*'admin',\s*'owner',\s*'editor',\s*'support'\s*\)/i)
  assert.match(roleBlock, /p_new_role\s*=\s*'owner'[\s\S]*?v_actor_role\s*<>\s*'owner'/i)
  assert.match(roleBlock, /pg_catalog\.pg_advisory_xact_lock\(780079::bigint\)/i)
  assert.match(roleBlock, /for\s+update/i)
  assert.match(roleBlock, /v_target_role,\s*v_target_status,\s*v_target_deleted_at/i)
  assert.match(roleBlock, /where\s+p\.role\s*=\s*'owner'[\s\S]*?p\.status\s*=\s*'active'[\s\S]*?p\.deleted_at\s+is\s+null[\s\S]*?for\s+update/i)
  assert.match(statusBlock, /p_new_status\s+not\s+in\s*\(\s*'active',\s*'banned'\s*\)/i)
  assert.match(statusBlock, /banned_by\s*=\s*v_actor_id/i)
  assert.match(statusBlock, /pg_catalog\.pg_advisory_xact_lock\(780079::bigint\)/i)
  assert.match(statusBlock, /banned_at\s*=\s*now\(\)/i)
  assert.match(statusBlock, /status\s*=\s*'active'[\s\S]*?banned_at\s*=\s*null[\s\S]*?banned_reason\s*=\s*null[\s\S]*?banned_by\s*=\s*null/i)
  assert.match(statusBlock, /where\s+p\.role\s*=\s*'owner'[\s\S]*?p\.status\s*=\s*'active'[\s\S]*?p\.deleted_at\s+is\s+null[\s\S]*?for\s+update/i)
  assert.match(statusBlock, /char_length\(p_reason\)\s*>\s*500/i)

  assert.match(executableSql, /revoke\s+all\s+on\s+function\s+public\.admin_update_profile_role\(uuid,\s*text\)\s+from\s+public/i)
  assert.match(executableSql, /grant\s+execute\s+on\s+function\s+public\.admin_update_profile_role\(uuid,\s*text\)\s+to\s+authenticated/i)
  assert.match(executableSql, /revoke\s+all\s+on\s+function\s+public\.admin_update_profile_status\(uuid,\s*text,\s*text\)\s+from\s+public/i)
  assert.match(executableSql, /grant\s+execute\s+on\s+function\s+public\.admin_update_profile_status\(uuid,\s*text,\s*text\)\s+to\s+authenticated/i)
  assert.doesNotMatch(executableSql, /grant\s+execute\s+on\s+function\s+public\.admin_update_profile_(?:role|status)[^\n]*\s+to\s+anon/i)
})

test('self-deactivation is a no-argument, actor-derived, non-reversible transition', () => {
  const block = functionBlock('deactivate_my_profile\\(\\)')
  assert.match(block, /returns\s+boolean/i)
  assert.match(block, /security\s+definer/i)
  assert.match(block, /set\s+search_path\s*=\s*pg_catalog,\s*public,\s*auth,\s*pg_temp/i)
  assert.match(block, /v_actor_id\s*:=\s*auth\.uid\(\)/i)
  assert.match(block, /pg_catalog\.pg_advisory_xact_lock\(780079::bigint\)/i)
  assert.match(block, /select\s+p\.role,\s*p\.status,\s*p\.deleted_at[\s\S]*?where\s+p\.id\s*=\s*v_actor_id[\s\S]*?for\s+update/i)
  assert.match(block, /return\s+false/i)
  assert.match(block, /Cannot deactivate the last usable Owner/i)
  assert.match(block, /deleted_at\s*=\s*now\(\)/i)
  assert.match(block, /deleted_reason\s*=\s*'self'/i)
  assert.match(block, /deleted_by\s*=\s*v_actor_id/i)
  assert.match(block, /where\s+id\s*=\s*v_actor_id[\s\S]*?deleted_at\s+is\s+null/i)
  assert.doesNotMatch(block, /deleted_at\s*=\s*null|deleted_reason\s*=\s*null|deleted_by\s*=\s*null/i)
  assert.match(executableSql, /revoke\s+all\s+on\s+function\s+public\.deactivate_my_profile\(\)\s+from\s+public/i)
  assert.match(executableSql, /grant\s+execute\s+on\s+function\s+public\.deactivate_my_profile\(\)\s+to\s+authenticated/i)
})

test('guard trigger blocks trusted fields for API roles', () => {
  const block = functionBlock('protect_profile_security_fields\\(')
  assert.match(block, /security\s+invoker/i)
  assert.match(block, /current_user\s+in\s*\(\s*'anon',\s*'authenticated'\s*\)/i)
  for (const field of ['role', 'status', 'banned_at', 'banned_reason', 'banned_by', 'deleted_at', 'deleted_reason', 'deleted_by']) {
    assert.match(block, new RegExp(`new\\.${field}\\s+is\\s+distinct\\s+from\\s+old\\.${field}`, 'i'))
  }
  assert.match(executableSql, /create\s+trigger\s+profiles_security_guard[\s\S]*?before\s+update\s+on\s+public\.profiles[\s\S]*?protect_profile_security_fields/i)
  assert.match(executableSql, /revoke\s+all\s+on\s+function\s+public\.protect_profile_security_fields\(\)\s+from\s+public,\s*anon,\s*authenticated/i)
})

test('public content manager policies are authenticated-only', () => {
  for (const policy of [
    'Only admins can manage homepage settings.',
    'Content managers can manage news.',
    'Content managers can manage news_packages.',
    'Content managers can manage news_summaries.',
    'Content managers can manage news_redirects.',
    'Content managers can manage articles.',
    'Content managers can manage article_packages.',
    'Content managers can manage promotions.',
  ]) {
    const policyStart = executableSql.toLowerCase().indexOf(`create policy "${policy.toLowerCase()}"`)
    assert.notEqual(policyStart, -1, `policy ${policy} exists`)
    const policyBlock = executableSql.slice(policyStart, policyStart + 700)
    assert.match(policyBlock, /for\s+all[\s\S]*?to\s+authenticated/i, `${policy} is authenticated-only`)
    assert.match(policyBlock, /status\s*=\s*'active'/i, `${policy} requires an active account`)
    assert.match(policyBlock, /deleted_at\s+is\s+null/i, `${policy} requires a non-deleted account`)
  }
  assert.doesNotMatch(executableSql, /drop\s+policy[^;]*public(?:ly)?\s+read/i)
  for (const publicReadPolicy of [
    'Homepage settings are publicly readable.',
    'Public can read published news.',
    'Public can read relations of published news (packages).',
    'Public can read relations of published news (summaries).',
    'Public can read news redirects.',
    'Public can read published articles.',
    'Public can read relations of published articles (packages).',
    'Public can read live homepage promotions.',
  ]) {
    assert.ok(executableSql.includes(`'${publicReadPolicy}'`), `public policy ${publicReadPolicy} remains asserted`)
  }
  assert.match(executableSql, /grant\s+select\s+on\s+table\s+public\.promotions\s+to\s+anon,\s*authenticated/i)
  assert.match(executableSql, /grant\s+insert,\s*update,\s*delete\s+on\s+table\s+public\.promotions\s+to\s+authenticated/i)
})

test('079 forward-replaces every known residual privileged mutation family', () => {
  const expectedPolicies = [
    ['Only owners can insert organizations.', 'public.organizations', 'INSERT', "role\s*=\s*'owner'"],
    ['Only owners can update organizations.', 'public.organizations', 'UPDATE', "role\s*=\s*'owner'"],
    ['Only owners can delete organizations.', 'public.organizations', 'DELETE', "role\s*=\s*'owner'"],
    ['Only owners can insert positions.', 'public.positions', 'INSERT', "role\s*=\s*'owner'"],
    ['Only owners can update positions.', 'public.positions', 'UPDATE', "role\s*=\s*'owner'"],
    ['Only owners can delete positions.', 'public.positions', 'DELETE', "role\s*=\s*'owner'"],
    ['Content creators can insert packages.', 'public.packages', 'INSERT', "role\s+in\s*\\(\\s*'owner',\\s*'admin',\\s*'editor'"],
    ['Content creators can update packages.', 'public.packages', 'UPDATE', "role\s+in\s*\\(\\s*'owner',\\s*'admin',\\s*'editor'"],
    ['Content managers can delete packages.', 'public.packages', 'DELETE', "role\s+in\s*\\(\\s*'owner',\\s*'admin'"],
    ['Content creators can insert exam_sets.', 'public.exam_sets', 'INSERT', "role\s+in\s*\\(\\s*'owner',\\s*'admin',\\s*'editor'"],
    ['Content creators can update exam_sets.', 'public.exam_sets', 'UPDATE', "role\s+in\s*\\(\\s*'owner',\\s*'admin',\\s*'editor'"],
    ['Content managers can delete exam_sets.', 'public.exam_sets', 'DELETE', "role\s+in\s*\\(\\s*'owner',\\s*\\s*'admin'"],
    ['Content creators can insert questions.', 'public.questions', 'INSERT', "role\s+in\s*\\(\\s*'owner',\\s*'admin',\\s*'editor'"],
    ['Content creators can update questions.', 'public.questions', 'UPDATE', "role\s+in\s*\\(\\s*'owner',\\s*'admin',\\s*'editor'"],
    ['Content managers can delete questions.', 'public.questions', 'DELETE', "role\s+in\s*\\(\\s*'owner',\\s*'admin'"],
    ['Content creators can manage exam_set_questions.', 'public.exam_set_questions', 'ALL', "role\s+in\s*\\(\\s*'owner',\\s*'admin',\\s*'editor'"],
    ['Financial managers can insert orders.', 'public.orders', 'INSERT', "role\s+in\s*\\(\\s*'owner',\\s*'admin'"],
    ['Financial managers can update orders.', 'public.orders', 'UPDATE', "role\s+in\s*\\(\\s*'owner',\\s*'admin'"],
    ['Financial managers can delete orders.', 'public.orders', 'DELETE', "role\s+in\s*\\(\\s*'owner',\\s*'admin'"],
    ['Users can upload package assets.', 'storage.objects', 'INSERT', "bucket_id\s*=\s*'package-assets'"],
    ['Users can update package assets.', 'storage.objects', 'UPDATE', "bucket_id\s*=\s*'package-assets'"],
    ['Content managers can upload news assets.', 'storage.objects', 'INSERT', "bucket_id\s*=\s*'news-assets'"],
    ['Content managers can update news assets.', 'storage.objects', 'UPDATE', "bucket_id\s*=\s*'news-assets'"],
    ['Content managers can delete news assets.', 'storage.objects', 'DELETE', "bucket_id\s*=\s*'news-assets'"],
    ['Content managers can upload article assets.', 'storage.objects', 'INSERT', "bucket_id\s*=\s*'article-assets'"],
    ['Content managers can update article assets.', 'storage.objects', 'UPDATE', "bucket_id\s*=\s*'article-assets'"],
    ['Content managers can delete article assets.', 'storage.objects', 'DELETE', "bucket_id\s*=\s*'article-assets'"],
  ] as const

  for (const [name, table, command] of expectedPolicies) {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const escapedTable = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const policy = new RegExp(
      `create\\s+policy\\s+"${escapedName}"[\\s\\S]*?on\\s+${escapedTable}[\\s\\S]*?for\\s+${command.toLowerCase()}`,
      'i',
    )
    const match = policy.exec(executableSql)
    assert.ok(match, `${table}.${name} exists with the expected operation`)

    const start = match.index
    const afterPolicyHeader = start + match[0].length
    const nextStatementStarts = [
      executableSql.indexOf('\ndrop policy', afterPolicyHeader),
      executableSql.indexOf('\ncreate policy', afterPolicyHeader),
      executableSql.indexOf('\ncreate or replace function', afterPolicyHeader),
      executableSql.indexOf('\ndo $profile_rbac_postflight$', afterPolicyHeader),
    ].filter((index) => index >= 0)
    const end = nextStatementStarts.length > 0
      ? Math.min(...nextStatementStarts)
      : executableSql.length
    const policyBlock = executableSql.slice(start, end)

    const rolePredicate = name.startsWith('Only owners')
      ? /role\s*=\s*'owner'/i
      : [
          'Content managers can delete packages.',
          'Content managers can delete exam_sets.',
          'Content managers can delete questions.',
        ].includes(name) || name.startsWith('Financial managers')
        ? /role\s+in\s*\(\s*'owner'\s*,\s*'admin'\s*\)/i
        : /role\s+in\s*\(\s*'owner'\s*,\s*'admin'\s*,\s*'editor'\s*\)/i

    assert.match(policyBlock, /to\s+authenticated/i, `${table}.${name} is authenticated-only`)
    assert.match(policyBlock, rolePredicate, `${table}.${name} preserves its role semantics`)
    assert.match(policyBlock, /status\s*=\s*'active'/i, `${table}.${name} requires an active account`)
    assert.match(policyBlock, /deleted_at\s+is\s+null/i, `${table}.${name} requires a non-deleted account`)
  }

  for (const expectedRolePredicate of [
    "role = 'owner'",
    "role in ('owner', 'admin')",
    "role in ('owner', 'admin', 'editor')",
  ]) {
    assert.ok(executableSql.includes(expectedRolePredicate), 'residual role semantics remain represented: ' + expectedRolePredicate)
  }

  assert.match(
    executableSql,
    /create\s+policy\s+"Content creators can manage exam_set_questions\."[\s\S]*?for\s+all[\s\S]*?to\s+authenticated/i,
  )
  assert.match(executableSql, /create\s+or\s+replace\s+function\s+public\.kp_is_content_editor\(\)[\s\S]*?status\s*=\s*'active'[\s\S]*?deleted_at\s+is\s+null/i)
  for (const table of ['reference_documents', 'reference_document_versions', 'reference_document_aliases']) {
    assert.match(
      executableSql,
      new RegExp(`create\\s+policy\\s+kp_editor_(?:insert|update)[\\s\\S]*?on\\s+public\\.${table}[\\s\\S]*?to\\s+authenticated[\\s\\S]*?kp_is_content_editor`, 'i'),
    )
  }
  assert.doesNotMatch(executableSql, /auth\.role\(\)\s*=\s*'authenticated'/i)
  assert.match(executableSql, /SEC postflight found an unfenced privileged mutation policy/i)
})

test('application authorization requires an active, non-deleted profile', () => {
  assert.match(serverProtect, /export\s+function\s+isUsableAccountProfile\(/i)
  assert.match(serverProtect, /candidate\.status\s*===\s*'active'/i)
  assert.match(serverProtect, /candidate\.deleted_at\s*===\s*null/i)

  for (const helper of ['requireStaff', 'requirePermission', 'checkPermission']) {
    const helperStart = serverProtect.indexOf(`export async function ${helper}`)
    assert.notEqual(helperStart, -1, `${helper} exists`)
    const helperBlock = serverProtect.slice(helperStart, helperStart + 900)
    assert.match(helperBlock, /isUsableAccountProfile\(profile\)/i, `${helper} checks account usability`)
  }

  assert.match(serverProtect, /STAFF_ROLES[^\n]*\['owner',\s*'admin',\s*'editor',\s*'support'\]/i)
  assert.match(serverProtect, /hasPermission\(profile\.role,\s*permission\)/i)
})

test('postflight assertions cover effective security state', () => {
  assert.match(executableSql, /do\s+\$profile_rbac_postflight\$/i)
  assert.match(executableSql, /current_setting\(\s*'sobdai\.sec079_status_baseline'/i)
  assert.match(executableSql, /status_column\.data_type\s*<>\s*'text'/i)
  assert.match(executableSql, /status_column\.is_nullable\s*<>\s*'NO'/i)
  assert.match(executableSql, /status_column\.column_default\s*<>\s*'''active''::text'/i)
  assert.match(executableSql, /status is null[\s\S]*?status not in\s*\(\s*'active',\s*'banned'\s*\)/i)
  assert.match(executableSql, /legacy profile that was not normalized to status=active/i)
  assert.match(executableSql, /has_table_privilege\(\s*'anon'[\s\S]*?public\.profiles[\s\S]*?'SELECT'/i)
  assert.match(executableSql, /has_table_privilege\(\s*'authenticated'[\s\S]*?public\.profiles[\s\S]*?'UPDATE'/i)
  assert.match(executableSql, /has_column_privilege\(/i)
  assert.match(executableSql, /c\.relrowsecurity/i)
  assert.match(executableSql, /pg_catalog\.pg_policies/i)
  assert.match(executableSql, /pg_catalog\.pg_get_userbyid\(p\.proowner\)/i)
  assert.match(executableSql, /p\.prosecdef/i)
  assert.match(executableSql, /search_path=pg_catalog, public, auth, pg_temp/i)
  assert.match(executableSql, /has_function_privilege\(/i)
  assert.match(executableSql, /t\.tgname\s*=\s*'profiles_security_guard'/i)
})

test('application paths use the protected boundaries', () => {
  assert.match(settingsActions, /\.from\(['"]profiles['"]\)[\s\S]*?\.update\(payload\)/i)
  assert.doesNotMatch(settingsActions, /updated_at\s*:/i)
  assert.match(settingsActions, /\.rpc\(['"]deactivate_my_profile['"]\)/i)
  assert.doesNotMatch(settingsActions, /deleted_(?:at|reason|by)\s*:/i)

  assert.match(userActions, /\.rpc\(['"]admin_update_profile_role['"]/i)
  assert.match(userActions, /\.rpc\(['"]admin_update_profile_status['"]/i)
  assert.match(userActions, /\.is\(['"]deleted_at['"],\s*null\)/i)
  assert.doesNotMatch(userActions, /\.from\(['"]profiles['"]\)[\s\S]*?\.update\(/i)
  assert.doesNotMatch(userActions, /banned_(?:at|by)\s*:/i)
  assert.equal(existsSync(join(appRoot, 'app/admin/users/actions.ts.bak')), false)
})

test('migration does not alter Written Exam, Assessment, or Knowledge Platform objects', () => {
  assert.doesNotMatch(executableSql, /written_exam/i)
  for (const objectName of ['assessment_', 'question', 'summary', 'package_summary', 'knowledge']) {
    assert.doesNotMatch(executableSql, new RegExp(`alter\\s+table[^;]*${objectName}`, 'i'))
  }
})
