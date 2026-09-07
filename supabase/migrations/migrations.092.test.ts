import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const migrationDir = dirname(fileURLToPath(import.meta.url))
const migrationName = '092_notifications_v1.sql'
const migration = readFileSync(join(migrationDir, migrationName), 'utf8')
const executableSql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

test('092 exists as one canonical additive notification migration', () => {
  const files = readdirSync(migrationDir)
  assert.equal(files.filter((name) => /^092_.+\.sql$/.test(name)).length, 1)
  assert.match(executableSql, /create table public\.notifications\s*\(/i)
  assert.doesNotMatch(executableSql, /create table if not exists public\.notifications/i)
  assert.match(migration, /to_regclass\('public\.notifications'\) is not null[\s\S]*?raise exception/i)
  assert.doesNotMatch(executableSql, /create index if not exists notifications_/i)
  assert.doesNotMatch(executableSql, /drop\s+(table|column|index)/i)
  assert.doesNotMatch(executableSql, /create table if not exists public\.(entitlements|enrollments)/i)
})

test('notifications has the minimal durable row, deliberate cascades, and hard approval dedupe', () => {
  assert.match(migration, /id uuid primary key default extensions\.uuid_generate_v4\(\)/i)
  assert.match(migration, /user_id uuid not null references public\.profiles\(id\) on delete cascade/i)
  assert.match(migration, /source_order_id uuid not null references public\.orders\(id\) on delete cascade/i)
  assert.match(migration, /type text not null/i)
  assert.match(migration, /read_at timestamptz/i)
  assert.match(migration, /created_at timestamptz not null default now\(\)/i)
  assert.match(migration, /constraint notifications_type_check check \(type in \('PACKAGE_APPROVED'\)\)/i)
  assert.match(migration, /constraint notifications_type_source_order_key unique \(type, source_order_id\)/i)
})

test('092 requires the deployed extensions-schema UUID generator before creating notification state', () => {
  assert.match(migration, /to_regnamespace\('extensions'\) is null[\s\S]*?to_regprocedure\('extensions\.uuid_generate_v4\(\)'\) is null/i)
  assert.match(migration, /Notification V1 requires extensions\.uuid_generate_v4\(\)/i)
})

test('notifications has the two bounded user-oriented indexes and own-row RLS', () => {
  assert.match(migration, /create index notifications_user_unread_idx[\s\S]*?on public\.notifications \(user_id, created_at desc\)[\s\S]*?where read_at is null/i)
  assert.match(migration, /create index notifications_user_created_at_idx[\s\S]*?on public\.notifications \(user_id, created_at desc\)/i)
  assert.match(migration, /alter table public\.notifications enable row level security/i)
  assert.match(migration, /create policy "Users can view own notifications\."[\s\S]*?for select[\s\S]*?using \(user_id = auth\.uid\(\)\)/i)
  assert.match(migration, /create policy "Users can mark own notifications read\."[\s\S]*?for update[\s\S]*?using \(user_id = auth\.uid\(\)\)[\s\S]*?with check \([\s\S]*?read_at is not null/i)
})

test('authenticated users cannot forge notification rows or mutate immutable fields', () => {
  assert.match(migration, /revoke all on table public\.notifications from public, anon, authenticated/i)
  assert.match(migration, /grant select on table public\.notifications to authenticated/i)
  assert.match(migration, /grant update \(read_at\) on table public\.notifications to authenticated/i)
  assert.doesNotMatch(executableSql, /grant\s+(insert|delete|update\s+on table)\s+table public\.notifications\s+to authenticated/i)
})

test('successful approval produces one trusted PACKAGE_APPROVED notification after paid access is set', () => {
  const approval = migration.match(/create or replace function public\.approve_payment_submission\([\s\S]*?p_submission_id uuid[\s\S]*?\)[\s\S]*?comment on function public\.approve_payment_submission/i)?.[0]
  assert.ok(approval)
  assert.match(approval, /update public\.payment_submissions[\s\S]*?status = 'approved'/i)
  assert.match(approval, /update public\.orders as o[\s\S]*?set status = 'paid'/i)
  assert.match(approval, /perform public\.try_create_package_approved_notification\(v_order_id\)/i)
  assert.ok(approval.indexOf("set status = 'paid'") < approval.lastIndexOf('perform public.try_create_package_approved_notification'))

  const producer = migration.match(/create or replace function public\.try_create_package_approved_notification\([\s\S]*?comment on function public\.try_create_package_approved_notification/i)?.[0]
  assert.ok(producer)
  assert.match(producer, /'PACKAGE_APPROVED'/i)
  assert.match(producer, /'แพ็กเกจของคุณพร้อมใช้งานแล้ว'/i)
  assert.match(producer, /'\/my-packages'/i)
  assert.match(producer, /on conflict \(type, source_order_id\) do nothing/i)
})

test('approval retries are idempotent and rejected evidence has no notification producer', () => {
  assert.match(migration, /if v_submission_status = 'approved' and v_order_status = 'paid' then[\s\S]*?perform public\.try_create_package_approved_notification\(v_order_id\)[\s\S]*?return query select v_submission_id, v_order_id, 'approved'::text/i)
  assert.match(migration, /on conflict \(type, source_order_id\) do nothing/i)

  const historicalReject = readFileSync(
    join(migrationDir, '088_manual_payment_foundation.sql'),
    'utf8',
  )
  const reject = historicalReject.match(/create or replace function public\.reject_payment_submission\([\s\S]*?p_submission_id uuid[\s\S]*?p_rejection_reason text[\s\S]*?\)[\s\S]*?comment on function public\.reject_payment_submission/i)?.[0]
  assert.ok(reject)
  assert.doesNotMatch(reject, /insert into public\.notifications/i)
})

test('notification failure is isolated in a PL/pgSQL exception block', () => {
  const producer = migration.match(/create or replace function public\.try_create_package_approved_notification\([\s\S]*?p_order_id uuid[\s\S]*?\)[\s\S]*?comment on function public\.try_create_package_approved_notification/i)?.[0]
  assert.ok(producer)
  assert.match(producer, /insert into public\.notifications[\s\S]*?exception[\s\S]*?when others then[\s\S]*?raise warning/i)
  assert.match(migration, /notification insertion is isolated in a[\s\S]*?PL\/pgSQL subtransaction/i)
})

test('notification producer is not a client-writable or client-executable authority', () => {
  assert.match(migration, /revoke all on function public\.try_create_package_approved_notification\(uuid\)[\s\S]*?from public, anon, authenticated, service_role/i)
  assert.doesNotMatch(migration, /grant execute on function public\.try_create_package_approved_notification/i)
})
