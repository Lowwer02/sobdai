'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getBangkokDateKey, getBangkokRangeStart } from '@/lib/activity/date'

export default function ActivityProvider() {
  const supabase = createClient()

  useEffect(() => {
    let cancelled = false

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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) updateLastSeen()
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  return null
}
