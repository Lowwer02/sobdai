/**
 * lib/recommendation/contracts.ts
 * ----------------------------------------------------------------------------
 * Recommendation Candidate Discovery — foundational contracts.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Recommendation Candidate Discovery Architecture Specification v1.0
 *     §3 (Input Contract), §4 (Output Contract), §3.3 (Content Store)
 *
 * TYPES ONLY. No business logic, no I/O, no side effects.
 *
 * IMMUTABILITY: every field is `readonly`. Discriminated unions use literal
 * discriminators for compile-time narrowing.
 *
 * EXTENSIBILITY: RecommendationContentType and DiscoverySignal are additive
 * unions — adding values is a contract extension, not a breaking change.
 * ContentStore uses a generic findContent method + ContentProvider registry
 * so new content types register without interface changes (§3.3, D3).
 */

// ═══════════════════════════════════════════════════════════════════════════
// 1. Vocabularies (additive unions)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Types of content the RCD can discover. From Architecture Spec §4.1.
 *
 * v1.0 ships with 'summary', 'question', 'exam_set', 'package'.
 * Future types (flashcard, video, article, learning_note, practice_set) are
 * ADDED to this union — no other file changes. Each new type registers a
 * ContentProvider; the ContentStore interface is unchanged.
 */
export type RecommendationContentType =
  | 'summary'
  | 'question'
  | 'exam_set'
  | 'package'
// Future (additive — uncomment when implemented):
// | 'flashcard'
// | 'video'
// | 'article'
// | 'learning_note'
// | 'practice_set'

/**
 * WHY a candidate was discovered. From Architecture Spec §4.1.
 *
 * Each signal traces back to a specific Analytics field — a Reviewer can
 * follow the evidence chain from candidate → signal → analytics data point.
 * Adding a signal is additive (§7.3).
 */
export type DiscoverySignal =
  | 'weak_subject' // learner is weak on this subject
  | 'weak_topic' // learner is weak on this topic
  | 'strong_subject' // learner is strong — reinforce
  | 'strong_topic' // learner is strong — reinforce
  | 'retry_simulation' // hasn't taken a simulation recently
  | 'continue_practice' // has started but not finished practice
  | 'coverage_gap' // (future) hasn't seen Blueprint-required area

// ═══════════════════════════════════════════════════════════════════════════
// 2. Content Store (generic, extensible — §3.3, D3)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generic content filter criteria. From Architecture Spec §3.3.
 *
 * Each key is optional; ContentProviders read what they need and ignore the
 * rest. Adding a new content type with novel filters is additive — just add
 * an optional key here. Existing providers ignore unknown keys.
 */
export interface ContentFilters {
  readonly subjects?: readonly string[]
  readonly topics?: readonly string[]
  readonly difficulties?: readonly string[]
  readonly excludeCodes?: readonly string[]
  // Future type-specific filters (all optional, all additive):
  // readonly videoDurationMax?: number
  // readonly flashcardDeckId?: string
  // readonly readingTimeMax?: number
}

/**
 * A generic content query. From Architecture Spec §3.3.
 *
 * `contentType` routes to the right ContentProvider inside the store;
 * `filters` carries type-specific criteria; `limit` bounds the result.
 */
export interface ContentQuery {
  readonly contentType: RecommendationContentType
  readonly filters: ContentFilters
  readonly limit: number
}

/**
 * A type-erased content reference returned by the ContentStore.
 * From Architecture Spec §3.3.
 *
 * All fields except `contentId` and `contentType` are optional — different
 * content types populate different subsets.
 */
export interface ContentRef {
  readonly contentId: string
  readonly contentType: RecommendationContentType
  readonly title: string | null
  readonly slug: string | null
  readonly packageId: string | null
  readonly subject: string | null
  readonly topic: string | null
  readonly difficulty: string | null
}

/**
 * Handles discovery for ONE content type. From Architecture Spec §3.3.
 *
 * The production ContentStore holds a Map<RecommendationContentType,
 * ContentProvider>. Registering a new type is additive — implement this
 * interface and register; nothing else changes.
 */
export interface ContentProvider {
  readonly contentType: RecommendationContentType
  find(query: ContentQuery): Promise<readonly ContentRef[]>
}

/**
 * The Content Store — a single generic discovery entry point.
 * From Architecture Spec §3.3.
 *
 * ONE method: findContent(query). The query's contentType routes internally.
 * Adding content types = register a new ContentProvider; the interface never
 * changes.
 */
