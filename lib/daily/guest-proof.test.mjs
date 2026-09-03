import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createDailyGuestCompletionProof,
  normalizeGuestCompletionAnswers,
  verifyDailyGuestCompletionProof,
} from './guest-proof.ts'

const questionIds = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
]
const answers = {
  [questionIds[0]]: 'A',
  [questionIds[1]]: 'B',
  [questionIds[2]]: 'C',
  [questionIds[3]]: 'D',
  [questionIds[4]]: 'A',
}
const secret = 'test-only-daily-proof-secret'
const issuedAt = Date.parse('2026-09-03T03:00:00.000Z')

test('a valid proof is bound to the exact Bangkok date and challenge order', () => {
  const token = createDailyGuestCompletionProof('2026-09-03', questionIds, answers, secret, issuedAt)
  const proof = verifyDailyGuestCompletionProof(
    token,
    secret,
    '2026-09-03',
    questionIds,
    issuedAt + 60_000,
  )

  assert.deepEqual(proof?.questionIds, questionIds)
  assert.deepEqual(proof?.answers, answers)
})

test('tampering with the signed payload is rejected', () => {
  const token = createDailyGuestCompletionProof('2026-09-03', questionIds, answers, secret, issuedAt)
  const [body, signature] = token.split('.')
  const tamperedBody = `${body.slice(0, -1)}${body.endsWith('A') ? 'B' : 'A'}`

  assert.equal(
    verifyDailyGuestCompletionProof(
      `${tamperedBody}.${signature}`,
      secret,
      '2026-09-03',
      questionIds,
      issuedAt + 60_000,
    ),
    null,
  )
})

test('stale, wrong-date, and wrong-challenge proofs are rejected', () => {
  const token = createDailyGuestCompletionProof('2026-09-03', questionIds, answers, secret, issuedAt)
  const afterExpiry = issuedAt + 36 * 60 * 60 * 1000 + 1

  assert.equal(
    verifyDailyGuestCompletionProof(token, secret, '2026-09-04', questionIds, issuedAt + 60_000),
    null,
  )
  assert.equal(
    verifyDailyGuestCompletionProof(token, secret, '2026-09-03', [...questionIds].reverse(), issuedAt + 60_000),
    null,
  )
  assert.equal(
    verifyDailyGuestCompletionProof(token, secret, '2026-09-03', questionIds, afterExpiry),
    null,
  )
})

test('completion input requires exactly five unique challenge answers', () => {
  assert.deepEqual(normalizeGuestCompletionAnswers(answers, questionIds), answers)
  assert.equal(normalizeGuestCompletionAnswers({ ...answers, extra: 'A' }, questionIds), null)
  assert.equal(normalizeGuestCompletionAnswers({ ...answers, [questionIds[0]]: 'X' }, questionIds), null)
  assert.equal(normalizeGuestCompletionAnswers({ [questionIds[0]]: 'A' }, questionIds), null)
})
