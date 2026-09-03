import { createHmac, timingSafeEqual } from 'node:crypto'
import type { DailyAnswers } from './types'

function isDailyChoice(value: unknown): value is DailyAnswers[string] {
  return typeof value === 'string' && ['A', 'B', 'C', 'D'].includes(value)
}

export const GUEST_DAILY_PROOF_COOKIE = 'sobdai_daily_guest_proof'
export const GUEST_DAILY_PROOF_MAX_AGE_SECONDS = 36 * 60 * 60

const GUEST_PROOF_VERSION = 1
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type GuestProofQuestionIds = [string, string, string, string, string]

export interface DailyGuestCompletionProof {
  version: 1
  localDate: string
  questionIds: GuestProofQuestionIds
  answers: DailyAnswers
  issuedAt: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isQuestionId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

function isFiveQuestionIds(value: unknown): value is GuestProofQuestionIds {
  return Array.isArray(value)
    && value.length === 5
    && value.every(isQuestionId)
    && new Set(value).size === 5
}

function sameSequence(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function decode(value: string): string | null {
  try {
    return Buffer.from(value, 'base64url').toString('utf8')
  } catch {
    return null
  }
}

function signBody(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest().toString('base64url')
}

/**
 * This is intentionally server-only configuration. A dedicated secret is
 * preferred; the existing server-only Supabase service key is a safe
 * migration-free fallback because it is already required by backend actions
 * and is never returned to the browser.
 */
export function getDailyGuestProofSecret(): string {
  const secret = process.env.DAILY_GUEST_PROOF_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('Missing Daily guest proof secret.')
  return secret
}

export function normalizeGuestCompletionAnswers(
  value: unknown,
  questionIds: readonly string[],
): DailyAnswers | null {
  if (!isFiveQuestionIds(questionIds) || !isRecord(value)) return null

  const keys = Object.keys(value)
  if (keys.length !== questionIds.length) return null
  if (keys.some((key) => !questionIds.includes(key))) return null

  const answers: DailyAnswers = {}
  for (const questionId of questionIds) {
    const choice = value[questionId]
    if (!isDailyChoice(choice)) return null
    answers[questionId] = choice
  }
  return answers
}

export function createDailyGuestCompletionProof(
  localDate: string,
  questionIds: readonly string[],
  answers: unknown,
  secret: string,
  issuedAt = Date.now(),
): string {
  if (!DATE_PATTERN.test(localDate)) throw new Error('Invalid Daily proof date.')
  if (!Number.isSafeInteger(issuedAt)) throw new Error('Invalid Daily proof timestamp.')

  const normalizedIds = isFiveQuestionIds(questionIds) ? [...questionIds] as GuestProofQuestionIds : null
  const normalizedAnswers = normalizeGuestCompletionAnswers(answers, questionIds)
  if (!normalizedIds || !normalizedAnswers) throw new Error('Invalid Daily proof answers.')

  const payload: DailyGuestCompletionProof = {
    version: GUEST_PROOF_VERSION,
    localDate,
    questionIds: normalizedIds,
    answers: Object.fromEntries(
      normalizedIds.map((questionId) => [questionId, normalizedAnswers[questionId]]),
    ),
    issuedAt,
  }
  const body = encode(JSON.stringify(payload))
  return `${body}.${signBody(body, secret)}`
}

export function verifyDailyGuestCompletionProof(
  token: string,
  secret: string,
  expectedLocalDate: string,
  expectedQuestionIds: readonly string[],
  now = Date.now(),
): DailyGuestCompletionProof | null {
  if (typeof token !== 'string' || token.length > 4096) return null

  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null

  const expectedSignature = signBody(parts[0], secret)
  const actualSignature = parts[1]
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8')
  const actualBuffer = Buffer.from(actualSignature, 'utf8')
  if (expectedBuffer.length !== actualBuffer.length
    || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    return null
  }

  const decoded = decode(parts[0])
  if (!decoded) return null

  let rawPayload: unknown
  try {
    rawPayload = JSON.parse(decoded)
  } catch {
    return null
  }
  if (!isRecord(rawPayload) || rawPayload.version !== GUEST_PROOF_VERSION) {
    return null
  }

  const localDate = rawPayload.localDate
  const questionIds = rawPayload.questionIds
  const issuedAt = rawPayload.issuedAt
  if (typeof localDate !== 'string'
    || localDate !== expectedLocalDate
    || !isFiveQuestionIds(questionIds)
    || !sameSequence(questionIds, expectedQuestionIds)
    || typeof issuedAt !== 'number'
    || !Number.isSafeInteger(issuedAt)
    || issuedAt > now + MAX_CLOCK_SKEW_MS
    || now - issuedAt > GUEST_DAILY_PROOF_MAX_AGE_SECONDS * 1000) {
    return null
  }

  const answers = normalizeGuestCompletionAnswers(rawPayload.answers, questionIds)
  if (!answers) return null

  return {
    version: 1,
    localDate,
    questionIds,
    answers,
    issuedAt,
  }
}

export function dailyGuestProofCookieOptions(maxAge = GUEST_DAILY_PROOF_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  }
}
