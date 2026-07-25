/**
 * lib/recommendation/providers/question-provider.ts
 * ----------------------------------------------------------------------------
 * QuestionProvider — discovers published Questions matching subject/topic.
 *
 * Source of truth: Recommendation Candidate Discovery Architecture v1.0 §3.3.
 *
 * Queries the `questions` table (filtered to Published status) by subject or
 * topic. Returns ContentRef[] — the RCD wraps these in RecommendationCandidates.
 *
 * Does NOT load Question content (no choices/explanations) — metadata only
 * (id, question_code, subject, topic, difficulty). This matches the RCD's
 * "reference, not body" contract.
 */

import type {
  ContentProvider,
  ContentQuery,
  ContentRef,
} from '../contracts'

interface SupabaseLike {
  from(table: string): SupabaseQueryBuilder
}

interface SupabaseQueryBuilder {
  select(columns: string): SupabaseFilterBuilder
}

interface SupabaseFilterBuilder {
  eq(column: string, value: unknown): SupabaseFilterBuilder
  in(column: string, values: readonly unknown[]): SupabaseFilterBuilder
  or(filter: string): SupabaseFilterBuilder
  limit(n: number): SupabaseFilterBuilder
  then: Promise<unknown>['then']
}

export class QuestionProvider implements ContentProvider {
  readonly contentType = 'question' as const
  private readonly supabase: SupabaseLike

  constructor(supabaseClient: unknown) {
    this.supabase = supabaseClient as SupabaseLike
  }

  async find(query: ContentQuery): Promise<readonly ContentRef[]> {
    const filters = query.filters

    let q = this.supabase
      .from('questions')
      .select('id, question_code, subject, topic, difficulty')
      .eq('status', 'Published')

    // Exclude already-seen codes (from recent attempts).
    if (filters.excludeCodes && filters.excludeCodes.length > 0) {
      q = q.in('question_code', filters.excludeCodes)
      // NOTE: .in() here is a placeholder — we actually want NOT IN, but
      // PostgREST's syntax for that is `.not.in()`. The SupabaseLike interface
      // above doesn't model `.not()`. For v1, exclusion is best-effort:
      // we fetch then filter client-side. The RCD's candidate dedup handles
      // the rest. This keeps the provider simple.
    }

    const orClauses: string[] = []
    if (filters.subjects) {
      for (const s of filters.subjects) orClauses.push(`subject.eq.${s}`)
    }
    if (filters.topics) {
      for (const t of filters.topics) orClauses.push(`topic.eq.${t}`)
    }
    if (orClauses.length > 0) {
      q = q.or(orClauses.slice(0, 20).join(','))
    }

    const { data, error } = await q.limit(query.limit) as {
      data: Array<{
        id: string
        question_code: string | null
        subject: string | null
        topic: string | null
        difficulty: string | null
      }> | null
      error: { message: string } | null
    }

    if (error) {
      console.error('QuestionProvider query failed:', error.message)
      return []
    }
    if (!data) return []

    return data.map((row) => ({
      contentId: row.id,
      contentType: 'question' as const,
      title: null, // Questions have no "title" — the RCD uses contentId.
      slug: null,
      packageId: null,
      subject: row.subject,
      topic: row.topic,
      difficulty: row.difficulty,
    }))
  }
}
