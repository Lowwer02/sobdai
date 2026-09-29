#!/usr/bin/env node

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import pg from 'pg'

const { Client } = pg

const TEST_GUARD = 'YES_I_AM_USING_SOBDAI_PAYMENT_M13A_DB_TEST'
const LOCAL_ONLY_GUARD = 'YES_I_AM_USING_SOBDAI_LOCAL_DB_ONLY'
const DATABASE_ENV = 'M1_3A_PAYMENT_DB_TEST_DATABASE_URL'
const STATEMENT_TIMEOUT = '15000ms'
const OPERATION_TIMEOUT_MS = 10000
const REQUIRED_ENVIRONMENT = [
  'M1_3A_PAYMENT_DB_ALLOW_DESTRUCTIVE_TESTS',
  DATABASE_ENV,
  'M1_3A_PAYMENT_DB_LOCAL_ONLY',
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
  manager: process.env.M1_3A_PAYMENT_DB_MANAGER_EMAIL || 'sec-db2a-admin@example.com',
  buyer: process.env.M1_3A_PAYMENT_DB_BUYER_EMAIL || 'sec-db2a-normal-user@example.com',
  other: process.env.M1_3A_PAYMENT_DB_OTHER_EMAIL || 'm1-2-other@example.test',
  support: process.env.M1_3A_PAYMENT_DB_SUPPORT_EMAIL || 'sec-db2a-support@example.com',
}

function ensure(condition, message) {
  assert.ok(condition, message)
}

