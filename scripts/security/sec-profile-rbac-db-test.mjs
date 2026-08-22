#!/usr/bin/env node

import pg from 'pg'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const { Client } = pg

const DESTRUCTIVE_TEST_GUARD = 'YES_I_AM_USING_SOBDAI_SEC_TEST'
const OWNER_INVARIANT_LOCK_ID = 780079
// Product invariant: multiple usable Owners are valid. SEC-079 imposes no
// maximum and never requires exactly one; only the lower bound is protected.
const MIN_USABLE_OWNER_COUNT = 1
// This is only the disposable fixture's reset baseline, not a product limit.
const FIXTURE_BASELINE_USABLE_OWNER_COUNT = 2
const STATEMENT_TIMEOUT = '15000ms'
const BLOCK_WAIT_TIMEOUT_MS = 4500
const OPERATION_TIMEOUT_MS = 10000

const REQUIRED_ENVIRONMENT = [
  'SEC_DB_ALLOW_DESTRUCTIVE_TESTS',
  'SEC_DB_TEST_PROJECT_REF',
  'SEC_DB_TEST_SUPABASE_URL',
  'SEC_DB_TEST_DATABASE_URL',
]

// If a normal application endpoint is present, require the operator to rerun
// with an isolated environment instead of allowing an ambiguous invocation.
const FORBIDDEN_APPLICATION_ENVIRONMENT = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'POSTGRES_URL',
  'POSTGRES_PASSWORD',
  'OMISE_SECRET_KEY',
  'OMISE_WEBHOOK_KEY',
]

// These are identifiers for the disposable fixture only. They are not
// credentials and are resolved to UUIDs from public.profiles at runtime.
const TEST_EMAILS = Object.freeze({
  ownerA: 'sec-db2a-owner-a@example.com',
  ownerB: 'sec-db2a-owner-b@example.com',
  admin: 'sec-db2a-admin@example.com',
  editor: 'sec-db2a-editor@example.com',
  support: 'sec-db2a-support@example.com',
  normal: 'sec-db2a-normal-user@example.com',
  bannedManager: 'sec-db2a-banned-user@example.com',
  deletedManager: 'sec-db2a-deleted-user@example.com',
})
const TEST_EMAIL_LIST = Object.values(TEST_EMAILS)

const PROFILE_SELF_SERVICE_FIELDS = new Set([
  'display_name',
  'occupation',
  'phone',
  'avatar_url',
  'last_seen_at',
])

const PROFILE_TRUSTED_FIELDS = new Set([
  'role',
  'status',
  'banned_at',
  'banned_reason',
  'banned_by',
  'deleted_at',
  'deleted_reason',
  'deleted_by',
])

const PROFILE_FIELD_ASSIGNMENTS = Object.freeze({
  role: 'role = $1',
  status: 'status = $1',
  banned_at: 'banned_at = $1',
  banned_reason: 'banned_reason = $1',
  banned_by: 'banned_by = $1',
  deleted_at: 'deleted_at = $1',
  deleted_reason: 'deleted_reason = $1',
  deleted_by: 'deleted_by = $1',
  display_name: 'display_name = $1',
  occupation: 'occupation = $1',
  phone: 'phone = $1',
  avatar_url: 'avatar_url = $1',
  last_seen_at: 'last_seen_at = $1',
})

const EXPECTED_MANAGER_POLICIES = [
  ['profiles_select_own', 'profiles', 'SELECT'],
  ['profiles_select_managers', 'profiles', 'SELECT'],
  ['profiles_update_self', 'profiles', 'UPDATE'],
  ['Only admins can manage homepage settings.', 'homepage_settings', 'ALL'],
  ['Content managers can manage news.', 'news', 'ALL'],
  ['Content managers can manage news_packages.', 'news_packages', 'ALL'],
  ['Content managers can manage news_summaries.', 'news_summaries', 'ALL'],
  ['Content managers can manage news_redirects.', 'news_redirects', 'ALL'],
  ['Content managers can manage articles.', 'articles', 'ALL'],
  ['Content managers can manage article_packages.', 'article_packages', 'ALL'],
  ['Content managers can manage promotions.', 'promotions', 'ALL'],
]

const EXPECTED_PUBLIC_POLICIES = [
  ['Homepage settings are publicly readable.', 'homepage_settings'],
  ['Public can read published news.', 'news'],
  ['Public can read relations of published news (packages).', 'news_packages'],
  ['Public can read relations of published news (summaries).', 'news_summaries'],
  ['Public can read news redirects.', 'news_redirects'],
  ['Public can read published articles.', 'articles'],
  ['Public can read relations of published articles (packages).', 'article_packages'],
  ['Public can read live homepage promotions.', 'promotions'],
]

// Category-A privileged mutation inventory. This is intentionally explicit so
// a newly reintroduced legacy policy cannot hide behind the old policy names.
// The catalog-wide assertion below also scans these relations for unexpected
// mutation policies after checking this inventory.
const EXPECTED_RESIDUAL_POLICIES = [
  ['public', 'organizations', 'Only owners can insert organizations.', 'INSERT', 'direct'],
  ['public', 'organizations', 'Only owners can update organizations.', 'UPDATE', 'direct'],
  ['public', 'organizations', 'Only owners can delete organizations.', 'DELETE', 'direct'],
  ['public', 'positions', 'Only owners can insert positions.', 'INSERT', 'direct'],
  ['public', 'positions', 'Only owners can update positions.', 'UPDATE', 'direct'],
  ['public', 'positions', 'Only owners can delete positions.', 'DELETE', 'direct'],
  ['public', 'packages', 'Content creators can insert packages.', 'INSERT', 'direct'],
  ['public', 'packages', 'Content creators can update packages.', 'UPDATE', 'direct'],
  ['public', 'packages', 'Content managers can delete packages.', 'DELETE', 'direct'],
  ['public', 'exam_sets', 'Content creators can insert exam_sets.', 'INSERT', 'direct'],
  ['public', 'exam_sets', 'Content creators can update exam_sets.', 'UPDATE', 'direct'],
  ['public', 'exam_sets', 'Content managers can delete exam_sets.', 'DELETE', 'direct'],
  ['public', 'questions', 'Content creators can insert questions.', 'INSERT', 'direct'],
  ['public', 'questions', 'Content creators can update questions.', 'UPDATE', 'direct'],
  ['public', 'questions', 'Content managers can delete questions.', 'DELETE', 'direct'],
  ['public', 'exam_set_questions', 'Content creators can manage exam_set_questions.', 'ALL', 'direct'],
  ['public', 'orders', 'Financial managers can insert orders.', 'INSERT', 'direct'],
  ['public', 'orders', 'Financial managers can update orders.', 'UPDATE', 'direct'],
  ['public', 'orders', 'Financial managers can delete orders.', 'DELETE', 'direct'],
  ['storage', 'objects', 'Users can upload package assets.', 'INSERT', 'direct'],
  ['storage', 'objects', 'Users can update package assets.', 'UPDATE', 'direct'],
  ['storage', 'objects', 'Content managers can upload news assets.', 'INSERT', 'direct'],
  ['storage', 'objects', 'Content managers can update news assets.', 'UPDATE', 'direct'],
  ['storage', 'objects', 'Content managers can delete news assets.', 'DELETE', 'direct'],
  ['storage', 'objects', 'Content managers can upload article assets.', 'INSERT', 'direct'],
  ['storage', 'objects', 'Content managers can update article assets.', 'UPDATE', 'direct'],
  ['storage', 'objects', 'Content managers can delete article assets.', 'DELETE', 'direct'],
  ['public', 'reference_documents', 'kp_editor_insert', 'INSERT', 'kp'],
  ['public', 'reference_documents', 'kp_editor_update', 'UPDATE', 'kp'],
  ['public', 'reference_document_versions', 'kp_editor_insert', 'INSERT', 'kp'],
  ['public', 'reference_document_versions', 'kp_editor_update', 'UPDATE', 'kp'],
  ['public', 'reference_document_aliases', 'kp_editor_insert', 'INSERT', 'kp'],
  ['public', 'reference_document_aliases', 'kp_editor_update', 'UPDATE', 'kp'],
]

const EXPECTED_PUBLIC_STORAGE_POLICIES = [
  ['Package Assets are publicly accessible.', 'objects'],
  ['News assets are publicly accessible.', 'objects'],
  ['Article assets are publicly accessible.', 'objects'],
]

const RESIDUAL_PUBLIC_TABLES = new Set([
  'organizations',
  'positions',
  'packages',
  'exam_sets',
  'questions',
  'exam_set_questions',
  'orders',
  'reference_documents',
  'reference_document_versions',
  'reference_document_aliases',
])

const EXPECTED_FUNCTIONS = [
  {
    signature: 'public.profile_actor_is_manager()',
    securityDefiner: true,
    authenticatedExecute: true,
    searchPath: 'pg_catalog,public,auth,pg_temp',
  },
  {
    signature: 'public.admin_update_profile_role(uuid,text)',
    securityDefiner: true,
    authenticatedExecute: true,
    searchPath: 'pg_catalog,public,auth,pg_temp',
  },
  {
    signature: 'public.admin_update_profile_status(uuid,text,text)',
    securityDefiner: true,
    authenticatedExecute: true,
    searchPath: 'pg_catalog,public,auth,pg_temp',
  },
  {
    signature: 'public.deactivate_my_profile()',
    securityDefiner: true,
    authenticatedExecute: true,
    searchPath: 'pg_catalog,public,auth,pg_temp',
  },
  {
    signature: 'public.protect_profile_security_fields()',
    securityDefiner: false,
    authenticatedExecute: false,
    searchPath: 'pg_catalog,public,pg_temp',
  },
  {
    signature: 'public.kp_is_content_editor()',
    securityDefiner: true,
    authenticatedExecute: true,
    searchPath: 'pg_catalog,public,auth,pg_temp',
  },
]

