import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const migrationPath = fileURLToPath(new URL('./096_position_entities_acl_normalization.sql', import.meta.url))
const migration094Path = fileURLToPath(new URL('./094_position_entities_v1.sql', import.meta.url))
const migration095Path = fileURLToPath(new URL('./095_position_entities_acl_grants.sql', import.meta.url))
const migration = readFileSync(migrationPath, 'utf8')
const migration094 = readFileSync(migration094Path, 'utf8')
const migration095 = readFileSync(migration095Path, 'utf8')
const normalizedMigration = migration.replace(/\s+/g, ' ')

const APPROVED_094_SHA256 =
  '3ef449b768777fffa241c7005324f7b354d90f22062a2866c6a5ec73dd47fe3c'
const APPROVED_095_SHA256 =
  'c32379519a718f17ba4a6049f9683191b088384eaed5dcc197f64782848c47d1'

test('096 normalizes Position Entity table ACL before restoring exact role grants', () => {
  assert.match(migrationPath, /096_position_entities_acl_normalization\.sql$/)

  const revoke = 'revoke all privileges on table public.position_entities from anon, authenticated, service_role'
  const revokeIndex = normalizedMigration.indexOf(revoke)
  assert.ok(revokeIndex >= 0, '096 must revoke all privileges from the three target roles')

  const grants = [
    'grant select on table public.position_entities to anon',
    'grant select, insert, update, delete on table public.position_entities to authenticated',
    'grant select, insert, update, delete on table public.position_entities to service_role',
  ]
  for (const grant of grants) {
    const grantIndex = normalizedMigration.indexOf(grant)
    assert.ok(grantIndex > revokeIndex, `${grant} must follow the normalization revoke`)
  }
})

test('096 grants only the tested effective privilege sets', () => {
  assert.doesNotMatch(
    normalizedMigration,
    /grant [^;]*(?:insert|update|delete|truncate|references|trigger|maintain)[^;]*\bto\s+anon\b/i,
  )
  assert.doesNotMatch(normalizedMigration, /grant all\b/i)

  assert.match(
    normalizedMigration,
    /grant select, insert, update, delete on table public\.position_entities to authenticated/i,
  )
  assert.match(
    normalizedMigration,
    /grant select, insert, update, delete on table public\.position_entities to service_role/i,
  )
  assert.doesNotMatch(
    normalizedMigration,
    /grant [^;]*(?:truncate|references|trigger|maintain)[^;]*\bto\s+(?:authenticated|service_role)\b/i,
  )
})

test('096 does not modify RLS, policies, RPCs, schema, or Position data', () => {
  assert.doesNotMatch(normalizedMigration, /(?:create|drop|alter)\s+policy/i)
  assert.doesNotMatch(normalizedMigration, /(?:enable|disable)\s+row\s+level\s+security/i)
  assert.doesNotMatch(
    normalizedMigration,
    /replace_position_entity_mappings|public\.positions\b|insert\s+into|update\s+public\.|delete\s+from/i,
  )
  assert.doesNotMatch(normalizedMigration, /alter\s+(?:table|column)|create\s+table|drop\s+table/i)
})

test('094 and 095 remain byte-stable while 096 is introduced forward-only', () => {
  assert.equal(createHash('sha256').update(migration094).digest('hex'), APPROVED_094_SHA256)
  assert.equal(createHash('sha256').update(migration095).digest('hex'), APPROVED_095_SHA256)
})
