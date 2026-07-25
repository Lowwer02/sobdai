/**
 * lib/recommendation/content-store.ts
 * ----------------------------------------------------------------------------
 * Supabase-backed ContentStore — production implementation.
 *
 * Source of truth: Recommendation Candidate Discovery Architecture v1.0 §3.3.
 *
 * Holds a Map<RecommendationContentType, ContentProvider>. Ships with
 * SummaryProvider + QuestionProvider registered. findContent() delegates to
 * the appropriate provider based on query.contentType.
 *
 * The RCD (discovery.ts) NEVER imports this file — it receives a ContentStore
 * via dependency injection. This keeps the RCD testable without Supabase.
 */

import type {
  ContentProvider,
  ContentQuery,
  ContentRef,
  ContentStore,
  RecommendationContentType,
} from './contracts'
import { SummaryProvider } from './providers/summary-provider'
import { QuestionProvider } from './providers/question-provider'

// ─── Production ContentStore ────────────────────────────────────────────────

/**
 * Build the production ContentStore with all v1 providers registered.
 *
 * Returns a fresh store each call (no shared mutable state).
 * Future providers (FlashcardProvider, VideoProvider, etc.) register here
 * additively — one line each.
 */
export function createContentStore(supabaseClient: unknown): ContentStore {
  const providers = new Map<RecommendationContentType, ContentProvider>()

  // Register v1 providers.
  const summaryProvider = new SummaryProvider(supabaseClient)
  const questionProvider = new QuestionProvider(supabaseClient)
  providers.set(summaryProvider.contentType, summaryProvider)
  providers.set(questionProvider.contentType, questionProvider)

  // Future (additive — uncomment when implemented):
  // const flashcardProvider = new FlashcardProvider(supabaseClient)
  // providers.set(flashcardProvider.contentType, flashcardProvider)

  return new SupabaseContentStore(providers)
}

/**
 * The production ContentStore. Delegates findContent to the registered
 * provider for the query's contentType.
 */
class SupabaseContentStore implements ContentStore {
  private readonly providers: ReadonlyMap<RecommendationContentType, ContentProvider>
  readonly supportedTypes: readonly RecommendationContentType[]

  constructor(providers: Map<RecommendationContentType, ContentProvider>) {
    this.providers = providers
    this.supportedTypes = [...providers.keys()]
  }

  async findContent(query: ContentQuery): Promise<readonly ContentRef[]> {
    const provider = this.providers.get(query.contentType)
    if (!provider) {
      // Graceful degradation: unsupported type → empty result (§10 risk).
      return []
    }
    return provider.find(query)
  }
}