class HarnessFailure extends Error {
  constructor(stage, code = null) {
    super(stage)
    this.name = 'HarnessFailure'
    this.stage = stage
    this.code = code
  }
}

function ensure(condition, stage) {
  if (!condition) {
    throw new HarnessFailure(stage)
  }
}

function asFailure(stage, error) {
  if (error instanceof HarnessFailure) {
    return error
  }
  return new HarnessFailure(stage, typeof error?.code === 'string' ? error.code : null)
}

function closeQuietly(client) {
  return client?.end().catch(() => {})
}

function errorReason(error) {
  const code = error?.code ?? null
  const message = typeof error?.message === 'string' ? error.message : ''

  if (message.includes('last usable Owner')) {
    return 'last_usable_owner_denied'
  }
  if (message.includes('Only an active Owner or Admin')) {
    return 'inactive_or_non_manager_denied'
  }
  if (message.includes('Authentication is required')) {
    return 'authentication_required'
  }
  if (message.includes('Trusted profile security fields')) {
    return 'trusted_field_guard_denied'
  }
  if (code === '42501') {
    return 'permission_denied'
  }
  if (code === '22023') {
    return 'invalid_argument'
  }
  if (code === '57014') {
    return 'statement_timeout'
  }
  if (code === '55P03') {
    return 'lock_not_available'
  }
  return 'database_error'
}

function compactOutcome(error) {
  return {
    ok: false,
    code: error?.code ?? null,
    reason: errorReason(error),
  }
}

async function tryQuery(client, text, params = []) {
  try {
    const result = await client.query(text, params)
    return {
      ok: true,
      rowCount: result.rowCount ?? 0,
      rows: result.rows,
    }
  } catch (error) {
    return compactOutcome(error)
  }
}

async function queryOrThrow(client, text, params, stage) {
  try {
    return await client.query(text, params)
  } catch (error) {
    throw asFailure(stage, error)
  }
}

function validateDatabaseTarget(projectRef, databaseUrl) {
  let parsedDatabaseUrl
  try {
    parsedDatabaseUrl = new URL(databaseUrl)
  } catch {
    throw new HarnessFailure('test_database_url_invalid')
  }

  ensure(
    parsedDatabaseUrl.protocol === 'postgres:' || parsedDatabaseUrl.protocol === 'postgresql:',
    'test_database_url_not_postgresql',
  )
  ensure(parsedDatabaseUrl.hostname.length > 0, 'test_database_url_missing_host')
  ensure(parsedDatabaseUrl.username.length > 0, 'test_database_url_missing_user')
  ensure(parsedDatabaseUrl.password.length > 0, 'test_database_url_missing_password')
  ensure(parsedDatabaseUrl.pathname === '/postgres', 'test_database_url_database_mismatch')
  ensure(parsedDatabaseUrl.search === '' && parsedDatabaseUrl.hash === '', 'test_database_url_contains_unexpected_parts')
  ensure(['', '5432', '6543'].includes(parsedDatabaseUrl.port), 'test_database_url_port_invalid')

  const directHost = parsedDatabaseUrl.hostname === `db.${projectRef}.supabase.co`
  const poolerHost = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(parsedDatabaseUrl.hostname)

  if (directHost) {
    ensure(parsedDatabaseUrl.username === 'postgres', 'test_database_url_direct_user_mismatch')
    return { mode: 'direct' }
  }

  if (poolerHost) {
    ensure(
      parsedDatabaseUrl.username === `postgres.${projectRef}`,
      'test_database_url_pooler_project_mismatch',
    )
    return { mode: 'pooler' }
  }

  throw new HarnessFailure('test_database_url_host_not_supabase')
}

function readConfiguration() {
  for (const key of REQUIRED_ENVIRONMENT) {
    ensure(
      typeof process.env[key] === 'string' && process.env[key].length > 0,
      'missing_required_environment_' + key,
    )
  }

  for (const key of FORBIDDEN_APPLICATION_ENVIRONMENT) {
    ensure(process.env[key] === undefined, 'normal_application_environment_present')
  }

  const guard = process.env.SEC_DB_ALLOW_DESTRUCTIVE_TESTS
  const ref = process.env.SEC_DB_TEST_PROJECT_REF
  const supabaseUrl = process.env.SEC_DB_TEST_SUPABASE_URL
  const databaseUrl = process.env.SEC_DB_TEST_DATABASE_URL

  ensure(guard === DESTRUCTIVE_TEST_GUARD, 'destructive_test_guard_mismatch')
  ensure(/^[a-z0-9]{20}$/.test(ref), 'test_project_ref_invalid')

  let parsedSupabaseUrl
  try {
    parsedSupabaseUrl = new URL(supabaseUrl)
  } catch {
    throw new HarnessFailure('test_supabase_url_invalid')
  }

  ensure(parsedSupabaseUrl.protocol === 'https:', 'test_supabase_url_not_https')
  ensure(parsedSupabaseUrl.hostname === ref + '.supabase.co', 'test_supabase_url_project_mismatch')
  ensure(
    parsedSupabaseUrl.username === ''
      && parsedSupabaseUrl.password === ''
      && parsedSupabaseUrl.port === ''
      && parsedSupabaseUrl.pathname === '/'
      && parsedSupabaseUrl.search === ''
      && parsedSupabaseUrl.hash === '',
    'test_supabase_url_contains_unexpected_parts',
  )

  const databaseTarget = validateDatabaseTarget(ref, databaseUrl)

  return {
    projectRef: ref,
    supabaseUrl,
    databaseUrl,
    databaseTarget,
  }
}

function createClient(config) {
  return new Client({
    connectionString: config.databaseUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  })
}

async function connectAdmin(config, stage = 'database_admin_connect') {
  const client = createClient(config)
  try {
    await client.connect()
    await client.query("set statement_timeout = '" + STATEMENT_TIMEOUT + "'")
    return client
  } catch (error) {
    await closeQuietly(client)
    throw asFailure(stage, error)
  }
}

async function connectAuthenticated(config, userId) {
  const client = await connectAdmin(config, 'authenticated_database_connect')
  try {
    await queryOrThrow(client, 'set role authenticated', [], 'authenticated_role_setup')
    await queryOrThrow(
      client,
      "select set_config('request.jwt.claim.sub', $1, false)",
      [userId],
      'authenticated_claim_setup',
    )
    await queryOrThrow(
      client,
      "select set_config('request.jwt.claim.role', 'authenticated', false)",
      [],
      'authenticated_role_claim_setup',
    )
    return client
  } catch (error) {
    await closeQuietly(client)
    throw asFailure('authenticated_session_setup', error)
  }
}

async function connectAnonymous(config) {
  const client = await connectAdmin(config, 'anonymous_database_connect')
  try {
    await queryOrThrow(client, 'set role anon', [], 'anonymous_role_setup')
    await queryOrThrow(
      client,
      "select set_config('request.jwt.claim.role', 'anon', false)",
      [],
      'anonymous_role_claim_setup',
    )
    return client
  } catch (error) {
    await closeQuietly(client)
    throw asFailure('anonymous_session_setup', error)
  }
}

async function fetchFixtureIds(client) {
  const result = await queryOrThrow(
    client,
    [
      'select p.email, p.id::text as id, (u.id is not null) as auth_user',
      'from public.profiles p',
      'left join auth.users u on u.id = p.id',
      'where p.email = any($1::text[])',
      'order by p.email',
    ].join('\n'),
    [TEST_EMAIL_LIST],
    'fixture_profile_lookup',
  )

  const byEmail = new Map(result.rows.map((row) => [row.email, row]))
  const ids = {}
  for (const [key, email] of Object.entries(TEST_EMAILS)) {
    const row = byEmail.get(email)
    ensure(row && row.auth_user === true, 'fixture_profile_or_auth_user_missing_' + key)
    ids[key] = row.id
  }
  return ids
}

async function fetchPublicFixtureIds(client) {
  const homepage = await queryOrThrow(
    client,
    'select id::text as id from public.homepage_settings order by id limit 1',
    [],
    'public_fixture_homepage_lookup',
  )
  const news = await queryOrThrow(
    client,
    "select id::text as id, is_published from public.news where slug = 'sec-published-news'",
    [],
    'public_fixture_news_lookup',
  )
  const article = await queryOrThrow(
    client,
    "select id::text as id, is_published from public.articles where slug = 'sec-published-article'",
    [],
    'public_fixture_article_lookup',
  )
  const promotion = await queryOrThrow(
    client,
    [
      'select id::text as id, status, active, placement',
      'from public.promotions',
      "where internal_name = 'sec-live-promotion'",
    ].join('\n'),
    [],
    'public_fixture_promotion_lookup',
  )

  ensure(homepage.rows.length === 1, 'public_fixture_homepage_missing')
  ensure(news.rows.length === 1 && news.rows[0].is_published === true, 'public_fixture_published_news_missing')
  ensure(
    article.rows.length === 1 && article.rows[0].is_published === true,
    'public_fixture_published_article_missing',
  )
  ensure(
    promotion.rows.length === 1
      && promotion.rows[0].status === 'published'
      && promotion.rows[0].active === true
      && promotion.rows[0].placement === 'homepage',
    'public_fixture_live_promotion_missing',
  )

  return {
    homepageId: homepage.rows[0].id,
    newsId: news.rows[0].id,
    articleId: article.rows[0].id,
    promotionId: promotion.rows[0].id,
  }
}

