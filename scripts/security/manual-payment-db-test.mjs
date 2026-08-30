#!/usr/bin/env node

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import pg from 'pg'

const { Client } = pg

const TEST_GUARD = 'YES_I_AM_USING_SOBDAI_PAYMENT_TEST'
const LOCAL_ONLY_GUARD = 'YES_I_AM_USING_SOBDAI_LOCAL_DB_ONLY'
const STATEMENT_TIMEOUT = '15000ms'
const OPERATION_TIMEOUT_MS = 10000
const REQUIRED_ENVIRONMENT = [
  'M1_PAYMENT_DB_ALLOW_DESTRUCTIVE_TESTS',
  'M1_PAYMENT_DB_TEST_DATABASE_URL',
]
const FORBIDDEN_APPLICATION_ENVIRONMENT = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'POSTGRES_URL',
  'POSTGRES_PASSWORD',
]
const FIXTURE_EMAILS = {
  manager: process.env.M1_PAYMENT_DB_MANAGER_EMAIL || 'sec-db2a-admin@example.com',
  buyer: process.env.M1_PAYMENT_DB_BUYER_EMAIL || 'sec-db2a-normal-user@example.com',
  support: process.env.M1_PAYMENT_DB_SUPPORT_EMAIL || 'sec-db2a-support@example.com',
}

function ensure(condition, message) {
  assert.ok(condition, message)
}

function readConfiguration() {
  for (const key of REQUIRED_ENVIRONMENT) {
    ensure(process.env[key], `missing required environment: ${key}`)
  }

  for (const key of FORBIDDEN_APPLICATION_ENVIRONMENT) {
    assert.equal(process.env[key], undefined, `application environment is forbidden: ${key}`)
  }

  assert.equal(process.env.M1_PAYMENT_DB_ALLOW_DESTRUCTIVE_TESTS, TEST_GUARD)

  const localOnly = process.env.M1_PAYMENT_DB_LOCAL_ONLY
  ensure(
    localOnly === undefined || localOnly === LOCAL_ONLY_GUARD,
    'local database guard is invalid',
  )

  if (localOnly === LOCAL_ONLY_GUARD) {
    ensure(
      process.env.M1_PAYMENT_DB_TEST_PROJECT_REF === undefined
        && process.env.M1_PAYMENT_DB_TEST_SUPABASE_URL === undefined,
      'local database cannot include remote Supabase target variables',
    )

    let databaseUrl
    try {
      databaseUrl = new URL(process.env.M1_PAYMENT_DB_TEST_DATABASE_URL)
    } catch {
      throw new Error('local database URL is invalid')
    }

    ensure(
      ['postgres:', 'postgresql:'].includes(databaseUrl.protocol),
      'local database URL is not PostgreSQL',
    )
    ensure(
      ['127.0.0.1', 'localhost'].includes(databaseUrl.hostname),
      'local database must use loopback host',
    )
    ensure(
      /^\/sobdai_m1_payment_test_[a-z0-9_]+$/.test(databaseUrl.pathname),
      'local database name is not a disposable M1 database',
    )
    ensure(databaseUrl.username === 'postgres', 'local database must use postgres role')
    ensure(databaseUrl.password === '', 'local database URL must not contain a password')
    ensure(databaseUrl.port !== '', 'local database URL must declare a port')
    ensure(databaseUrl.search === '' && databaseUrl.hash === '', 'local database URL contains unexpected parts')

    return { databaseUrl: databaseUrl.toString(), localOnly: true }
  }

  for (const key of ['M1_PAYMENT_DB_TEST_PROJECT_REF', 'M1_PAYMENT_DB_TEST_SUPABASE_URL']) {
    ensure(process.env[key], `missing required environment: ${key}`)
  }

  const projectRef = process.env.M1_PAYMENT_DB_TEST_PROJECT_REF
  assert.match(projectRef, /^[a-z0-9]{20}$/)

  const supabaseUrl = new URL(process.env.M1_PAYMENT_DB_TEST_SUPABASE_URL)
  assert.equal(supabaseUrl.protocol, 'https:')
  assert.equal(supabaseUrl.hostname, `${projectRef}.supabase.co`)
  assert.equal(supabaseUrl.pathname, '/')
  assert.equal(supabaseUrl.search, '')
  assert.equal(supabaseUrl.hash, '')

  const databaseUrl = new URL(process.env.M1_PAYMENT_DB_TEST_DATABASE_URL)
  assert.ok(['postgres:', 'postgresql:'].includes(databaseUrl.protocol))
  assert.equal(databaseUrl.pathname, '/postgres')
  assert.equal(databaseUrl.search, '')
  assert.equal(databaseUrl.hash, '')
  assert.ok(databaseUrl.username)
  assert.ok(databaseUrl.password)
  assert.ok(['', '5432', '6543'].includes(databaseUrl.port))
  assert.ok(
    databaseUrl.hostname === `db.${projectRef}.supabase.co`
      || /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(databaseUrl.hostname),
    'database must be the declared Supabase project',
  )

  if (databaseUrl.hostname === `db.${projectRef}.supabase.co`) {
    assert.equal(databaseUrl.username, 'postgres')
  } else {
    assert.equal(databaseUrl.username, `postgres.${projectRef}`)
  }

  return { databaseUrl: databaseUrl.toString(), localOnly: false }
}

