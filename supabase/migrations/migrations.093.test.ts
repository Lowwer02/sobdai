import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const migration = read('supabase/migrations/093_payment_rejected_notification.sql')
const positionMigrationPath = fileURLToPath(new URL('./093_position_entities_v1.sql', import.meta.url))
const positionMigration = readFileSync(positionMigrationPath, 'utf8')
const executableSql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

test('093 is additive and fails closed against an incompatible notification baseline', () => {
  assert.match(migration, /Notification 093 requires the canonical public\.notifications table/i)
  assert.match(migration, /Notification 093 refuses a drifted notification type constraint/i)
  assert.match(migration, /Notification 093 refuses a drifted PACKAGE_APPROVED dedupe constraint/i)
  assert.match(migration, /add column source_payment_submission_id uuid/i)
  assert.doesNotMatch(executableSql, /create table public\.notifications/i)
  assert.doesNotMatch(executableSql, /create table public\.payment_submissions/i)
  assert.doesNotMatch(executableSql, /drop\s+(table|column)/i)
})

test('093 preserves package approval dedupe while allowing one rejection notification per submission', () => {
  assert.match(migration, /type in \('PACKAGE_APPROVED', 'PAYMENT_REJECTED'\)/i)
  assert.match(migration, /drop constraint notifications_type_source_order_key/i)
  assert.match(migration, /create unique index notifications_type_source_order_key[\s\S]*?where type = 'PACKAGE_APPROVED'/i)
  assert.match(migration, /add constraint notifications_type_source_payment_submission_key[\s\S]*?unique \(type, source_payment_submission_id\)/i)
  assert.match(migration, /on conflict \(type, source_order_id\) where type = 'PACKAGE_APPROVED' do nothing/i)
  assert.match(migration, /on conflict \(type, source_payment_submission_id\) do nothing/i)
})

test('093 uses the payment submission foreign key and existing checkout resubmission surface', () => {
  assert.match(migration, /source_payment_submission_id uuid[\s\S]*?references public\.payment_submissions\(id\) on delete cascade/i)
  assert.match(migration, /'\/checkout\/' \|\| v_package_id::text/i)
  assert.match(migration, /'การชำระเงินยังไม่ผ่าน'/i)
  assert.match(migration, /'กรุณาตรวจสอบและส่งหลักฐานการชำระเงินใหม่'/i)
  const producer = migration.match(/create or replace function public\.try_create_payment_rejected_notification\([\s\S]*?comment on function public\.try_create_payment_rejected_notification/i)?.[0]
  assert.ok(producer)
  assert.doesNotMatch(producer, /rejection_reason/i)
})

test('093 keeps trusted helper execution fenced and rejection authority unchanged', () => {
  const producer = migration.match(/create or replace function public\.try_create_payment_rejected_notification\([\s\S]*?comment on function public\.try_create_payment_rejected_notification/i)?.[0]
  assert.ok(producer)
  assert.match(producer, /security definer/i)
  assert.match(producer, /set search_path = pg_catalog, public, auth, pg_temp/i)
  assert.match(producer, /exception[\s\S]*?when others then[\s\S]*?raise warning/i)
  assert.match(migration, /revoke all on function public\.try_create_payment_rejected_notification\(uuid\)[\s\S]*?from public, anon, authenticated, service_role/i)

  const rejection = migration.match(/create or replace function public\.reject_payment_submission\([\s\S]*?comment on function public\.reject_payment_submission/i)?.[0]
  assert.ok(rejection)
  assert.match(rejection, /v_actor_id := auth\.uid\(\)/i)
  assert.match(rejection, /p\.role in \('owner', 'admin'\)/i)
  assert.match(rejection, /v_submission_status <> 'submitted'[\s\S]*?v_order_status <> 'pending'[\s\S]*?v_payment_provider <> 'promptpay_manual'/i)
  assert.match(rejection, /set status = 'rejected'[\s\S]*?public\.try_create_payment_rejected_notification/i)
  assert.match(migration, /grant execute on function public\.reject_payment_submission\(uuid, text\)[\s\S]*?to authenticated/i)
  assert.doesNotMatch(rejection, /update public\.orders[\s\S]*?set status/i)
})

test('Position V1 migration is additive, relational, and does not seed production content', () => {
  assert.match(positionMigration, /create table if not exists public\.position_entities/i)
  assert.match(positionMigration, /slug text unique not null/i)
  assert.match(positionMigration, /status text not null default 'draft'/i)
  assert.match(positionMigration, /sources jsonb not null default '\[\]'::jsonb/i)
  assert.match(positionMigration, /references public\.article_authors\(id\) on delete set null/i)
  assert.match(positionMigration, /add column if not exists position_entity_id uuid/i)
  assert.match(positionMigration, /foreign key \(position_entity_id\).*references public\.position_entities\(id\).*on delete set null/is)
  assert.match(positionMigration, /Public can read published position entities/i)
  assert.match(positionMigration, /status = 'published'/i)
  assert.match(positionMigration, /Content managers can manage position entities/i)
  assert.match(positionMigration, /role in \('owner', 'admin', 'editor'\)/i)
  assert.doesNotMatch(positionMigration, /policy-and-plan-analyst/i)
  assert.doesNotMatch(positionMigration, /นักวิเคราะห์นโยบายและแผน/i)
})
