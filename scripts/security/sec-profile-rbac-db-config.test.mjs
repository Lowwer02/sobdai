import assert from 'node:assert/strict'
import test from 'node:test'

import { readConfiguration, validateDatabaseTarget } from './sec-profile-rbac-db-test.mjs'

const PROJECT_A = 'a'.repeat(20)
const PROJECT_B = 'b'.repeat(20)

function directUrl(projectRef, path = '/postgres') {
  return `postgresql://postgres:placeholder@db.${projectRef}.supabase.co:5432${path}`
}

function poolerUrl(projectRef, username = `postgres.${projectRef}`, path = '/postgres') {
  return `postgresql://${username}:placeholder@aws-0-test.pooler.supabase.com:6543${path}`
}

function withEnvironment(values, callback) {
  const keys = [
    'SEC_DB_ALLOW_DESTRUCTIVE_TESTS',
    'SEC_DB_TEST_PROJECT_REF',
    'SEC_DB_TEST_SUPABASE_URL',
    'SEC_DB_TEST_DATABASE_URL',
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
  const previous = new Map(keys.map((key) => [key, process.env[key]]))

  try {
    for (const key of keys) delete process.env[key]
    Object.assign(process.env, values)
    return callback()
  } finally {
    for (const key of keys) {
      const value = previous.get(key)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test('accepts only project-bound direct and Supabase pooler targets', () => {
  assert.deepEqual(validateDatabaseTarget(PROJECT_A, directUrl(PROJECT_A)), { mode: 'direct' })
  assert.deepEqual(validateDatabaseTarget(PROJECT_A, poolerUrl(PROJECT_A)), { mode: 'pooler' })
})

test('rejects an API project A with a database target for project B', () => {
  withEnvironment({
    SEC_DB_ALLOW_DESTRUCTIVE_TESTS: 'YES_I_AM_USING_SOBDAI_SEC_TEST',
    SEC_DB_TEST_PROJECT_REF: PROJECT_A,
    SEC_DB_TEST_SUPABASE_URL: `https://${PROJECT_A}.supabase.co`,
    SEC_DB_TEST_DATABASE_URL: poolerUrl(PROJECT_B),
  }, () => {
    assert.throws(() => readConfiguration(), /test_database_url_pooler_project_mismatch/)
  })
})

test('rejects a pooler username with the wrong project ref', () => {
  assert.throws(
    () => validateDatabaseTarget(PROJECT_A, poolerUrl(PROJECT_A, `postgres.${PROJECT_B}`)),
    /test_database_url_pooler_project_mismatch/,
  )
})

test('rejects non-Supabase hosts and unexpected database paths', () => {
  assert.throws(
    () => validateDatabaseTarget(PROJECT_A, 'postgresql://postgres:placeholder@example.test:5432/postgres'),
    /test_database_url_host_not_supabase/,
  )
  assert.throws(
    () => validateDatabaseTarget(PROJECT_A, directUrl(PROJECT_A, '/other')),
    /test_database_url_database_mismatch/,
  )
})

test('rejects missing destructive authorization before configuration use', () => {
  withEnvironment({
    SEC_DB_TEST_PROJECT_REF: PROJECT_A,
    SEC_DB_TEST_SUPABASE_URL: `https://${PROJECT_A}.supabase.co`,
    SEC_DB_TEST_DATABASE_URL: directUrl(PROJECT_A),
  }, () => {
    assert.throws(() => readConfiguration(), /missing_required_environment_SEC_DB_ALLOW_DESTRUCTIVE_TESTS/)
  })
})