async function fetchResidualFixtureIds(client) {
  const result = await queryOrThrow(
    client,
    [
      'select',
      "  (select id::text from public.organizations where code = 'SEC-DB-ORG') as organization_id,",
      "  (select id::text from public.positions where code = 'SEC-DB-POS') as position_id,",
      "  (select id::text from public.packages where package_code = 'SEC-DB-PKG') as package_id,",
      "  (select id::text from public.exam_sets where name = 'SEC DB Exam Set') as exam_set_id,",
      "  (select id::text from public.questions where content = 'SEC DB Question') as question_id,",
      "  (select id::text from public.orders where payment_provider = 'sec-db2') as order_id,",
      "  (select id::text from storage.objects where bucket_id = 'package-assets' and name = 'sec/package-probe.bin') as package_asset_id,",
      "  (select id::text from storage.objects where bucket_id = 'news-assets' and name = 'sec/news-probe.bin') as news_asset_id,",
      "  (select id::text from storage.objects where bucket_id = 'article-assets' and name = 'sec/article-probe.bin') as article_asset_id,",
      "  (select id::text from public.reference_documents where document_code = 'SEC-DB-REF') as reference_document_id,",
      "  (select id::text from public.reference_document_versions where version_label = 'SEC-DB-V1') as reference_document_version_id,",
      "  (select id::text from public.reference_document_aliases where normalized_value = 'sec-db-alias') as reference_document_alias_id",
    ].join('\n'),
    [],
    'residual_fixture_lookup',
  )
  const row = result.rows[0]
  const ids = Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value]))
  for (const [key, value] of Object.entries(ids)) {
    ensure(typeof value === 'string' && value.length > 0, 'residual_fixture_missing_' + key)
  }
  return ids
}

async function verifyPrerequisites(client) {
  const result = await queryOrThrow(
    client,
    [
      'select',
      "  to_regclass('public.profiles') is not null as profiles,",
      "  to_regclass('auth.users') is not null as auth_users,",
      "  to_regprocedure('auth.uid()') is not null as auth_uid,",
      "  to_regprocedure('public.handle_updated_at()') is not null as handle_updated_at,",
      "  to_regprocedure('public.profile_actor_is_manager()') is not null as manager_function,",
      "  to_regprocedure('public.admin_update_profile_role(uuid, text)') is not null as role_function,",
      "  to_regprocedure('public.admin_update_profile_status(uuid, text, text)') is not null as status_function,",
      "  to_regprocedure('public.deactivate_my_profile()') is not null as deactivate_function,",
      "  to_regprocedure('public.protect_profile_security_fields()') is not null as trigger_function,",
      "  to_regprocedure('public.kp_is_content_editor()') is not null as kp_content_editor_function,",
      "  to_regclass('public.promotions') is not null as promotions,",
      "  to_regclass('public.organizations') is not null as organizations,",
      "  to_regclass('public.positions') is not null as positions,",
      "  to_regclass('public.packages') is not null as packages,",
      "  to_regclass('public.exam_sets') is not null as exam_sets,",
      "  to_regclass('public.questions') is not null as questions,",
      "  to_regclass('public.exam_set_questions') is not null as exam_set_questions,",
      "  to_regclass('public.orders') is not null as orders,",
      "  to_regclass('public.reference_documents') is not null as reference_documents,",
      "  to_regclass('public.reference_document_versions') is not null as reference_document_versions,",
      "  to_regclass('public.reference_document_aliases') is not null as reference_document_aliases,",
      "  to_regclass('storage.objects') is not null as storage_objects,",
      "  to_regclass('storage.buckets') is not null as storage_buckets,",
      "  exists (select 1 from pg_roles where rolname = 'anon') as anon_role,",
      "  exists (select 1 from pg_roles where rolname = 'authenticated') as authenticated_role,",
      "  exists (select 1 from pg_roles where rolname = 'service_role') as service_role,",
      "  has_table_privilege(current_user, 'public.profiles', 'UPDATE') as can_reset_fixture",
    ].join('\n'),
    [],
    'supabase_primitives_lookup',
  )
  const row = result.rows[0]
  const primitiveChecks = {
    profiles: row.profiles === true,
    auth_users: row.auth_users === true,
    auth_uid: row.auth_uid === true,
    anon_role: row.anon_role === true,
    authenticated_role: row.authenticated_role === true,
    service_role: row.service_role === true,
    promotions: row.promotions === true,
    migration_079_functions: row.handle_updated_at === true
      && row.manager_function === true
      && row.role_function === true
      && row.status_function === true
      && row.deactivate_function === true
      && row.trigger_function === true,
    residual_relations: row.organizations === true
      && row.positions === true
      && row.packages === true
      && row.exam_sets === true
      && row.questions === true
      && row.exam_set_questions === true
      && row.orders === true
      && row.reference_documents === true
      && row.reference_document_versions === true
      && row.reference_document_aliases === true
      && row.storage_objects === true
      && row.storage_buckets === true,
    kp_content_editor_function: row.kp_content_editor_function === true,
    can_reset_fixture: row.can_reset_fixture === true,
  }
  ensure(Object.values(primitiveChecks).every(Boolean), 'supabase_prerequisites_incomplete')

  const ids = await fetchFixtureIds(client)
  const publicFixture = await fetchPublicFixtureIds(client)
  const residualFixture = await fetchResidualFixtureIds(client)
  return {
    pass: true,
    primitives: primitiveChecks,
    fixture: {
      profile_count: Object.keys(ids).length,
      auth_relationships: true,
      public_content: true,
      residual_privileged_surface: true,
    },
    ids,
    publicFixture,
    residualFixture,
  }
}

async function fetchState(client) {
  const profiles = await queryOrThrow(
    client,
    [
      'select email, role, status, deleted_at is null as not_deleted,',
      "  (role = 'owner' and status = 'active' and deleted_at is null) as usable_owner",
      'from public.profiles',
      'where email = any($1::text[])',
      'order by email',
    ].join('\n'),
    [TEST_EMAIL_LIST],
    'fixture_state_lookup',
  )
  const owners = await queryOrThrow(
    client,
    [
      'select count(*)::int as count',
      'from public.profiles',
      "where role = 'owner' and status = 'active' and deleted_at is null",
    ].join('\n'),
    [],
    'usable_owner_count_lookup',
  )

  const states = {}
  for (const row of profiles.rows) {
    const key = Object.entries(TEST_EMAILS).find(([, email]) => email === row.email)?.[0]
    if (key) {
      states[key] = {
        role: row.role,
        status: row.status,
        not_deleted: row.not_deleted,
        usable_owner: row.usable_owner,
      }
    }
  }
  return {
    states,
    usable_owner_count: owners.rows[0]?.count ?? 0,
  }
}

async function assertUsableOwnerInvariant(client, stage) {
  const result = await queryOrThrow(
    client,
    [
      'select count(*)::int as count',
      'from public.profiles',
      "where role = 'owner' and status = 'active' and deleted_at is null",
    ].join('\n'),
    [],
    stage + '_lookup',
  )
  const count = result.rows[0]?.count ?? 0
  ensure(count >= MIN_USABLE_OWNER_COUNT, stage + '_violated')
  return count
}

async function resetFixture(config, ids) {
  const client = await connectAdmin(config, 'fixture_reset_connect')
  try {
    await queryOrThrow(client, 'begin', [], 'fixture_reset_begin')
    await queryOrThrow(
      client,
      [
        'update public.profiles',
        'set',
        "  role = case email",
        "    when $1 then 'owner'",
        "    when $2 then 'owner'",
        "    when $3 then 'admin'",
        "    when $4 then 'editor'",
        "    when $5 then 'support'",
        "    when $6 then 'user'",
        "    when $7 then 'admin'",
        "    when $8 then 'admin'",
        '    else role',
        '  end,',
        "  status = case when email = $7 then 'banned' else 'active' end,",
        "  display_name = case",
        "    when email = $1 then 'SEC DB2 test owner A'",
        "    when email = $2 then 'SEC DB2 test owner B'",
        "    when email = $3 then 'SEC DB2 test admin'",
        "    when email = $4 then 'SEC DB2 test editor'",
        "    when email = $5 then 'SEC DB2 test support'",
        "    when email = $6 then 'SEC DB2 test normal'",
        "    when email = $7 then 'SEC DB2 test banned manager'",
        "    when email = $8 then 'SEC DB2 test deleted manager'",
        '    else display_name',
        '  end,',
        "  occupation = 'SEC security test',",
        "  phone = '0000000000',",
        '  avatar_url = null,',
        '  last_seen_at = now(),',
        "  deleted_at = case when email = $8 then now() else null end,",
        "  deleted_reason = case when email = $8 then 'SEC fixture deleted' else null end,",
        "  deleted_by = case when email = $8 then $9::uuid else null end,",
        "  banned_at = case when email = $7 then now() else null end,",
        "  banned_reason = case when email = $7 then 'SEC fixture banned' else null end,",
        "  banned_by = case when email = $7 then $9::uuid else null end",
        'where email = any($10::text[])',
      ].join('\n'),
      [
        TEST_EMAILS.ownerA,
        TEST_EMAILS.ownerB,
        TEST_EMAILS.admin,
        TEST_EMAILS.editor,
        TEST_EMAILS.support,
        TEST_EMAILS.normal,
        TEST_EMAILS.bannedManager,
        TEST_EMAILS.deletedManager,
        ids.admin,
        TEST_EMAIL_LIST,
      ],
      'fixture_reset_update',
    )
    await queryOrThrow(client, 'commit', [], 'fixture_reset_commit')
    const state = await fetchState(client)
    ensure(
      state.usable_owner_count === FIXTURE_BASELINE_USABLE_OWNER_COUNT,
      'fixture_reset_expected_two_usable_owners',
    )
    ensure(Object.keys(state.states).length === TEST_EMAIL_LIST.length, 'fixture_reset_missing_profiles')
    return state
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw asFailure('fixture_reset', error)
  } finally {
    await closeQuietly(client)
  }
}

