'use server'

import { createClient } from '@/lib/supabase/server'
import {
  normalizeDailyInput,
  parseDailyMutationRpc,
  parseDailyStateRpc,
  rpcErrorMessage,
} from '@/lib/daily/data'
import type {
  DailyLoadResult,
  DailyMutationResult,
  SaveDailyProgressInput,
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
    return parseDailyStateRpc(data)
  } catch (error) {
    console.error('loadDailyState: unexpected error:', error)
    return { status: 'error', message: 'ไม่สามารถโหลด Daily ได้ในขณะนี้' }
  }
}

export async function saveDailyProgress(
  input: SaveDailyProgressInput,
): Promise<DailyMutationResult> {
  try {
    const normalized = normalizeDailyInput(input)
    if (!normalized) return { status: 'error', message: 'ข้อมูลคำตอบไม่ถูกต้อง' }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { status: 'unauthenticated' }

    const { data, error } = (await (supabase as any).rpc('daily_save_progress', {
      p_answers: normalized.answers,
      p_current_index: normalized.currentIndex,
      p_finalize: normalized.finalize,
    })) as {
      data: unknown
      error: { message: string; code?: string } | null
    }
    if (error) {
      console.error('saveDailyProgress: RPC failed:', error.message)
      return { status: 'error', message: rpcErrorMessage(error) }
    }
    return parseDailyMutationRpc(data)
  } catch (error) {
    console.error('saveDailyProgress: unexpected error:', error)
    return { status: 'error', message: 'ไม่สามารถบันทึก Daily ได้ในขณะนี้' }
  }
}
