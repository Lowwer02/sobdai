import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationPath = join(migrationDir, '076_kp_entitlement_order_status_alignment.sql')
const sql = readFileSync(migrationPath, 'utf8')
const migration046 = readFileSync(join(migrationDir, '046_kp_rls_foundation.sql'), 'utf8')
const migration075 = readFileSync(join(migrationDir, '075_kp_public_summary_discovery.sql'), 'utf8')
const orderFoundation = readFileSync(join(migrationDir, '011_order_status_foundation.sql'), 'utf8')
const orderUtils = readFileSync(join(migrationDir, '../../lib/orderUtils.ts'), 'utf8')
const assessmentAccess = readFileSync(join(migrationDir, '../../lib/assessment/session-types.ts'), 'utf8')

function executableSql(source: string): string {
  return source
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
}

test('076 exists as a forward-only catalog alignment migration', () => {
  assert.match(sql, /set\s+local\s+lock_timeout\s*=\s*'5s'/i)
  assert.match(sql, /do\s+\$kp_entitlement_status_alignment\$/i)
  assert.match(sql, /notify\s+pgrst,\s*'reload schema'/i)
  assert.doesNotMatch(executableSql(sql), /\b(?:create|alter|drop)\s+table\b/i)
  assert.doesNotMatch(executableSql(sql), /\b(?:insert\s+into|update\s+public\.|delete\s+from\s+public\.|truncate\s+table)\b/i)
})