async function updateProfileField(client, field, value, targetId) {
  ensure(PROFILE_FIELD_ASSIGNMENTS[field] !== undefined, 'unrecognized_profile_field')
  return tryQuery(
    client,
    'update public.profiles set ' + PROFILE_FIELD_ASSIGNMENTS[field] + ' where id = $2',
    [value, targetId],
  )
}

async function updateMixedProfile(client, targetId) {
  return tryQuery(
    client,
    'update public.profiles set display_name = $1, role = $2 where id = $3',
    ['SEC DB2 mixed update', 'admin', targetId],
  )
}

async function fetchProfileSecurityState(client, targetId) {
  const result = await queryOrThrow(
    client,
    [
      'select role, status, display_name, occupation, phone, avatar_url, last_seen_at,',
      '  deleted_at, deleted_reason, deleted_by::text,',
      '  banned_at, banned_reason, banned_by::text',
      'from public.profiles',
      'where id = $1',
    ].join('\n'),
    [targetId],
    'profile_security_state_lookup',
  )
  ensure(result.rows.length === 1, 'profile_security_state_missing')
  return result.rows[0]
}

async function callRole(client, targetId, newRole) {
  const outcome = await tryQuery(
    client,
    'select public.admin_update_profile_role($1::uuid, $2::text) as result',
    [targetId, newRole],
  )
  if (!outcome.ok) {
    return outcome
  }
  return {
    ok: true,
    result: outcome.rows[0]?.result ?? null,
  }
}

async function callStatus(client, targetId, newStatus, reason = null) {
  const outcome = await tryQuery(
    client,
    'select public.admin_update_profile_status($1::uuid, $2::text, $3::text) as result',
    [targetId, newStatus, reason],
  )
  if (!outcome.ok) {
    return outcome
  }
  return {
    ok: true,
    result: outcome.rows[0]?.result ?? null,
  }
}

async function callDeactivate(client) {
  const outcome = await tryQuery(
    client,
    'select public.deactivate_my_profile() as result',
    [],
  )
  if (!outcome.ok) {
    return outcome
  }
  return {
    ok: true,
    result: outcome.rows[0]?.result ?? null,
  }
}

function expectDenied(outcome, stage, reason = null) {
  ensure(outcome.ok === false, stage + '_not_denied')
  ensure(outcome.code === '42501', stage + '_wrong_error_code')
  if (reason) {
    ensure(outcome.reason === reason, stage + '_wrong_error_reason')
  }
}

function expectSucceeded(outcome, stage) {
  ensure(outcome.ok === true && outcome.result === true, stage + '_did_not_succeed')
}

async function runDirectBoundary(config, ids, admin) {
  const normal = await connectAuthenticated(config, ids.normal)
  try {
    const before = await fetchProfileSecurityState(admin, ids.normal)

    const allowed = {}
    allowed.display_name = await updateProfileField(normal, 'display_name', 'SEC DB2 allowed name', ids.normal)
    allowed.occupation = await updateProfileField(normal, 'occupation', 'SEC DB2 allowed occupation', ids.normal)
    allowed.phone = await updateProfileField(normal, 'phone', '0999999999', ids.normal)
    allowed.avatar_url = await updateProfileField(
      normal,
      'avatar_url',
      'https://example.com/sec-db2-avatar.png',
      ids.normal,
    )
    allowed.last_seen_at = await updateProfileField(
      normal,
      'last_seen_at',
      new Date().toISOString(),
      ids.normal,
    )
    for (const field of PROFILE_SELF_SERVICE_FIELDS) {
      ensure(allowed[field].ok === true && allowed[field].rowCount === 1, 'self_service_' + field + '_failed')
    }

    const denied = {}
    denied.role_admin = updateProfileField(normal, 'role', 'admin', ids.normal)
    denied.role_owner = updateProfileField(normal, 'role', 'owner', ids.normal)
    denied.role_editor = updateProfileField(normal, 'role', 'editor', ids.normal)
    denied.status = updateProfileField(normal, 'status', 'banned', ids.normal)
    denied.banned_at = updateProfileField(normal, 'banned_at', new Date().toISOString(), ids.normal)
    denied.banned_reason = updateProfileField(normal, 'banned_reason', 'SEC direct attempt', ids.normal)
    denied.banned_by = updateProfileField(normal, 'banned_by', ids.admin, ids.normal)
    denied.deleted_at = updateProfileField(normal, 'deleted_at', new Date().toISOString(), ids.normal)
    denied.deleted_reason = updateProfileField(normal, 'deleted_reason', 'SEC direct attempt', ids.normal)
    denied.deleted_by = updateProfileField(normal, 'deleted_by', ids.admin, ids.normal)
    const deniedResults = await Promise.all(Object.entries(denied).map(async ([name, promise]) => [name, await promise]))
    const deniedSummary = Object.fromEntries(deniedResults)
    for (const [name, outcome] of Object.entries(deniedSummary)) {
      expectDenied(outcome, 'direct_' + name)
    }

    const mixed = await updateMixedProfile(normal, ids.normal)
    expectDenied(mixed, 'direct_mixed_update')

    const otherRow = await updateProfileField(normal, 'display_name', 'SEC other-row attempt', ids.ownerA)
    ensure(otherRow.ok === true && otherRow.rowCount === 0, 'direct_other_row_was_mutable')

    const after = await fetchProfileSecurityState(admin, ids.normal)
    for (const field of PROFILE_TRUSTED_FIELDS) {
      ensure(after[field] === before[field], 'direct_denied_mutated_' + field)
    }
    const ownerCount = await assertUsableOwnerInvariant(admin, 'direct_boundary_owner_invariant')

    return {
      pass: true,
      allowed_self_service_fields: Object.fromEntries(
        Object.entries(allowed).map(([name, outcome]) => [name, outcome.rowCount]),
      ),
      trusted_field_denials: Object.fromEntries(
        Object.entries(deniedSummary).map(([name, outcome]) => [name, {
          denied: outcome.ok === false,
          code: outcome.code,
          reason: outcome.reason,
        }]),
      ),
      mixed_update_denied: true,
      other_row_affected_rows: otherRow.rowCount,
      trusted_fields_unchanged: true,
      usable_owner_count: ownerCount,
    }
  } finally {
    await closeQuietly(normal)
  }
}

async function runRpcBoundary(config, ids, admin) {
  const sessions = await Promise.all([
    connectAuthenticated(config, ids.editor),
    connectAuthenticated(config, ids.support),
    connectAuthenticated(config, ids.bannedManager),
    connectAuthenticated(config, ids.deletedManager),
    connectAuthenticated(config, ids.admin),
    connectAuthenticated(config, ids.ownerA),
  ])
  const [editor, support, bannedManager, deletedManager, adminSession, owner] = sessions
  try {
    const editorRole = await callRole(editor, ids.normal, 'editor')
    expectDenied(editorRole, 'editor_role_rpc', 'inactive_or_non_manager_denied')
    await assertUsableOwnerInvariant(admin, 'editor_role_rpc_owner_invariant')

    const editorStatus = await callStatus(editor, ids.normal, 'banned', 'SEC editor attempt')
    expectDenied(editorStatus, 'editor_status_rpc', 'inactive_or_non_manager_denied')
    await assertUsableOwnerInvariant(admin, 'editor_status_rpc_owner_invariant')

    const supportRole = await callRole(support, ids.normal, 'editor')
    expectDenied(supportRole, 'support_role_rpc', 'inactive_or_non_manager_denied')
    await assertUsableOwnerInvariant(admin, 'support_role_rpc_owner_invariant')

    const supportStatus = await callStatus(support, ids.normal, 'banned', 'SEC support attempt')
    expectDenied(supportStatus, 'support_status_rpc', 'inactive_or_non_manager_denied')
    await assertUsableOwnerInvariant(admin, 'support_status_rpc_owner_invariant')

    const bannedRole = await callRole(bannedManager, ids.normal, 'editor')
    expectDenied(bannedRole, 'banned_manager_role_rpc', 'inactive_or_non_manager_denied')
    const deletedStatus = await callStatus(deletedManager, ids.normal, 'banned', 'SEC deleted attempt')
    expectDenied(deletedStatus, 'deleted_manager_status_rpc', 'inactive_or_non_manager_denied')

    const adminRole = await callRole(adminSession, ids.normal, 'editor')
    expectSucceeded(adminRole, 'admin_role_rpc')
    await assertUsableOwnerInvariant(admin, 'admin_role_rpc_owner_invariant')

    const adminRoleReset = await callRole(adminSession, ids.normal, 'user')
    expectSucceeded(adminRoleReset, 'admin_role_reset_rpc')
    await assertUsableOwnerInvariant(admin, 'admin_role_reset_rpc_owner_invariant')

    const ownerBan = await callStatus(owner, ids.normal, 'banned', 'SEC owner smoke')
    expectSucceeded(ownerBan, 'owner_ban_rpc')
    await assertUsableOwnerInvariant(admin, 'owner_ban_rpc_owner_invariant')

    const ownerUnban = await callStatus(owner, ids.normal, 'active', null)
    expectSucceeded(ownerUnban, 'owner_unban_rpc')
    const ownerCount = await assertUsableOwnerInvariant(admin, 'owner_unban_rpc_owner_invariant')

    return {
      pass: true,
      editor: { role_denied: true, status_denied: true },
      support: { role_denied: true, status_denied: true },
      inactive_managers: { banned_denied: true, deleted_denied: true },
      admin_role_transition: true,
      owner_status_transition: true,
      usable_owner_count: ownerCount,
    }
  } finally {
    await Promise.all(sessions.map((client) => closeQuietly(client)))
  }
}