function withTimeout(promise, label) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), OPERATION_TIMEOUT_MS)
    }),
  ]).finally(() => clearTimeout(timer))
}

async function query(client, text, params = []) {
  return withTimeout(client.query(text, params), 'database operation')
}

async function setAuthenticated(client, userId) {
  await query(client, 'set role authenticated')
  await query(client, "select set_config('request.jwt.claim.sub', $1, false)", [userId])
  await query(client, "select set_config('request.jwt.claim.role', 'authenticated', false)")
}

async function resetAuthenticated(client) {
  await query(client, 'reset role')
  await query(client, "select set_config('request.jwt.claim.sub', '', false)")
  await query(client, "select set_config('request.jwt.claim.role', '', false)")
}

async function asAuthenticated(client, userId, callback) {
  await setAuthenticated(client, userId)
  try {
    return await callback()
  } finally {
    await resetAuthenticated(client)
  }
}

async function expectRejected(client, label, callback) {
  const savepoint = `m1_expected_failure_${randomUUID().replaceAll('-', '')}`
  await query(client, `savepoint ${savepoint}`)
  let error = null
  try {
    await callback()
  } catch (caught) {
    error = caught
  }
  await query(client, `rollback to savepoint ${savepoint}`)
  await query(client, `release savepoint ${savepoint}`)
  ensure(error, `${label} unexpectedly succeeded`)
  return error
}

async function lookupFixtureIds(client) {
  const emails = Object.values(FIXTURE_EMAILS)
  const result = await query(
    client,
    `
      select id::text, email, role, status, deleted_at
      from public.profiles
      where email = any($1::text[])
    `,
    [emails],
  )
  const byEmail = new Map(result.rows.map((row) => [row.email, row]))
  const ids = {}
  for (const [key, email] of Object.entries(FIXTURE_EMAILS)) {
    const row = byEmail.get(email)
    ensure(row, `missing disposable profile: ${email}`)
    ensure(row.status === 'active' && row.deleted_at === null, `${key} fixture is not active`)
    ids[key] = row.id
  }
  ensure(ids.manager !== ids.buyer, 'manager and buyer fixtures must differ')
  ensure(ids.manager !== ids.support && ids.buyer !== ids.support, 'fixture identities must differ')
  ensure(['owner', 'admin'].includes(byEmail.get(FIXTURE_EMAILS.manager).role), 'manager fixture lacks financial role')
  ensure(byEmail.get(FIXTURE_EMAILS.buyer).role === 'user', 'buyer fixture must be a customer')
  ensure(byEmail.get(FIXTURE_EMAILS.support).role === 'support', 'support fixture must be read-only support')
  return ids
}

async function assertMigrationObjects(client) {
  const catalog = await query(
    client,
    `
      select
        to_regclass('public.payment_submissions') is not null as payment_submissions,
        to_regprocedure('public.approve_payment_submission(uuid)') is not null as approve_rpc,
        to_regprocedure('public.reject_payment_submission(uuid,text)') is not null as reject_rpc,
        to_regprocedure('public.guard_manual_payment_paid_transition()') is not null as guard_function,
        exists (
          select 1 from pg_trigger t
          join pg_class c on c.oid = t.tgrelid
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public'
            and c.relname = 'orders'
            and t.tgname = 'guard_manual_payment_paid_transition'
            and not t.tgisinternal
        ) as guard_trigger,
        has_table_privilege('authenticated', 'public.payment_submissions', 'SELECT') as authenticated_select,
        has_table_privilege('authenticated', 'public.payment_submissions', 'INSERT') as authenticated_insert,
        has_table_privilege('authenticated', 'public.payment_submissions', 'UPDATE') as authenticated_update,
        has_table_privilege('authenticated', 'public.payment_submissions', 'DELETE') as authenticated_delete
    `,
  )
  assert.deepEqual(catalog.rows[0], {
    payment_submissions: true,
    approve_rpc: true,
    reject_rpc: true,
    guard_function: true,
    guard_trigger: true,
    authenticated_select: true,
    authenticated_insert: false,
    authenticated_update: false,
    authenticated_delete: false,
  })
}