function readConfiguration() {
  for (const key of REQUIRED_ENVIRONMENT) ensure(process.env[key], `missing required environment: ${key}`)
  for (const key of FORBIDDEN_APPLICATION_ENVIRONMENT) {
    assert.equal(process.env[key], undefined, `application environment is forbidden: ${key}`)
  }

  assert.equal(process.env.M1_3A_PAYMENT_DB_ALLOW_DESTRUCTIVE_TESTS, TEST_GUARD)
  assert.equal(process.env.M1_3A_PAYMENT_DB_LOCAL_ONLY, LOCAL_ONLY_GUARD)

  let databaseUrl
  try {
    databaseUrl = new URL(process.env[DATABASE_ENV])
  } catch {
    throw new Error('local database URL is invalid')
  }

  ensure(['postgres:', 'postgresql:'].includes(databaseUrl.protocol), 'database URL is not PostgreSQL')
  ensure(['127.0.0.1', 'localhost'].includes(databaseUrl.hostname), 'database must use loopback host')
  ensure(/^\/sobdai_m13a_payment_test_[a-z0-9_]+$/.test(databaseUrl.pathname), 'database name is not disposable M1.3A test database')
  ensure(databaseUrl.username === 'postgres', 'database must use postgres role')
  ensure(databaseUrl.password === '', 'local database URL must not contain a password')
  ensure(databaseUrl.port !== '', 'local database URL must declare a port')
  ensure(databaseUrl.search === '' && databaseUrl.hash === '', 'database URL contains unexpected parts')

  return { databaseUrl: databaseUrl.toString() }
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

async function setClaims(client, role, userId = null) {
  await query(client, `set role ${role}`)
  await query(client, "select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ role, ...(userId ? { sub: userId } : {}) })])
  await query(client, "select set_config('request.jwt.claim.role', $1, false)", [role])
  if (userId) await query(client, "select set_config('request.jwt.claim.sub', $1, false)", [userId])
}

async function resetClaims(client) {
  await query(client, 'reset role')
  await query(client, "select set_config('request.jwt.claims', '{}', false)")
  await query(client, "select set_config('request.jwt.claim.role', '', false)")
  await query(client, "select set_config('request.jwt.claim.sub', '', false)")
}

async function asRole(client, role, userId, callback) {
  await setClaims(client, role, userId)
  try {
    return await callback()
  } finally {
    await resetClaims(client)
  }
}

async function expectRejected(client, label, callback) {
  const savepoint = `m13a_failure_${randomUUID().replaceAll('-', '')}`
  await query(client, 'begin')
  try {
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
    await query(client, 'commit')
    return error
  } catch (error) {
    await query(client, 'rollback').catch(() => {})
    throw error
  }
}

async function lookupFixtureIds(client) {
  const result = await query(
    client,
    `select id::text, email, role, status, deleted_at from public.profiles where email = any($1::text[])`,
    [Object.values(FIXTURE_EMAILS)],
  )
  const byEmail = new Map(result.rows.map((row) => [row.email, row]))
  const ids = {}
  for (const [key, email] of Object.entries(FIXTURE_EMAILS)) {
    const row = byEmail.get(email)
    ensure(row, `missing disposable profile: ${email}`)
    ensure(row.status === 'active' && row.deleted_at === null, `${key} fixture is not active`)
    ids[key] = row.id
  }
  ensure(['owner', 'admin'].includes(byEmail.get(FIXTURE_EMAILS.manager).role), 'manager fixture lacks financial role')
  ensure(byEmail.get(FIXTURE_EMAILS.buyer).role === 'user', 'buyer fixture must be a customer')
  ensure(byEmail.get(FIXTURE_EMAILS.other).role === 'user', 'other fixture must be a customer')
  ensure(byEmail.get(FIXTURE_EMAILS.support).role === 'support', 'support fixture must be read-only support')
  return ids
}

async function assertMigrationObjects(client) {
  const result = await query(
    client,
    `
      select
        to_regclass('public.payment_verifications') is not null as verifications,
        to_regclass('public.approved_payment_evidence') is not null as approved_evidence,
        to_regclass('public.payment_verification_events') is not null as events,
        to_regclass('public.payment_verification_legacy_backfill_results') is not null as legacy_backfill_results,
        to_regclass('public.payment_provider_attestations') is not null as provider_attestations,
        exists (select 1 from pg_class where oid = 'public.payment_verifications'::regclass and relrowsecurity) as verification_rls,
        exists (select 1 from pg_class where oid = 'public.approved_payment_evidence'::regclass and relrowsecurity) as evidence_rls,
        exists (select 1 from pg_class where oid = 'public.payment_verification_events'::regclass and relrowsecurity) as events_rls,
        exists (select 1 from pg_class where oid = 'public.payment_verification_legacy_backfill_results'::regclass and relrowsecurity) as legacy_backfill_rls,
        exists (select 1 from pg_class where oid = 'public.payment_provider_attestations'::regclass and relrowsecurity) as provider_attestation_rls,
        exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'payment_provider_attestations' and column_name = 'provider_transaction_identity') as provider_transaction_identity_column,
        exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'payment_provider_attestations' and column_name = 'provider_transaction_at') as provider_transaction_at_column,
        exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'payment_provider_attestations' and column_name = 'provider_verified_at') as provider_verified_at_column,
        exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'payment_provider_attestations' and column_name = 'valid_until') as provider_valid_until_column,
        to_regclass('public.payment_provider_attestations_verified_transaction_key') is not null as provider_transaction_unique_index,
        exists (select 1 from pg_constraint where conrelid = 'public.payment_provider_attestations'::regclass and conname = 'payment_provider_attestation_temporal_check') as provider_temporal_constraint,
        has_table_privilege('authenticated', 'public.payment_verifications', 'SELECT') as verification_select,
        has_table_privilege('service_role', 'public.payment_verifications', 'SELECT') as verification_service_select,
        has_table_privilege('authenticated', 'public.payment_verifications', 'INSERT') as verification_insert,
        has_table_privilege('authenticated', 'public.payment_verifications', 'UPDATE') as verification_update,
        has_table_privilege('service_role', 'public.payment_provider_attestations', 'INSERT') as provider_service_insert,
        has_table_privilege('authenticated', 'public.payment_provider_attestations', 'INSERT') as provider_authenticated_insert,
        has_table_privilege('anon', 'public.payment_provider_attestations', 'INSERT') as provider_anon_insert,
        has_table_privilege('authenticated', 'public.payment_verification_events', 'INSERT') as events_insert,
        has_function_privilege('service_role', 'public.start_payment_verification(uuid,uuid,boolean)', 'EXECUTE') as start_service,
        has_function_privilege('authenticated', 'public.start_payment_verification(uuid,uuid,boolean)', 'EXECUTE') as start_authenticated,
        has_function_privilege('service_role', 'public.complete_payment_verification(uuid,uuid,jsonb)', 'EXECUTE') as complete_service,
        has_function_privilege('service_role', 'public.auto_approve_payment_verification(uuid)', 'EXECUTE') as auto_service,
        has_function_privilege('authenticated', 'public.auto_approve_payment_verification(uuid)', 'EXECUTE') as auto_authenticated,
        has_function_privilege('anon', 'public.auto_approve_payment_verification(uuid)', 'EXECUTE') as auto_anon,
        has_function_privilege('service_role', 'public.start_payment_verification_legacy_backfill()', 'EXECUTE') as backfill_start_service,
        has_function_privilege('service_role', 'public.get_payment_verification_legacy_backfill_page(integer)', 'EXECUTE') as backfill_page_service,
        has_function_privilege('authenticated', 'public.start_payment_verification_legacy_backfill()', 'EXECUTE') as backfill_start_authenticated,
        has_function_privilege('authenticated', 'public.get_payment_verification_legacy_backfill_page(integer)', 'EXECUTE') as backfill_page_authenticated,
        has_function_privilege('service_role', 'public.complete_payment_verification_legacy_backfill(integer,integer,integer)', 'EXECUTE') as backfill_complete_service,
        has_function_privilege('service_role', 'public.record_payment_verification_legacy_backfill(uuid,text,text,text,text,text,text)', 'EXECUTE') as backfill_record_service,
        has_function_privilege('service_role', 'public.list_payment_slip_retention_candidates(timestamptz)', 'EXECUTE') as retention_service,
        has_function_privilege('service_role', 'public.update_payment_verification_settings(boolean,text,text[])', 'EXECUTE') as settings_service,
        has_function_privilege('authenticated', 'public.update_payment_verification_settings(boolean,text,text[])', 'EXECUTE') as settings_authenticated,
        has_function_privilege('authenticated', 'public.get_payment_verification_customer_status(uuid)', 'EXECUTE') as customer_status_authenticated,
        has_function_privilege('anon', 'public.get_payment_verification_customer_status(uuid)', 'EXECUTE') as customer_status_anon,
        (select column_default = 'false' from information_schema.columns where table_schema = 'public' and table_name = 'payment_settings' and column_name = 'auto_approval_enabled') as shadow_default,
        (select column_default = 'false' from information_schema.columns where table_schema = 'public' and table_name = 'payment_settings' and column_name = 'legacy_replay_backfill_complete') as legacy_replay_default,
        exists (select 1 from pg_trigger where tgname = 'payment_verification_events_append_only') as append_only_trigger
    `,
  )
  assert.deepEqual(result.rows[0], {
    verifications: true,
    approved_evidence: true,
    events: true,
    legacy_backfill_results: true,
    provider_attestations: true,
    verification_rls: true,
    evidence_rls: true,
    events_rls: true,
    legacy_backfill_rls: true,
    provider_attestation_rls: true,
    provider_transaction_identity_column: true,
    provider_transaction_at_column: true,
    provider_verified_at_column: true,
    provider_valid_until_column: true,
    provider_transaction_unique_index: true,
    provider_temporal_constraint: true,
    verification_select: false,
    verification_service_select: true,
    verification_insert: false,
    verification_update: false,
    provider_service_insert: false,
    provider_authenticated_insert: false,
    provider_anon_insert: false,
    events_insert: false,
    start_service: true,
    start_authenticated: false,
    complete_service: true,
    auto_service: true,
    auto_authenticated: false,
    auto_anon: false,
    backfill_start_service: true,
    backfill_page_service: true,
    backfill_start_authenticated: false,
    backfill_page_authenticated: false,
    backfill_complete_service: true,
    backfill_record_service: true,
    retention_service: true,
    settings_service: true,
    settings_authenticated: false,
    customer_status_authenticated: true,
    customer_status_anon: false,
    shadow_default: true,
    legacy_replay_default: true,
    append_only_trigger: true,
  })

  const identityIndex = await query(
    client,
    `select pg_get_indexdef('public.payment_provider_attestations_verified_transaction_key'::regclass) as definition`,
  )
  assert.match(identityIndex.rows[0].definition, /unique index .* \(provider, method, provider_transaction_identity\)/i)
  assert.match(identityIndex.rows[0].definition, /where .*status = 'VERIFIED'/i)
}

async function insertPackage(client, id, suffix, amount) {
  await query(
    client,
    `insert into public.packages (id, slug, package_code, name, current_price, original_price, difficulty, features, is_published)
     values ($1, $2, $3, $4, $5, $5, 'Mixed', '[]'::jsonb, true)`,
    [id, `m13a-${suffix}-${id.slice(0, 8)}`, `M13A-${suffix}-${id.slice(0, 8)}`, `M1.3A ${suffix}`, amount],
  )
}

async function insertOrder(client, id, userId, packageId, amount) {
  await query(
    client,
    `insert into public.orders (id, user_id, package_id, amount, status, payment_provider)
     values ($1, $2, $3, $4, 'pending', 'promptpay_manual')`,
    [id, userId, packageId, amount],
  )
}

async function insertSubmission(client, id, orderId, userId, suffix) {
  const storageObjectPath = `${userId}/${orderId}/${randomUUID()}.png`
  await query(
    client,
    `insert into public.payment_submissions (id, order_id, idempotency_key, storage_object_path, original_filename, mime_type, file_size_bytes, payment_method, status)
     values ($1, $2, $3, $4, $5, 'image/png', 128, 'promptpay_manual', 'submitted')`,
    [id, orderId, randomUUID(), storageObjectPath, `${suffix}.png`],
  )
  return { id, orderId, storageObjectPath }
}

async function insertStorageObject(client, storageObjectPath) {
  await query(
    client,
    `insert into storage.objects (id, bucket_id, name) values ($1, 'payment-slips', $2)`,
    [randomUUID(), storageObjectPath],
  )
}

async function insertProviderAttestation(client, fixture, verification, overrides = {}) {
  const attestationId = randomUUID()
  fixture.attestations.push(attestationId)
  const status = overrides.status || 'VERIFIED'
  const timestampBase = Date.now()
  const providerTransactionAt = overrides.providerTransactionAt === undefined
    ? (status === 'VERIFIED' ? new Date(timestampBase).toISOString() : null)
    : overrides.providerTransactionAt
  const providerVerifiedAt = overrides.providerVerifiedAt === undefined
    ? (status === 'VERIFIED' ? new Date(timestampBase).toISOString() : null)
    : overrides.providerVerifiedAt
  const validUntil = overrides.validUntil === undefined
    ? (status === 'VERIFIED' ? new Date(timestampBase + 60 * 60 * 1000).toISOString() : null)
    : overrides.validUntil
  const createdAt = overrides.createdAt === undefined
    ? new Date(timestampBase).toISOString()
    : overrides.createdAt
  const providerTransactionIdentity = overrides.providerTransactionIdentity === undefined
    ? `promptpay-provider-api-v1:${verification.verificationId}`
    : overrides.providerTransactionIdentity
  await query(client, `
    insert into public.payment_provider_attestations (
      id, verification_id, submission_id, order_id, provider, method, status,
      transaction_reference_fingerprint, transaction_amount, recipient_name,
      destination_suffix, provider_transaction_identity, provider_transaction_at,
      provider_verified_at, valid_until, created_at
    ) values ($1, $2, $3, $4, 'promptpay_authoritative', 'promptpay_provider_api_v1', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
  `, [
    attestationId,
    overrides.verificationId || verification.verificationId,
    overrides.submissionId || verification.submissionId,
    overrides.orderId || verification.orderId,
    status,
    overrides.referenceFingerprint === undefined ? verification.referenceFingerprint : overrides.referenceFingerprint,
    overrides.transactionAmount === undefined ? (status === 'VERIFIED' ? 900 : null) : overrides.transactionAmount,
    overrides.recipientName === undefined ? 'กิตติพงษ์' : overrides.recipientName,
    overrides.destinationSuffix === undefined ? '1853' : overrides.destinationSuffix,
    providerTransactionIdentity,
    providerTransactionAt,
    providerVerifiedAt,
    validUntil,
    createdAt,
  ])
  return attestationId
}

function identityHex(identity) {
  return Buffer.from(identity).toString('hex').padEnd(64, '0').slice(0, 64)
}

function analyzerResult(decision = 'MANUAL_REVIEW', identity = 'test', overrides = {}) {
  const referenceSuffix = identityHex(overrides.reference || identity)
  const rawSuffix = identityHex(overrides.raw || identity)
  const normalizedSuffix = identityHex(overrides.normalized || identity)
  return {
    analyzerVersion: 'm1.3a-shadow-1',
    decision,
    state: decision,
    detectedAmount: decision === 'STRONG_MATCH' ? '900.00' : null,
    amountMatchState: decision === 'STRONG_MATCH' ? 'MATCH' : 'UNKNOWN',
    recipientMatchState: decision === 'STRONG_MATCH' ? 'MATCH' : 'UNKNOWN',
    destinationMatchState: decision === 'STRONG_MATCH' ? 'MATCH' : 'UNKNOWN',
    qrKind: decision === 'STRONG_MATCH' ? 'SLIP_VERIFICATION' : 'UNKNOWN',
    qrStructureValid: decision === 'STRONG_MATCH' ? true : null,
    qrCrcValid: decision === 'STRONG_MATCH' ? true : null,
    referenceExtracted: decision === 'STRONG_MATCH',
    qrFormat: decision === 'STRONG_MATCH' ? 'BANK_SLIP_VERIFY' : null,
    providerAttestation: 'NOT_CHECKED',
    referenceState: decision === 'STRONG_MATCH' ? 'VALID_UNIQUE' : 'UNKNOWN',
    referenceFingerprint: decision === 'STRONG_MATCH' ? `hmac-sha256:v1:${referenceSuffix}` : null,
    rawImageHash: decision === 'STRONG_MATCH' ? `sha256:v1:${rawSuffix}` : null,
    normalizedImageHash: decision === 'STRONG_MATCH' ? `sha256:v1:${normalizedSuffix}` : null,
    perceptualHash: decision === 'STRONG_MATCH' ? 'phash:v1:0000000000000000000000000000000000000000000000000000000000000000' : null,
    imageDuplicateState: 'NONE',
    timestampState: 'UNKNOWN',
    reasonCodes: [],
    durationMs: 2,
  }
}

function manualMachineResult(identity, overrides = {}) {
  const result = analyzerResult('MANUAL_REVIEW')
  const referenceSuffix = identityHex(overrides.reference || identity)
  const rawSuffix = identityHex(overrides.raw || identity)
  const normalizedSuffix = identityHex(overrides.normalized || identity)
  result.referenceState = 'VALID_UNIQUE'
  result.referenceFingerprint = `hmac-sha256:v1:${referenceSuffix}`
  result.rawImageHash = `sha256:v1:${rawSuffix}`
  result.normalizedImageHash = `sha256:v1:${normalizedSuffix}`
  result.perceptualHash = 'phash:v1:0000000000000000000000000000000000000000000000000000000000000000'
  return result
}

async function openDbClient(connectionString) {
  const session = new Client({ connectionString, connectionTimeoutMillis: 10000 })
  await session.connect()
  await query(session, `set statement_timeout = '${STATEMENT_TIMEOUT}'`)
  return session
}

async function invoke(connectionString, role, userId, sql, params = []) {
  const session = await openDbClient(connectionString)
  try {
    return await asRole(session, role, userId, () => query(session, sql, params))
  } finally {
    await session.end().catch(() => {})
  }
}

async function invokeCaptured(connectionString, role, userId, sql, params = []) {
  try {
    return { result: await invoke(connectionString, role, userId, sql, params), error: null }
  } catch (error) {
    return { result: null, error }
  }
}

async function createVerificationFixture(client, fixture, userId, suffix, result, options = {}) {
  const packageId = randomUUID()
  const orderId = randomUUID()
  const submissionId = randomUUID()
  fixture.packages.push(packageId)
  fixture.orders.push(orderId)
  fixture.submissions.push(submissionId)
  await insertPackage(client, packageId, suffix, 900)
  await insertOrder(client, orderId, userId, packageId, 900)
  const submission = await insertSubmission(client, submissionId, orderId, userId, suffix)
  await insertStorageObject(client, submission.storageObjectPath)
  const leaseToken = randomUUID()
  const claim = await asRole(
    client,
    'service_role',
    null,
    () => query(client, 'select * from public.start_payment_verification($1, $2, false)', [submissionId, leaseToken]),
  )
  assert.equal(claim.rows[0].lease_acquired, true)
  const completion = await asRole(
    client,
    'service_role',
    null,
    () => completeVerification(client, claim.rows[0].verification_id, leaseToken, result),
  )
  assert.equal(completion.rows[0].state, result.decision)
  const verification = {
    packageId,
    orderId,
    submissionId,
    verificationId: claim.rows[0].verification_id,
    referenceFingerprint: result.referenceFingerprint,
  }
  if (options.providerAttestation) {
    await insertProviderAttestation(
      client,
      fixture,
      verification,
      options.providerAttestation === true ? {} : options.providerAttestation,
    )
  }
  return verification
}

async function completeVerification(client, verificationId, leaseToken, result) {
  return query(
    client,
    `select * from public.complete_payment_verification($1, $2, $3::jsonb)`,
    [verificationId, leaseToken, JSON.stringify(result)],
  )
}

async function cleanFixture(client, ids) {
  // This is a disposable local harness. The append-only event trigger is
  // intentionally exercised above; cleanup uses a superuser-only local
  // transaction setting so the fixture cannot remain behind after a failure.
  await query(client, 'begin')
  try {
    await query(client, 'set local session_replication_role = replica')
    await query(client, 'delete from public.notifications where source_order_id = any($1::uuid[])', [ids.orders])
    await query(client, 'delete from public.payment_verification_legacy_backfill_results where submission_id = any($1::uuid[])', [ids.submissions])
    await query(client, 'delete from public.payment_provider_attestations where order_id = any($1::uuid[])', [ids.orders])
    await query(client, 'delete from public.approved_payment_evidence where order_id = any($1::uuid[])', [ids.orders])
    await query(client, 'delete from public.payment_verification_events where submission_id = any($1::uuid[])', [ids.submissions])
    await query(client, 'delete from public.payment_verifications where submission_id = any($1::uuid[])', [ids.submissions])
    await query(client, 'delete from public.payment_submissions where id = any($1::uuid[])', [ids.submissions])
    await query(client, 'delete from public.orders where id = any($1::uuid[])', [ids.orders])
    await query(client, 'delete from public.packages where id = any($1::uuid[])', [ids.packages])
    await query(client, 'commit')
  } catch (error) {
    await query(client, 'rollback').catch(() => {})
    throw error
  }
}

async function assertFullPaymentRaceState(client, label, expectedRows) {
  const orderIds = expectedRows.map((expected) => expected.orderId)
  const state = await query(client, `
    select
      o.id as order_id,
      (select count(*)::int from public.orders same_order where same_order.id = o.id) as order_count,
      o.status as order_status,
      (select count(*)::int from public.payment_submissions ps where ps.order_id = o.id) as submission_count,
      (select ps.status from public.payment_submissions ps where ps.order_id = o.id order by ps.created_at, ps.id limit 1) as submission_status,
      (select ps.review_source from public.payment_submissions ps where ps.order_id = o.id order by ps.created_at, ps.id limit 1) as submission_review_source,
      (select ps.reviewed_by is null from public.payment_submissions ps where ps.order_id = o.id order by ps.created_at, ps.id limit 1) as submission_reviewed_by_is_null,
      (select count(*)::int from public.payment_verifications pv where pv.order_id = o.id) as verification_count,
      (select pv.state from public.payment_verifications pv where pv.order_id = o.id order by pv.created_at, pv.id limit 1) as verification_state,
      (select count(*)::int from public.approved_payment_evidence ape where ape.order_id = o.id) as approved_evidence_count,
      (select count(*)::int from public.payment_provider_attestations pa where pa.order_id = o.id) as provider_attestation_count,
      (select count(*)::int from public.payment_provider_attestations pa where pa.order_id = o.id and pa.status = 'VERIFIED') as verified_provider_attestation_count,
      (select count(*)::int from public.payment_verification_events pve where pve.order_id = o.id) as verification_event_count,
      (select count(*)::int from public.notifications n where n.source_order_id = o.id) as notification_count
    from public.orders o
    where o.id = any($1::uuid[])
    order by o.id
  `, [orderIds])

  assert.equal(state.rows.length, expectedRows.length, `${label}: expected one aggregate row per race order`)
  const actualByOrder = new Map(state.rows.map((row) => [row.order_id, row]))
  for (const expected of expectedRows) {
    const row = actualByOrder.get(expected.orderId)
    ensure(row, `${label}: missing final state for ${expected.orderId}`)
    assert.deepEqual({
      order_count: row.order_count,
      order_status: row.order_status,
      submission_count: row.submission_count,
      submission_status: row.submission_status,
      submission_review_source: row.submission_review_source,
      submission_reviewed_by_is_null: row.submission_reviewed_by_is_null,
      verification_count: row.verification_count,
      verification_state: row.verification_state,
      approved_evidence_count: row.approved_evidence_count,
      provider_attestation_count: row.provider_attestation_count,
      verified_provider_attestation_count: row.verified_provider_attestation_count,
      verification_event_count: row.verification_event_count,
      notification_count: row.notification_count,
    }, {
      order_count: 1,
      order_status: expected.orderStatus,
      submission_count: 1,
      submission_status: expected.submissionStatus,
      submission_review_source: expected.submissionReviewSource,
      submission_reviewed_by_is_null: expected.submissionReviewedByIsNull,
      verification_count: 1,
      verification_state: expected.verificationState,
      approved_evidence_count: expected.approvedEvidenceCount,
      provider_attestation_count: expected.providerAttestationCount,
      verified_provider_attestation_count: expected.verifiedProviderAttestationCount,
      verification_event_count: expected.verificationEventCount,
      notification_count: expected.notificationCount,
    }, `${label}: unexpected financial state mutation for ${expected.orderId}`)
  }

  const integrity = await query(client, `
    select
      (
        select count(*)::int
        from public.payment_verifications pv
        where pv.order_id = any($1::uuid[])
          and not exists (
            select 1
            from public.payment_submissions ps
            where ps.id = pv.submission_id
              and ps.order_id = pv.order_id
          )
      ) as verification_linkage_errors,
      (
        select count(*)::int
        from public.payment_provider_attestations pa
        where pa.order_id = any($1::uuid[])
          and not exists (
            select 1
            from public.payment_verifications pv
            join public.payment_submissions ps on ps.id = pv.submission_id
            where pv.id = pa.verification_id
              and pv.submission_id = pa.submission_id
              and pv.order_id = pa.order_id
              and ps.order_id = pa.order_id
          )
      ) as provider_attestation_orphans,
      (
        select count(*)::int
        from public.payment_verification_events pve
        where pve.order_id = any($1::uuid[])
          and (
            pve.verification_id is null
            or not exists (
              select 1
              from public.payment_verifications pv
              join public.payment_submissions ps on ps.id = pv.submission_id
              where pv.id = pve.verification_id
                and pv.submission_id = pve.submission_id
                and pv.order_id = pve.order_id
                and ps.order_id = pve.order_id
            )
          )
      ) as verification_event_linkage_errors,
      (
        select count(*)::int
        from public.notifications n
        where n.source_order_id = any($1::uuid[])
          and n.source_payment_submission_id is not null
          and not exists (
            select 1
            from public.payment_submissions ps
            where ps.id = n.source_payment_submission_id
              and ps.order_id = n.source_order_id
          )
      ) as notification_linkage_errors,
      (
        select count(*)::int
        from (
          select provider, method, provider_transaction_identity
          from public.payment_provider_attestations
          where status = 'VERIFIED'
          group by provider, method, provider_transaction_identity
          having count(*) > 1
        ) duplicate_verified_transactions
      ) as duplicate_verified_provider_transactions
  `, [orderIds])

  assert.deepEqual(integrity.rows[0], {
    verification_linkage_errors: 0,
    provider_attestation_orphans: 0,
    verification_event_linkage_errors: 0,
    notification_linkage_errors: 0,
    duplicate_verified_provider_transactions: 0,
  }, `${label}: full-state linkage/integrity assertion failed`)
}

async function readPaymentFixtureTimestamps(client, verification) {
  const result = await query(client, `
    select o.created_at as order_created_at,
           ps.created_at as submission_created_at
    from public.orders o
    join public.payment_submissions ps on ps.order_id = o.id
    join public.payment_verifications pv on pv.submission_id = ps.id
    where o.id = $1 and ps.id = $2 and pv.id = $3
  `, [verification.orderId, verification.submissionId, verification.verificationId])
  assert.equal(result.rows.length, 1)
  return result.rows[0]
}

async function assertProviderAutoApproved(client, verification, label) {
  const approval = await asRole(
    client,
    'service_role',
    null,
    () => query(client, 'select * from public.auto_approve_payment_verification($1)', [verification.verificationId]),
  )
  assert.equal(approval.rows[0].status, 'approved')
  await assertFullPaymentRaceState(client, label, [{
    orderId: verification.orderId,
    orderStatus: 'paid',
    submissionStatus: 'approved',
    submissionReviewSource: 'automatic',
    submissionReviewedByIsNull: true,
    verificationState: 'AUTO_APPROVED',
    approvedEvidenceCount: 1,
    providerAttestationCount: 1,
    verifiedProviderAttestationCount: 1,
    verificationEventCount: 5,
    notificationCount: 1,
  }])
}

async function assertProviderAutoDenied(client, verification, label) {
  const denial = await asRole(
    client,
    'service_role',
    null,
    () => expectRejected(client, label, () => query(
      client,
      'select * from public.auto_approve_payment_verification($1)',
      [verification.verificationId],
    )),
  )
  assert.equal(denial.code, '40001')
  await assertFullPaymentRaceState(client, label, [{
    orderId: verification.orderId,
    orderStatus: 'pending',
    submissionStatus: 'submitted',
    submissionReviewSource: 'manual',
    submissionReviewedByIsNull: true,
    verificationState: 'STRONG_MATCH',
    approvedEvidenceCount: 0,
    providerAttestationCount: 1,
    verifiedProviderAttestationCount: 1,
    verificationEventCount: 3,
    notificationCount: 0,
  }])
}

async function runProof() {
  const config = readConfiguration()
  const client = new Client({ connectionString: config.databaseUrl, connectionTimeoutMillis: 10000 })
  await client.connect()
  const fixture = { packages: [], orders: [], submissions: [], attestations: [] }
  const raceClients = []

  try {
    await query(client, `set statement_timeout = '${STATEMENT_TIMEOUT}'`)
    await assertMigrationObjects(client)
    const ids = await lookupFixtureIds(client)

    const backfillStart = await asRole(
      client,
      'service_role',
      null,
      () => query(client, 'select * from public.start_payment_verification_legacy_backfill()'),
    )
    assert.equal(backfillStart.rows.length, 1)
    assert.equal(backfillStart.rows[0].already_complete, false)
    const incompleteBackfill = await asRole(
      client,
      'service_role',
      null,
      () => query(client, 'select * from public.complete_payment_verification_legacy_backfill($1, $2, $3)', [1, 0, 0]),
    )
    assert.equal(incompleteBackfill.rows[0].complete, false)
    const fenceState = await query(client, 'select auto_approval_enabled, legacy_replay_backfill_complete from public.payment_settings where id = 1')
    assert.equal(fenceState.rows[0].auto_approval_enabled, false)
    assert.equal(fenceState.rows[0].legacy_replay_backfill_complete, false)

    for (const role of ['anon', 'authenticated']) {
      const userId = role === 'authenticated' ? ids.buyer : null
      const leaseDenied = await invokeCaptured(
        config.databaseUrl,
        role,
        userId,
        'select * from public.start_payment_verification($1, $2, false)',
        [randomUUID(), randomUUID()],
      )
      assert.ok(leaseDenied.error, `${role} invoked verification lease start`)
      assert.equal(leaseDenied.error.code, '42501')

      const startDenied = await invokeCaptured(
        config.databaseUrl,
        role,
        userId,
        'select * from public.start_payment_verification_legacy_backfill()',
      )
      assert.ok(startDenied.error, `${role} invoked legacy backfill start`)
      assert.equal(startDenied.error.code, '42501')
      const pageDenied = await invokeCaptured(
        config.databaseUrl,
        role,
        userId,
        'select * from public.get_payment_verification_legacy_backfill_page($1)',
        [100],
      )
      assert.ok(pageDenied.error, `${role} invoked legacy backfill page`)
      assert.equal(pageDenied.error.code, '42501')
      const completeDenied = await invokeCaptured(
        config.databaseUrl,
        role,
        userId,
        'select * from public.complete_payment_verification_legacy_backfill($1, $2, $3)',
        [0, 0, 0],
      )
      assert.ok(completeDenied.error, `${role} invoked legacy backfill completion`)
      assert.equal(completeDenied.error.code, '42501')

      const recordDenied = await invokeCaptured(
        config.databaseUrl,
        role,
        userId,
        'select * from public.record_payment_verification_legacy_backfill($1, $2, $3, $4, $5, $6, $7)',
        [randomUUID(), 'UNSUPPORTED_REFERENCE', 'test', null, null, null, null],
      )
      assert.ok(recordDenied.error, `${role} invoked legacy backfill record`)
      assert.equal(recordDenied.error.code, '42501')

      const retentionDenied = await invokeCaptured(
        config.databaseUrl,
        role,
        userId,
        'select * from public.list_payment_slip_retention_candidates()',
      )
      assert.ok(retentionDenied.error, `${role} invoked payment retention candidates`)
      assert.equal(retentionDenied.error.code, '42501')

      const settingsDenied = await invokeCaptured(
        config.databaseUrl,
        role,
        userId,
        'select * from public.update_payment_verification_settings($1, $2, $3)',
        [false, 'กิตติพงษ์', ['1853', '853']],
      )
      assert.ok(settingsDenied.error, `${role} invoked verification settings`)
      assert.equal(settingsDenied.error.code, '42501')
    }

    const packageLease = randomUUID()
    const packageExpired = randomUUID()
    const packageAuto = randomUUID()
    const packageManual = randomUUID()
    const orderLease = randomUUID()
    const orderExpired = randomUUID()
    const orderAuto = randomUUID()
    const orderManual = randomUUID()
    const submissionLease = randomUUID()
    const submissionExpired = randomUUID()
    const submissionAuto = randomUUID()
    const submissionManual = randomUUID()
    fixture.packages.push(packageLease, packageExpired, packageAuto, packageManual)
    fixture.orders.push(orderLease, orderExpired, orderAuto, orderManual)
    fixture.submissions.push(submissionLease, submissionExpired, submissionAuto, submissionManual)

    await insertPackage(client, packageLease, 'lease', 900)
    await insertPackage(client, packageExpired, 'expired', 900)
    await insertPackage(client, packageAuto, 'auto', 900)
    await insertPackage(client, packageManual, 'manual', 900)
    await insertOrder(client, orderLease, ids.buyer, packageLease, 900)
    await insertOrder(client, orderExpired, ids.buyer, packageExpired, 900)
    await insertOrder(client, orderAuto, ids.buyer, packageAuto, 900)
    await insertOrder(client, orderManual, ids.buyer, packageManual, 900)
    await insertSubmission(client, submissionLease, orderLease, ids.buyer, 'lease')
    await insertSubmission(client, submissionExpired, orderExpired, ids.buyer, 'expired')
    await insertSubmission(client, submissionAuto, orderAuto, ids.buyer, 'auto')
    await insertSubmission(client, submissionManual, orderManual, ids.buyer, 'manual')

    // A real two-session race must yield exactly one durable lease owner.
    for (let index = 0; index < 2; index += 1) {
      const raceClient = new Client({ connectionString: config.databaseUrl, connectionTimeoutMillis: 10000 })
      await raceClient.connect()
      await query(raceClient, `set statement_timeout = '${STATEMENT_TIMEOUT}'`)
      raceClients.push(raceClient)
    }
    const raceTokens = [randomUUID(), randomUUID()]
    const raceResults = await Promise.all(raceClients.map((raceClient, index) => asRole(
      raceClient,
      'service_role',
      null,
      () => query(raceClient, 'select * from public.start_payment_verification($1, $2, false)', [submissionLease, raceTokens[index]]),
    )))
    const acquired = raceResults
      .map((result, index) => ({ result: result.rows[0], index }))
      .filter(({ result }) => result.lease_acquired === true)
    assert.equal(acquired.length, 1)
    assert.equal(raceResults.filter((result) => result.rows[0].lease_acquired === false).length, 1)

    const winner = acquired[0]
    const completedLease = await asRole(
      raceClients[winner.index],
      'service_role',
      null,
      () => completeVerification(raceClients[winner.index], winner.result.verification_id, raceTokens[winner.index], analyzerResult()),
    )
    assert.equal(completedLease.rows[0].state, 'MANUAL_REVIEW')

    // Service-only result persistence is lease-bound and a second completion
    // cannot overwrite the durable decision after the lease is consumed.
    const staleCompletion = await asRole(
      client,
      'service_role',
      null,
      () => completeVerification(client, winner.result.verification_id, raceTokens[winner.index], analyzerResult('SUSPICIOUS')),
    )
    assert.equal(staleCompletion.rows[0].state, 'MANUAL_REVIEW')
    assert.equal(staleCompletion.rows[0].decision, null)

    await query(client, `
      update public.payment_verifications
      set attempt_count = 20,
          state = 'MANUAL_REVIEW',
          decision = 'MANUAL_REVIEW',
          lease_token = null,
          lease_expires_at = null
      where id = $1
    `, [winner.result.verification_id])
    const retryLimit = await asRole(
      client,
      'service_role',
      null,
      () => query(client, 'select * from public.start_payment_verification($1, $2, true)', [submissionLease, randomUUID()]),
    )
    assert.equal(retryLimit.rows[0].state, 'ANALYZER_ERROR')
    const retryLimitAgain = await asRole(
      client,
      'service_role',
      null,
      () => query(client, 'select * from public.start_payment_verification($1, $2, true)', [submissionLease, randomUUID()]),
    )
    assert.equal(retryLimitAgain.rows[0].state, 'ANALYZER_ERROR')
    const retryLimitEvents = await query(client, `
      select count(*)::int as count
      from public.payment_verification_events
      where verification_id = $1
        and event_type = 'analyzer_error'
        and reason_codes = array['ANALYZER_RETRY_LIMIT']::text[]
    `, [winner.result.verification_id])
    assert.equal(retryLimitEvents.rows[0].count, 1)

    const expiredToken = randomUUID()
    const expiredClaim = await asRole(
      client,
      'service_role',
      null,
      () => query(client, 'select * from public.start_payment_verification($1, $2, false)', [submissionExpired, expiredToken]),
    )
    assert.equal(expiredClaim.rows[0].lease_acquired, true)
    await query(client, 'update public.payment_verifications set lease_expires_at = now() - interval \'1 second\' where id = $1', [expiredClaim.rows[0].verification_id])
    const recoveredToken = randomUUID()
    const recoveredClaim = await asRole(
      client,
      'service_role',
      null,
      () => query(client, 'select * from public.start_payment_verification($1, $2, false)', [submissionExpired, recoveredToken]),
    )
    assert.equal(recoveredClaim.rows[0].lease_acquired, true)
    assert.equal(recoveredClaim.rows[0].attempt_count, 2)
    await asRole(
      client,
      'service_role',
      null,
      () => completeVerification(client, recoveredClaim.rows[0].verification_id, recoveredToken, analyzerResult()),
    )
    const recoveryEvent = await query(client, "select count(*)::int as count from public.payment_verification_events where submission_id = $1 and event_type = 'analysis_lease_recovered'", [submissionExpired])
    assert.equal(recoveryEvent.rows[0].count, 1)

    const autoLeaseToken = randomUUID()
    const autoClaim = await asRole(
      client,
      'service_role',
      null,
      () => query(client, 'select * from public.start_payment_verification($1, $2, false)', [submissionAuto, autoLeaseToken]),
    )
    assert.equal(autoClaim.rows[0].lease_acquired, true)
    const autoVerificationId = autoClaim.rows[0].verification_id
    const autoResult = await asRole(
      client,
      'service_role',
      null,
      () => completeVerification(client, autoVerificationId, autoLeaseToken, analyzerResult('STRONG_MATCH')),
    )
    assert.equal(autoResult.rows[0].state, 'STRONG_MATCH')
    const autoVerification = {
      verificationId: autoVerificationId,
      submissionId: submissionAuto,
      orderId: orderAuto,
      referenceFingerprint: `hmac-sha256:v1:${identityHex('test')}`,
    }

    const replayClaim = await asRole(
      client,
      'service_role',
      null,
      () => query(client, 'select * from public.start_payment_verification($1, $2, false)', [submissionAuto, randomUUID()]),
    )
    assert.equal(replayClaim.rows[0].lease_acquired, false)
    assert.equal(replayClaim.rows[0].state, 'STRONG_MATCH')

    // The automatic primitive is service-only but remains unreachable in
    // shadow mode. The savepoint proves the disabled gate rolls back its
    // attempt event and leaves the order/submission untouched.
    const disabledAutoError = await asRole(
      client,
      'service_role',
      null,
      () => expectRejected(client, 'disabled automatic approval', () => query(client, 'select * from public.auto_approve_payment_verification($1)', [autoVerificationId])),
    )
    assert.equal(disabledAutoError.code, '55000')
    const autoOrderState = await query(client, 'select status from public.orders where id = $1', [orderAuto])
    assert.equal(autoOrderState.rows[0].status, 'pending')

    const settingsEnableError = await asRole(
      client,
      'authenticated',
      ids.manager,
      () => expectRejected(client, 'enable automatic approval before legacy replay backfill', () => query(
        client,
        'select * from public.update_payment_verification_settings($1, $2, $3)',
        [true, 'กิตติพงษ์', ['1853', '853']],
      )),
    )
    assert.equal(settingsEnableError.code, '42501')

    const serviceSettingsEnableError = await asRole(
      client,
      'service_role',
      null,
      () => expectRejected(client, 'service enable automatic approval before legacy replay backfill', () => query(
        client,
        'select * from public.update_payment_verification_settings($1, $2, $3)',
        [true, 'กิตติพงษ์', ['1853', '853']],
      )),
    )
    assert.equal(serviceSettingsEnableError.code, '55000')

    await query(client, 'update public.payment_settings set auto_approval_enabled = true where id = 1')
    const fencedAutoError = await asRole(
      client,
      'service_role',
      null,
      () => expectRejected(client, 'automatic approval with incomplete legacy replay backfill', () => query(
        client,
        'select * from public.auto_approve_payment_verification($1)',
        [autoVerificationId],
      )),
    )
    assert.equal(fencedAutoError.code, '55000')
    await query(client, 'update public.payment_settings set auto_approval_enabled = false where id = 1')

    for (const role of ['anon', 'authenticated']) {
      const autoDenied = await invokeCaptured(
        config.databaseUrl,
        role,
        role === 'authenticated' ? ids.buyer : null,
        'select * from public.auto_approve_payment_verification($1)',
        [autoVerificationId],
      )
      assert.ok(autoDenied.error, `${role} invoked automatic approval`)
      assert.equal(autoDenied.error.code, '42501')
    }

    const fakeProviderBoolean = await invokeCaptured(
      config.databaseUrl,
      'service_role',
      null,
      'select * from public.auto_approve_payment_verification($1, $2)',
      [autoVerificationId, true],
    )
    assert.ok(fakeProviderBoolean.error)
    assert.equal(fakeProviderBoolean.error.code, '42883')

    const autoSubmissionPath = await query(client, 'select storage_object_path from public.payment_submissions where id = $1', [submissionAuto])
    await insertStorageObject(client, autoSubmissionPath.rows[0].storage_object_path)
    await query(client, 'update public.payment_settings set auto_approval_enabled = true, legacy_replay_backfill_complete = true where id = 1')

    const offlineOnlyError = await asRole(
      client,
      'service_role',
      null,
      () => expectRejected(client, 'offline-only strong match auto approval', () => query(
        client,
        'select * from public.auto_approve_payment_verification($1)',
        [autoVerificationId],
      )),
    )
    assert.equal(offlineOnlyError.code, '40001')
    const offlineOnlyFinal = await query(client, `
      select o.status as order_status, ps.status as submission_status,
             pv.state as verification_state,
             (select count(*) from public.approved_payment_evidence where order_id = o.id) as evidence_count,
             (select count(*) from public.notifications where source_order_id = o.id and type = 'PACKAGE_APPROVED') as notification_count
      from public.orders o
      join public.payment_submissions ps on ps.order_id = o.id
      join public.payment_verifications pv on pv.submission_id = ps.id
      where o.id = $1
    `, [orderAuto])
    assert.deepEqual(offlineOnlyFinal.rows[0], {
      order_status: 'pending',
      submission_status: 'submitted',
      verification_state: 'STRONG_MATCH',
      evidence_count: '0',
      notification_count: '0',
    })

    await insertProviderAttestation(client, fixture, autoVerification)

    const automaticApproval = await asRole(
      client,
      'service_role',
      null,
      () => query(client, 'select * from public.auto_approve_payment_verification($1)', [autoVerificationId]),
    )
    assert.equal(automaticApproval.rows[0].status, 'approved')
    const automaticRetry = await asRole(
      client,
      'service_role',
      null,
      () => query(client, 'select * from public.auto_approve_payment_verification($1)', [autoVerificationId]),
    )
    assert.equal(automaticRetry.rows[0].status, 'approved')
    const automaticFinal = await query(client, `
      select o.status as order_status,
             ps.status as submission_status,
             pv.state as verification_state,
             (select count(*) from public.approved_payment_evidence where submission_id = $1) as evidence_count,
             (select count(*) from public.notifications where source_order_id = $2 and type = 'PACKAGE_APPROVED') as notification_count,
             (select count(*) from public.payment_verification_events where submission_id = $1 and event_type = 'auto_approved') as auto_approved_events
      from public.orders o
      join public.payment_submissions ps on ps.order_id = o.id
      join public.payment_verifications pv on pv.submission_id = ps.id
      where o.id = $2
    `, [submissionAuto, orderAuto])
    assert.deepEqual(automaticFinal.rows[0], {
      order_status: 'paid',
      submission_status: 'approved',
      verification_state: 'AUTO_APPROVED',
      evidence_count: '1',
      notification_count: '1',
      auto_approved_events: '1',
    })

    const duplicateProviderAttestationError = await expectRejected(
      client,
      'duplicate VERIFIED provider transaction',
      () => insertProviderAttestation(client, fixture, autoVerification),
    )
    assert.equal(duplicateProviderAttestationError.code, '23505')
    const duplicateProviderCount = await query(client, `
      select count(*)::int as count
      from public.payment_provider_attestations
      where provider = 'promptpay_authoritative'
        and method = 'promptpay_provider_api_v1'
        and provider_transaction_identity = $1
        and status = 'VERIFIED'
    `, [`promptpay-provider-api-v1:${autoVerification.verificationId}`])
    assert.equal(duplicateProviderCount.rows[0].count, 1)

    const concurrentProvider = await createVerificationFixture(
      client,
      fixture,
      ids.buyer,
      'provider-concurrent-duplicate',
      analyzerResult('STRONG_MATCH', 'provider-concurrent-duplicate'),
    )
    const concurrentProviderResults = await Promise.allSettled(
      raceClients.map((raceClient) => insertProviderAttestation(
        raceClient,
        fixture,
        concurrentProvider,
        { providerTransactionIdentity: 'promptpay-provider-api-v1:concurrent-duplicate' },
      )),
    )
    assert.equal(concurrentProviderResults.filter((result) => result.status === 'fulfilled').length, 1)
    assert.equal(concurrentProviderResults.filter((result) => result.status === 'rejected' && result.reason?.code === '23505').length, 1)
    await assertFullPaymentRaceState(client, 'provider transaction insert race', [{
      orderId: concurrentProvider.orderId,
      orderStatus: 'pending',
      submissionStatus: 'submitted',
      submissionReviewSource: 'manual',
      submissionReviewedByIsNull: true,
      verificationState: 'STRONG_MATCH',
      approvedEvidenceCount: 0,
      providerAttestationCount: 1,
      verifiedProviderAttestationCount: 1,
      verificationEventCount: 3,
      notificationCount: 0,
    }])

    const crossOrderProviderA = await createVerificationFixture(
      client,
      fixture,
      ids.buyer,
      'provider-cross-order-a',
      analyzerResult('STRONG_MATCH', 'provider-cross-order-a'),
    )
    const crossOrderProviderB = await createVerificationFixture(
      client,
      fixture,
      ids.other,
      'provider-cross-order-b',
      analyzerResult('STRONG_MATCH', 'provider-cross-order-b'),
    )
    await insertProviderAttestation(client, fixture, crossOrderProviderA, {
      providerTransactionIdentity: 'promptpay-provider-api-v1:cross-order-user-reuse',
    })
    const crossOrderProviderError = await expectRejected(
      client,
      'provider transaction reused across orders and users',
      () => insertProviderAttestation(client, fixture, crossOrderProviderB, {
        providerTransactionIdentity: 'promptpay-provider-api-v1:cross-order-user-reuse',
      }),
    )
    assert.equal(crossOrderProviderError.code, '23505')

    const retryableProvider = await createVerificationFixture(
      client,
      fixture,
      ids.other,
      'provider-retryable-states',
      analyzerResult('STRONG_MATCH', 'provider-retryable-states'),
    )
    const retryableIdentity = 'promptpay-provider-api-v1:retryable-state'
    await insertProviderAttestation(client, fixture, retryableProvider, {
      status: 'FAILED',
      providerTransactionIdentity: retryableIdentity,
    })
    await insertProviderAttestation(client, fixture, retryableProvider, {
      status: 'UNAVAILABLE',
      providerTransactionIdentity: retryableIdentity,
    })
    await insertProviderAttestation(client, fixture, retryableProvider, {
      status: 'VERIFIED',
      providerTransactionIdentity: retryableIdentity,
    })
    const retryableStates = await query(client, `
      select status, count(*)::int as count
      from public.payment_provider_attestations
      where verification_id = $1
      group by status
      order by status
    `, [retryableProvider.verificationId])
    assert.deepEqual(retryableStates.rows, [
      { status: 'FAILED', count: 1 },
      { status: 'UNAVAILABLE', count: 1 },
      { status: 'VERIFIED', count: 1 },
    ])

    const mismatchedAttestation = await createVerificationFixture(
      client,
      fixture,
      ids.other,
      'mismatched-provider-attestation',
      analyzerResult('STRONG_MATCH', 'mismatched-provider-attestation'),
      { providerAttestation: { transactionAmount: 901 } },
    )
    const mismatchedAttestationError = await asRole(
      client,
      'service_role',
      null,
      () => expectRejected(client, 'mismatched provider attestation', () => query(
        client,
        'select * from public.auto_approve_payment_verification($1)',
        [mismatchedAttestation.verificationId],
      )),
    )
    assert.equal(mismatchedAttestationError.code, '40001')
    const mismatchedAttestationFinal = await query(client, `
      select o.status as order_status, ps.status as submission_status,
             pv.state as verification_state,
             (select count(*) from public.approved_payment_evidence where order_id = o.id) as evidence_count,
             (select count(*) from public.notifications where source_order_id = o.id and type = 'PACKAGE_APPROVED') as notification_count
      from public.orders o
      join public.payment_submissions ps on ps.order_id = o.id
      join public.payment_verifications pv on pv.submission_id = ps.id
      where o.id = $1
    `, [mismatchedAttestation.orderId])
    assert.deepEqual(mismatchedAttestationFinal.rows[0], {
      order_status: 'pending',
      submission_status: 'submitted',
      verification_state: 'STRONG_MATCH',
      evidence_count: '0',
      notification_count: '0',
    })

    const mismatchedOrderTarget = await createVerificationFixture(
      client,
      fixture,
      ids.other,
      'mismatched-provider-order-target',
      analyzerResult('STRONG_MATCH', 'mismatched-provider-order-target'),
    )
    const mismatchedOrderAttestation = await createVerificationFixture(
      client,
      fixture,
      ids.other,
      'mismatched-provider-order',
      analyzerResult('STRONG_MATCH', 'mismatched-provider-order'),
    )
    await insertProviderAttestation(client, fixture, mismatchedOrderAttestation, { orderId: mismatchedOrderTarget.orderId })
    const mismatchedOrderError = await asRole(
      client,
      'service_role',
      null,
      () => expectRejected(client, 'mismatched provider order attestation', () => query(
        client,
        'select * from public.auto_approve_payment_verification($1)',
        [mismatchedOrderAttestation.verificationId],
      )),
    )
    assert.equal(mismatchedOrderError.code, '40001')

    const mismatchedReferenceAttestation = await createVerificationFixture(
      client,
      fixture,
      ids.other,
      'mismatched-provider-reference',
      analyzerResult('STRONG_MATCH', 'mismatched-provider-reference'),
    )
    await insertProviderAttestation(client, fixture, mismatchedReferenceAttestation, {
      referenceFingerprint: `hmac-sha256:v1:${identityHex('different-provider-reference')}`,
    })
    const mismatchedReferenceError = await asRole(
      client,
      'service_role',
      null,
      () => expectRejected(client, 'mismatched provider reference attestation', () => query(
        client,
        'select * from public.auto_approve_payment_verification($1)',
        [mismatchedReferenceAttestation.verificationId],
      )),
    )
    assert.equal(mismatchedReferenceError.code, '40001')

    const failedAttestation = await createVerificationFixture(
      client,
      fixture,
      ids.other,
      'failed-provider-attestation',
      analyzerResult('STRONG_MATCH', 'failed-provider-attestation'),
      { providerAttestation: { status: 'FAILED' } },
    )
    const failedAttestationError = await asRole(
      client,
      'service_role',
      null,
      () => expectRejected(client, 'failed provider attestation', () => query(
        client,
        'select * from public.auto_approve_payment_verification($1)',
        [failedAttestation.verificationId],
      )),
    )
    assert.equal(failedAttestationError.code, '40001')

    const afterOrderTransaction = await createVerificationFixture(
      client,
      fixture,
      ids.other,
      'provider-transaction-after-order',
      analyzerResult('STRONG_MATCH', 'provider-transaction-after-order'),
    )
    await insertProviderAttestation(client, fixture, afterOrderTransaction, {
      providerTransactionAt: new Date().toISOString(),
    })
    await assertProviderAutoApproved(client, afterOrderTransaction, 'provider transaction after order creation')

    const atOrderCreationTransaction = await createVerificationFixture(
      client,
      fixture,
      ids.other,
      'provider-transaction-at-order',
      analyzerResult('STRONG_MATCH', 'provider-transaction-at-order'),
    )
    const atOrderCreationTimestamps = await readPaymentFixtureTimestamps(client, atOrderCreationTransaction)
    await insertProviderAttestation(client, fixture, atOrderCreationTransaction, {
      providerTransactionAt: new Date(atOrderCreationTimestamps.order_created_at).toISOString(),
    })
    await assertProviderAutoApproved(client, atOrderCreationTransaction, 'provider transaction exactly at order creation')

    const withinOrderToleranceTransaction = await createVerificationFixture(
      client,
      fixture,
      ids.other,
      'provider-transaction-within-order-tolerance',
      analyzerResult('STRONG_MATCH', 'provider-transaction-within-order-tolerance'),
    )
    const withinOrderToleranceTimestamps = await readPaymentFixtureTimestamps(client, withinOrderToleranceTransaction)
    await insertProviderAttestation(client, fixture, withinOrderToleranceTransaction, {
      providerTransactionAt: new Date(new Date(withinOrderToleranceTimestamps.order_created_at).getTime() - 4 * 60 * 1000).toISOString(),
    })
    await assertProviderAutoApproved(client, withinOrderToleranceTransaction, 'provider transaction within order clock skew tolerance')

    const outsideOrderToleranceTransaction = await createVerificationFixture(
      client,
      fixture,
      ids.other,
      'provider-transaction-outside-order-tolerance',
      analyzerResult('STRONG_MATCH', 'provider-transaction-outside-order-tolerance'),
    )
    const outsideOrderToleranceTimestamps = await readPaymentFixtureTimestamps(client, outsideOrderToleranceTransaction)
    await insertProviderAttestation(client, fixture, outsideOrderToleranceTransaction, {
      providerTransactionAt: new Date(new Date(outsideOrderToleranceTimestamps.order_created_at).getTime() - 5 * 60 * 1000 - 1000).toISOString(),
    })
    await assertProviderAutoDenied(client, outsideOrderToleranceTransaction, 'provider transaction immediately outside order clock skew tolerance')

    const hoursBeforeOrderTransaction = await createVerificationFixture(
      client,
      fixture,
      ids.other,
      'provider-transaction-hours-before-order',
      analyzerResult('STRONG_MATCH', 'provider-transaction-hours-before-order'),
    )
    const hoursBeforeOrderTimestamps = await readPaymentFixtureTimestamps(client, hoursBeforeOrderTransaction)
    await insertProviderAttestation(client, fixture, hoursBeforeOrderTransaction, {
      providerTransactionAt: new Date(new Date(hoursBeforeOrderTimestamps.order_created_at).getTime() - 2 * 60 * 60 * 1000).toISOString(),
    })
    await assertProviderAutoDenied(client, hoursBeforeOrderTransaction, 'provider transaction hours before order')

    const daysBeforeOrderTransaction = await createVerificationFixture(
      client,
      fixture,
      ids.other,
      'provider-transaction-days-before-order',
      analyzerResult('STRONG_MATCH', 'provider-transaction-days-before-order'),
    )
    const daysBeforeOrderTimestamps = await readPaymentFixtureTimestamps(client, daysBeforeOrderTransaction)
    await insertProviderAttestation(client, fixture, daysBeforeOrderTransaction, {
      providerTransactionAt: new Date(new Date(daysBeforeOrderTimestamps.order_created_at).getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    })
    await assertProviderAutoDenied(client, daysBeforeOrderTransaction, 'provider transaction days before order')

    const oldVerifiedOrder = await createVerificationFixture(
      client,
      fixture,
      ids.other,
      'provider-old-verified-order',
      analyzerResult('STRONG_MATCH', 'provider-old-verified-order'),
    )
    const oldOrderCreatedAt = new Date(Date.now() - 2 * 60 * 60 * 1000)
    const oldTransactionAt = new Date(Date.now() - 60 * 60 * 1000)
    await query(client, 'update public.orders set created_at = $2 where id = $1', [oldVerifiedOrder.orderId, oldOrderCreatedAt.toISOString()])
    await insertProviderAttestation(client, fixture, oldVerifiedOrder, {
      providerTransactionAt: oldTransactionAt.toISOString(),
    })
    await assertProviderAutoApproved(client, oldVerifiedOrder, 'old order accepts its valid provider transaction')

    const reusedOldTransaction = await createVerificationFixture(
      client,
      fixture,
      ids.other,
      'provider-old-verified-transaction-reused',
      analyzerResult('STRONG_MATCH', 'provider-old-verified-transaction-reused'),
    )
    await insertProviderAttestation(client, fixture, reusedOldTransaction, {
      providerTransactionIdentity: 'promptpay-provider-api-v1:old-verified-transaction-reused',
      providerTransactionAt: oldTransactionAt.toISOString(),
    })
    await assertProviderAutoDenied(client, reusedOldTransaction, 'old VERIFIED transaction reused for new order')

    const delayedSubmissionTransaction = await createVerificationFixture(
      client,
      fixture,
      ids.other,
      'provider-delayed-submission',
      analyzerResult('STRONG_MATCH', 'provider-delayed-submission'),
    )
    const delayedNow = Date.now()
    const delayedOrderCreatedAt = new Date(delayedNow - 10 * 60 * 60 * 1000)
    const delayedTransactionAt = new Date(delayedNow - 9 * 60 * 60 * 1000)
    const delayedSubmissionCreatedAt = new Date(delayedNow - 60 * 60 * 1000)
    await query(client, 'update public.orders set created_at = $2 where id = $1', [delayedSubmissionTransaction.orderId, delayedOrderCreatedAt.toISOString()])
    await query(client, 'update public.payment_submissions set created_at = $2 where id = $1', [delayedSubmissionTransaction.submissionId, delayedSubmissionCreatedAt.toISOString()])
    await insertProviderAttestation(client, fixture, delayedSubmissionTransaction, {
      providerTransactionAt: delayedTransactionAt.toISOString(),
    })
    await assertProviderAutoApproved(client, delayedSubmissionTransaction, 'submission many hours after valid provider transaction')

    const nextDaySubmissionTransaction = await createVerificationFixture(
      client,
      fixture,
      ids.other,
      'provider-next-day-submission',
      analyzerResult('STRONG_MATCH', 'provider-next-day-submission'),
    )
    const nextDayNow = Date.now()
    const nextDayOrderCreatedAt = new Date(nextDayNow - 36 * 60 * 60 * 1000)
    const nextDayTransactionAt = new Date(nextDayNow - 30 * 60 * 60 * 1000)
    const nextDaySubmissionCreatedAt = new Date(nextDayNow - 6 * 60 * 60 * 1000)
    await query(client, 'update public.orders set created_at = $2 where id = $1', [nextDaySubmissionTransaction.orderId, nextDayOrderCreatedAt.toISOString()])
    await query(client, 'update public.payment_submissions set created_at = $2 where id = $1', [nextDaySubmissionTransaction.submissionId, nextDaySubmissionCreatedAt.toISOString()])
    await insertProviderAttestation(client, fixture, nextDaySubmissionTransaction, {
      providerTransactionAt: nextDayTransactionAt.toISOString(),
    })
    await assertProviderAutoApproved(client, nextDaySubmissionTransaction, 'next-day submission after valid provider transaction')

    const futureAttestation = await createVerificationFixture(
      client,
      fixture,
      ids.other,
      'future-provider-attestation',
      analyzerResult('STRONG_MATCH', 'future-provider-attestation'),
    )
    const futureBase = Date.now()
    await insertProviderAttestation(client, fixture, futureAttestation, {
      providerTransactionAt: new Date(futureBase).toISOString(),
      providerVerifiedAt: new Date(futureBase + 10 * 60 * 1000).toISOString(),
      validUntil: new Date(futureBase + 2 * 60 * 60 * 1000).toISOString(),
    })
    const futureAttestationError = await asRole(
      client,
      'service_role',
      null,
      () => expectRejected(client, 'future-dated provider attestation', () => query(
        client,
        'select * from public.auto_approve_payment_verification($1)',
        [futureAttestation.verificationId],
      )),
    )
    assert.equal(futureAttestationError.code, '40001')
    await assertFullPaymentRaceState(client, 'future provider freshness gate', [{
      orderId: futureAttestation.orderId,
      orderStatus: 'pending',
      submissionStatus: 'submitted',
      submissionReviewSource: 'manual',
      submissionReviewedByIsNull: true,
      verificationState: 'STRONG_MATCH',
      approvedEvidenceCount: 0,
      providerAttestationCount: 1,
      verifiedProviderAttestationCount: 1,
      verificationEventCount: 3,
      notificationCount: 0,
    }])

    const expiredAttestation = await createVerificationFixture(
      client,
      fixture,
      ids.other,
      'expired-provider-attestation',
      analyzerResult('STRONG_MATCH', 'expired-provider-attestation'),
    )
    const expiredBase = Date.now()
    await insertProviderAttestation(client, fixture, expiredAttestation, {
      providerTransactionAt: new Date(expiredBase - 2 * 60 * 1000).toISOString(),
      providerVerifiedAt: new Date(expiredBase - 60 * 1000).toISOString(),
      validUntil: new Date(expiredBase - 1000).toISOString(),
    })
    const expiredAttestationError = await asRole(
      client,
      'service_role',
      null,
      () => expectRejected(client, 'expired provider attestation', () => query(
        client,
        'select * from public.auto_approve_payment_verification($1)',
        [expiredAttestation.verificationId],
      )),
    )
    assert.equal(expiredAttestationError.code, '40001')
    await assertFullPaymentRaceState(client, 'expired provider freshness gate', [{
      orderId: expiredAttestation.orderId,
      orderStatus: 'pending',
      submissionStatus: 'submitted',
      submissionReviewSource: 'manual',
      submissionReviewedByIsNull: true,
      verificationState: 'STRONG_MATCH',
      approvedEvidenceCount: 0,
      providerAttestationCount: 1,
      verifiedProviderAttestationCount: 1,
      verificationEventCount: 3,
      notificationCount: 0,
    }])

    const createdBeforeIdentity = await createVerificationFixture(
      client,
      fixture,
      ids.other,
      'provider-attestation-before-identity',
      analyzerResult('STRONG_MATCH', 'provider-attestation-before-identity'),
    )
    const createdBeforeBase = Date.now()
    await insertProviderAttestation(client, fixture, createdBeforeIdentity, {
      createdAt: new Date(createdBeforeBase - 60 * 60 * 1000).toISOString(),
      providerTransactionAt: new Date(createdBeforeBase).toISOString(),
      providerVerifiedAt: new Date(createdBeforeBase).toISOString(),
      validUntil: new Date(createdBeforeBase + 60 * 60 * 1000).toISOString(),
    })
    const createdBeforeIdentityError = await asRole(
      client,
      'service_role',
      null,
      () => expectRejected(client, 'provider attestation created before identity', () => query(
        client,
        'select * from public.auto_approve_payment_verification($1)',
        [createdBeforeIdentity.verificationId],
      )),
    )
    assert.equal(createdBeforeIdentityError.code, '40001')

    const missingValidity = await createVerificationFixture(
      client,
      fixture,
      ids.other,
      'provider-missing-validity',
      analyzerResult('STRONG_MATCH', 'provider-missing-validity'),
    )
    const missingValidityError = await expectRejected(
      client,
      'VERIFIED provider attestation without validity contract',
      () => insertProviderAttestation(client, fixture, missingValidity, { validUntil: null }),
    )
    assert.equal(missingValidityError.code, '23514')

    const mismatchedTimestamps = await createVerificationFixture(
      client,
      fixture,
      ids.other,
      'provider-mismatched-timestamps',
      analyzerResult('STRONG_MATCH', 'provider-mismatched-timestamps'),
    )
    const mismatchedTimestampBase = Date.now()
    const mismatchedTimestampError = await expectRejected(
      client,
      'provider verification before transaction timestamp',
      () => insertProviderAttestation(client, fixture, mismatchedTimestamps, {
        providerTransactionAt: new Date(mismatchedTimestampBase).toISOString(),
        providerVerifiedAt: new Date(mismatchedTimestampBase - 1000).toISOString(),
        validUntil: new Date(mismatchedTimestampBase + 60 * 60 * 1000).toISOString(),
      }),
    )
    assert.equal(mismatchedTimestampError.code, '23514')

    const plainSha = await createVerificationFixture(
      client,
      fixture,
      ids.other,
      'plain-sha-reference',
      analyzerResult('STRONG_MATCH', 'plain-sha-reference'),
      { providerAttestation: true },
    )
    await query(client, `
      update public.payment_verifications
      set reference_fingerprint = $2
      where id = $1
    `, [plainSha.verificationId, `sha256:v1:${identityHex('plain-sha-reference')}`])
    const plainShaError = await asRole(
      client,
      'service_role',
      null,
      () => expectRejected(client, 'plain SHA reference auto approval', () => query(
        client,
        'select * from public.auto_approve_payment_verification($1)',
        [plainSha.verificationId],
      )),
    )
    assert.equal(plainShaError.code, '40001')
    const plainShaFinal = await query(client, `
      select o.status as order_status,
             ps.status as submission_status,
             count(ape.id)::int as evidence_count
      from public.orders o
      join public.payment_submissions ps on ps.order_id = o.id
      left join public.approved_payment_evidence ape on ape.order_id = o.id
      where o.id = $1
      group by o.status, ps.status
    `, [plainSha.orderId])
    assert.deepEqual(plainShaFinal.rows[0], {
      order_status: 'pending',
      submission_status: 'submitted',
      evidence_count: 0,
    })

    const autoReferenceA = await createVerificationFixture(
      client,
      fixture,
      ids.buyer,
      'auto-shared-reference-a',
      analyzerResult('STRONG_MATCH', 'auto-shared-reference-a', { reference: 'shared-reference' }),
      { providerAttestation: true },
    )
    const autoReferenceB = await createVerificationFixture(
      client,
      fixture,
      ids.other,
      'auto-shared-reference-b',
      analyzerResult('STRONG_MATCH', 'auto-shared-reference-b', { reference: 'shared-reference' }),
      { providerAttestation: true },
    )
    const autoReferenceOutcomes = await Promise.all([
      invokeCaptured(config.databaseUrl, 'service_role', null, 'select * from public.auto_approve_payment_verification($1)', [autoReferenceA.verificationId]),
      invokeCaptured(config.databaseUrl, 'service_role', null, 'select * from public.auto_approve_payment_verification($1)', [autoReferenceB.verificationId]),
    ])
    assert.equal(autoReferenceOutcomes.filter((outcome) => outcome.result).length, 1)
    assert.equal(autoReferenceOutcomes.filter((outcome) => outcome.error?.code === '23505').length, 1)
    const autoReferenceFinal = await query(client, `
      select o.status as order_status, ps.status as submission_status,
             pv.state as verification_state,
             (select count(*) from public.approved_payment_evidence where order_id = o.id) as evidence_count,
             (select count(*) from public.payment_verification_events where verification_id = pv.id) as verification_event_count,
             (select count(*) from public.payment_verification_events where verification_id = pv.id and event_type = 'auto_approved') as auto_approved_event_count,
             (select count(*) from public.notifications where source_order_id = o.id and type = 'PACKAGE_APPROVED') as notification_count
      from public.orders o
      join public.payment_submissions ps on ps.order_id = o.id
      join public.payment_verifications pv on pv.submission_id = ps.id
      where o.id = any($1::uuid[])
      order by o.id
    `, [[autoReferenceA.orderId, autoReferenceB.orderId]])
    assert.deepEqual(autoReferenceFinal.rows.map((row) => row.order_status).sort(), ['paid', 'pending'])
    assert.deepEqual(autoReferenceFinal.rows.map((row) => row.submission_status).sort(), ['approved', 'submitted'])
    assert.deepEqual(autoReferenceFinal.rows.map((row) => row.verification_state).sort(), ['AUTO_APPROVED', 'STRONG_MATCH'])
    assert.deepEqual(autoReferenceFinal.rows.map((row) => row.evidence_count).sort(), ['0', '1'])
    assert.deepEqual(autoReferenceFinal.rows.map((row) => row.auto_approved_event_count).sort(), ['0', '1'])
    assert.deepEqual(autoReferenceFinal.rows.map((row) => row.notification_count).sort(), ['0', '1'])
    assert.ok(autoReferenceFinal.rows.every((row) => Number(row.verification_event_count) > 0))
    await assertFullPaymentRaceState(client, 'automatic same-reference race', [
      { orderId: autoReferenceA.orderId, orderStatus: 'pending', submissionStatus: 'submitted', submissionReviewSource: 'manual', submissionReviewedByIsNull: true, verificationState: 'STRONG_MATCH', approvedEvidenceCount: 0, providerAttestationCount: 1, verifiedProviderAttestationCount: 1, verificationEventCount: autoReferenceOutcomes[0].result ? 5 : 3, notificationCount: 0 },
      { orderId: autoReferenceB.orderId, orderStatus: 'pending', submissionStatus: 'submitted', submissionReviewSource: 'manual', submissionReviewedByIsNull: true, verificationState: 'STRONG_MATCH', approvedEvidenceCount: 0, providerAttestationCount: 1, verifiedProviderAttestationCount: 1, verificationEventCount: autoReferenceOutcomes[1].result ? 5 : 3, notificationCount: 0 },
    ].map((expected, index) => autoReferenceOutcomes[index].result
      ? { ...expected, orderStatus: 'paid', submissionStatus: 'approved', submissionReviewSource: 'automatic', submissionReviewedByIsNull: true, verificationState: 'AUTO_APPROVED', approvedEvidenceCount: 1, notificationCount: 1 }
      : expected))

    const manualRawA = await createVerificationFixture(client, fixture, ids.buyer, 'manual-shared-image-a', manualMachineResult('manual-shared-image-a', { raw: 'shared-raw', normalized: 'shared-normalized' }))
    const manualRawB = await createVerificationFixture(client, fixture, ids.other, 'manual-shared-image-b', manualMachineResult('manual-shared-image-b', { raw: 'shared-raw', normalized: 'shared-normalized' }))
    const manualRawOutcomes = await Promise.all([
      invokeCaptured(config.databaseUrl, 'authenticated', ids.manager, 'select * from public.approve_payment_submission($1)', [manualRawA.submissionId]),
      invokeCaptured(config.databaseUrl, 'authenticated', ids.manager, 'select * from public.approve_payment_submission($1)', [manualRawB.submissionId]),
    ])
    assert.equal(manualRawOutcomes.filter((outcome) => outcome.result).length, 1)
    assert.equal(manualRawOutcomes.filter((outcome) => outcome.error?.code === '23505').length, 1)
    const manualRawFinal = await query(client, `
      select o.status as order_status, ps.status as submission_status,
             pv.state as verification_state,
             (select count(*) from public.approved_payment_evidence where order_id = o.id) as evidence_count,
             (select count(*) from public.payment_verification_events where verification_id = pv.id) as verification_event_count,
             (select count(*) from public.payment_verification_events where verification_id = pv.id and event_type = 'manually_approved') as manually_approved_event_count,
             (select count(*) from public.notifications where source_order_id = o.id and type = 'PACKAGE_APPROVED') as notification_count
      from public.orders o
      join public.payment_submissions ps on ps.order_id = o.id
      join public.payment_verifications pv on pv.submission_id = ps.id
      where o.id = any($1::uuid[])
      order by o.id
    `, [[manualRawA.orderId, manualRawB.orderId]])
    assert.deepEqual(manualRawFinal.rows.map((row) => row.order_status).sort(), ['paid', 'pending'])
    assert.deepEqual(manualRawFinal.rows.map((row) => row.submission_status).sort(), ['approved', 'submitted'])
    assert.deepEqual(manualRawFinal.rows.map((row) => row.verification_state).sort(), ['APPROVED_MANUAL', 'MANUAL_REVIEW'])
    assert.deepEqual(manualRawFinal.rows.map((row) => row.evidence_count).sort(), ['0', '1'])
    assert.deepEqual(manualRawFinal.rows.map((row) => row.manually_approved_event_count).sort(), ['0', '1'])
    assert.deepEqual(manualRawFinal.rows.map((row) => row.notification_count).sort(), ['0', '1'])
    assert.ok(manualRawFinal.rows.every((row) => Number(row.verification_event_count) > 0))
    await assertFullPaymentRaceState(client, 'manual shared-image race', [
      { orderId: manualRawA.orderId, orderStatus: 'pending', submissionStatus: 'submitted', submissionReviewSource: 'manual', submissionReviewedByIsNull: true, verificationState: 'MANUAL_REVIEW', approvedEvidenceCount: 0, providerAttestationCount: 0, verifiedProviderAttestationCount: 0, verificationEventCount: manualRawOutcomes[0].result ? 4 : 3, notificationCount: 0 },
      { orderId: manualRawB.orderId, orderStatus: 'pending', submissionStatus: 'submitted', submissionReviewSource: 'manual', submissionReviewedByIsNull: true, verificationState: 'MANUAL_REVIEW', approvedEvidenceCount: 0, providerAttestationCount: 0, verifiedProviderAttestationCount: 0, verificationEventCount: manualRawOutcomes[1].result ? 4 : 3, notificationCount: 0 },
    ].map((expected, index) => manualRawOutcomes[index].result
      ? { ...expected, orderStatus: 'paid', submissionStatus: 'approved', submissionReviewSource: 'manual', submissionReviewedByIsNull: false, verificationState: 'APPROVED_MANUAL', approvedEvidenceCount: 1, notificationCount: 1 }
      : expected))

    const manualReferenceA = await createVerificationFixture(client, fixture, ids.buyer, 'manual-shared-reference-a', manualMachineResult('manual-shared-reference-a', { reference: 'shared-manual-reference' }))
    const manualReferenceB = await createVerificationFixture(client, fixture, ids.buyer, 'manual-shared-reference-b', manualMachineResult('manual-shared-reference-b', { reference: 'shared-manual-reference' }))
    const manualReferenceOutcomes = await Promise.all([
      invokeCaptured(config.databaseUrl, 'authenticated', ids.manager, 'select * from public.approve_payment_submission($1)', [manualReferenceA.submissionId]),
      invokeCaptured(config.databaseUrl, 'authenticated', ids.manager, 'select * from public.approve_payment_submission($1)', [manualReferenceB.submissionId]),
    ])
    assert.equal(manualReferenceOutcomes.filter((outcome) => outcome.result).length, 1)
    assert.equal(manualReferenceOutcomes.filter((outcome) => outcome.error?.code === '23505').length, 1)
    const manualReferenceFinal = await query(client, `
      select o.status as order_status, ps.status as submission_status,
             pv.state as verification_state,
             (select count(*) from public.approved_payment_evidence where order_id = o.id) as evidence_count,
             (select count(*) from public.payment_verification_events where verification_id = pv.id) as verification_event_count,
             (select count(*) from public.payment_verification_events where verification_id = pv.id and event_type = 'manually_approved') as manually_approved_event_count,
             (select count(*) from public.notifications where source_order_id = o.id and type = 'PACKAGE_APPROVED') as notification_count
      from public.orders o
      join public.payment_submissions ps on ps.order_id = o.id
      join public.payment_verifications pv on pv.submission_id = ps.id
      where o.id = any($1::uuid[])
      order by o.id
    `, [[manualReferenceA.orderId, manualReferenceB.orderId]])
    assert.deepEqual(manualReferenceFinal.rows.map((row) => row.order_status).sort(), ['paid', 'pending'])
    assert.deepEqual(manualReferenceFinal.rows.map((row) => row.submission_status).sort(), ['approved', 'submitted'])
    assert.deepEqual(manualReferenceFinal.rows.map((row) => row.verification_state).sort(), ['APPROVED_MANUAL', 'MANUAL_REVIEW'])
    assert.deepEqual(manualReferenceFinal.rows.map((row) => row.evidence_count).sort(), ['0', '1'])
    assert.deepEqual(manualReferenceFinal.rows.map((row) => row.manually_approved_event_count).sort(), ['0', '1'])
    assert.deepEqual(manualReferenceFinal.rows.map((row) => row.notification_count).sort(), ['0', '1'])
    assert.ok(manualReferenceFinal.rows.every((row) => Number(row.verification_event_count) > 0))
    await assertFullPaymentRaceState(client, 'manual shared-reference race', [
      { orderId: manualReferenceA.orderId, orderStatus: 'pending', submissionStatus: 'submitted', submissionReviewSource: 'manual', submissionReviewedByIsNull: true, verificationState: 'MANUAL_REVIEW', approvedEvidenceCount: 0, providerAttestationCount: 0, verifiedProviderAttestationCount: 0, verificationEventCount: manualReferenceOutcomes[0].result ? 4 : 3, notificationCount: 0 },
      { orderId: manualReferenceB.orderId, orderStatus: 'pending', submissionStatus: 'submitted', submissionReviewSource: 'manual', submissionReviewedByIsNull: true, verificationState: 'MANUAL_REVIEW', approvedEvidenceCount: 0, providerAttestationCount: 0, verifiedProviderAttestationCount: 0, verificationEventCount: manualReferenceOutcomes[1].result ? 4 : 3, notificationCount: 0 },
    ].map((expected, index) => manualReferenceOutcomes[index].result
      ? { ...expected, orderStatus: 'paid', submissionStatus: 'approved', submissionReviewSource: 'manual', submissionReviewedByIsNull: false, verificationState: 'APPROVED_MANUAL', approvedEvidenceCount: 1, notificationCount: 1 }
      : expected))

    const autoManual = await createVerificationFixture(client, fixture, ids.buyer, 'auto-manual-race', analyzerResult('STRONG_MATCH', 'auto-manual-race'), { providerAttestation: true })
    const autoManualOutcomes = await Promise.all([
      invokeCaptured(config.databaseUrl, 'service_role', null, 'select * from public.auto_approve_payment_verification($1)', [autoManual.verificationId]),
      invokeCaptured(config.databaseUrl, 'authenticated', ids.manager, 'select * from public.approve_payment_submission($1)', [autoManual.submissionId]),
    ])
    assert.ok(autoManualOutcomes.some((outcome) => outcome.result))
    const autoManualFinal = await query(client, `
      select o.status as order_status, ps.status as submission_status, pv.state as verification_state,
             (select count(*) from public.approved_payment_evidence where submission_id = $1) as evidence_count,
             (select count(*) from public.payment_verification_events where verification_id = pv.id) as verification_event_count,
             (select count(*) from public.payment_verification_events where verification_id = pv.id and event_type = 'auto_approved') as auto_approved_event_count,
             (select count(*) from public.payment_verification_events where verification_id = pv.id and event_type = 'manually_approved') as manually_approved_event_count,
             (select count(*) from public.notifications where source_order_id = $2 and type = 'PACKAGE_APPROVED') as notification_count
      from public.orders o
      join public.payment_submissions ps on ps.order_id = o.id
      join public.payment_verifications pv on pv.submission_id = ps.id
      where ps.id = $1 and o.id = $2
    `, [autoManual.submissionId, autoManual.orderId])
    assert.deepEqual(autoManualFinal.rows[0].order_status, 'paid')
    assert.deepEqual(autoManualFinal.rows[0].submission_status, 'approved')
    assert.ok(['AUTO_APPROVED', 'APPROVED_MANUAL'].includes(autoManualFinal.rows[0].verification_state))
    assert.equal(autoManualFinal.rows[0].evidence_count, '1')
    assert.equal(autoManualFinal.rows[0].notification_count, '1')
    assert.equal(Number(autoManualFinal.rows[0].auto_approved_event_count) + Number(autoManualFinal.rows[0].manually_approved_event_count), 1)
    assert.ok(Number(autoManualFinal.rows[0].verification_event_count) > 0)
    await assertFullPaymentRaceState(client, 'automatic-manual race', [{
      orderId: autoManual.orderId,
      orderStatus: 'paid',
      submissionStatus: 'approved',
      submissionReviewSource: autoManualFinal.rows[0].verification_state === 'AUTO_APPROVED' ? 'automatic' : 'manual',
      submissionReviewedByIsNull: autoManualFinal.rows[0].verification_state === 'AUTO_APPROVED',
      verificationState: autoManualFinal.rows[0].verification_state,
      approvedEvidenceCount: 1,
      providerAttestationCount: 1,
      verifiedProviderAttestationCount: 1,
      verificationEventCount: autoManualFinal.rows[0].verification_state === 'AUTO_APPROVED' ? 5 : 4,
      notificationCount: 1,
    }])

    const autoReject = await createVerificationFixture(client, fixture, ids.buyer, 'auto-reject-race', analyzerResult('STRONG_MATCH', 'auto-reject-race'), { providerAttestation: true })
    const autoRejectOutcomes = await Promise.all([
      invokeCaptured(config.databaseUrl, 'service_role', null, 'select * from public.auto_approve_payment_verification($1)', [autoReject.verificationId]),
      invokeCaptured(config.databaseUrl, 'authenticated', ids.manager, 'select * from public.reject_payment_submission($1, $2)', [autoReject.submissionId, 'race rejection']),
    ])
    const autoRejectFinal = await query(client, `
      select o.status as order_status, ps.status as submission_status, pv.state as verification_state,
             (select count(*) from public.approved_payment_evidence where submission_id = $1) as evidence_count,
             (select count(*) from public.payment_verification_events where verification_id = pv.id) as verification_event_count,
             (select count(*) from public.payment_verification_events where verification_id = pv.id and event_type = 'auto_approved') as auto_approved_event_count,
             (select count(*) from public.payment_verification_events where verification_id = pv.id and event_type = 'manually_rejected') as manually_rejected_event_count,
             (select count(*) from public.notifications where source_order_id = $2 and type = 'PACKAGE_APPROVED') as approved_notification_count,
             (select count(*) from public.notifications where source_payment_submission_id = $1 and type = 'PAYMENT_REJECTED') as rejected_notification_count
      from public.orders o
      join public.payment_submissions ps on ps.order_id = o.id
      join public.payment_verifications pv on pv.submission_id = ps.id
      where ps.id = $1 and o.id = $2
    `, [autoReject.submissionId, autoReject.orderId])
    assert.ok(autoRejectOutcomes.some((outcome) => outcome.result))
    if (autoRejectFinal.rows[0].order_status === 'paid') {
      assert.equal(autoRejectFinal.rows[0].submission_status, 'approved')
      assert.equal(autoRejectFinal.rows[0].evidence_count, '1')
      assert.equal(autoRejectFinal.rows[0].auto_approved_event_count, '1')
      assert.equal(autoRejectFinal.rows[0].manually_rejected_event_count, '0')
      assert.equal(autoRejectFinal.rows[0].approved_notification_count, '1')
      assert.equal(autoRejectFinal.rows[0].rejected_notification_count, '0')
    } else {
      assert.equal(autoRejectFinal.rows[0].order_status, 'pending')
      assert.equal(autoRejectFinal.rows[0].submission_status, 'rejected')
      assert.equal(autoRejectFinal.rows[0].verification_state, 'REJECTED_MANUAL')
      assert.equal(autoRejectFinal.rows[0].evidence_count, '0')
      assert.equal(autoRejectFinal.rows[0].auto_approved_event_count, '0')
      assert.equal(autoRejectFinal.rows[0].manually_rejected_event_count, '1')
      assert.equal(autoRejectFinal.rows[0].approved_notification_count, '0')
      assert.equal(autoRejectFinal.rows[0].rejected_notification_count, '1')
    }
    assert.ok(Number(autoRejectFinal.rows[0].verification_event_count) > 0)
    await assertFullPaymentRaceState(client, 'automatic-reject race', [{
      orderId: autoReject.orderId,
      orderStatus: autoRejectFinal.rows[0].order_status,
      submissionStatus: autoRejectFinal.rows[0].submission_status,
      submissionReviewSource: autoRejectFinal.rows[0].order_status === 'paid' ? 'automatic' : 'manual',
      submissionReviewedByIsNull: autoRejectFinal.rows[0].order_status === 'paid',
      verificationState: autoRejectFinal.rows[0].verification_state,
      approvedEvidenceCount: autoRejectFinal.rows[0].evidence_count === '1' ? 1 : 0,
      providerAttestationCount: 1,
      verifiedProviderAttestationCount: 1,
      verificationEventCount: autoRejectFinal.rows[0].order_status === 'paid' ? 5 : 4,
      notificationCount: 1,
    }])

    const autoCancel = await createVerificationFixture(client, fixture, ids.buyer, 'auto-cancel-race', analyzerResult('STRONG_MATCH', 'auto-cancel-race'), { providerAttestation: true })
    const autoCancelOutcomes = await Promise.all([
      invokeCaptured(config.databaseUrl, 'service_role', null, 'select * from public.auto_approve_payment_verification($1)', [autoCancel.verificationId]),
      invokeCaptured(config.databaseUrl, 'authenticated', ids.manager, 'select * from public.cancel_manual_payment_order($1)', [autoCancel.orderId]),
    ])
    assert.ok(autoCancelOutcomes.some((outcome) => outcome.result))
    const autoCancelFinal = await query(client, `
      select o.status as order_status, ps.status as submission_status, pv.state as verification_state,
             (select count(*) from public.approved_payment_evidence where submission_id = $1) as evidence_count,
             (select count(*) from public.payment_verification_events where verification_id = pv.id) as verification_event_count,
             (select count(*) from public.payment_verification_events where verification_id = pv.id and event_type = 'auto_approved') as auto_approved_event_count,
             (select count(*) from public.notifications where source_order_id = $2 and type = 'PACKAGE_APPROVED') as notification_count
      from public.orders o
      join public.payment_submissions ps on ps.order_id = o.id
      join public.payment_verifications pv on pv.submission_id = ps.id
      where ps.id = $1 and o.id = $2
    `, [autoCancel.submissionId, autoCancel.orderId])
    assert.deepEqual(autoCancelFinal.rows[0], {
      order_status: 'paid',
      submission_status: 'approved',
      verification_state: 'AUTO_APPROVED',
      evidence_count: '1',
      verification_event_count: autoCancelFinal.rows[0].verification_event_count,
      auto_approved_event_count: '1',
      notification_count: '1',
    })
    assert.ok(Number(autoCancelFinal.rows[0].verification_event_count) > 0)
    await assertFullPaymentRaceState(client, 'automatic-cancel race', [{
      orderId: autoCancel.orderId,
      orderStatus: 'paid',
      submissionStatus: 'approved',
      submissionReviewSource: 'automatic',
      submissionReviewedByIsNull: true,
      verificationState: 'AUTO_APPROVED',
      approvedEvidenceCount: 1,
      providerAttestationCount: 1,
      verifiedProviderAttestationCount: 1,
      verificationEventCount: 5,
      notificationCount: 1,
    }])

    await query(client, 'update public.payment_settings set auto_approval_enabled = false, legacy_replay_backfill_complete = false where id = 1')

    const unauthorizedStart = await asRole(
      client,
      'authenticated',
      ids.buyer,
      () => expectRejected(client, 'authenticated lease claim', () => query(client, 'select * from public.start_payment_verification($1, $2, false)', [submissionManual, randomUUID()])),
    )
    assert.equal(unauthorizedStart.code, '42501')

    for (const role of ['anon', 'authenticated']) {
      const completeDenied = await invokeCaptured(
        config.databaseUrl,
        role,
        role === 'authenticated' ? ids.buyer : null,
        'select * from public.complete_payment_verification($1, $2, $3::jsonb)',
        [randomUUID(), randomUUID(), JSON.stringify(analyzerResult())],
      )
      assert.ok(completeDenied.error, `${role} invoked verification completion`)
      assert.equal(completeDenied.error.code, '42501')
    }

    const directInsert = await asRole(
      client,
      'authenticated',
      ids.manager,
      () => expectRejected(client, 'authenticated verification insert', () => query(
        client,
        `insert into public.payment_verifications (submission_id, order_id, state, analyzer_version) values ($1, $2, 'AUTO_CHECKING', 'test')`,
        [submissionManual, orderManual],
      )),
    )
    assert.equal(directInsert.code, '42501')

    for (const role of ['anon', 'authenticated', 'service_role']) {
      const providerInsertDenied = await invokeCaptured(
        config.databaseUrl,
        role,
        role === 'authenticated' ? ids.buyer : null,
        `insert into public.payment_provider_attestations (
          id, verification_id, submission_id, order_id, provider, method, status
        ) values ($1, $2, $3, $4, 'promptpay_authoritative', 'promptpay_provider_api_v1', 'VERIFIED')`,
        [randomUUID(), randomUUID(), randomUUID(), randomUUID()],
      )
      assert.ok(providerInsertDenied.error, `${role} forged provider attestation`)
      assert.equal(providerInsertDenied.error.code, '42501')
    }

    const buyerVerificationRows = await invokeCaptured(
      config.databaseUrl,
      'authenticated',
      ids.buyer,
      'select id, reason_codes from public.payment_verifications where submission_id = $1',
      [submissionLease],
    )
    assert.ok(buyerVerificationRows.error)
    assert.equal(buyerVerificationRows.error.code, '42501')

    const customerStatus = await asRole(
      client,
      'authenticated',
      ids.buyer,
      () => query(client, 'select * from public.get_payment_verification_customer_status($1)', [submissionLease]),
    )
    assert.deepEqual(customerStatus.fields.map((field) => field.name), ['status'])
    assert.equal(customerStatus.rows[0].status, 'under_review')
    const anonymousCustomerStatus = await invokeCaptured(
      config.databaseUrl,
      'anon',
      null,
      'select * from public.get_payment_verification_customer_status($1)',
      [submissionLease],
    )
    assert.ok(anonymousCustomerStatus.error)
    assert.equal(anonymousCustomerStatus.error.code, '42501')

    const managerVerificationRows = await asRole(
      client,
      'service_role',
      null,
      () => query(client, 'select id, reason_codes from public.payment_verifications where submission_id = $1', [submissionLease]),
    )
    assert.equal(managerVerificationRows.rows.length, 1)

    const supportVerificationRows = await invokeCaptured(
      config.databaseUrl,
      'authenticated',
      ids.support,
      'select id from public.payment_verifications where submission_id = $1',
      [submissionLease],
    )
    assert.ok(supportVerificationRows.error)
    assert.equal(supportVerificationRows.error.code, '42501')

    const supportEventRows = await asRole(
      client,
      'authenticated',
      ids.support,
      () => query(client, 'select id from public.payment_verification_events where submission_id = $1', [submissionLease]),
    )
    assert.equal(supportEventRows.rows.length, 0)

    const managerEventRows = await asRole(
      client,
      'authenticated',
      ids.manager,
      () => query(client, 'select id from public.payment_verification_events where submission_id = $1', [submissionLease]),
    )
    assert.ok(managerEventRows.rows.length >= 1)

    const appendOnlyError = await expectRejected(
      client,
      'verification event mutation',
      () => query(client, 'delete from public.payment_verification_events where submission_id = $1', [submissionLease]),
    )
    assert.equal(appendOnlyError.code, '42501')

    const manualApproval = await asRole(
      client,
      'authenticated',
      ids.manager,
      () => query(client, 'select * from public.approve_payment_submission($1)', [submissionManual]),
    )
    assert.deepEqual(manualApproval.rows[0], {
      payment_submission_id: submissionManual,
      order_id: orderManual,
      status: 'approved',
    })

    const manualReplay = await asRole(
      client,
      'authenticated',
      ids.manager,
      () => query(client, 'select * from public.approve_payment_submission($1)', [submissionManual]),
    )
    assert.deepEqual(manualReplay.rows[0], manualApproval.rows[0])

    // Exercise the service/operator legacy path with a pre-cutoff approved
    // row. It writes replay identity only; it does not grant or revoke access.
    const legacyPackage = randomUUID()
    const legacyOrder = randomUUID()
    const legacySubmission = randomUUID()
    fixture.packages.push(legacyPackage)
    fixture.orders.push(legacyOrder)
    fixture.submissions.push(legacySubmission)
    await insertPackage(client, legacyPackage, 'legacy-backfill', 900)
    await insertOrder(client, legacyOrder, ids.other, legacyPackage, 900)
    await insertSubmission(client, legacySubmission, legacyOrder, ids.other, 'legacy-backfill')
    const legacyCutoff = await query(client, 'select legacy_replay_backfill_cutoff_at from public.payment_settings where id = 1')
    await query(client, `
      update public.payment_submissions
      set status = 'approved',
          review_source = 'manual',
          reviewed_at = $2,
          reviewed_by = $3,
          rejection_reason = null
      where id = $1
    `, [legacySubmission, new Date(new Date(legacyCutoff.rows[0].legacy_replay_backfill_cutoff_at).getTime() - 1000).toISOString(), ids.manager])
    await query(client, `update public.orders set status = 'paid' where id = $1`, [legacyOrder])
    const legacyBefore = await query(client, 'select status, approval_source from public.orders o left join public.approved_payment_evidence ape on ape.order_id = o.id where o.id = $1', [legacyOrder])
    const legacyNotificationsBefore = await query(client, "select count(*)::int as count from public.notifications where source_order_id = $1 and type = 'PACKAGE_APPROVED'", [legacyOrder])
    const legacyBackfillResume = await asRole(
      client,
      'service_role',
      null,
      () => query(client, 'select * from public.start_payment_verification_legacy_backfill()'),
    )
    assert.equal(legacyBackfillResume.rows[0].already_complete, false)
    const legacyIdentity = identityHex('legacy-backfill')
    const legacyRecord = await asRole(
      client,
      'service_role',
      null,
      () => query(client, `
        select * from public.record_payment_verification_legacy_backfill($1, $2, $3, $4, $5, $6, $7)
      `, [
        legacySubmission,
        'BACKFILLED',
        'MACHINE_IDENTITY_REPLAY_SAFE',
        `hmac-sha256:v1:${legacyIdentity}`,
        `sha256:v1:${identityHex('legacy-raw')}`,
        `sha256:v1:${identityHex('legacy-normalized')}`,
        'phash:v1:0000000000000000000000000000000000000000000000000000000000000000',
      ]),
    )
    assert.deepEqual(legacyRecord.rows[0], { backfill_status: 'BACKFILLED', ledger_written: true })
    const legacyRecordAgain = await asRole(
      client,
      'service_role',
      null,
      () => query(client, `
        select * from public.record_payment_verification_legacy_backfill($1, $2, $3, $4, $5, $6, $7)
      `, [
        legacySubmission,
        'BACKFILLED',
        'MACHINE_IDENTITY_REPLAY_SAFE',
        `hmac-sha256:v1:${legacyIdentity}`,
        `sha256:v1:${identityHex('legacy-raw')}`,
        `sha256:v1:${identityHex('legacy-normalized')}`,
        'phash:v1:0000000000000000000000000000000000000000000000000000000000000000',
      ]),
    )
    assert.deepEqual(legacyRecordAgain.rows[0], { backfill_status: 'BACKFILLED', ledger_written: true })
    const legacyComplete = await asRole(
      client,
      'service_role',
      null,
      () => query(client, 'select * from public.complete_payment_verification_legacy_backfill($1, $2, $3)', [1, 1, 0]),
    )
    assert.deepEqual(legacyComplete.rows[0], {
      complete: true,
      total_count: 1,
      backfilled_count: 1,
      unsupported_count: 0,
    })
    const legacyAfter = await query(client, 'select o.status, ape.approval_source from public.orders o left join public.approved_payment_evidence ape on ape.order_id = o.id where o.id = $1', [legacyOrder])
    const legacyNotificationsAfter = await query(client, "select count(*)::int as count from public.notifications where source_order_id = $1 and type = 'PACKAGE_APPROVED'", [legacyOrder])
    assert.deepEqual(legacyBefore.rows[0], { status: 'paid', approval_source: null })
    assert.deepEqual(legacyAfter.rows[0], { status: 'paid', approval_source: 'legacy' })
    assert.equal(legacyNotificationsBefore.rows[0].count, 0)
    assert.equal(legacyNotificationsAfter.rows[0].count, 0)

    // The legacy identity is now part of the canonical replay ledger. A
    // second order with the same machine identities must fail closed before
    // it can claim evidence, payment, or a notification.
    await query(client, 'update public.payment_settings set auto_approval_enabled = true, legacy_replay_backfill_complete = true where id = 1')
    const legacyReplay = await createVerificationFixture(
      client,
      fixture,
      ids.buyer,
      'legacy-replay',
      analyzerResult('STRONG_MATCH', 'legacy-replay', {
        reference: 'legacy-backfill',
        raw: 'legacy-raw',
        normalized: 'legacy-normalized',
      }),
      { providerAttestation: true },
    )
    const legacyReplayError = await asRole(
      client,
      'service_role',
      null,
      () => expectRejected(client, 'backfilled legacy replay', () => query(
        client,
        'select * from public.auto_approve_payment_verification($1)',
        [legacyReplay.verificationId],
      )),
    )
    assert.equal(legacyReplayError.code, '23505')
    const legacyReplayFinal = await query(client, `
      select o.status as order_status,
             ps.status as submission_status,
             pv.state as verification_state,
             (select count(*) from public.approved_payment_evidence where order_id = o.id) as evidence_count,
             (select count(*) from public.notifications where source_order_id = o.id and type = 'PACKAGE_APPROVED') as notification_count
      from public.orders o
      join public.payment_submissions ps on ps.order_id = o.id
      join public.payment_verifications pv on pv.submission_id = ps.id
      where o.id = $1
    `, [legacyReplay.orderId])
    assert.deepEqual(legacyReplayFinal.rows[0], {
      order_status: 'pending',
      submission_status: 'submitted',
      verification_state: 'STRONG_MATCH',
      evidence_count: '0',
      notification_count: '0',
    })

    // The disposable harness reopens a new negative backfill run so it can
    // prove that an unresolved legacy row keeps the activation fence closed.
    // Production never reopens a completed fence through an application RPC.
    await query(client, `
      update public.payment_settings
      set auto_approval_enabled = false,
          legacy_replay_backfill_complete = false,
          legacy_replay_backfill_in_progress = false,
          legacy_replay_backfill_checkpoint_reviewed_at = null,
          legacy_replay_backfill_checkpoint_submission_id = null
      where id = 1
    `)

    const unsupportedPackage = randomUUID()
    const unsupportedOrder = randomUUID()
    const unsupportedSubmission = randomUUID()
    fixture.packages.push(unsupportedPackage)
    fixture.orders.push(unsupportedOrder)
    fixture.submissions.push(unsupportedSubmission)
    await insertPackage(client, unsupportedPackage, 'legacy-pdf', 901)
    await insertOrder(client, unsupportedOrder, ids.other, unsupportedPackage, 901)
    await insertSubmission(client, unsupportedSubmission, unsupportedOrder, ids.other, 'legacy-pdf')
    await query(client, `
      update public.payment_submissions
      set mime_type = 'application/pdf',
          original_filename = 'legacy.pdf',
          status = 'approved',
          reviewed_at = $2,
          reviewed_by = $3,
          rejection_reason = null
      where id = $1
    `, [unsupportedSubmission, new Date(new Date(legacyCutoff.rows[0].legacy_replay_backfill_cutoff_at).getTime() - 2000).toISOString(), ids.manager])
    await query(client, 'update public.orders set status = \'paid\' where id = $1', [unsupportedOrder])
    const unsupportedBackfillStart = await asRole(
      client,
      'service_role',
      null,
      () => query(client, 'select * from public.start_payment_verification_legacy_backfill()'),
    )
    assert.equal(unsupportedBackfillStart.rows[0].already_complete, false)
    const unsupportedRecord = await asRole(
      client,
      'service_role',
      null,
      () => query(client, `
        select * from public.record_payment_verification_legacy_backfill($1, $2, $3, $4, $5, $6, $7)
      `, [unsupportedSubmission, 'PDF_MANUAL_ONLY', 'PDF_MANUAL_ONLY', null, null, null, null]),
    )
    assert.deepEqual(unsupportedRecord.rows[0], { backfill_status: 'PDF_MANUAL_ONLY', ledger_written: false })
    const unsupportedLedger = await query(client, 'select count(*)::int as count from public.approved_payment_evidence where submission_id = $1', [unsupportedSubmission])
    assert.equal(unsupportedLedger.rows[0].count, 0)
    const invalidBackfillIdentity = await asRole(
      client,
      'service_role',
      null,
      () => expectRejected(client, 'unversioned legacy replay identity', () => query(
        client,
        'select * from public.record_payment_verification_legacy_backfill($1, $2, $3, $4, $5, $6, $7)',
        [unsupportedSubmission, 'BACKFILLED', 'invalid', `sha256:v1:${identityHex('invalid-reference')}`, `sha256:v1:${identityHex('invalid-raw')}`, `sha256:v1:${identityHex('invalid-normalized')}`, null],
      )),
    )
    assert.equal(invalidBackfillIdentity.code, '22023')
    const unsupportedComplete = await asRole(
      client,
      'service_role',
      null,
      () => query(client, 'select * from public.complete_payment_verification_legacy_backfill($1, $2, $3)', [2, 1, 1]),
    )
    assert.deepEqual(unsupportedComplete.rows[0], {
      complete: false,
      total_count: 2,
      backfilled_count: 1,
      unsupported_count: 1,
    })
    const unsupportedFence = await query(client, 'select legacy_replay_backfill_complete from public.payment_settings where id = 1')
    assert.equal(unsupportedFence.rows[0].legacy_replay_backfill_complete, false)

    const orderState = await query(client, 'select status from public.orders where id = $1', [orderManual])
    assert.equal(orderState.rows[0].status, 'paid')
    const ledgerState = await query(client, 'select approval_source from public.approved_payment_evidence where submission_id = $1', [submissionManual])
    assert.equal(ledgerState.rows[0].approval_source, 'manual')
    await query(client, 'update public.payment_settings set auto_approval_enabled = false, legacy_replay_backfill_complete = false where id = 1')

    // Keyset pagination/resume proof: add more than one bounded page of
    // approved pre-cutoff rows, process only part of page 1, then resume from
    // the durable (reviewed_at, id) checkpoint after an interruption.
    const pageCutoff = new Date(new Date(legacyCutoff.rows[0].legacy_replay_backfill_cutoff_at).getTime() - 5000)
    const pagedRows = Array.from({ length: 105 }, (_, index) => {
      const packageId = randomUUID()
      const orderId = randomUUID()
      const submissionId = randomUUID()
      const reviewedAt = new Date(pageCutoff.getTime() - (index + 1) * 1000).toISOString()
      fixture.packages.push(packageId)
      fixture.orders.push(orderId)
      fixture.submissions.push(submissionId)
      return {
        packageId,
        orderId,
        submissionId,
        reviewedAt,
        slug: `m13a-page-${index}-${packageId.slice(0, 8)}`,
        code: `M13A-PAGE-${index}-${packageId.slice(0, 8)}`,
        storagePath: `${ids.other}/${orderId}/${submissionId}.pdf`,
      }
    })
    await query(client, `
      insert into public.packages (id, slug, package_code, name, current_price, original_price, difficulty, features, is_published)
      select x.id, x.slug, x.package_code, x.name, x.current_price, x.current_price, 'Mixed', '[]'::jsonb, true
      from jsonb_to_recordset($1::jsonb) as x(
        id uuid, slug text, package_code text, name text, current_price numeric
      )
    `, [JSON.stringify(pagedRows.map((row, index) => ({
      id: row.packageId,
      slug: row.slug,
      package_code: row.code,
      name: `M1.3A page ${index}`,
      current_price: 910,
    })))])
    await query(client, `
      insert into public.orders (id, user_id, package_id, amount, status, payment_provider)
      select x.id, $2::uuid, x.package_id, 910, 'pending', 'promptpay_manual'
      from jsonb_to_recordset($1::jsonb) as x(id uuid, package_id uuid)
    `, [JSON.stringify(pagedRows.map((row) => ({ id: row.orderId, package_id: row.packageId }))), ids.other])
    await query(client, `
      insert into public.payment_submissions (
        id, order_id, idempotency_key, storage_object_path, original_filename,
        mime_type, file_size_bytes, payment_method, status
      )
      select x.id, x.order_id, x.idempotency_key, x.storage_object_path,
             x.original_filename, 'application/pdf', 128, 'promptpay_manual', 'submitted'
      from jsonb_to_recordset($1::jsonb) as x(
        id uuid, order_id uuid, idempotency_key uuid, storage_object_path text,
        original_filename text
      )
    `, [JSON.stringify(pagedRows.map((row, index) => ({
      id: row.submissionId,
      order_id: row.orderId,
      idempotency_key: randomUUID(),
      storage_object_path: row.storagePath,
      original_filename: `page-${index}.pdf`,
    })))])
    await query(client, `
      update public.payment_submissions ps
      set status = 'approved',
          review_source = 'manual',
          reviewed_at = x.reviewed_at,
          reviewed_by = $2::uuid,
          rejection_reason = null
      from jsonb_to_recordset($1::jsonb) as x(id uuid, reviewed_at timestamptz)
      where ps.id = x.id
    `, [JSON.stringify(pagedRows.map((row) => ({ id: row.submissionId, reviewed_at: row.reviewedAt }))), ids.manager])
    await query(client, 'update public.orders set status = \'paid\' where id = any($1::uuid[])', [pagedRows.map((row) => row.orderId)])

    const pagedStart = await asRole(
      client,
      'service_role',
      null,
      () => query(client, 'select * from public.start_payment_verification_legacy_backfill()'),
    )
    assert.equal(pagedStart.rows[0].already_complete, false)
    const firstPage = await asRole(
      client,
      'service_role',
      null,
      () => query(client, 'select * from public.get_payment_verification_legacy_backfill_page($1)', [100]),
    )
    assert.equal(firstPage.rows.length, 100)
    const recordLegacyPdf = (submissionId) => asRole(
      client,
      'service_role',
      null,
      () => query(client, `
        select * from public.record_payment_verification_legacy_backfill($1, 'PDF_MANUAL_ONLY', 'PDF_MANUAL_ONLY', null, null, null, null)
      `, [submissionId]),
    )
    for (const row of firstPage.rows.slice(0, 7)) await recordLegacyPdf(row.submission_id)
    const resumedStart = await asRole(
      client,
      'service_role',
      null,
      () => query(client, 'select * from public.start_payment_verification_legacy_backfill()'),
    )
    assert.equal(resumedStart.rows[0].already_complete, false)
    assert.equal(resumedStart.rows[0].checkpoint_submission_id, firstPage.rows[6].submission_id)

    let remainingPage = await asRole(
      client,
      'service_role',
      null,
      () => query(client, 'select * from public.get_payment_verification_legacy_backfill_page($1)', [100]),
    )
    let pageCount = 1
    while (remainingPage.rows.length > 0) {
      pageCount += 1
      for (const row of remainingPage.rows) await recordLegacyPdf(row.submission_id)
      remainingPage = await asRole(
        client,
        'service_role',
        null,
        () => query(client, 'select * from public.get_payment_verification_legacy_backfill_page($1)', [100]),
      )
    }
    assert.ok(pageCount > 1)
    const pagedCounts = await query(client, 'select legacy_replay_backfill_success_count, legacy_replay_backfill_unsupported_count from public.payment_settings where id = 1')
    const pagedComplete = await asRole(
      client,
      'service_role',
      null,
      () => query(client, 'select * from public.complete_payment_verification_legacy_backfill($1, $2, $3)', [
        pagedCounts.rows[0].legacy_replay_backfill_success_count + pagedCounts.rows[0].legacy_replay_backfill_unsupported_count,
        pagedCounts.rows[0].legacy_replay_backfill_success_count,
        pagedCounts.rows[0].legacy_replay_backfill_unsupported_count,
      ]),
    )
    assert.equal(pagedComplete.rows[0].complete, false)
    assert.equal(pagedComplete.rows[0].total_count, 107)
    assert.equal(pagedComplete.rows[0].backfilled_count, 1)
    assert.equal(pagedComplete.rows[0].unsupported_count, 106)

    console.log(JSON.stringify({
      status: 'PASS',
      database: 'disposable-local-only',
      migration: '103_payment_verification_m1_3_expand.sql',
      assertions: {
        migration_objects_and_shadow_default: true,
        legacy_replay_activation_fence: true,
        legacy_replay_service_backfill_and_completion: true,
        legacy_replay_idempotent_and_blocked: true,
        unsupported_legacy_fails_closed: true,
        legacy_backfill_identity_format_rejected: true,
        legacy_backfill_keyset_pagination_over_one_page_and_resume: true,
        service_only_lease_and_completion: true,
        concurrent_lease_single_winner: true,
        expired_lease_recovery: true,
        lease_consumed_and_stale_completion_fenced: true,
        analyzer_retry_limit_event_once: true,
        every_service_rpc_denied_to_anon_and_authenticated: true,
        service_only_settings_and_retention: true,
        customer_sanitized_status_and_manager_only_rows: true,
        authenticated_mutation_denied: true,
        support_read_denied: true,
        append_only_event_boundary: true,
        manual_approval_compatibility: true,
        manual_approval_replay_safe: true,
        automatic_approval_retry_notification_idempotency: true,
        provider_attestation_valid_temporal_contract: true,
        provider_attestation_no_attestation_fails_closed: true,
        provider_attestation_future_dated_rejected: true,
        provider_attestation_expired_rejected: true,
        provider_attestation_created_before_identity_rejected: true,
        provider_attestation_missing_validity_rejected: true,
        provider_attestation_mismatched_timestamps_rejected: true,
        provider_transaction_identity_unique_boundary: true,
        provider_transaction_concurrent_duplicate_blocked: true,
        provider_transaction_insert_race_full_state_assertions: true,
        provider_transaction_cross_order_user_replay_blocked: true,
        provider_transaction_namespace_index_checked: true,
        provider_failed_unavailable_retry_semantics: true,
        provider_transaction_after_order_creation_passes: true,
        provider_transaction_at_order_creation_passes: true,
        provider_transaction_within_order_clock_skew_passes: true,
        provider_transaction_outside_order_clock_skew_denied: true,
        provider_transaction_hours_before_order_denied: true,
        provider_transaction_days_before_order_denied: true,
        old_verified_transaction_new_order_denied: true,
        delayed_submission_after_valid_transaction_permitted: true,
        next_day_submission_after_valid_transaction_permitted: true,
        provider_transaction_age_gate_fail_closed: true,
        provider_attestation_mismatched_order_denied: true,
        provider_attestation_mismatched_reference_denied: true,
        plain_sha_reference_rejected: true,
        auto_same_reference_concurrency: true,
        manual_same_raw_normalized_concurrency: true,
        manual_same_reference_concurrency: true,
        auto_manual_race: true,
        auto_reject_race: true,
        auto_cancel_race: true,
        financial_races_full_state_assertions: true,
      },
    }, null, 2))
  } finally {
    await Promise.all(raceClients.map((raceClient) => raceClient.end().catch(() => {})))
    await cleanFixture(client, fixture).catch(() => {})
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