async function probeContentWrite(client, targetId, stage, expectedAllowed) {
  await queryOrThrow(client, 'begin', [], stage + '_begin')
  const outcome = await tryQuery(
    client,
    'update public.news set title = title where id = $1',
    [targetId],
  )

  try {
    if (expectedAllowed) {
      ensure(outcome.ok === true && outcome.rowCount === 1, stage + '_active_manager_failed')
    } else if (outcome.ok) {
      ensure(outcome.rowCount === 0, stage + '_inactive_manager_mutated_content')
    } else {
      expectDenied(outcome, stage + '_inactive_manager_denied')
    }
  } finally {
    await safeRollback(client)
  }

  return outcome
}

async function probePrivilegedMutation(client, text, params, stage, expectedAllowed) {
  await queryOrThrow(client, 'begin', [], stage + '_begin')
  const outcome = await tryQuery(client, text, params)

  try {
    if (expectedAllowed) {
      ensure(outcome.ok === true && outcome.rowCount === 1, stage + '_active_manager_failed')
    } else if (outcome.ok) {
      ensure(outcome.rowCount === 0, stage + '_inactive_manager_mutated')
    } else {
      expectDenied(outcome, stage + '_inactive_manager_denied')
    }
  } finally {
    await safeRollback(client)
  }

  return outcome
}

async function runResidualAuthorizationBoundary(config, ids, residualFixture, admin) {
  const broadSessions = await Promise.all([
    connectAuthenticated(config, ids.admin),
    connectAuthenticated(config, ids.bannedManager),
    connectAuthenticated(config, ids.deletedManager),
  ])
  const [activeManager, bannedManager, deletedManager] = broadSessions
  const broadBoundaries = [
    ['package_update', activeManager, 'update public.packages set name = name where id = $1', [residualFixture.package_id]],
    ['exam_set_update', activeManager, 'update public.exam_sets set name = name where id = $1', [residualFixture.exam_set_id]],
    ['question_update', activeManager, 'update public.questions set content = content where id = $1', [residualFixture.question_id]],
    ['exam_set_question_update', activeManager, 'update public.exam_set_questions set sort_order = sort_order where exam_set_id = $1 and question_id = $2', [residualFixture.exam_set_id, residualFixture.question_id]],
    ['order_update', activeManager, 'update public.orders set amount = amount where id = $1', [residualFixture.order_id]],
    ['package_asset_update', activeManager, 'update storage.objects set metadata = metadata where id = $1', [residualFixture.package_asset_id]],
    ['news_asset_update', activeManager, 'update storage.objects set metadata = metadata where id = $1', [residualFixture.news_asset_id]],
    ['article_asset_update', activeManager, 'update storage.objects set metadata = metadata where id = $1', [residualFixture.article_asset_id]],
    ['kp_reference_document_update', activeManager, 'update public.reference_documents set canonical_title = canonical_title where id = $1', [residualFixture.reference_document_id]],
    ['kp_reference_document_version_update', activeManager, 'update public.reference_document_versions set version_label = version_label where id = $1', [residualFixture.reference_document_version_id]],
    ['kp_reference_document_alias_update', activeManager, 'update public.reference_document_aliases set reason = reason where id = $1', [residualFixture.reference_document_alias_id]],
  ]

  try {
    const broadResults = {}
    for (const [name, , text, params] of broadBoundaries) {
      broadResults[name] = {
        active: await probePrivilegedMutation(activeManager, text, params, 'active_' + name, true),
        banned: await probePrivilegedMutation(bannedManager, text, params, 'banned_' + name, false),
        deleted: await probePrivilegedMutation(deletedManager, text, params, 'deleted_' + name, false),
      }
    }

    // The owner-only organization/position policies are tested separately with
    // the same required role in active, banned, and deleted states. The two
    // usable Owners remain untouched, so the product lower-bound invariant is
    // still two while these fixture rows are made unusable.
    await queryOrThrow(
      admin,
      "update public.profiles set role = 'owner' where id = any($1::uuid[])",
      [[ids.bannedManager, ids.deletedManager]],
      'owner_only_residual_fixture_role_setup',
    )
    const ownerSessions = await Promise.all([
      connectAuthenticated(config, ids.ownerA),
      connectAuthenticated(config, ids.bannedManager),
      connectAuthenticated(config, ids.deletedManager),
    ])
    const [activeOwner, bannedOwner, deletedOwner] = ownerSessions
    try {
      const ownerResults = {}
      for (const [name, text, params] of [
        ['organization_update', 'update public.organizations set name = name where id = $1', [residualFixture.organization_id]],
        ['position_update', 'update public.positions set name = name where id = $1', [residualFixture.position_id]],
      ]) {
        ownerResults[name] = {
          active: await probePrivilegedMutation(activeOwner, text, params, 'active_' + name, true),
          banned: await probePrivilegedMutation(bannedOwner, text, params, 'banned_' + name, false),
          deleted: await probePrivilegedMutation(deletedOwner, text, params, 'deleted_' + name, false),
        }
      }

      const allResults = { ...broadResults, ...ownerResults }
      return {
        pass: true,
        active_authorized_allowed: Object.values(allResults).every((row) => row.active.ok && row.active.rowCount === 1),
        banned_same_role_denied: Object.values(allResults).every((row) => row.banned.ok ? row.banned.rowCount === 0 : row.banned.code === '42501'),
        deleted_same_role_denied: Object.values(allResults).every((row) => row.deleted.ok ? row.deleted.rowCount === 0 : row.deleted.code === '42501'),
        boundaries: Object.fromEntries(Object.entries(allResults).map(([name, row]) => [name, {
          active_allowed: row.active.ok && row.active.rowCount === 1,
          banned_denied: row.banned.ok ? row.banned.rowCount === 0 : row.banned.code === '42501',
          deleted_denied: row.deleted.ok ? row.deleted.rowCount === 0 : row.deleted.code === '42501',
        }])),
      }
    } finally {
      await Promise.all(ownerSessions.map((client) => closeQuietly(client)))
    }
  } finally {
    await Promise.all(broadSessions.map((client) => closeQuietly(client)))
  }
}

async function runContentAuthorizationBoundary(config, ids, publicFixture) {
  const sessions = await Promise.all([
    connectAuthenticated(config, ids.ownerA),
    connectAuthenticated(config, ids.admin),
    connectAuthenticated(config, ids.editor),
    connectAuthenticated(config, ids.bannedManager),
    connectAuthenticated(config, ids.deletedManager),
  ])
  const [owner, admin, editor, bannedManager, deletedManager] = sessions

  try {
    const active = {
      owner: await probeContentWrite(owner, publicFixture.newsId, 'active_owner_content_write', true),
      admin: await probeContentWrite(admin, publicFixture.newsId, 'active_admin_content_write', true),
      editor: await probeContentWrite(editor, publicFixture.newsId, 'active_editor_content_write', true),
    }
    const inactive = {
      banned: await probeContentWrite(bannedManager, publicFixture.newsId, 'banned_manager_content_write', false),
      deleted: await probeContentWrite(deletedManager, publicFixture.newsId, 'deleted_manager_content_write', false),
    }

    return {
      pass: true,
      active_owner_allowed: active.owner.ok && active.owner.rowCount === 1,
      active_admin_allowed: active.admin.ok && active.admin.rowCount === 1,
      active_editor_allowed: active.editor.ok && active.editor.rowCount === 1,
      banned_manager_denied: inactive.banned.ok ? inactive.banned.rowCount === 0 : true,
      deleted_manager_denied: inactive.deleted.ok ? inactive.deleted.rowCount === 0 : true,
    }
  } finally {
    await Promise.all(sessions.map((client) => closeQuietly(client)))
  }
}

async function runOwnerMultiplicity(config, ids, admin) {
  const owner = await connectAuthenticated(config, ids.ownerA)
  try {
    const promoteToOwner = await callRole(owner, ids.normal, 'owner')
    expectSucceeded(promoteToOwner, 'second_owner_assignment')
    const countAfterPromotion = await assertUsableOwnerInvariant(
      admin,
      'second_owner_assignment_owner_invariant',
    )
    ensure(countAfterPromotion >= 3, 'second_owner_assignment_did_not_allow_multiple_owners')

    const demoteBackToUser = await callRole(owner, ids.normal, 'user')
    expectSucceeded(demoteBackToUser, 'multiple_owner_cleanup')
    const countAfterCleanup = await assertUsableOwnerInvariant(
      admin,
      'multiple_owner_cleanup_owner_invariant',
    )
    ensure(countAfterCleanup >= MIN_USABLE_OWNER_COUNT, 'multiple_owner_cleanup_violated_owner_invariant')

    return {
      pass: true,
      multiple_usable_owners_allowed: true,
      maximum_owner_count_imposed: false,
      usable_owner_count_after_promotion: countAfterPromotion,
      usable_owner_count_after_cleanup: countAfterCleanup,
    }
  } finally {
    await closeQuietly(owner)
  }
}