test('076 fails closed on the migration-011 effective Orders status vocabulary', () => {
  assert.match(sql, /orders_status_check/i)
  for (const status of ['free', 'pending', 'paid', 'failed', 'refunded', 'cancelled']) {
    assert.match(sql, new RegExp(`position\\('${status}'\\s+in\\s+lower\\(v_status_check\\)\\)`, 'i'))
  }
  assert.match(sql, /position\('completed'\s+in\s+lower\(v_status_check\)\)\s*>\s*0/i)
  assert.match(orderFoundation, /check\s*\(status\s+in\s*\('free',\s*'pending',\s*'paid',\s*'failed',\s*'refunded',\s*'cancelled'\)/i)
})

test('076 targets only the exact 046 entitlement helper signatures', () => {
  assert.match(sql, /to_regprocedure\('public\.kp_can_read_package_summary\(uuid,\s*uuid\)'\)/i)
  assert.match(sql, /to_regprocedure\('public\.kp_can_read_summary_version\(uuid,\s*uuid\)'\)/i)
  assert.match(sql, /ambiguous KP entitlement helper overload/i)
  assert.match(sql, /v_package_owner_before\s+is\s+distinct\s+from\s+v_api_owner/i)
  assert.match(sql, /v_version_owner_before\s+is\s+distinct\s+from\s+v_api_owner/i)
  assert.match(sql, /prosecdef/i)
  assert.match(sql, /v_package_volatility_before\s*<>\s*'s'/i)
  assert.match(sql, /search_path=pg_catalog, public/i)
})

test('076 replaces exactly the stale entitlement comparison with paid/free', () => {
  assert.match(sql, /v_old_literal\s+constant\s+text\s*:=\s*'o\.status = ''completed'''/i)
  assert.match(sql, /v_new_literal\s+constant\s+text\s*:=\s*'o\.status in \(''paid'', ''free''\)'/i)
  assert.match(sql, /v_old_pattern\s+constant\s+text/i)
  assert.match(sql, /v_new_pattern\s+constant\s+text/i)
  assert.match(sql, /execute\s+pg_catalog\.regexp_replace\([\s\S]*v_old_pattern[\s\S]*v_new_literal/i)
  assert.match(sql, /o\.user_id\s*=\s*auth\.uid\(\)/i)
  assert.match(sql, /o\.package_id\s*=\s*ps\.package_id/i)
  assert.match(sql, /ps\.status\s*=\s*''active''/i)
  assert.match(sql, /p\.is_published\s*=\s*true/i)
  assert.match(sql, /s\.lifecycle_status\s*=\s*''active''/i)
  assert.match(sql, /s\.visibility\s*=\s*''product_entitled''/i)
  assert.match(sql, /auth\.uid\(\)isnotnull/i)
  assert.match(sql, /v_package_definition_after[\s\S]*v_new_match_count[\s\S]*v_old_match_count/i)
})

test('access statuses are paid/free in the current application vocabulary', () => {
  assert.match(orderUtils, /ORDER_COMPLETED_STATUSES\s*=\s*\[ORDER_STATUS\.PAID,\s*ORDER_STATUS\.FREE\]/)
  assert.match(assessmentAccess, /ACCESS_ORDER_STATUSES\s*=\s*\['paid',\s*'free'\]/)
  assert.doesNotMatch(orderUtils, /ORDER_COMPLETED_STATUSES\s*=\s*\[[^\]]*COMPLETED/i)
})

test('076 postflight rejects every non-entitled order state and missing old predicate', () => {
  assert.match(sql, /paid\/free-only entitlement postflight/i)
  assert.match(sql, /obsolete completed-order entitlement check/i)
  assert.match(sql, /v_old_match_count\s*>\s*0/i)
  for (const denied of ['pending', 'failed', 'refunded', 'cancelled']) {
    assert.match(sql, new RegExp(denied, 'i'))
  }
  assert.match(sql, /no installed KP authorization surface may retain the obsolete literal/i)
})

test('helper ACLs/settings and 075 surfaces are preserved', () => {
  assert.match(sql, /has_function_privilege\('public',\s*v_package_reader,\s*'EXECUTE'\)/i)
  assert.match(sql, /has_function_privilege\('anon',\s*v_package_reader,\s*'EXECUTE'\)/i)
  assert.match(sql, /has_function_privilege\('authenticated',\s*v_version_reader,\s*'EXECUTE'\)/i)
  assert.match(sql, /v_package_acl_after\s+is\s+distinct\s+from\s+v_package_acl_before/i)
  assert.match(sql, /v_version_acl_after\s+is\s+distinct\s+from\s+v_version_acl_before/i)
  assert.match(sql, /v_discovery_definition_after\s+is\s+distinct\s+from\s+v_discovery_definition_before/i)
  assert.match(sql, /v_route_definition_after\s+is\s+distinct\s+from\s+v_route_definition_before/i)
  assert.match(sql, /kp_read_package_summary_cards\(uuid\)/i)
  assert.match(sql, /kp_read_summary_route\(text,\s*text\)/i)
  assert.match(sql, /content_md/i)
  assert.match(sql, /public\.kp_can_read_package_summary\(/i)
  assert.match(sql, /public\.kp_can_read_summary_version\(/i)
})

test('075 discovery remains entitlement-independent while protected content remains gated', () => {
  assert.match(migration075, /kp_read_package_summary_cards/i)
  assert.match(migration075, /metadata-only, entitlement-independent/i)
  assert.match(migration075, /kp_can_read_package_summary\(ps\.package_id,\s*ps\.summary_id\)/i)
  assert.match(migration075, /kp_can_read_summary_version\(ps\.summary_id,\s*sv\.id\)/i)
  assert.match(sql, /position\('kp_can_read_package_summary'\s+in\s+lower\(v_discovery_definition_before\)\)\s*>\s*0/i)
  assert.match(sql, /position\('content_md'\s+in\s+lower\(v_route_definition_before\)\)\s*=\s*0/i)
})

test('076 does not broaden RLS, table grants, writers, or migration 075', () => {
  const executable = executableSql(sql)
  assert.doesNotMatch(executable, /create\s+policy|drop\s+policy/i)
  assert.doesNotMatch(executable, /grant\s+(?:select|insert|update|delete|all)\s+on\s+(?:table|schema)/i)
  assert.doesNotMatch(executable, /create\s+or\s+replace\s+function\s+public\.kp_persist_/i)
  assert.doesNotMatch(executable, /kp_read_package_summary_cards\s*\([^)]*\)\s*returns/i)
  assert.match(sql, /no table privileges or RLS\s+-- policy is granted/i)
  assert.match(migration046, /o\.status\s*=\s*'completed'/i)
  assert.doesNotMatch(sql, /migration\s+060|049[-_]|050[-_]|051[-_]|052[-_]|053[-_]|backfill|approve|reconcile/i)
})

test('migrations 001-075 remain historical inputs, not edited by 076', () => {
  assert.doesNotMatch(sql, /migrations\/0(?:0[1-9]|[1-6][0-9]|7[0-5])[^\n]*\b(?:write|modify|replace)\b/i)
  assert.match(migration075, /create\s+function\s+public\.kp_read_package_summary_cards/i)
  assert.match(migration046, /create\s+or\s+replace\s+function\s+public\.kp_can_read_package_summary/i)
})
