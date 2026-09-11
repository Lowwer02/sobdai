import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const migrationPath = fileURLToPath(new URL('./094_position_entities_v1.sql', import.meta.url))
const legacyPositionMigrationPath = fileURLToPath(new URL('./093_position_entities_v1.sql', import.meta.url))
const paymentMigrationPath = fileURLToPath(new URL('./093_payment_rejected_notification.sql', import.meta.url))
const migration = readFileSync(migrationPath, 'utf8')
const normalizedMigration = migration.replace(/\s+/g, ' ')

test('Position V1 owns migration 094 without replacing Production migration 093', () => {
  assert.equal(existsSync(migrationPath), true)
  assert.equal(existsSync(legacyPositionMigrationPath), false)
  assert.doesNotMatch(normalizedMigration, /093_position_entities_v1/i)

  // This branch predates the Production 093 payment file. If it is present in
  // a later release-candidate base, this test still verifies it is not a
  // Position V1 migration.
  if (existsSync(paymentMigrationPath)) {
    const paymentMigration = readFileSync(paymentMigrationPath, 'utf8')
    assert.doesNotMatch(paymentMigration, /position_entities_v1|replace_position_entity_mappings/i)
  }
})

test('094 creates the additive Position V1 schema and preserves relational safety', () => {
  assert.match(normalizedMigration, /create table public\.position_entities \(/i)
  assert.match(normalizedMigration, /slug text unique not null/i)
  assert.match(normalizedMigration, /id uuid default extensions\.uuid_generate_v4\(\) primary key/i)
  assert.match(normalizedMigration, /status text not null default 'draft'/i)
  assert.match(normalizedMigration, /sources jsonb not null default '\[\]'::jsonb/i)
  assert.match(normalizedMigration, /references public\.article_authors\(id\) on delete set null/i)
  assert.match(normalizedMigration, /add column position_entity_id uuid/i)
  assert.match(normalizedMigration, /foreign key \(position_entity_id\) references public\.position_entities\(id\) on delete set null/i)
  assert.match(normalizedMigration, /create index position_entities_status_updated_idx/i)
  assert.match(normalizedMigration, /alter table public\.position_entities enable row level security/i)
  assert.match(normalizedMigration, /public can read published position entities/i)
  assert.match(normalizedMigration, /status = 'published'/i)
  assert.match(normalizedMigration, /content managers can manage position entities/i)
  assert.match(normalizedMigration, /role in \('owner', 'admin', 'editor'\)/i)
  assert.doesNotMatch(normalizedMigration, /policy-and-plan-analyst/i)
  assert.doesNotMatch(normalizedMigration, /นักวิเคราะห์นโยบายและแผน/i)
})

test('094 installs an owner-gated atomic mapping RPC with pre-mutation validation', () => {
  const rpcStart = migration.indexOf('create or replace function public.replace_position_entity_mappings')
  const rpcEnd = migration.indexOf('comment on function public.replace_position_entity_mappings')
  assert.ok(rpcStart >= 0)
  assert.ok(rpcEnd > rpcStart)
  const rpc = migration.slice(rpcStart, rpcEnd)
  const normalizedRpc = rpc.replace(/\s+/g, ' ')
  const clearIndex = rpc.indexOf('update public.positions')

  assert.match(normalizedRpc, /p_entity_id uuid, p_position_ids uuid\[\]/i)
  assert.match(rpc, /returns jsonb/i)
  assert.match(rpc, /security definer/i)
  assert.match(rpc, /set search_path = pg_catalog, public, auth, pg_temp/i)
  assert.match(rpc, /v_actor_id := auth\.uid\(\)/i)
  assert.match(rpc, /v_actor_role <> 'owner'/i)
  assert.match(rpc, /for update/i)
  assert.match(rpc, /every requested Position must exist/i)
  assert.match(rpc, /lower\(btrim\(coalesce\(p\.code/i)
  assert.match(rpc, /GEN and placeholder Positions cannot be mapped/i)
  assert.match(rpc, /already owned by another Position Entity/i)
  assert.match(rpc, /set position_entity_id = null/i)
  assert.match(rpc, /set position_entity_id = v_entity_id/i)
  assert.match(rpc, /get diagnostics v_mapped_count = row_count/i)
  assert.ok(rpc.indexOf('GEN and placeholder Positions cannot be mapped') < clearIndex)
  assert.ok(rpc.indexOf('already owned by another Position Entity') < clearIndex)
  assert.match(normalizedMigration, /revoke all on function public\.replace_position_entity_mappings\(uuid, uuid\[\]\) from public, anon, authenticated, service_role/i)
  assert.match(normalizedMigration, /grant execute on function public\.replace_position_entity_mappings\(uuid, uuid\[\]\) to authenticated/i)
})

test('094 fails closed on missing or partially-created baseline objects', () => {
  assert.match(normalizedMigration, /Position V1 094 requires the canonical public\.positions table/i)
  assert.match(normalizedMigration, /Position V1 094 requires public\.article_authors from migration 080/i)
  assert.match(normalizedMigration, /Position V1 094 requires extensions\.uuid_generate_v4\(\)/i)
  assert.match(normalizedMigration, /Position V1 094 requires the hardened profiles authorization columns/i)
  assert.match(normalizedMigration, /Position V1 094 refuses an already-present public\.position_entities table/i)
  assert.match(normalizedMigration, /Position V1 094 refuses an already-present positions\.position_entity_id column/i)
  assert.match(normalizedMigration, /Position V1 094 refuses an already-present mapping RPC/i)
})