async function runSelfDeactivation(config, ids, admin) {
  const normal = await connectAuthenticated(config, ids.normal)
  try {
    const before = await fetchProfileSecurityState(admin, ids.normal)
    const deactivation = await callDeactivate(normal)
    expectSucceeded(deactivation, 'self_deactivation')
    const afterDeactivation = await fetchProfileSecurityState(admin, ids.normal)

    ensure(afterDeactivation.role === before.role, 'self_deactivation_changed_role')
    ensure(afterDeactivation.status === before.status, 'self_deactivation_changed_status')
    ensure(afterDeactivation.banned_at === before.banned_at, 'self_deactivation_changed_banned_at')
    ensure(afterDeactivation.banned_reason === before.banned_reason, 'self_deactivation_changed_banned_reason')
    ensure(afterDeactivation.banned_by === before.banned_by, 'self_deactivation_changed_banned_by')
    ensure(afterDeactivation.deleted_at !== null, 'self_deactivation_missing_deleted_at')
    ensure(afterDeactivation.deleted_reason === 'self', 'self_deactivation_wrong_reason')
    ensure(afterDeactivation.deleted_by === ids.normal, 'self_deactivation_wrong_actor')

    const directReactivation = await updateProfileField(normal, 'deleted_at', null, ids.normal)
    expectDenied(directReactivation, 'direct_self_reactivation')

    const repeated = await callDeactivate(normal)
    ensure(repeated.ok === true && repeated.result === false, 'repeated_self_deactivation_not_false')
    const ownerCount = await assertUsableOwnerInvariant(admin, 'self_deactivation_owner_invariant')

    return {
      pass: true,
      self_deactivation_succeeded: true,
      trusted_role_status_ban_fields_unchanged: true,
      direct_reactivation_denied: true,
      repeated_deactivation_returned_false: true,
      usable_owner_count: ownerCount,
    }
  } finally {
    await closeQuietly(normal)
  }
}

async function runAnonymousBoundary(config, publicFixture, admin) {
  const anonymous = await connectAnonymous(config)
  try {
    const profileRead = await tryQuery(anonymous, 'select count(*)::int as count from public.profiles', [])
    expectDenied(profileRead, 'anonymous_profile_read', 'permission_denied')

    const profileMutation = await tryQuery(
      anonymous,
      'update public.profiles set display_name = $1 where id = $2',
      ['SEC anonymous attempt', publicFixture.normalId],
    )
    expectDenied(profileMutation, 'anonymous_profile_mutation', 'permission_denied')

    const publicQueries = {
      homepage_settings: [
        'select count(*)::int as count from public.homepage_settings where id = $1',
        [publicFixture.homepageId],
      ],
      published_news: [
        "select count(*)::int as count from public.news where id = $1 and is_published = true",
        [publicFixture.newsId],
      ],
      published_news_packages: [
        'select count(*)::int as count from public.news_packages where news_id = $1',
        [publicFixture.newsId],
      ],
      published_news_summaries: [
        'select count(*)::int as count from public.news_summaries where news_id = $1',
        [publicFixture.newsId],
      ],
      news_redirects: [
        "select count(*)::int as count from public.news_redirects where from_path = '/news/old-sec'",
        [],
      ],
      published_articles: [
        "select count(*)::int as count from public.articles where id = $1 and is_published = true",
        [publicFixture.articleId],
      ],
      published_article_packages: [
        'select count(*)::int as count from public.article_packages where article_id = $1',
        [publicFixture.articleId],
      ],
      live_homepage_promotions: [
        "select count(*)::int as count from public.promotions where id = $1 and placement = 'homepage' and status = 'published' and active = true",
        [publicFixture.promotionId],
      ],
    }

    const rows = {}
    for (const [name, [sql, params]] of Object.entries(publicQueries)) {
      const outcome = await tryQuery(anonymous, sql, params)
      ensure(outcome.ok === true && outcome.rows[0]?.count === 1, 'anonymous_public_read_' + name)
      rows[name] = outcome.rows[0].count
    }

    const ownerCount = await assertUsableOwnerInvariant(admin, 'anonymous_boundary_owner_invariant')
    return {
      pass: true,
      anonymous_profiles_denied: true,
      anonymous_profile_mutation_denied: true,
      anonymous_live_promotion_read_allowed: rows.live_homepage_promotions === 1,
      public_content_rows: rows,
      usable_owner_count: ownerCount,
    }
  } finally {
    await closeQuietly(anonymous)
  }
}

