/**
 * app/admin/generate/publish-authority.test.ts
 * ----------------------------------------------------------------------------
 * Behavioral tests for the server-authoritative publish target (audit fix P1).
 *
 * RUN: npx jiti app/admin/generate/publish-authority.test.ts
 *
 * Proves against the REAL registry, REAL Blueprint source, and REAL Engine
 * Reader (public API):
 *  - KSB (bma-education-specialist@3.0.1) authoritative per-Set target = 100
 *  - forged/spoofed/short payloads are rejected before any DB access
 *  - the publish action invokes the authority guard before every database
 *    read and before the Exam Set write primitive
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import {
  resolveAuthoritativePublishTarget,
  validateAuthoritativeQuestionCounts,
  validateDestinationPackageBinding,
} from './publish-authority'

const KSB_IDENTITY = { id: 'bma-education-specialist', version: '3.0.1' }

function codes(count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) => `Q-${String(index + 1).padStart(6, '0')}`
  )
}

function set(
  questionCodes: string[],
  expectedQuestionCount: number
): { setNumber: number; questionCodes: string[]; expectedQuestionCount: number } {
  return { setNumber: 1, questionCodes, expectedQuestionCount }
}

/** Mirror of the action's pre-database sequence (guard → count check). */
async function preDatabaseVerdict(
  identity: { id: string; version: string },
  sets: readonly { setNumber: number; questionCodes: string[]; expectedQuestionCount: number }[]
): Promise<string | null> {
  const target = await resolveAuthoritativePublishTarget(identity)
  if (!target.ok) {
    return target.error
  }
  return validateAuthoritativeQuestionCounts(sets, target.perSet)
}

async function verifies_ksb_authoritative_target_is_100(): Promise<void> {
  const target = await resolveAuthoritativePublishTarget(KSB_IDENTITY)
  assert.ok(target.ok, `KSB identity must resolve: ${JSON.stringify(target)}`)
  assert.equal(
    target.perSet,
    100,
    'The registered KSB Blueprint must authoritatively require 100 Questions per Set'
  )
  assert.equal(target.packageCode, 'KSB-EDU-2026-V10')
}

async function verifies_forged_six_of_six_is_rejected(): Promise<void> {
  // A: internally consistent forgery — 6 codes, client expected forged to 6.
  const error = await preDatabaseVerdict(KSB_IDENTITY, [
    set(codes(6), 6),
  ])
  assert.ok(
    error !== null && error.includes('requires exactly 100'),
    `the forged (6, 6) pair must be rejected against the authoritative target: ${String(error)}`
  )
}

async function verifies_truthful_six_of_100_is_rejected(): Promise<void> {
  // B: honest partial — 6 codes, expected 100.
  const error = await preDatabaseVerdict(KSB_IDENTITY, [
    set(codes(6), 100),
  ])
  assert.ok(
    error !== null && error.includes('Partial allocations cannot be published'),
    `a 6/100 partial allocation must be rejected: ${String(error)}`
  )
}

async function verifies_ninety_nine_of_99_is_rejected(): Promise<void> {
  // C: one short with a forged matching client count.
  const error = await preDatabaseVerdict(KSB_IDENTITY, [
    set(codes(99), 99),
  ])
  assert.ok(
    error !== null && error.includes('requires exactly 100'),
    `the forged (99, 99) pair must be rejected: ${String(error)}`
  )
}

async function verifies_exactly_100_is_accepted(): Promise<void> {
  // D: complete allocation.
  const error = await preDatabaseVerdict(KSB_IDENTITY, [
    set(codes(100), 100),
  ])
  assert.equal(error, null, 'a complete 100/100 allocation must pass the guard')
}

async function verifies_forged_expected_cannot_override_authority(): Promise<void> {
  // E: complete allocation with a forged LOW client count — the client count
  // must not bypass or redefine the authoritative server target.
  const error = await preDatabaseVerdict(KSB_IDENTITY, [
    set(codes(100), 6),
  ])
  assert.ok(
    error !== null && error.includes('Client-declared targets cannot override'),
    `a forged client expected count must be rejected: ${String(error)}`
  )
}

async function verifies_unknown_blueprint_is_rejected(): Promise<void> {
  // F: spoofed identity.
  const target = await resolveAuthoritativePublishTarget({
    id: 'not-a-registered-blueprint',
    version: '3.0.1',
  })
  assert.ok(!target.ok)
  assert.match(target.error, /is not a registered Assessment Blueprint/)
}

