'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import {
  normalizeDailyAnswerInput,
  parseDailyMutationRpc,
  parseDailyStateRpc,
  rpcErrorMessage,
} from '@/lib/daily/data'
import {
  createGuestDailyState,
  getCurrentBangkokDateKey,
} from '@/lib/daily/guest-challenge'
import { resolveGuestDailyChallenge } from '@/lib/daily/guest-data'
import {
  createDailyGuestCompletionProof,
  dailyGuestProofCookieOptions,
  getDailyGuestProofSecret,
  GUEST_DAILY_PROOF_COOKIE,
  normalizeGuestCompletionAnswers,
  verifyDailyGuestCompletionProof,
} from '@/lib/daily/guest-proof'
import type {
  DailyGuestClaimResult,
  DailyGuestCompletionResult,
  DailyGuestMutationResult,
  DailyLoadResult,
  DailyMutationResult,
  DailyState,
  SubmitDailyAnswerInput,
} from '@/lib/daily/types'

export async function loadDailyState(): Promise<DailyLoadResult> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { status: 'unauthenticated' }

    const { data, error } = (await (supabase as any).rpc('daily_get_state')) as {
      data: unknown
      error: { message: string; code?: string } | null
    }
    if (error) {
      console.error('loadDailyState: RPC failed:', error.message)
      return { status: 'error', message: rpcErrorMessage(error) }
    }
    const parsed = parseDailyStateRpc(data)
    if (parsed.status !== 'ready') return parsed

    const cookieStore = await cookies()
    return {
      status: 'ready',
      state: {
        ...parsed.state,
        viewer: 'authenticated',
        guestClaimAvailable: cookieStore.has(GUEST_DAILY_PROOF_COOKIE),
      },
    }
  } catch (error) {
    console.error('loadDailyState: unexpected error:', error)
    return { status: 'error', message: 'ไม่สามารถโหลด Daily ได้ในขณะนี้' }
  }
}

export async function submitDailyAnswer(
  input: SubmitDailyAnswerInput,
): Promise<DailyMutationResult> {
  try {
    const normalized = normalizeDailyAnswerInput(input)
    if (!normalized) return { status: 'error', message: 'ข้อมูลคำตอบไม่ถูกต้อง' }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { status: 'unauthenticated' }

    const { data, error } = (await (supabase as any).rpc('daily_submit_answer', {
      p_question_id: normalized.questionId,
      p_choice: normalized.choice,
      p_next_index: normalized.nextIndex,
    })) as {
      data: unknown
      error: { message: string; code?: string } | null
    }
    if (error) {
      console.error('submitDailyAnswer: RPC failed:', error.message)
      return { status: 'error', message: rpcErrorMessage(error) }
    }
    return parseDailyMutationRpc(data)
  } catch (error) {
    console.error('submitDailyAnswer: unexpected error:', error)
    return { status: 'error', message: 'ไม่สามารถบันทึก Daily ได้ในขณะนี้' }
  }
}

async function hasAuthenticatedUser(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return Boolean(user)
}

/**
 * Guest Daily is a read-only server path. It deliberately does not call the
 * authenticated 089 state RPC because that RPC creates user aggregate rows.
 */
export async function loadGuestDailyState(): Promise<DailyLoadResult> {
  try {
    if (await hasAuthenticatedUser()) {
      return { status: 'error', message: 'กรุณาโหลด Daily ใหม่อีกครั้ง' }
    }

    const resolved = await resolveGuestDailyChallenge()
    if (resolved.status === 'error') return resolved
    if (resolved.status === 'unavailable') {
      return { status: 'unavailable', state: {
        available: false,
        localDate: resolved.localDate,
        reason: resolved.reason,
      } }
    }

    return {
      status: 'ready',
      state: createGuestDailyState(resolved.challenge),
    }
  } catch (error) {
    console.error('loadGuestDailyState: unexpected error:', error)
    return { status: 'error', message: 'ไม่สามารถโหลดข้อสอบประจำวันได้ในขณะนี้' }
  }
}

/**
 * Check one guest answer against the current server-side challenge. This
 * reads the answer key only on the server and does not persist any guest
 * answer or activity row.
 */
export async function submitGuestDailyAnswer(
  input: SubmitDailyAnswerInput,
): Promise<DailyGuestMutationResult> {
  try {
    const normalized = normalizeDailyAnswerInput(input)
    if (!normalized) return { status: 'error', message: 'ข้อมูลคำตอบไม่ถูกต้อง' }
    if (await hasAuthenticatedUser()) return { status: 'unauthenticated' }

    const resolved = await resolveGuestDailyChallenge()
    if (resolved.status === 'error') return resolved
    if (resolved.status === 'unavailable') {
      return { status: 'error', message: 'ข้อสอบประจำวันนี้ยังไม่พร้อมใช้งาน' }
    }

    const question = resolved.challenge.questions.find((candidate) => candidate.id === normalized.questionId)
    if (!question) return { status: 'error', message: 'คำถามนี้ไม่อยู่ในชุด Daily วันนี้' }

    return {
      status: 'ready',
      result: {
        id: question.id,
        selected: normalized.choice,
        correctAnswer: question.correct_answer,
        isCorrect: normalized.choice === question.correct_answer,
        explanation: question.full_explanation,
      },
    }
  } catch (error) {
    console.error('submitGuestDailyAnswer: unexpected error:', error)
    return { status: 'error', message: 'ไม่สามารถตรวจคำตอบได้ในขณะนี้' }
  }
}