async function waitForBlocking(observer, pid, expectedBlocker) {
  const started = Date.now()
  let last = null
  while (Date.now() - started < BLOCK_WAIT_TIMEOUT_MS) {
    const result = await queryOrThrow(
      observer,
      [
        'select state, wait_event_type, wait_event,',
        '  pg_blocking_pids($1::integer) as blockers',
        'from pg_stat_activity',
        'where pid = $1::integer',
      ].join('\n'),
      [pid],
      'blocking_observation',
    )
    last = result.rows[0] ?? null
    const blockers = Array.isArray(last?.blockers) ? last.blockers.map(Number) : []
    if (
      last
      && last.wait_event_type === 'Lock'
      && blockers.includes(Number(expectedBlocker))
    ) {
      return {
        blocked: true,
        wait_event_type: last.wait_event_type,
        wait_event: last.wait_event,
        blocker_observed: true,
        elapsed_ms: Date.now() - started,
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  return {
    blocked: false,
    last_state: last?.state ?? null,
    last_wait_event_type: last?.wait_event_type ?? null,
    last_wait_event: last?.wait_event ?? null,
    blocker_observed: false,
    elapsed_ms: Date.now() - started,
  }
}

async function withTimeout(promise, timeoutMs = OPERATION_TIMEOUT_MS) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new HarnessFailure('bounded_concurrency_wait_timeout')), timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function safeRollback(client) {
  await client.query('rollback').catch(() => {})
}

async function runOwnerRace(config, ids, definition) {
  const first = await connectAuthenticated(config, ids[definition.firstActor])
  const second = await connectAuthenticated(config, ids[definition.secondActor])
  const observer = await connectAdmin(config, 'race_observer_connect')
  let secondPromise = null

  try {
    await queryOrThrow(first, 'begin', [], definition.name + '_first_begin')
    const firstPidResult = await queryOrThrow(first, 'select pg_backend_pid() as pid', [], definition.name + '_first_pid')
    const firstPid = Number(firstPidResult.rows[0].pid)
    await queryOrThrow(
      first,
      'select pg_catalog.pg_advisory_xact_lock($1::bigint)',
      [OWNER_INVARIANT_LOCK_ID],
      definition.name + '_first_lock',
    )
    const firstResult = await definition.firstOperation(first, ids)
    ensure(firstResult.ok === true && firstResult.result === true, definition.name + '_first_operation_failed')

    await queryOrThrow(second, 'begin', [], definition.name + '_second_begin')
    const secondPidResult = await queryOrThrow(second, 'select pg_backend_pid() as pid', [], definition.name + '_second_pid')
    const secondPid = Number(secondPidResult.rows[0].pid)
    secondPromise = definition.secondOperation(second, ids)
    const blocking = await waitForBlocking(observer, secondPid, firstPid)
    ensure(blocking.blocked === true && blocking.blocker_observed === true, definition.name + '_no_real_blocking')

    await queryOrThrow(first, 'commit', [], definition.name + '_first_commit')
    const ownerCountAfterFirstCommit = await assertUsableOwnerInvariant(
      observer,
      definition.name + '_after_first_commit_owner_invariant',
    )
    const secondResult = await withTimeout(secondPromise)
    if (secondResult.ok) {
      await queryOrThrow(second, 'commit', [], definition.name + '_second_commit')
    } else {
      await safeRollback(second)
    }
    const ownerCountAfterSecondResolution = await assertUsableOwnerInvariant(
      observer,
      definition.name + '_after_second_resolution_owner_invariant',
    )
    const final = await fetchState(observer)
    const pass = secondResult.ok === false
      && secondResult.code === '42501'
      && secondResult.reason === 'last_usable_owner_denied'
      && ownerCountAfterFirstCommit >= MIN_USABLE_OWNER_COUNT
      && ownerCountAfterSecondResolution >= MIN_USABLE_OWNER_COUNT
      && final.usable_owner_count >= MIN_USABLE_OWNER_COUNT

    return {
      name: definition.name,
      pass,
      first_result: { ok: firstResult.ok, result: firstResult.result },
      second_result: {
        ok: secondResult.ok,
        code: secondResult.code ?? null,
        reason: secondResult.reason ?? null,
      },
      second_completed_after_first_commit: true,
      blocking,
      usable_owner_count_after_first_commit: ownerCountAfterFirstCommit,
      usable_owner_count_after_second_resolution: ownerCountAfterSecondResolution,
      final_usable_owner_count: final.usable_owner_count,
    }
  } catch (error) {
    if (secondPromise) {
      secondPromise.catch(() => {})
    }
    await safeRollback(first)
    await safeRollback(second)
    throw asFailure(definition.name, error)
  } finally {
    await Promise.all([closeQuietly(first), closeQuietly(second), closeQuietly(observer)])
  }
}

async function runManagerAuthorizationRace(config, ids) {
  const owner = await connectAuthenticated(config, ids.ownerA)
  const manager = await connectAuthenticated(config, ids.admin)
  const observer = await connectAdmin(config, 'toctou_observer_connect')
  let managerPromise = null

  try {
    await queryOrThrow(owner, 'begin', [], 'toctou_owner_begin')
    const ownerPidResult = await queryOrThrow(owner, 'select pg_backend_pid() as pid', [], 'toctou_owner_pid')
    const ownerPid = Number(ownerPidResult.rows[0].pid)
    await queryOrThrow(
      owner,
      'select pg_catalog.pg_advisory_xact_lock($1::bigint)',
      [OWNER_INVARIANT_LOCK_ID],
      'toctou_owner_lock',
    )
    const ownerBan = await callStatus(owner, ids.admin, 'banned', 'SEC DB2C TOCTOU')
    expectSucceeded(ownerBan, 'toctou_owner_ban')

    await queryOrThrow(manager, 'begin', [], 'toctou_manager_begin')
    const managerPidResult = await queryOrThrow(manager, 'select pg_backend_pid() as pid', [], 'toctou_manager_pid')
    const managerPid = Number(managerPidResult.rows[0].pid)
    managerPromise = callRole(manager, ids.normal, 'editor')
    const blocking = await waitForBlocking(observer, managerPid, ownerPid)
    ensure(blocking.blocked === true && blocking.blocker_observed === true, 'toctou_no_real_blocking')

    await queryOrThrow(owner, 'commit', [], 'toctou_owner_commit')
    const ownerCountAfterCommit = await assertUsableOwnerInvariant(observer, 'toctou_after_owner_commit_owner_invariant')
    const managerResult = await withTimeout(managerPromise)
    expectDenied(managerResult, 'toctou_manager_authorization', 'inactive_or_non_manager_denied')
    await safeRollback(manager)
    const final = await fetchState(observer)

    return {
      pass: final.states.admin?.status === 'banned'
        && managerResult.ok === false
        && managerResult.code === '42501'
        && ownerCountAfterCommit >= MIN_USABLE_OWNER_COUNT
        && final.usable_owner_count >= MIN_USABLE_OWNER_COUNT,
      manager_authorization_checked_after_lock: true,
      owner_transition_succeeded: true,
      manager_operation_result: {
        ok: managerResult.ok,
        code: managerResult.code,
        reason: managerResult.reason,
      },
      manager_completed_after_owner_commit: true,
      blocking,
      usable_owner_count_after_owner_commit: ownerCountAfterCommit,
      final_usable_owner_count: final.usable_owner_count,
    }
  } catch (error) {
    if (managerPromise) {
      managerPromise.catch(() => {})
    }
    await safeRollback(owner)
    await safeRollback(manager)
    throw asFailure('manager_authorization_toctou', error)
  } finally {
    await Promise.all([closeQuietly(owner), closeQuietly(manager), closeQuietly(observer)])
  }
}

async function runConcurrencySuite(config, ids) {
  const scenarios = []

  scenarios.push(await runOwnerRace(config, ids, {
    name: 'owner_demotion_vs_owner_ban',
    firstActor: 'ownerB',
    firstOperation: (client, values) => callRole(client, values.ownerA, 'admin'),
    secondActor: 'ownerA',
    secondOperation: (client, values) => callStatus(client, values.ownerB, 'banned', 'SEC DB2C A'),
  }))

  await resetFixture(config, ids)
  scenarios.push(await runOwnerRace(config, ids, {
    name: 'owner_demotion_vs_self_deactivation',
    firstActor: 'ownerB',
    firstOperation: (client, values) => callRole(client, values.ownerA, 'admin'),
    secondActor: 'ownerB',
    secondOperation: (client) => callDeactivate(client),
  }))

  await resetFixture(config, ids)
  scenarios.push(await runOwnerRace(config, ids, {
    name: 'owner_ban_vs_self_deactivation',
    firstActor: 'ownerB',
    firstOperation: (client, values) => callStatus(client, values.ownerA, 'banned', 'SEC DB2C C'),
    secondActor: 'ownerB',
    secondOperation: (client) => callDeactivate(client),
  }))

  await resetFixture(config, ids)
  scenarios.push(await runOwnerRace(config, ids, {
    name: 'two_owner_self_deactivations',
    firstActor: 'ownerA',
    firstOperation: (client) => callDeactivate(client),
    secondActor: 'ownerB',
    secondOperation: (client) => callDeactivate(client),
  }))

  await resetFixture(config, ids)
  const toctou = await runManagerAuthorizationRace(config, ids)
  await resetFixture(config, ids)

  return {
    pass: scenarios.every((scenario) => scenario.pass) && toctou.pass,
    advisory_lock_id: OWNER_INVARIANT_LOCK_ID,
    real_independent_sessions: true,
    scenarios,
    manager_authorization_toctou: toctou,
  }
}

async function verifyCatalog(client) {
  const profileRls = await queryOrThrow(
    client,
    [
      'select c.relrowsecurity as enabled',
      'from pg_class c',
      'join pg_namespace n on n.oid = c.relnamespace',
      "where n.nspname = 'public' and c.relname = 'profiles' and c.relkind = 'r'",
    ].join('\n'),
    [],
    'catalog_profile_rls_lookup',
  )
  const grants = await queryOrThrow(
    client,
    [
      'select',
      "  has_table_privilege('anon', 'public.profiles', 'SELECT') as anon_table_select,",
      "  has_table_privilege('authenticated', 'public.profiles', 'UPDATE') as authenticated_table_update,",
      "  has_table_privilege('authenticated', 'public.profiles', 'SELECT') as authenticated_table_select,",
      "  has_table_privilege('anon', 'public.promotions', 'SELECT') as anon_promotion_select,",
      "  has_table_privilege('authenticated', 'public.promotions', 'SELECT') as authenticated_promotion_select,",
      "  has_table_privilege('authenticated', 'public.promotions', 'INSERT') as authenticated_promotion_insert,",
      "  has_table_privilege('authenticated', 'public.promotions', 'UPDATE') as authenticated_promotion_update,",
      "  has_table_privilege('authenticated', 'public.promotions', 'DELETE') as authenticated_promotion_delete",
    ].join('\n'),
    [],
    'catalog_profile_grants_lookup',
  )
  const columns = await queryOrThrow(
    client,
    [
      'select column_name,',
      "  has_column_privilege('anon', 'public.profiles', column_name, 'SELECT') as anon_select,",
      "  has_column_privilege('authenticated', 'public.profiles', column_name, 'UPDATE') as authenticated_update",
      'from information_schema.columns',
      "where table_schema = 'public' and table_name = 'profiles'",
      'order by ordinal_position',
    ].join('\n'),
    [],
    'catalog_profile_column_grants_lookup',
  )
  const policies = await queryOrThrow(
    client,
    [
      "select schemaname, policyname, tablename, cmd, roles::text as roles, coalesce(qual, '') as qual, coalesce(with_check, '') as with_check",
      'from pg_catalog.pg_policies',
      "where schemaname in ('public', 'storage')",
    ].join('\n'),
    [],
    'catalog_policy_lookup',
  )
  const functions = await queryOrThrow(
    client,
    [
      'select n.nspname as schema_name, p.oid::regprocedure::text as regprocedure,',
      '  pg_get_userbyid(p.proowner) as owner,',
      '  p.prosecdef as security_definer,',
      "  coalesce(p.proconfig, '{}'::text[]) as config,",
      "  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,",
      "  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,",
      "  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute",
      'from pg_proc p',
      'join pg_namespace n on n.oid = p.pronamespace',
      'where p.oid in (',
      "  to_regprocedure('public.profile_actor_is_manager()'),",
      "  to_regprocedure('public.admin_update_profile_role(uuid, text)'),",
      "  to_regprocedure('public.admin_update_profile_status(uuid, text, text)'),",
      "  to_regprocedure('public.deactivate_my_profile()'),",
      "  to_regprocedure('public.protect_profile_security_fields()'),",
      "  to_regprocedure('public.kp_is_content_editor()')",
      ')',
    ].join('\n'),
    [],
    'catalog_function_lookup',
  )
  const trigger = await queryOrThrow(
    client,
    [
      'select t.tgenabled,',
      "  t.tgfoid = to_regprocedure('public.protect_profile_security_fields()') as correct_function",
      'from pg_trigger t',
      'join pg_class c on c.oid = t.tgrelid',
      'join pg_namespace n on n.oid = c.relnamespace',
      "where n.nspname = 'public' and c.relname = 'profiles'",
      "  and t.tgname = 'profiles_security_guard' and not t.tgisinternal",
    ].join('\n'),
    [],
    'catalog_security_trigger_lookup',
  )
  const currentUser = await queryOrThrow(client, 'select current_user as current_user', [], 'catalog_current_user_lookup')

  const grantRow = grants.rows[0]
  const columnGrantExact = columns.rows.length > 0
    && columns.rows.every((row) => (
      row.anon_select === false
      && row.authenticated_update === PROFILE_SELF_SERVICE_FIELDS.has(row.column_name)
    ))
  const policyMap = new Map(
    policies.rows.map((row) => [row.schemaname + '|' + row.tablename + '|' + row.policyname + '|' + row.cmd, row]),
  )
  const managerPolicyRoles = EXPECTED_MANAGER_POLICIES.every(([name, table, command]) => (
    policyMap.get('public|' + table + '|' + name + '|' + command)?.roles === '{authenticated}'
  ))
  const managerPolicyUsableAccounts = EXPECTED_MANAGER_POLICIES
    .filter(([, table]) => table !== 'profiles')
    .every(([name, table, command]) => {
      const policy = policyMap.get('public|' + table + '|' + name + '|' + command)
      return policy?.roles === '{authenticated}'
        && /status\s*=\s*'active'/i.test(policy.qual + ' ' + policy.with_check)
        && /deleted_at\s+is\s+null/i.test(policy.qual + ' ' + policy.with_check)
    })
  const publicPolicyRoles = EXPECTED_PUBLIC_POLICIES.every(([name, table]) => (
    policyMap.get('public|' + table + '|' + name + '|SELECT')?.roles === '{public}'
  ))
  const publicStoragePolicyRoles = EXPECTED_PUBLIC_STORAGE_POLICIES.every(([name, table]) => (
    policyMap.get('storage|' + table + '|' + name + '|SELECT')?.roles === '{public}'
  ))
  const profileSelectRoles = policies.rows
    .filter((row) => row.schemaname === 'public' && row.tablename === 'profiles' && row.cmd === 'SELECT')
    .every((row) => row.roles === '{authenticated}')
  const profileUpdateRole = policyMap.get('public|profiles|profiles_update_self|UPDATE')?.roles === '{authenticated}'

  const residualPolicyChecks = {}
  for (const [schema, table, name, command, fence] of EXPECTED_RESIDUAL_POLICIES) {
    const policy = policyMap.get(schema + '|' + table + '|' + name + '|' + command)
    const predicate = (policy?.qual ?? '') + ' ' + (policy?.with_check ?? '')
    const rolesCorrect = policy?.roles === '{authenticated}'
    const fenceCorrect = fence === 'kp'
      ? /kp_is_content_editor/i.test(predicate)
      : /status\s*=\s*'active'/i.test(predicate) && /deleted_at\s+is\s+null/i.test(predicate)
    residualPolicyChecks[schema + '.' + table + '.' + name + '.' + command] = {
      exists: Boolean(policy),
      roles_correct: rolesCorrect,
      usable_account_fence: fenceCorrect,
    }
  }
  const residualPolicyInventoryPass = Object.values(residualPolicyChecks).every((check) => (
    check.exists && check.roles_correct && check.usable_account_fence
  ))

  const residualMutationRows = policies.rows.filter((row) => {
    const predicate = (row.qual ?? '') + ' ' + (row.with_check ?? '')
    const targetRelation = row.schemaname === 'public'
      ? RESIDUAL_PUBLIC_TABLES.has(row.tablename)
      : row.schemaname === 'storage'
        && row.tablename === 'objects'
        && /package-assets|news-assets|article-assets/i.test(predicate)
    return targetRelation && ['INSERT', 'UPDATE', 'DELETE', 'ALL'].includes(row.cmd)
  })
  const residualUnexpectedRows = residualMutationRows.filter((row) => {
    const predicate = (row.qual ?? '') + ' ' + (row.with_check ?? '')
    const serviceFenced = row.roles.includes('service_role') || /service_role/i.test(predicate)
    if (serviceFenced) return false
    const kpTable = ['reference_documents', 'reference_document_versions', 'reference_document_aliases'].includes(row.tablename)
    const usableFence = kpTable
      ? /kp_is_content_editor/i.test(predicate)
      : /status\s*=\s*'active'/i.test(predicate) && /deleted_at\s+is\s+null/i.test(predicate)
    return row.roles !== '{authenticated}' || !usableFence
  })
  const catalogWideResidualPass = residualUnexpectedRows.length === 0

  const functionMap = new Map(
    functions.rows.map((row) => [
      row.schema_name + '.' + row.regprocedure.replace(/\s+/g, ''),
      row,
    ]),
  )
  const functionChecks = {}
  for (const expected of EXPECTED_FUNCTIONS) {
    const row = functionMap.get(expected.signature)
    const config = row?.config ?? []
    const lockedPath = config.some((value) => (
      value.replace(/\s+/g, '') === 'search_path=' + expected.searchPath
    ))
    const executeCorrect = expected.authenticatedExecute
      ? row?.anon_execute === false
        && row?.authenticated_execute === true
        && row?.service_role_execute === false
      : row?.anon_execute === false
        && row?.authenticated_execute === false
        && row?.service_role_execute === false
    functionChecks[expected.signature] = {
      exists: Boolean(row),
      owner_trusted: row?.owner === currentUser.rows[0]?.current_user,
      security_definer: row?.security_definer === expected.securityDefiner,
      locked_search_path: lockedPath,
      execute_acl_correct: executeCorrect,
    }
  }
  const functionsPass = Object.values(functionChecks).every((check) => (
    check.exists
    && check.owner_trusted
    && check.security_definer
    && check.locked_search_path
    && check.execute_acl_correct
  ))
  const triggerPass = trigger.rows.length === 1
    && trigger.rows[0].correct_function === true
    && trigger.rows[0].tgenabled !== 'D'

  const checks = {
    profiles_rls_enabled: profileRls.rows[0]?.enabled === true,
    no_broad_anon_profile_select: grantRow?.anon_table_select === false
      && columns.rows.every((row) => row.anon_select === false),
    no_authenticated_generic_profile_update: grantRow?.authenticated_table_update === false,
    promotion_table_acl: grantRow?.anon_promotion_select === true
      && grantRow?.authenticated_promotion_select === true
      && grantRow?.authenticated_promotion_insert === true
      && grantRow?.authenticated_promotion_update === true
      && grantRow?.authenticated_promotion_delete === true,
    exact_authenticated_profile_update_columns: columnGrantExact,
    profile_policy_roles: profileSelectRoles && profileUpdateRole,
    manager_policy_roles: managerPolicyRoles,
    manager_policy_usable_accounts: managerPolicyUsableAccounts,
    public_policy_roles: publicPolicyRoles && publicStoragePolicyRoles,
    residual_policy_inventory: residualPolicyInventoryPass,
    catalog_wide_privileged_mutation_fence: catalogWideResidualPass,
    security_trigger: triggerPass,
    function_acl_and_definer_contract: functionsPass,
  }

  return {
    pass: Object.values(checks).every(Boolean),
    checks,
    residual_policy_checks: residualPolicyChecks,
    residual_mutation_policy_rows: residualMutationRows.map((row) => ({
      schema: row.schemaname,
      table: row.tablename,
      name: row.policyname,
      command: row.cmd,
      roles: row.roles,
    })),
    unexpected_privileged_mutation_policies: residualUnexpectedRows.map((row) => ({
      schema: row.schemaname,
      table: row.tablename,
      name: row.policyname,
      command: row.cmd,
      roles: row.roles,
    })),
  }
}

async function runHarness() {
  const config = readConfiguration()
  const admin = await connectAdmin(config)
  let ids = null
  let cleanupNeeded = false

  try {
    const prerequisites = await verifyPrerequisites(admin)
    ids = prerequisites.ids
    cleanupNeeded = true

    await resetFixture(config, ids)
    const catalog = await verifyCatalog(admin)
    ensure(catalog.pass, 'catalog_contract_failed')

    const direct = await runDirectBoundary(config, ids, admin)
    await resetFixture(config, ids)
    const ownerMultiplicity = await runOwnerMultiplicity(config, ids, admin)
    await resetFixture(config, ids)
    const rpc = await runRpcBoundary(config, ids, admin)
    await resetFixture(config, ids)
    const contentAuthorization = await runContentAuthorizationBoundary(
      config,
      ids,
      prerequisites.publicFixture,
    )
    await resetFixture(config, ids)
    const residualAuthorization = await runResidualAuthorizationBoundary(
      config,
      ids,
      prerequisites.residualFixture,
      admin,
    )
    await resetFixture(config, ids)
    const selfDeactivation = await runSelfDeactivation(config, ids, admin)
    await resetFixture(config, ids)
    const anonymous = await runAnonymousBoundary(
      config,
      {
        ...prerequisites.publicFixture,
        normalId: ids.normal,
      },
      admin,
    )
    await resetFixture(config, ids)
    const concurrency = await runConcurrencySuite(config, ids)
    const finalState = await fetchState(admin)
    ensure(
      finalState.usable_owner_count >= MIN_USABLE_OWNER_COUNT,
      'final_usable_owner_invariant',
    )

    const report = {
      pass: direct.pass
        && rpc.pass
        && contentAuthorization.pass
        && residualAuthorization.pass
        && ownerMultiplicity.pass
        && selfDeactivation.pass
        && anonymous.pass
        && concurrency.pass,
      project_ref: config.projectRef,
      environment: {
        guard_verified: true,
        explicit_test_variables: true,
        normal_application_environment_rejected: true,
        dotenv_files_loaded: false,
        production_endpoint_variables_used: false,
        database_target_bound: true,
        database_target_mode: config.databaseTarget.mode,
      },
      prerequisites: {
        pass: prerequisites.pass,
        primitives: prerequisites.primitives,
        fixture: prerequisites.fixture,
      },
      catalog,
      direct_profile_boundary: direct,
      owner_product_invariant: ownerMultiplicity,
      rpc_boundary: rpc,
      content_authorization: contentAuthorization,
      residual_privileged_mutation_authorization: residualAuthorization,
      self_deactivation: selfDeactivation,
      anonymous_boundary: anonymous,
      concurrency,
      final_state: {
        usable_owner_count: finalState.usable_owner_count,
        fixture_rows: Object.keys(finalState.states).length,
      },
    }
    console.log(JSON.stringify(report, null, 2))
    if (!report.pass) {
      process.exitCode = 1
    }
  } finally {
    if (cleanupNeeded && ids) {
      await resetFixture(config, ids).catch(() => {})
    }
    await closeQuietly(admin)
  }
}

function reportHarnessFailure(error) {
  const failure = error instanceof HarnessFailure
    ? error
    : new HarnessFailure('unclassified_harness_failure', typeof error?.code === 'string' ? error.code : null)
  console.error(JSON.stringify({
    pass: false,
    failure: {
      stage: failure.stage,
      code: failure.code,
    },
  }))
  process.exitCode = 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runHarness().catch(reportHarnessFailure)
}

export { readConfiguration, validateDatabaseTarget }
