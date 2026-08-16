import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const sql = readFileSync(join(migrationDir, '077_kp_owner_admin_internal_package_access.sql'), 'utf8')
const migration046 = readFileSync(join(migrationDir, '046_kp_rls_foundation.sql'), 'utf8')
const migration075 = readFileSync(join(migrationDir, '075_kp_public_summary_discovery.sql'), 'utf8')
const migration076 = readFileSync(join(migrationDir, '076_kp_entitlement_order_status_alignment.sql'), 'utf8')
const rbac = readFileSync(join(migrationDir, '../../lib/auth/rbac.ts'), 'utf8')
const serverProtect = readFileSync(join(migrationDir, '../../lib/auth/server-protect.ts'), 'utf8')
const sessionTypes = readFileSync(join(migrationDir, '../../lib/assessment/session-types.ts'), 'utf8')

function executableSql(source: string): string {
  return source
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
}

function functionBlock(name: string): string {
  return sql.match(new RegExp(
    `(?:create|create\\s+or\\s+replace)\\s+function\\s+public\\.${name}[\\s\\S]*?\\$function\\$;`,
    'i',
  ))?.[0] ?? ''
}

test('077 is forward-only and does not rewrite earlier migration/data surfaces', () => {
  assert.match(sql, /set\s+local\s+lock_timeout\s*=\s*'5s'/i)
  assert.match(sql, /do\s+\$kp_owner_admin_internal_access_preflight\$/i)
  assert.match(sql, /do\s+\$kp_owner_admin_internal_access_postflight\$/i)
  assert.match(sql, /notify\s+pgrst,\s*'reload schema'/i)
  assert.doesNotMatch(executableSql(sql), /\b(?:create|alter|drop)\s+table\b/i)
  assert.doesNotMatch(executableSql(sql), /\b(?:insert\s+into|update\s+public\.|delete\s+from\s+public\.|truncate\s+table)\b/i)
  assert.doesNotMatch(sql, /migration\s+060|049[-_]|050[-_]|051[-_]|052[-_]|053[-_]|backfill|approve|reconcile/i)
})

test('Owner/Admin predicate is exact, secure, and anonymous-safe', () => {
  const helper = functionBlock('kp_is_owner_admin\\(\\)')
  assert.ok(helper)
  assert.match(helper, /returns\s+boolean/i)
  assert.match(helper, /language\s+sql[\s\S]*?stable[\s\S]*?security\s+definer/i)
  assert.match(helper, /set\s+search_path\s*=\s*pg_catalog,\s*public/i)
  assert.match(helper, /auth\.uid\(\)\s+is\s+not\s+null/i)
  assert.match(helper, /p\.id\s*=\s*auth\.uid\(\)/i)
  assert.match(helper, /p\.role\s+in\s*\(\s*'owner'\s*,\s*'admin'\s*\)/i)
  assert.doesNotMatch(helper, /'editor'|'support'|'user'/i)
  assert.match(sql, /revoke\s+all\s+on\s+function\s+public\.kp_is_owner_admin\(\)[\s\S]*?from\s+public,\s*anon/i)
  assert.match(sql, /grant\s+execute\s+on\s+function\s+public\.kp_is_owner_admin\(\)[\s\S]*?to\s+authenticated/i)
})

test('product entitlement adds only the Owner/Admin branch and keeps paid/free', () => {
  const packageHelper = functionBlock('kp_can_read_package_summary\\(')
  assert.ok(packageHelper)
  assert.match(packageHelper, /public\.kp_is_owner_admin\(\)/i)
  assert.match(packageHelper, /s\.visibility\s*=\s*'product_entitled'/i)
  assert.match(packageHelper, /o\.status\s+in\s*\(\s*'paid'\s*,\s*'free'\s*\)/i)
  assert.match(packageHelper, /auth\.uid\(\)\s+is\s+not\s+null/i)
  assert.match(packageHelper, /o\.user_id\s*=\s*auth\.uid\(\)/i)
  assert.match(packageHelper, /o\.package_id\s*=\s*ps\.package_id/i)
  assert.match(packageHelper, /ps\.status\s*=\s*'active'/i)
  assert.match(packageHelper, /p\.is_published\s*=\s*true/i)
  assert.match(packageHelper, /s\.lifecycle_status\s*=\s*'active'/i)
  assert.doesNotMatch(packageHelper, /o\.status\s*=\s*'completed'/i)
})

test('Summary-version access inherits the package predicate without a duplicate bypass', () => {
  assert.doesNotMatch(executableSql(sql), /create\s+or\s+replace\s+function\s+public\.kp_can_read_summary_version/i)
  assert.match(sql, /public\.kp_can_read_summary_version\(/i)
  assert.match(sql, /public\.kp_can_read_package_summary\(ps\.package_id,\s*ps\.summary_id\)/i)
  assert.match(sql, /kp_is_owner_admin[\s\S]*Summary-version access branch/i)
  assert.match(migration046, /public\.kp_can_read_package_summary\(ps\.package_id,\s*ps\.summary_id\)/i)
})

test('077 fails closed on 076 and preserves 075 discovery/content boundaries', () => {
  assert.match(sql, /to_regprocedure\('public\.kp_can_read_package_summary\(uuid,\s*uuid\)'\)/i)
  assert.match(sql, /to_regprocedure\('public\.kp_can_read_summary_version\(uuid,\s*uuid\)'\)/i)
  assert.match(sql, /o\.statusin\(''paid'',''free''\)/i)
  assert.match(sql, /o\.status=''completed''/i)
  assert.match(sql, /kp_read_package_summary_cards\(uuid\)/i)
  assert.match(sql, /kp_read_summary_route\(text,\s*text\)/i)
  assert.match(sql, /content_md/i)
  assert.match(sql, /s\.is_published/i)
  assert.match(sql, /position\('kp_can_read_package_summary'\s+in\s+v_discovery_normalized_after\)\s*>\s*0/i)
  assert.match(sql, /position\('public\.kp_can_read_summary_version\('\s+in\s+v_route_normalized_after\)\s*=\s*0/i)
  assert.match(migration075, /metadata-only, entitlement-independent/i)
  assert.match(migration076, /o\.status\s+in\s*\(''paid'',\s*''free''\)/i)
})

test('role vocabulary and existing staff boundary remain broad', () => {
  for (const role of ['owner', 'admin', 'editor', 'support', 'user']) {
    assert.match(sql, new RegExp(role, 'i'))
  }
  assert.match(sql, /v_role_check[\s\S]*owner[\s\S]*admin[\s\S]*editor[\s\S]*support[\s\S]*user/i)
  assert.match(rbac, /INTERNAL_PACKAGE_ACCESS_ROLES\s*=\s*\['owner',\s*'admin'\]/)
  assert.match(serverProtect, /STAFF_ROLES[^\n]*\['owner',\s*'admin',\s*'editor',\s*'support'\]/)
  assert.match(sessionTypes, /STAFF_ROLES\s*=\s*\['admin',\s*'owner',\s*'editor',\s*'support'\]/)
  assert.doesNotMatch(sql, /kp_is_staff|kp_is_content_editor/i)
})