async function insertPackage(client, id, suffix, currentPrice) {
  await query(
    client,
    `
      insert into public.packages (
        id, slug, package_code, name, current_price, original_price,
        difficulty, features, is_published
      ) values ($1, $2, $3, $4, $5, $5, 'Mixed', '[]'::jsonb, true)
    `,
    [id, `m1-payment-${suffix}-${id.slice(0, 8)}`, `M1-${suffix}-${id.slice(0, 8)}`, `M1 ${suffix}`, currentPrice],
  )
}

async function insertOrder(client, id, userId, packageId, amount, provider, status = 'pending') {
  await query(
    client,
    `
      insert into public.orders (id, user_id, package_id, amount, status, payment_provider)
      values ($1, $2, $3, $4, $5, $6)
    `,
    [id, userId, packageId, amount, status, provider],
  )
}

async function insertSubmission(client, id, orderId, userId, suffix) {
  await query(
    client,
    `
      insert into public.payment_submissions (
        id, order_id, idempotency_key, storage_object_path, original_filename,
        mime_type, file_size_bytes, payment_method, status
      ) values ($1, $2, $3, $4, $5, 'image/png', 128, 'promptpay_manual', 'submitted')
    `,
    [
      id,
      orderId,
      randomUUID(),
      `${userId}/${orderId}/${randomUUID()}.png`,
      `${suffix}.png`,
    ],
  )
}

