'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function fetchQuestionsForPicker(filters: {
  search?: string
  subject?: string
  law?: string
  topic?: string
  difficulty?: string
  is_common?: boolean
  page?: number
  limit?: number
}) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
      },
    }
  )
  
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Unauthorized')

  const page = filters.page || 1
  const limit = filters.limit || 10
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = supabase
    .from('questions')
    .select('id, content, subject, topic, law, difficulty, is_common, category', { count: 'exact' })

  if (filters.search) {
    query = query.ilike('content', `%${filters.search}%`)
  }
  if (filters.subject) {
    query = query.eq('subject', filters.subject)
  }
  if (filters.law) {
    query = query.eq('law', filters.law)
  }
  if (filters.topic) {
    query = query.eq('topic', filters.topic)
  }
  if (filters.difficulty) {
    query = query.eq('difficulty', filters.difficulty)
  }
  if (filters.is_common !== undefined) {
    query = query.eq('is_common', filters.is_common)
  }

  query = query.range(from, to).order('created_at', { ascending: false })

  const { data, count, error } = await query

  if (error) throw error

  return { data, count: count || 0 }
}

export async function fetchQuestionDetailsForPicker(ids: string[]) {
  if (!ids.length) return []
  
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
      },
    }
  )

  const { data, error } = await supabase
    .from('questions')
    .select('id, content, subject, topic, law, difficulty, is_common, category')
    .in('id', ids)

  if (error) throw error
  return data
}

export async function fetchUniqueFilters() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
      },
    }
  )

  const { data } = await supabase
    .from('questions')
    .select('subject, law, topic')

  const uniqueSubjects = Array.from(new Set(data?.map(c => c.subject).filter(Boolean))) as string[]
  const uniqueLaws = Array.from(new Set(data?.map(c => c.law).filter(Boolean))) as string[]
  const uniqueTopics = Array.from(new Set(data?.map(c => c.topic).filter(Boolean))) as string[]

  return { uniqueSubjects, uniqueLaws, uniqueTopics }
}
