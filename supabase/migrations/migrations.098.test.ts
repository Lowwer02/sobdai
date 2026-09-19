import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const migrationsDir = join(root, 'supabase/migrations')
const expand = readFileSync(join(migrationsDir, '098_payment_settings_m1_2_expand.sql'), 'utf8')
const cancelRejected = readFileSync(join(migrationsDir, '099_manual_payment_cancel_rejected_orders.sql'), 'utf8')
const enforce = readFileSync(join(migrationsDir, '100_payment_settings_m1_2_enforce.sql'), 'utf8')

test('M1.2 is split into an M1.1-safe EXPAND, compatibility, and gated ENFORCE migration', () => {
  const files = readdirSync(migrationsDir)

  assert.deepEqual(
    files.filter((name) => /^098_payment_settings_m1_2_.+\.sql$/.test(name)),
    ['098_payment_settings_m1_2_expand.sql'],
  )
  assert.ok(files.includes('099_manual_payment_cancel_rejected_orders.sql'))
  assert.ok(files.includes('100_payment_settings_m1_2_enforce.sql'))
  assert.doesNotMatch(expand, /create trigger guard_payment_settings_for_manual_order/i)
  assert.match(expand, /insert into public\.payment_settings[\s\S]*?enabled,[\s\S]*?false/i)
  assert.match(expand, /recipient_type text not null default 'ewallet'/i)
  assert.match(expand, /recipient_identifier text not null default ''/i)
  assert.match(enforce, /valid configured PromptPay recipient while payment remains disabled/i)
  assert.match(enforce, /requires zero pending promptpay_manual orders/i)
  assert.match(enforce, /pg_advisory_xact_lock\(7281, 1201\)/i)
  assert.doesNotMatch(expand, /homepage_settings\.extended_config|support\.qr_image_url/i)
  assert.doesNotMatch(enforce, /drop\s+(table|column|index)/i)
})

test('099 changes only the canonical cancellation boundary and preserves rejected evidence', () => {
  assert.match(cancelRejected, /payment_submissions\.order_id and payment_submissions\.status/i)
  assert.match(cancelRejected, /submitted[\s\S]*?approved[\s\S]*?rejected/i)
  assert.match(cancelRejected, /status is distinct from 'rejected'/i)
  assert.match(cancelRejected, /create or replace function public\.guard_manual_payment_cancel_transition\(\)/i)
  assert.match(cancelRejected, /create or replace function public\.cancel_manual_payment_order\(\s*p_order_id uuid/i)
  assert.match(cancelRejected, /security definer/i)
  assert.match(cancelRejected, /set search_path = pg_catalog, public, auth, pg_temp/i)
  assert.match(cancelRejected, /from public\.orders o[\s\S]*?for update/i)
  assert.match(cancelRejected, /manual_payment_order_events[\s\S]*?'cancelled'/i)
  assert.match(cancelRejected, /grant execute on function public\.cancel_manual_payment_order\(uuid\) to authenticated/i)
  assert.doesNotMatch(cancelRejected, /delete from public\.payment_submissions/i)
  assert.doesNotMatch(cancelRejected, /update public\.payment_submissions/i)
})

test('098 keeps M1.1 order creation compatible while serializing the cutover lock', () => {
  assert.match(expand, /create or replace function public\.create_manual_payment_order\(\s*p_package_id uuid[\s\S]*?pg_advisory_xact_lock\(7281, 1201\)[\s\S]*?insert into public\.orders[\s\S]*?promptpay_manual/i)
  assert.doesNotMatch(expand, /PromptPay payment settings are unavailable/i)
  assert.doesNotMatch(expand, /create trigger guard_payment_settings_for_manual_order/i)
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
  assert.match(expand, /create or replace function public\.update_payment_settings\([\s\S]*?pg_advisory_xact_lock\(7281, 1201\)[\s\S]*?o\.status = 'pending'[\s\S]*?o\.payment_provider = 'promptpay_manual'/i)
  assert.match(expand, /ยังมีคำสั่งซื้อ PromptPay ที่รอชำระอยู่ กรุณาจัดการคำสั่งซื้อเหล่านั้นก่อนเปลี่ยนผู้รับเงิน/i)
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
