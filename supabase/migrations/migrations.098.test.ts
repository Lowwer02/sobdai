import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const migrationsDir = join(root, 'supabase/migrations')
const expand = readFileSync(join(migrationsDir, '098_payment_settings_m1_2_expand.sql'), 'utf8')
const enforce = readFileSync(join(migrationsDir, '099_payment_settings_m1_2_enforce.sql'), 'utf8')

test('M1.2 is split into an M1.1-safe EXPAND and a gated ENFORCE migration', () => {
  const files = readdirSync(migrationsDir)

  assert.deepEqual(
    files.filter((name) => /^098_payment_settings_m1_2_.+\.sql$/.test(name)),
    ['098_payment_settings_m1_2_expand.sql'],
  )
  assert.ok(files.includes('099_payment_settings_m1_2_enforce.sql'))
  assert.doesNotMatch(expand, /create trigger guard_payment_settings_for_manual_order/i)
  assert.match(expand, /insert into public\.payment_settings[\s\S]*?enabled,[\s\S]*?false/i)
  assert.match(expand, /recipient_type text not null default 'ewallet'/i)
  assert.match(expand, /recipient_identifier text not null default ''/i)
  assert.match(enforce, /configure and verify a valid enabled PromptPay recipient/i)
  assert.doesNotMatch(expand, /homepage_settings\.extended_config|support\.qr_image_url/i)
  assert.doesNotMatch(enforce, /drop\s+(table|column|index)/i)
})

test('settings are private and financial managers use an RPC instead of direct writes', () => {
  assert.match(expand, /alter table public\.payment_settings enable row level security/i)
  assert.match(expand, /revoke all on table public\.payment_settings from public, anon, authenticated, service_role/i)
  assert.match(expand, /grant select on table public\.payment_settings to authenticated, service_role/i)
  assert.match(expand, /payment_settings_actor_is_manager[\s\S]*?p\.role in \('owner', 'admin'\)/i)
  assert.match(expand, /create policy payment_settings_financial_select[\s\S]*?to authenticated[\s\S]*?payment_settings_actor_is_manager/i)
  assert.doesNotMatch(expand, /create policy payment_settings_financial_update/i)
  assert.doesNotMatch(expand, /grant update\s*\(/i)
  assert.match(expand, /create or replace function public\.update_payment_settings\(/i)
  assert.match(expand, /revoke all on function public\.update_payment_settings\(boolean, text, text, text\) from public, anon, authenticated, service_role/i)
  assert.match(expand, /grant execute on function public\.update_payment_settings\(boolean, text, text, text\) to authenticated/i)
})

test('enabled changes and recipient changes share the lifecycle lock', () => {
  assert.match(enforce, /old\.enabled is not distinct from new\.enabled/i)
  assert.match(enforce, /old\.recipient_type is not distinct from new\.recipient_type/i)
  assert.match(enforce, /old\.recipient_identifier is not distinct from new\.recipient_identifier/i)
  assert.match(enforce, /create trigger guard_payment_settings_lifecycle[\s\S]*?before update on public\.payment_settings/i)
  assert.match(enforce, /pg_advisory_xact_lock\(7281, 1201\)/i)
  assert.match(enforce, /new\.enabled[\s\S]*?valid 15-digit E-Wallet ID/i)
  assert.match(enforce, /old\.recipient_type is distinct from new\.recipient_type[\s\S]*?old\.recipient_identifier is distinct from new\.recipient_identifier/i)
  assert.match(enforce, /o\.status = 'pending'[\s\S]*?o\.payment_provider = 'promptpay_manual'/i)
  assert.match(enforce, /ยังมีคำสั่งซื้อ PromptPay ที่รอชำระอยู่ กรุณาจัดการคำสั่งซื้อเหล่านั้นก่อนเปลี่ยนผู้รับเงิน/i)
})

test('new manual orders fail closed and serialize with lifecycle updates', () => {
  assert.match(enforce, /create trigger guard_payment_settings_for_manual_order[\s\S]*?before insert or update on public\.orders/i)
  assert.match(enforce, /perform pg_catalog\.pg_advisory_xact_lock\(7281, 1201\)/i)
  assert.match(enforce, /ps\.enabled = true[\s\S]*?ps\.recipient_type = 'ewallet'[\s\S]*?recipient_identifier ~ '\^\[0-9\]\{15\}\$'/i)
  assert.match(enforce, /PromptPay payment settings are unavailable/i)
  assert.match(enforce, /if TG_OP = 'UPDATE'[\s\S]*?old\.status is not distinct from 'pending'/i)
  assert.match(expand, /constraint payment_settings_enabled_config_check/i)
})
