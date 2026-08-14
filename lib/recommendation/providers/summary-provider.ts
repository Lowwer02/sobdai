/**
 * lib/recommendation/providers/summary-provider.ts
 * ----------------------------------------------------------------------------
 * SummaryProvider — discovers published Summaries matching subject/topic.
 *
 * Source of truth: Recommendation Candidate Discovery Architecture v1.0 §3.3.
 *
 * Uses the shared verified Summary target resolver by subject or topic. The
 * provider emits the selected Package-local slug and Package identity rather
 * than reconstructing a route from root fields.
 */

import type { ContentProvider, ContentQuery, ContentRef } from '../contracts.ts'
// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { findPublicSummaryTargets, type SummaryTargetReadClient } from '../../summary-target.ts'

export class SummaryProvider implements ContentProvider {
  readonly contentType = 'summary' as const
  private readonly supabase: SummaryTargetReadClient

  constructor(supabaseClient: unknown) {
    this.supabase = supabaseClient as SummaryTargetReadClient
  }

  async find(query: ContentQuery): Promise<readonly ContentRef[]> {
    try {
      const targets = await findPublicSummaryTargets(this.supabase, {
        subjects: query.filters.subjects,
        topics: query.filters.topics,
        limit: query.limit,
      })

      return [...targets.values()].map((target) => ({
        contentId: target.summaryId,
        contentType: 'summary' as const,
        title: target.title,
        slug: target.summarySlug,
        packageId: target.packageId,
        subject: target.subject,
        topic: target.topic,
        difficulty: null,
      }))
    } catch {
      // Discovery is best-effort; a target lookup failure must not break the
      // recommendation engine or turn an invalid root into a link.
      return []
    }
  }
}
