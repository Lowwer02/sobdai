/**
 * lib/recommendation/providers/summary-provider.ts
 * ----------------------------------------------------------------------------
 * SummaryProvider — discovers published Summaries matching subject/topic.
 *
 * Source of truth: Recommendation Candidate Discovery Architecture v1.0 §3.3.
 *
 * Queries the `summaries` table (filtered to published) by subject or topic.
 * Returns ContentRef[] — the RCD wraps these in RecommendationCandidates.
 */

import type {
  ContentProvider,
  ContentQuery,
  ContentRef,
} from '../contracts'

// Minimal Supabase client type (avoid importing the full Supabase types here —
// the provider only uses .from().select().eq().or().limit()).
interface SupabaseLike {
  from(table: string): SupabaseQueryBuilder
}

interface SupabaseQueryBuilder {
  select(columns: string): SupabaseFilterBuilder
}

interface SupabaseFilterBuilder {
  eq(column: string, value: unknown): SupabaseFilterBuilder
  or(filter: string): SupabaseFilterBuilder
  limit(n: number): SupabaseFilterBuilder
  then: Promise<unknown>['then']
}

export class SummaryProvider implements ContentProvider {
  readonly contentType = 'summary' as const
  private readonly supabase: SupabaseLike

  constructor(supabaseClient: unknown) {
    this.supabase = supabaseClient as SupabaseLike
  }

  async find(query: ContentQuery): Promise<readonly ContentRef[]> {
    const filters = query.filters

    // Build the query.
    let q = this.supabase
      .from('summaries')
      .select('id, slug, title, subject, topic, package_id')
      .eq('is_published', true)

    // Subject or topic filter via .or() (same pattern as existing enrichWithTargets).
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
        slug: string
        title: string
        subject: string | null
        topic: string | null
        package_id: string
      }> | null
      error: { message: string } | null
    }

    if (error) {
      console.error('SummaryProvider query failed:', error.message)
      return []
    }
    if (!data) return []

    return data.map((row) => ({
      contentId: row.id,
      contentType: 'summary' as const,
      title: row.title,
      slug: row.slug,
      packageId: row.package_id,
      subject: row.subject,
      topic: row.topic,
      difficulty: null,
    }))
  }
}
