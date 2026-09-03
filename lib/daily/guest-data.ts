import 'server-only'

import { createAdminClient } from '../supabase/admin'
import {
  buildGuestDailyChallenge,
  GUEST_DAILY_CHALLENGE_SELECT,
  GUEST_DAILY_QUESTION_SELECT,
  getCurrentBangkokDateKey,
  selectDeterministicDailyQuestionIds,
  type DailyQuestionIds,
  type GuestDailyChallenge,
} from './guest-challenge'

export type GuestDailyChallengeResult =
  | { status: 'ready'; challenge: GuestDailyChallenge }
  | { status: 'unavailable'; localDate: string; reason: 'not-enough-eligible-questions' | 'challenge-invalid' }
  | { status: 'error'; message: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readPersistedQuestionIds(value: unknown): DailyQuestionIds | null {
  if (!isRecord(value)) return null
  const ids = [
    value.question_1_id,
    value.question_2_id,
    value.question_3_id,
    value.question_4_id,
    value.question_5_id,
  ]
  return ids.every((id): id is string => typeof id === 'string')
    ? ids as DailyQuestionIds
    : null
}

/**
 * Read-only guest resolver. It may read the immutable shared challenge, but
 * it never creates a challenge row and never touches either user progress
 * table. The authenticated 089 RPC remains the only writer for user state.
 */
export async function resolveGuestDailyChallenge(
  localDate = getCurrentBangkokDateKey(),
): Promise<GuestDailyChallengeResult> {
  try {
    const admin = createAdminClient()
    const { data: persistedChallenge, error: challengeError } = await admin
      .from('daily_challenges')
      .select(GUEST_DAILY_CHALLENGE_SELECT)
      .eq('local_date', localDate)
      .maybeSingle()

    if (challengeError) {
      console.error('resolveGuestDailyChallenge: challenge read failed:', challengeError.message)
      return { status: 'error', message: 'ไม่สามารถโหลดข้อสอบประจำวันได้ในขณะนี้' }
    }

    const persistedIds = persistedChallenge ? readPersistedQuestionIds(persistedChallenge) : null
    if (persistedChallenge && !persistedIds) {
      return { status: 'unavailable', localDate, reason: 'challenge-invalid' }
    }

    const questionQuery = admin
      .from('questions')
      .select(GUEST_DAILY_QUESTION_SELECT)
    const { data: questionRows, error: questionError } = persistedIds
      ? await questionQuery.in('id', persistedIds)
      : await questionQuery.eq('status', 'Published')

    if (questionError) {
      console.error('resolveGuestDailyChallenge: question read failed:', questionError.message)
      return { status: 'error', message: 'ไม่สามารถโหลดข้อสอบประจำวันได้ในขณะนี้' }
    }

    const rows = Array.isArray(questionRows) ? questionRows : []
    const questionIds = persistedIds ?? selectDeterministicDailyQuestionIds(localDate, rows)

    if (questionIds.length !== 5) {
      return { status: 'unavailable', localDate, reason: 'not-enough-eligible-questions' }
    }

    const challenge = buildGuestDailyChallenge(localDate, questionIds, rows)
    if (!challenge) {
      return { status: 'unavailable', localDate, reason: 'challenge-invalid' }
    }

    return { status: 'ready', challenge }
  } catch (error) {
    console.error('resolveGuestDailyChallenge: unexpected error:', error)
    return { status: 'error', message: 'ไม่สามารถโหลดข้อสอบประจำวันได้ในขณะนี้' }
  }
}
