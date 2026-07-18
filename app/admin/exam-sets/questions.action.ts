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
    .select('id, content, subject, document, topic, law, difficulty, is_common, category, question_code, status', { count: 'exact' })
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
    // Search matches EITHER content OR question_code (Session 6.17: search by
    // Question Code OR Content). Composed via PostgREST `or` so it still
    // combines with the other `.eq()` filters below. The term is reused for
    // both columns so a single search box covers both. Escaping commas is not
    // needed here because the term is the only operand in each clause.
    query = query.or(`content.ilike.%${filters.search}%,question_code.ilike.%${filters.search}%`)
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
    .select('id, content, subject, document, topic, law, difficulty, is_common, category, question_code, status')
    .in('id', ids)

  if (error) throw error
  return data
}

export async function fetchUniqueFilters() {
  const { supabase } = await requirePermission('content.write')

  // Distinct, non-null filter metadata is now computed in Postgres by the
  // get_question_metadata RPC (migration 022) — one round-trip, no row cap.
  // The previous implementation read every question row and deduped in JS,
  // which was silently truncated by PostgREST's default 1000-row limit and
  // caused filter values (e.g. Documents) to go missing on larger Banks.
  // Sorted alphabetically by the RPC, so no client sorting is needed.
  //
  // The RPC is a custom Postgres function not covered by auto-generated DB
  // types, so we cast through `unknown` like the other RPC callers here.
  type MetaRow = {
    subjects: string[] | null
    documents: string[] | null
    topics: string[] | null
    laws: string[] | null
  }

  const { data, error } = (await (supabase as any).rpc('get_question_metadata')) as {
    data: MetaRow[] | null
    error: { message: string } | null
  }

  if (error) {
    console.error('get_question_metadata RPC failed:', error.message)
    return { uniqueSubjects: [], uniqueDocuments: [], uniqueLaws: [], uniqueTopics: [] }
  }

  // The RPC returns exactly one row of arrays. Normalize nulls to [] for the
  // empty-Bank / empty-column cases, and keep the original return shape so
  // the consuming UI (QuestionPicker dropdowns) is unchanged.
  const row = (data && data[0]) || { subjects: null, documents: null, topics: null, laws: null }
  return {
    uniqueSubjects: row.subjects ?? [],
    uniqueDocuments: row.documents ?? [],
    uniqueLaws: row.laws ?? [],
    uniqueTopics: row.topics ?? [],
  }
}


// ─── Question Inspector (read-only) ─────────────────────────────────────
// Backs the Question Inspector drawer in the Picker. Two read-only actions:
//   - fetchQuestionInspectorData(id): full metadata + content + timeline
//   - fetchQuestionUsedIn(id): the "Used In" graph (exam sets + packages)
// No edits, no writes, no schema change — pure reads over existing tables.

/**
 * Full read-only metadata + content + timeline for a single Question, for the
 * Inspector. Includes fields the picker card doesn't carry (status, full
 * choices/answer, created_at/updated_at). Returns null when the question is
 * not found. Optional fields are nullable; the UI degrades gracefully.
 */
export interface QuestionInspectorData {
  id: string
  content: string | null
  choice_a: string | null
  choice_b: string | null
  choice_c: string | null
  choice_d: string | null
  correct_answer: string | null
  hint: string | null
  full_explanation: string | null
  reference: string | null
  difficulty: string | null
  category: string | null
  tags: string[] | null
  status: string | null
  subject: string | null
  document: string | null
  law: string | null
  topic: string | null
  is_common: boolean | null
  created_at: string | null
  updated_at: string | null
}

export async function fetchQuestionInspectorData(
  questionId: string
): Promise<QuestionInspectorData | null> {
  if (!questionId) return null
  const { supabase } = await requirePermission('content.write')

  const { data, error } = await supabase
    .from('questions')
    .select(`
      id, content,
      choice_a, choice_b, choice_c, choice_d, correct_answer,
      hint, full_explanation, reference,
      difficulty, category, tags, status,
      subject, document, law, topic, is_common,
      created_at, updated_at
    `)
    .eq('id', questionId)
    .maybeSingle()

  if (error) {
    console.error('fetchQuestionInspectorData failed:', error.message)
    return null
  }
  return (data as QuestionInspectorData) ?? null
}

/**
 * A single "Used In" reference: the Exam Set that contains the question and
 * the Package that owns that Exam Set. `package_*` is null when the Exam Set's
 * package could not be resolved (shouldn't happen — package_id is NOT NULL —
 * but the UI degrades gracefully).
 */
export interface QuestionUsedInReference {
  exam_set_id: string
  exam_set_name: string
  package_id: string | null
  package_name: string | null
  package_code: string | null
  package_is_published: boolean | null
}

/**
 * Read-only "Used In" graph for a Question: every Exam Set that contains it,
 * each joined to its owning Package. Derived entirely from the existing
 * exam_set_questions → exam_sets → packages relationships (the same source of
 * truth as Usage counts). Returns an empty list when the question is unused
 * or not found — the UI shows a friendly empty state.
 */
export async function fetchQuestionUsedIn(
  questionId: string
): Promise<QuestionUsedInReference[]> {
  if (!questionId) return []
  const { supabase } = await requirePermission('content.write')

  const { data, error } = await supabase
    .from('exam_set_questions')
    .select(`
      exam_set_id,
      exam_sets (
        id, name,
        packages ( id, name, package_code, is_published )
      )
    `)
    .eq('question_id', questionId)
    .order('exam_set_id', { ascending: true })

  if (error) {
    console.error('fetchQuestionUsedIn failed:', error.message)
    return []
  }

  const refs: QuestionUsedInReference[] = []
  for (const row of data ?? []) {
    const es = (row as any)?.exam_sets
    if (!es) continue
    // packages() on exam_sets is a single row (FK), but PostgREST may return
    // it wrapped depending on shape — normalize both cases.
    const pkg = Array.isArray(es.packages) ? es.packages[0] : es.packages
    refs.push({
      exam_set_id: es.id,
      exam_set_name: es.name,
      package_id: pkg?.id ?? null,
      package_name: pkg?.name ?? null,
      package_code: pkg?.package_code ?? null,
      package_is_published: pkg?.is_published ?? null,
    })
  }
  return refs
}

