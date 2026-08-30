import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const slipRoute = read('app/api/payment/manual/slip/route.ts')
const omiseWebhook = read('app/api/payment/webhook/route.ts')
const migration = read('supabase/migrations/088_manual_payment_foundation.sql')

test('manual slip route preserves evidence after an ambiguous submission commit', () => {
  assert.match(slipRoute, /let submissionCommitted = false/)
  assert.match(slipRoute, /findSubmissionByIdempotencyKey\(supabase, orderId, idempotencyKey\)/)
  assert.match(slipRoute, /payment slip commit state is ambiguous/)
  assert.match(slipRoute, /shouldDeleteUploadedPaymentSlip\(/)
  assert.match(slipRoute, /attemptPaymentSubmissionNotification\(/)
})

test('legacy Omise webhook can only select and update Omise orders', () => {
  assert.equal(
    (omiseWebhook.match(/\.eq\('payment_provider', 'omise'\)/g) || []).length,
    3,
  )
  assert.match(omiseWebhook, /\.update\(\{ status: ORDER_STATUS\.PAID \}\)[\s\S]*\.eq\('payment_provider', 'omise'\)/)
})

test('manual payment evidence retains order and reviewer provenance', () => {
  assert.match(migration, /order_id uuid not null references public\.orders\(id\) on delete restrict/)
  assert.match(migration, /reviewed_by uuid references public\.profiles\(id\) on delete restrict/)
})

test('manual paid transitions are database-guarded and evidence state is RPC-only', () => {
  assert.match(migration, /create or replace function public\.guard_manual_payment_paid_transition\(\)/)
  assert.match(migration, /TG_OP = 'INSERT'[\s\S]*?new\.status is distinct from 'paid'[\s\S]*?new\.payment_provider is distinct from 'promptpay_manual'/)
  assert.match(migration, /elsif new\.status is distinct from 'paid'[\s\S]*?old\.status is not distinct from 'paid'/)
  assert.match(migration, /ps\.order_id = new\.id[\s\S]*?ps\.status = 'approved'[\s\S]*?ps\.reviewed_at is not null[\s\S]*?ps\.reviewed_by is not null/)
  assert.match(migration, /create trigger guard_manual_payment_paid_transition[\s\S]*?before insert or update on public\.orders/)
  assert.match(migration, /revoke all on table public\.payment_submissions from public, anon, authenticated/)
  assert.match(migration, /grant select on table public\.payment_submissions to authenticated/)
  assert.match(migration, /update public\.payment_submissions[\s\S]*?update public\.orders[\s\S]*?status = 'paid'/)
})