async function runProof() {
  const config = readConfiguration()
  const client = new Client({
    connectionString: config.databaseUrl,
    ...(config.localOnly ? {} : { ssl: { rejectUnauthorized: false } }),
    connectionTimeoutMillis: 10000,
  })

  await client.connect()
  try {
    await query(client, `set statement_timeout = '${STATEMENT_TIMEOUT}'`)
    await assertMigrationObjects(client)
    const ids = await lookupFixtureIds(client)

    const packageApproved = randomUUID()
    const packageAtomic = randomUUID()
    const packageRejected = randomUUID()
    const packageCoexistence = randomUUID()
    const packageFree = randomUUID()
    const orderApproved = randomUUID()
    const orderAtomic = randomUUID()
    const orderRejected = randomUUID()
    const orderManualCoexistence = randomUUID()
    const orderOmiseCoexistence = randomUUID()
    const orderFree = randomUUID()
    const submissionApproved = randomUUID()
    const submissionAtomic = randomUUID()
    const submissionRejected = randomUUID()

    await query(client, 'begin')
    await insertPackage(client, packageApproved, 'approved', 900)
    await insertPackage(client, packageAtomic, 'atomic', 950)
    await insertPackage(client, packageRejected, 'rejected', 1100)
    await insertPackage(client, packageCoexistence, 'coexistence', 1300)
    await insertPackage(client, packageFree, 'free', 0)
    await insertOrder(client, orderApproved, ids.buyer, packageApproved, 900, 'promptpay_manual')
    await insertOrder(client, orderAtomic, ids.buyer, packageAtomic, 950, 'promptpay_manual')
    await insertOrder(client, orderRejected, ids.buyer, packageRejected, 1100, 'promptpay_manual')
    await insertOrder(client, orderManualCoexistence, ids.buyer, packageCoexistence, 1300, 'promptpay_manual')
    await insertOrder(client, orderOmiseCoexistence, ids.buyer, packageCoexistence, 1300, 'omise')
    await insertOrder(client, orderFree, ids.buyer, packageFree, 0, 'manual_grant', 'free')
    await insertSubmission(client, submissionApproved, orderApproved, ids.buyer, 'approved')
    await insertSubmission(client, submissionAtomic, orderAtomic, ids.buyer, 'atomic')
    await insertSubmission(client, submissionRejected, orderRejected, ids.buyer, 'rejected')

    const directManualError = await asAuthenticated(client, ids.manager, () =>
      expectRejected(client, 'direct manual pending-to-paid update', () =>
        query(client, 'update public.orders set status = \'paid\' where id = $1', [orderApproved]),
      ),
    )
    assert.equal(directManualError.code, '42501')

    const directManualInsertError = await asAuthenticated(client, ids.manager, () =>
      expectRejected(client, 'direct manual paid-order insert', () =>
        query(
          client,
          `
            insert into public.orders (id, user_id, package_id, amount, status, payment_provider)
            values ($1, $2, $3, 900, 'paid', 'promptpay_manual')
          `,
          [randomUUID(), ids.buyer, packageApproved],
        ),
      ),
    )
    assert.equal(directManualInsertError.code, '42501')

    const forgedApprovalError = await asAuthenticated(client, ids.manager, () =>
      expectRejected(client, 'direct payment evidence approval forgery', () =>
        query(
          client,
          `
            update public.payment_submissions
            set status = 'approved', reviewed_at = now(), reviewed_by = $2
            where id = $1
          `,
          [submissionApproved, ids.manager],
        ),
      ),
    )
    assert.equal(forgedApprovalError.code, '42501')

    const customerApproveError = await asAuthenticated(client, ids.buyer, () =>
      expectRejected(client, 'customer approval attempt', () =>
        query(client, 'select * from public.approve_payment_submission($1)', [submissionApproved]),
      ),
    )
    assert.equal(customerApproveError.code, '42501')

    const customerRejectError = await asAuthenticated(client, ids.buyer, () =>
      expectRejected(client, 'customer rejection attempt', () =>
        query(client, 'select * from public.reject_payment_submission($1, $2)', [submissionApproved, 'nope']),
      ),
    )
    assert.equal(customerRejectError.code, '42501')

    const supportApproveError = await asAuthenticated(client, ids.support, () =>
      expectRejected(client, 'support approval attempt', () =>
        query(client, 'select * from public.approve_payment_submission($1)', [submissionApproved]),
      ),
    )
    assert.equal(supportApproveError.code, '42501')

    const supportRejectError = await asAuthenticated(client, ids.support, () =>
      expectRejected(client, 'support rejection attempt', () =>
        query(client, 'select * from public.reject_payment_submission($1, $2)', [submissionApproved, 'nope']),
      ),
    )
    assert.equal(supportRejectError.code, '42501')

    const supportEvidence = await asAuthenticated(client, ids.support, () =>
      query(client, 'select id from public.payment_submissions where id = $1', [submissionApproved]),
    )
    assert.equal(supportEvidence.rows.length, 0)

    const approved = await asAuthenticated(client, ids.manager, () =>
      query(client, 'select * from public.approve_payment_submission($1)', [submissionApproved]),
    )
    assert.deepEqual(approved.rows[0], {
      payment_submission_id: submissionApproved,
      order_id: orderApproved,
      status: 'approved',
    })

    const approvedState = await query(
      client,
      `
        select ps.status as submission_status, ps.reviewed_by::text, ps.reviewed_at is not null as reviewed,
               o.status as order_status
        from public.payment_submissions ps
        join public.orders o on o.id = ps.order_id
        where ps.id = $1
      `,
      [submissionApproved],
    )
    assert.equal(approvedState.rows[0].submission_status, 'approved')
    assert.equal(approvedState.rows[0].reviewed_by, ids.manager)
    assert.equal(approvedState.rows[0].reviewed, true)
    assert.equal(approvedState.rows[0].order_status, 'paid')

    const buyerAccess = await asAuthenticated(client, ids.buyer, () =>
      query(
        client,
        `select id from public.orders where user_id = $1 and package_id = $2 and status in ('paid', 'free')`,
        [ids.buyer, packageApproved],
      ),
    )
    assert.equal(buyerAccess.rows.length, 1)

    // Force the final order mutation to fail after the RPC has updated the
    // evidence row. The savepoint recovery must reveal that both writes rolled
    // back together, proving the canonical approval boundary is atomic.
    await query(
      client,
      `
        alter table public.orders
        add constraint m1_payment_atomicity_probe
        check (id <> '${orderAtomic}'::uuid or status <> 'paid')
      `,
    )
    const atomicApprovalError = await asAuthenticated(client, ids.manager, () =>
      expectRejected(client, 'canonical approval atomic rollback', () =>
        query(client, 'select * from public.approve_payment_submission($1)', [submissionAtomic]),
      ),
    )
    assert.equal(atomicApprovalError.code, '23514')

    const atomicState = await query(
      client,
      `
        select ps.status as submission_status, ps.reviewed_by, ps.reviewed_at,
               o.status as order_status
        from public.payment_submissions ps
        join public.orders o on o.id = ps.order_id
        where ps.id = $1
      `,
      [submissionAtomic],
    )
    assert.deepEqual(atomicState.rows[0], {
      submission_status: 'submitted',
      reviewed_by: null,
      reviewed_at: null,
      order_status: 'pending',
    })

    const approvalRetry = await asAuthenticated(client, ids.manager, () =>
      query(client, 'select * from public.approve_payment_submission($1)', [submissionApproved]),
    )
    assert.deepEqual(approvalRetry.rows[0], approved.rows[0])

    const rejected = await asAuthenticated(client, ids.manager, () =>
      query(client, 'select * from public.reject_payment_submission($1, $2)', [submissionRejected, 'ยอดเงินไม่ตรง']),
    )
    assert.deepEqual(rejected.rows[0], {
      payment_submission_id: submissionRejected,
      order_id: orderRejected,
      status: 'rejected',
    })

    const rejectedState = await query(
      client,
      `
        select ps.status as submission_status, ps.reviewed_by::text, ps.reviewed_at is not null as reviewed,
               o.status as order_status
        from public.payment_submissions ps
        join public.orders o on o.id = ps.order_id
        where ps.id = $1
      `,
      [submissionRejected],
    )
    assert.equal(rejectedState.rows[0].submission_status, 'rejected')
    assert.equal(rejectedState.rows[0].reviewed_by, ids.manager)
    assert.equal(rejectedState.rows[0].reviewed, true)
    assert.equal(rejectedState.rows[0].order_status, 'pending')

    const rejectedAccess = await asAuthenticated(client, ids.buyer, () =>
      query(
        client,
        `select id from public.orders where user_id = $1 and package_id = $2 and status in ('paid', 'free')`,
        [ids.buyer, packageRejected],
      ),
    )
    assert.equal(rejectedAccess.rows.length, 0)

    const rejectedPaidError = await asAuthenticated(client, ids.manager, () =>
      expectRejected(client, 'paid transition after rejection', () =>
        query(client, 'update public.orders set status = \'paid\' where id = $1', [orderRejected]),
      ),
    )
    assert.equal(rejectedPaidError.code, '42501')

    await asAuthenticated(client, ids.manager, () =>
      query(client, 'update public.orders set status = \'paid\' where id = $1', [orderOmiseCoexistence]),
    )
    const manualCoexistenceError = await asAuthenticated(client, ids.manager, () =>
      expectRejected(client, 'manual order in Omise coexistence scenario', () =>
        query(client, 'update public.orders set status = \'paid\' where id = $1', [orderManualCoexistence]),
      ),
    )
    assert.equal(manualCoexistenceError.code, '42501')

    const omiseStates = await query(
      client,
      'select id::text, status, payment_provider from public.orders where id = any($1::uuid[]) order by id',
      [[orderManualCoexistence, orderOmiseCoexistence]],
    )
    assert.deepEqual(omiseStates.rows, [
      { id: orderManualCoexistence, status: 'pending', payment_provider: 'promptpay_manual' },
      { id: orderOmiseCoexistence, status: 'paid', payment_provider: 'omise' },
    ].sort((a, b) => a.id.localeCompare(b.id)))

    const freeAccess = await asAuthenticated(client, ids.buyer, () =>
      query(
        client,
        `select id from public.orders where user_id = $1 and package_id = $2 and status in ('paid', 'free')`,
        [ids.buyer, packageFree],
      ),
    )
    assert.equal(freeAccess.rows.length, 1)

    await query(client, 'rollback')
    console.log(JSON.stringify({
      status: 'PASS',
      database: 'disposable-only',
      migration: '088',
      assertions: {
        manual_paid_guard: true,
        manual_paid_insert_guard: true,
        approved_state_forgery_denied: true,
        canonical_approval_paid_order: true,
        canonical_approval_atomic: true,
        approval_idempotent: true,
        rejection_preserves_pending_and_denies_access: true,
        customer_and_support_boundaries: true,
        support_mutation_denied: true,
        omise_manual_coexistence: true,
        free_access_unchanged: true,
      },
    }, null, 2))
  } catch (error) {
    await query(client, 'rollback').catch(() => {})
    throw error
  } finally {
    await client.end()
  }
}

runProof().catch((error) => {
  console.error(JSON.stringify({
    status: 'FAIL',
    code: error?.code ?? null,
    message: error?.message ?? String(error),
  }, null, 2))
  process.exitCode = 1
})
