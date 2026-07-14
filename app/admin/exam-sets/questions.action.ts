'use server'

import { requirePermission } from "@/lib/auth/server-protect"

/**
 * Per-Question usage, derived entirely from the exam_set_questions join
 * (the single source of truth). `usage_count` = number of Exam Sets that
 * contain the Question; `is_used` is its boolean projection. Never persisted
 * on the questions row, so it can never drift.
 *
 * Backed by the get_question_usage_counts Postgres RPC (migration 021),
 * which mirrors the get_package_public_counts pattern (migration 016).
 */
export interface QuestionUsage {
  question_id: string
  usage_count: number
  is_used: boolean
}

/**
 * Returns usage counts for a batch of Question ids in a single round-trip.
 *
 * Use this to hydrate Usage Badges for a page of results without N+1 queries.
 * Every requested id yields a row (count 0 when the Question is unused).
 *
 * Pass an empty array to get an empty map — the RPC is not called.
 */
export async function fetchQuestionUsage(
  questionIds: string[]
): Promise<Record<string, QuestionUsage>> {
  if (!questionIds || questionIds.length === 0) return {}

  const { supabase } = await requirePermission('content.write')

  // The RPC is a custom Postgres function not covered by auto-generated DB
  // types, so we cast through `unknown` like getPackagePublicCounts does.
  type UsageRow = QuestionUsage

  const { data, error } = (await (supabase as any).rpc('get_question_usage_counts', {
    question_ids: questionIds,
  })) as { data: UsageRow[] | null; error: { message: string } | null }

  if (error) {
    console.error('get_question_usage_counts RPC failed:', error.message)
    return {}
  }

  const map: Record<string, QuestionUsage> = {}
  for (const row of data ?? []) {
    map[row.question_id] = {
      question_id: row.question_id,
      usage_count: Number(row.usage_count) || 0,
      is_used: Boolean(row.is_used),
    }
  }
  return map
}


export async function fetchQuestionsForPicker(filters: {
  search?: string
  subject?: string
  document?: string
  law?: string
  topic?: string
  difficulty?: string
  is_common?: boolean
  usage?: 'all' | 'used' | 'unused'
  page?: number
  limit?: number
}) {
  const { supabase } = await requirePermission('content.write')

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Unauthorized')

  const page = filters.page || 1
  const limit = filters.limit || 10
  const from = (page - 1) * limit
  const to = from + limit - 1

  // Server-side Usage filter. "Usage" is derived from exam_set_questions
  // (never duplicated on the questions row). PostgREST has no native
  // NOT-EXISTS operator, so we resolve the set of used question_ids once
  // (a single bounded query, deduped in JS), then apply `.in` (used) or
  // `.not.in` (unused) BEFORE pagination so range/count operate on the
  // filtered dataset. This is 2 round-trips total (not N+1) and composes
  // with all other filters.
  //
  // Note: the proper long-term solution for very large banks is an EXISTS/
  // NOT-EXISTS SQL RPC (already on the roadmap). This no-DB-change path is
  // the SAFE Phase-1 implementation.
  if (filters.usage === 'used' || filters.usage === 'unused') {
    const { data: usedRows, error: usedErr } = await supabase
      .from('exam_set_questions')
      .select('question_id')
    if (usedErr) throw usedErr

    const usedIds = Array.from(
      new Set((usedRows ?? []).map(r => r.question_id).filter(Boolean))
    ) as string[]

    if (filters.usage === 'used') {
      // No question is used anywhere → empty result with accurate count 0.
      if (usedIds.length === 0) return { data: [], count: 0 }
      return queryQuestions(supabase, filters, from, to, q => q.in('id', usedIds))
    }

    // unused: exclude the used set. If nothing is used, everything is unused
    // → no usage predicate needed (fetch normally).
    const extraFilter = usedIds.length > 0
      ? (q: ReturnType<typeof baseQuestionsQuery>) => q.not.in('id', usedIds)
      : null
    return queryQuestions(supabase, filters, from, to, extraFilter ?? undefined)
  }

  return queryQuestions(supabase, filters, from, to)
}

// Shared query builder so the usage branches and the default path build the
// exact same filter chain (search/subject/topic/...) and ordering. An optional
// `usageFilter` is injected right before range/order so it composes with the
// rest. Keeping this extracted avoids drifting between the three call sites.
type SupabaseQ = ReturnType<typeof baseQuestionsQuery>

function baseQuestionsQuery(supabase: any) {
  return supabase
    .from('questions')
    .select('id, content, subject, document, topic, law, difficulty, is_common, category', { count: 'exact' })
}

async function queryQuestions(
  supabase: any,
  filters: {
    search?: string
    subject?: string
    document?: string
    law?: string
    topic?: string
    difficulty?: string
    is_common?: boolean
  },
  from: number,
  to: number,
  usageFilter?: (q: SupabaseQ) => SupabaseQ
) {
  let query = baseQuestionsQuery(supabase)

  if (filters.search) {
    query = query.ilike('content', `%${filters.search}%`)
  }
  if (filters.subject) {
    query = query.eq('subject', filters.subject)
  }
  if (filters.document) {
    query = query.eq('document', filters.document)
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
  if (usageFilter) {
    query = usageFilter(query)
  }

  query = query.range(from, to).order('created_at', { ascending: false })

  const { data, count, error } = await query

  if (error) throw error

  return { data, count: count || 0 }
}

export async function fetchQuestionDetailsForPicker(ids: string[]) {
  if (!ids.length) return []

  const { supabase } = await requirePermission('content.write')

  const { data, error } = await supabase
    .from('questions')
    .select('id, content, subject, document, topic, law, difficulty, is_common, category')
    .in('id', ids)

  if (error) throw error
  return data
}

export async function fetchUniqueFilters() {
  const { supabase } = await requirePermission('content.write')

  const { data } = await supabase
    .from('questions')
    .select('subject, law, topic, document')

  const uniqueSubjects = Array.from(new Set(data?.map(c => c.subject).filter(Boolean))) as string[]
  const uniqueDocuments = Array.from(new Set(data?.map(c => c.document).filter(Boolean))) as string[]
  const uniqueLaws = Array.from(new Set(data?.map(c => c.law).filter(Boolean))) as string[]
  const uniqueTopics = Array.from(new Set(data?.map(c => c.topic).filter(Boolean))) as string[]

  return { uniqueSubjects, uniqueDocuments, uniqueLaws, uniqueTopics }
}
