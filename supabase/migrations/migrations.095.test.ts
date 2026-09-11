import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const migrationPath = fileURLToPath(new URL('./095_position_entities_acl_grants.sql', import.meta.url))
const migration094Path = fileURLToPath(new URL('./094_position_entities_v1.sql', import.meta.url))
const migration = readFileSync(migrationPath, 'utf8')
const migration094 = readFileSync(migration094Path, 'utf8')
const normalizedMigration = migration.replace(/\s+/g, ' ')

const APPROVED_094_SHA256 =
  '3ef449b768777fffa241c7005324f7b354d90f22062a2866c6a5ec73dd47fe3c'

test('095 is the forward-only Position Entity ACL migration', () => {
  assert.match(migrationPath, /095_position_entities_acl_grants\.sql$/)
  assert.match(normalizedMigration, /grant select on table public\.position_entities to anon/i)
  assert.match(normalizedMigration, /grant select on table public\.position_entities to authenticated/i)
  assert.match(
    normalizedMigration,
    /grant insert, update, delete on table public\.position_entities to authenticated/i,
  )
  assert.match(
    normalizedMigration,
    /grant select, insert, update, delete on table public\.position_entities to service_role/i,
  )
  assert.doesNotMatch(
    normalizedMigration,
    /grant [^;]*(?:insert|update|delete)[^;]*\bto\s+anon\b/i,
  )
  assert.doesNotMatch(normalizedMigration, /grant all\b/i)
})

test('095 does not weaken Position V1 RLS or operational authorization', () => {
  assert.doesNotMatch(normalizedMigration, /(?:create|drop|alter)\s+policy/i)
  assert.doesNotMatch(normalizedMigration, /disable\s+row\s+level\s+security/i)
  assert.doesNotMatch(normalizedMigration, /bypassrls|replace_position_entity_mappings|public\.positions\b/i)
  assert.match(migration094, /alter table public\.position_entities enable row level security/i)
  assert.match(migration094, /replace_position_entity_mappings/i)
})

test('094 remains byte-stable while 095 is introduced as a separate forward migration', () => {
  const migration094Sha256 = createHash('sha256').update(migration094).digest('hex')
  assert.equal(migration094Sha256, APPROVED_094_SHA256)
})