/**
 * Verify all five terminal choices server-side and place only a signed,
 * HttpOnly proof in the browser. The proof is not returned to the client.
 */
export async function completeGuestDaily(
  input: { answers: unknown },
): Promise<DailyGuestCompletionResult> {
  try {
    if (await hasAuthenticatedUser()) return { status: 'unauthenticated' }

    const resolved = await resolveGuestDailyChallenge()
    if (resolved.status === 'error') return resolved
    if (resolved.status === 'unavailable') {
      return { status: 'error', message: 'ข้อสอบประจำวันนี้ยังไม่พร้อมใช้งาน' }
    }

    const answers = normalizeGuestCompletionAnswers(
      input?.answers,
      resolved.challenge.questionIds,
    )
    if (!answers) return { status: 'error', message: 'ผลการทำ Daily ไม่ครบถ้วน' }

    const proof = createDailyGuestCompletionProof(
      resolved.challenge.localDate,
      resolved.challenge.questionIds,
      answers,
      getDailyGuestProofSecret(),
    )
    const cookieStore = await cookies()
    cookieStore.set(
      GUEST_DAILY_PROOF_COOKIE,
      proof,
      dailyGuestProofCookieOptions(),
    )
    return { status: 'ready' }
  } catch (error) {
    console.error('completeGuestDaily: unexpected error:', error)
    return { status: 'error', message: 'ไม่สามารถยืนยันผล Daily ได้ในขณะนี้' }
  }
}

/**
 * Authenticated claim path. It accepts no client-authored score, EXP, date,
 * or answer payload. The only input is the HttpOnly proof cookie, and every
 * answer is replayed through migration 089's authoritative idempotent RPC.
 */
export async function claimGuestDaily(): Promise<DailyGuestClaimResult> {
  const cookieStore = await cookies()
  const token = cookieStore.get(GUEST_DAILY_PROOF_COOKIE)?.value
  if (!token) return { status: 'none' }

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { status: 'unauthenticated' }

    const resolved = await resolveGuestDailyChallenge(getCurrentBangkokDateKey())
    if (resolved.status === 'error') return resolved
    if (resolved.status === 'unavailable') {
      cookieStore.set(GUEST_DAILY_PROOF_COOKIE, '', dailyGuestProofCookieOptions(0))
      return { status: 'invalid-proof' }
    }

    const proof = verifyDailyGuestCompletionProof(
      token,
      getDailyGuestProofSecret(),
      resolved.challenge.localDate,
      resolved.challenge.questionIds,
    )
    if (!proof) {
      cookieStore.set(GUEST_DAILY_PROOF_COOKIE, '', dailyGuestProofCookieOptions(0))
      return { status: 'invalid-proof' }
    }

    let finalState: DailyState | null = null
    let expDelta = 0

    for (const [index, questionId] of proof.questionIds.entries()) {
      const { data, error } = (await (supabase as any).rpc('daily_submit_answer', {
        p_question_id: questionId,
        p_choice: proof.answers[questionId],
        p_next_index: index,
      })) as {
        data: unknown
        error: { message: string; code?: string } | null
      }
      if (error) {
        console.error('claimGuestDaily: RPC failed:', error.message)
        return { status: 'error', message: rpcErrorMessage(error) }
      }

      const parsed = parseDailyMutationRpc(data)
      if (parsed.status !== 'ready') return parsed
      finalState = parsed.result.state
      expDelta = Math.min(50, expDelta + parsed.result.expDelta)
    }

    if (!finalState || !finalState.progress.dailyCompleted) {
      return { status: 'error', message: 'ไม่สามารถบันทึกผล Daily ให้ครบได้' }
    }

    cookieStore.set(GUEST_DAILY_PROOF_COOKIE, '', dailyGuestProofCookieOptions(0))
    return {
      status: 'ready',
      state: {
        ...finalState,
        viewer: 'authenticated',
        guestClaimAvailable: false,
      },
      expDelta,
    }
  } catch (error) {
    console.error('claimGuestDaily: unexpected error:', error)
    return { status: 'error', message: 'ไม่สามารถบันทึกผล Daily ให้บัญชีได้ในขณะนี้' }
  }
}