export interface ContentStore {
  /**
   * Find published content matching the query.
   * Routes to the appropriate ContentProvider based on query.contentType.
   */
  findContent(query: ContentQuery): Promise<readonly ContentRef[]>

  /** Which content types this store currently supports. */
  readonly supportedTypes: readonly RecommendationContentType[]
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Recommendation Candidate (output contract — §4.1)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A reference to the discovered content (not the content body itself).
 * From Architecture Spec §4.1.
 */
export interface ContentReference {
  readonly kind: RecommendationContentType
  readonly contentId: string
  readonly title: string | null
  readonly slug: string | null
  readonly packageId: string | null
}

/**
 * Analytics evidence that triggered this discovery.
 * From Architecture Spec §4.1. A Reviewer can trace any candidate back to
 * the specific analytics data that triggered it.
 */
export interface CandidateEvidence {
  readonly subject: string | null
  readonly topic: string | null
  readonly accuracy: number | null
  readonly attemptCount: number | null
}

/**
 * Content metadata for the Engine to use in scoring.
 * From Architecture Spec §4.1.
 */
export interface CandidateMetadata {
  readonly subject: string | null
  readonly topic: string | null
  readonly difficulty: string | null
}

/**
 * A recommendation candidate — the RCD's unit of output.
 * From Architecture Spec §4.1.
 *
 * `id` is a deterministic hash of `type + contentId + signal` (D5) — same
 * content via the same signal always produces the same id; same content via
 * a different signal produces a different id (the Engine picks the winner).
 *
 * IMMUTABLE: every field is readonly.
 */
export interface RecommendationCandidate {
  /** Deterministic hash of type + contentId + signal. */
  readonly id: string
  readonly type: RecommendationContentType
  readonly content: ContentReference
  readonly signal: DiscoverySignal
  readonly reason: string
  readonly evidence: CandidateEvidence
  readonly metadata: CandidateMetadata
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. CandidateList + DiscoveryResult (§4.2, §4.3)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Aggregate stats for audit/monitoring. From Architecture Spec §4.2.
 */
export interface CandidateListStats {
  readonly totalCandidates: number
  readonly bySignal: ReadonlyMap<DiscoverySignal, number>
  readonly byType: ReadonlyMap<RecommendationContentType, number>
}

/**
 * The RCD's output list. From Architecture Spec §4.2.
 * Immutable; candidates sorted deterministically.
 */
export interface CandidateList {
  readonly candidates: readonly RecommendationCandidate[]
  readonly isEmpty: boolean
  readonly stats: CandidateListStats
}

/**
 * The RCD's top-level result. From Architecture Spec §4.3.
 * Discriminated union on `ok`.
 */
export type DiscoveryResult =
  | { readonly ok: true; readonly list: CandidateList }
  | { readonly ok: false; readonly error: string }

// ═══════════════════════════════════════════════════════════════════════════
// 5. Recommendation Policy (§3.2)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Configuration document defining discovery parameters.
 * From Architecture Spec §3.2.
 *
 * v1 uses "Policy" (flat config). A future version may evolve into a richer
 * "Blueprint" document without changing this interface's consumption surface.
 */
export interface RecommendationPolicy {
  readonly version: string
  readonly weakTopicAccuracyThreshold: number
  readonly strongTopicAccuracyThreshold: number
  readonly minQuestionsForEvidence: number
  readonly maxCandidatesPerSignal: number
  readonly enabledContentTypes: readonly RecommendationContentType[]
  readonly seenContentWindowHours: number
  readonly signals: readonly DiscoverySignal[]
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. Candidate ID helper (D5 — deterministic hash)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a deterministic candidate ID from its type, contentId, and signal.
 *
 * Same inputs → same id, always. Same content via a different signal →
 * different id (the Engine picks the winner). Uses a simple FNV-1a hash
 * for determinism + speed (no crypto needed; this is an identity key, not
 * a security boundary).
 *
 * Pure function. No side effects.
 */
export function candidateId(
  type: RecommendationContentType,
  contentId: string,
  signal: DiscoverySignal
): string {
  // FNV-1a 32-bit hash of "type|contentId|signal"
  const input = `${type}|${contentId}|${signal}`
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  // Base36 for compactness; prefix 'rc' (recommendation candidate) for audit.
  return `rc-${(hash >>> 0).toString(36)}`
}