async function verifies_wrong_version_is_rejected(): Promise<void> {
  // G: known id, unregistered version — no "latest" substitution.
  const target = await resolveAuthoritativePublishTarget({
    id: 'bma-education-specialist',
    version: '9.9.9',
  })
  assert.ok(!target.ok)
  assert.match(target.error, /version '9\.9\.9' is not registered/)
}

function verifies_package_binding_is_enforced(): void {
  // H: destination must be the Blueprint's registered package.
  const blueprintPackage = 'KSB-EDU-2026-V10'
  assert.equal(
    validateDestinationPackageBinding('OTHER-PACKAGE', blueprintPackage),
    `The destination Package is not bound to Blueprint package '${blueprintPackage}'.`
  )
  assert.ok(
    validateDestinationPackageBinding(null, blueprintPackage) !== null,
    'a package without a code must not bind'
  )
  assert.equal(
    validateDestinationPackageBinding(blueprintPackage, blueprintPackage),
    null
  )
}

function verifies_guard_precedes_all_database_access(): void {
  // I: the authority module itself performs no database access, and the
  // publish action invokes it before the first Supabase read and before the
  // Exam Set write primitive.
  const authoritySource = readFileSync(
    path.join(__dirname, 'publish-authority.ts'),
    'utf8'
  )
  assert.ok(
    !authoritySource.includes('supabase'),
    'publish-authority.ts must not touch the database'
  )

  const actionSource = readFileSync(
    path.join(__dirname, 'publish-actions.ts'),
    'utf8'
  )
  const guardIndex = actionSource.indexOf(
    'resolveAuthoritativePublishTarget('
  )
  const countGuardIndex = actionSource.indexOf(
    'validateAuthoritativeQuestionCounts('
  )
  const firstDbReadIndex = actionSource.indexOf('await supabase')
  const firstWriteIndex = actionSource.indexOf('await createExamSetAction(')
  assert.ok(guardIndex !== -1, 'the action must call the authority guard')
  assert.ok(countGuardIndex !== -1, 'the action must enforce the count guard')
  assert.ok(firstDbReadIndex !== -1, 'expected database reads in the action')
  assert.ok(firstWriteIndex !== -1, 'expected Exam Set writes in the action')
  assert.ok(
    guardIndex < firstDbReadIndex && guardIndex < firstWriteIndex,
    'the authority guard must run before any database access or write'
  )
  assert.ok(
    countGuardIndex < firstDbReadIndex && countGuardIndex < firstWriteIndex,
    'the authoritative count check must run before any database access or write'
  )
}

// ─── runner ─────────────────────────────────────────────────────────────────

const tests: readonly {
  readonly name: string
  readonly fn: () => void | Promise<void>
}[] = [
  {
    name: 'KSB authoritative per-Set target resolves to exactly 100 from the registered source',
    fn: verifies_ksb_authoritative_target_is_100,
  },
  {
    name: 'A: forged 6 codes + client expected 6 → REJECTED',
    fn: verifies_forged_six_of_six_is_rejected,
  },
  {
    name: 'B: truthful 6 codes + expected 100 → REJECTED',
    fn: verifies_truthful_six_of_100_is_rejected,
  },
  {
    name: 'C: 99 codes + forged expected 99 → REJECTED',
    fn: verifies_ninety_nine_of_99_is_rejected,
  },
  {
    name: 'D: 100 distinct codes + expected 100 → ACCEPTED',
    fn: verifies_exactly_100_is_accepted,
  },
  {
    name: 'E: 100 codes + forged client expected 6 → REJECTED (cannot override authority)',
    fn: verifies_forged_expected_cannot_override_authority,
  },
  {
    name: 'F: unknown Blueprint identity → REJECTED',
    fn: verifies_unknown_blueprint_is_rejected,
  },
  {
    name: 'G: unregistered Blueprint version → REJECTED (no substitution)',
    fn: verifies_wrong_version_is_rejected,
  },
  {
    name: 'H: destination Package binding enforced',
    fn: verifies_package_binding_is_enforced,
  },
  {
    name: 'I: authority guard precedes every database read and write',
    fn: verifies_guard_precedes_all_database_access,
  },
]

let failed = 0
for (const test of tests) {
  try {
    await test.fn()
    console.log(`  ✓ ${test.name}`)
  } catch (error) {
    failed += 1
    console.error(`  ✗ ${test.name}`)
    console.error(error)
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
