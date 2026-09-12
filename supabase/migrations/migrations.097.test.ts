import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const migrationName = '097_manual_payment_m1_1.sql'
const migrationPath = join(root, 'supabase/migrations', migrationName)
const migration = readFileSync(migrationPath, 'utf8')

test('097 is one additive migration after the production head', () => {
  const files = readdirSync(join(root, 'supabase/migrations'))
  assert.equal(files.filter((name) => /^097_.+\.sql$/.test(name)).length, 1)
  assert.match(migration, /DB-first, expand-compatible migration/i)
  assert.match(migration, /after confirming the production migration head is\s+--\s+096/i)
  assert.doesNotMatch(migration, /create table public\./i)
  assert.doesNotMatch(migration, /drop\s+(table|column|index)/i)
})

test('cancel RPC is a locked financial-manager-only pending manual transition', () => {
  const cancel = migration.match(
    /create or replace function public\.cancel_manual_payment_order\([\s\S]*?comment on function public\.cancel_manual_payment_order/i,
  )?.[0]

  assert.ok(cancel)
  assert.match(cancel, /v_actor_id := auth\.uid\(\)/i)
  assert.match(cancel, /p\.role in \('owner', 'admin'\)/i)
  assert.match(cancel, /p\.status = 'active'/i)
  assert.match(cancel, /p\.deleted_at is null/i)
  assert.match(cancel, /from public\.orders o[\s\S]*?where o\.id = p_order_id[\s\S]*?for update/i)
  assert.match(cancel, /select count\(\*\)[\s\S]*?from public\.payment_submissions ps[\s\S]*?ps\.order_id = p_order_id/i)
  assert.match(cancel, /v_order_status = 'cancelled'[\s\S]*?v_submission_count = 0[\s\S]*?return query select v_order_id, 'cancelled'/i)
  assert.match(cancel, /v_order_status <> 'pending'[\s\S]*?v_payment_provider <> 'promptpay_manual'/i)
  assert.match(cancel, /v_submission_count <> 0[\s\S]*?A payment submission already exists/i)
  assert.match(cancel, /update public\.orders(?: as o)?[\s\S]*?set status = 'cancelled'[\s\S]*?(?:o\.)?status = 'pending'[\s\S]*?(?:o\.)?payment_provider = 'promptpay_manual'/i)
})

test('cancellation has a durable audit row and a database anti-bypass trigger', () => {
  assert.match(migration, /create table if not exists public\.manual_payment_order_events/i)
  assert.match(migration, /actor_id uuid not null references public\.profiles\(id\)/i)
  assert.match(migration, /event_type text not null check \(event_type = 'cancelled'\)/i)
  assert.match(migration, /create or replace function public\.guard_manual_payment_cancel_transition\(\)[\s\S]*?security invoker/i)
  assert.match(migration, /current_setting\([\s\S]*?sobdai\.manual_payment_cancel_authorization/i)
  assert.match(migration, /current_user in \('anon', 'authenticated', 'service_role', 'authenticator'\)/i)
  assert.match(migration, /create trigger guard_manual_payment_cancel_transition[\s\S]*?before update on public\.orders/i)
  assert.match(migration, /insert into public\.manual_payment_order_events[\s\S]*?v_actor_id[\s\S]*?'cancelled'[\s\S]*?v_order_status[\s\S]*?'cancelled'/i)
  assert.match(migration, /revoke all on table public\.manual_payment_order_events from public, anon, authenticated, service_role/i)
})

test('submit RPC keeps the released signature and serializes the five-row cap', () => {
  assert.equal(
    (migration.match(/create or replace function public\.submit_payment_slip\(/g) || []).length,
    1,
  )
  assert.match(migration, /create or replace function public\.submit_payment_slip\(\s*p_order_id uuid,\s*p_idempotency_key uuid,\s*p_storage_object_path text,\s*p_original_filename text,\s*p_mime_type text,\s*p_file_size_bytes bigint/i)
  assert.match(migration, /The order lock serializes cancellation, submission, and the count check/i)
  assert.match(migration, /select count\(\*\)[\s\S]*?from public\.payment_submissions ps[\s\S]*?ps\.order_id = p_order_id[\s\S]*?if v_submission_count >= 5/i)
  assert.match(migration, /errcode = 'P0001'[\s\S]*?Payment submission limit reached/i)
  assert.match(migration, /status = 'submitted'[\s\S]*?A payment slip is already awaiting review/i)
  assert.match(migration, /return query select v_existing_submission_id, v_existing_order_id, v_existing_status/i)
})

test('new RPC privileges are fenced to authenticated callers', () => {
  assert.match(migration, /revoke all on function public\.cancel_manual_payment_order\(uuid\)[\s\S]*?from public, anon, authenticated, service_role/i)
  assert.match(migration, /grant execute on function public\.cancel_manual_payment_order\(uuid\) to authenticated/i)
  assert.match(migration, /revoke all on function public\.submit_payment_slip\(uuid, uuid, text, text, text, bigint\)[\s\S]*?from public, anon, authenticated, service_role/i)
  assert.match(migration, /grant execute on function public\.submit_payment_slip\(uuid, uuid, text, text, text, bigint\)[\s\S]*?to authenticated/i)
})
