'use client'

import { useEffect } from 'react'
import { getBangkokDateKey, getBangkokRangeStart } from '@/lib/activity/date'

function hasPossibleSession(): boolean {
  if (typeof document === 'undefined') return false
  try {
    if (document.cookie.includes('sb-') && document.cookie.includes('-auth-token')) {
      return true
    }
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        return true
      }
    }
  } catch {}
  return false
}

export default function ActivityProvider() {
  useEffect(() => {
    // For anonymous visitors with no Supabase session token, do not load Supabase SDK.
    if (!hasPossibleSession()) {
      return
    }

    let cancelled = false
    let subscription: { unsubscribe: () => void } | null = null

    const runActivityTracker = async () => {
      const { createClient } = await import('@/lib/supabase/client')
      if (cancelled) return
      const supabase = createClient()

      const updateLastSeen = async () => {
        const { data: { session } } = await supabase.auth.getSession()
        const userId = session?.user.id

        if (!userId || cancelled) return

        const { data, error } = await supabase
          .from('profiles')
          .select('last_seen_at')
          .eq('id', userId)
          .single()

        if (error || cancelled) {
          if (error) console.error('ActivityProvider: failed to read last_seen_at:', error.message)
          return
        }

        if (getBangkokDateKey(data?.last_seen_at ?? 0) === getBangkokDateKey()) return

        const todayStart = getBangkokRangeStart('day')
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', userId)
          .or(`last_seen_at.is.null,last_seen_at.lt.${todayStart}`)

        if (updateError) {
          console.error('ActivityProvider: failed to update last_seen_at:', updateError.message)
        }
      }

      updateLastSeen()

      const { data: subData } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user && !cancelled) updateLastSeen()
      })
      subscription = subData.subscription
    }

    runActivityTracker()

    return () => {
      cancelled = true
      subscription?.unsubscribe()
    }
  }, [])

  return null
}
