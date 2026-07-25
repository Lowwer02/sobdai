/**
 * lib/recommendation/discovery.ts
 * ----------------------------------------------------------------------------
 * Recommendation Candidate Discovery — the orchestrator.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Recommendation Candidate Discovery Architecture v1.0 §5 (Workflow)
 *
 * discoverCandidates() is the RCD's single public entry point. It:
 *   1. Gates on analytics (zero attempts → empty).
 *   2. Extracts signals (via signals.ts).
 *   3. Computes already-seen content (from history within window).
 *   4. Queries the ContentStore per signal × enabled content type.
 *   5. Wraps each ContentRef in a RecommendationCandidate.
 *   6. Assembles, sorts deterministically, builds stats.
 *   7. Returns an immutable CandidateList (or error).
 *
 * Async because ContentStore is async (D8). Signal extraction and assembly
 * are sync.
 *
 * The RCD NEVER:
 *   - Ranks or scores candidates (Engine's job).
 *   - Imports Supabase (uses injected ContentStore).
 *   - Mutates inputs (analytics, policy, store are read-only).
 */

import type { PersonalAnalytics } from '@/lib/assessment/analytics'
import type {
  CandidateList,
  CandidateListStats,
  ContentFilters,
  ContentQuery,
  ContentRef,
  ContentStore,
  DiscoverySignal,
  RecommendationCandidate,
  RecommendationContentType,
  RecommendationPolicy,
  DiscoveryResult,
} from './contracts'
import { candidateId } from './contracts'
import { extractSignals, type ExtractedSignal } from './signals'

// ─── Public API: discoverCandidates ─────────────────────────────────────────

/**
 * Discover recommendation candidates from learner analytics.
 *
 * @param analytics     The learner's PersonalAnalytics.
 * @param policy        Discovery rules (thresholds, caps, enabled types).
 * @param contentStore  Read-only content source (injected — never Supabase directly).
 * @returns             DiscoveryResult (CandidateList on success; error string on failure).
 */
export async function discoverCandidates(
  analytics: PersonalAnalytics,
  policy: RecommendationPolicy,
  contentStore: ContentStore
): Promise<DiscoveryResult> {
  try {
    // 1. Gate check — new user with zero attempts.
    if (analytics.overall.totalAttempts === 0) {
      return { ok: true, list: emptyCandidateList() }
    }

    // 2. Extract signals from analytics (filtered by policy).
    const signals = extractSignals(analytics, policy)
    if (signals.length === 0) {
      return { ok: true, list: emptyCandidateList() }
    }

    // 3. Compute already-seen content IDs (from recent history).
    const seenCodes = computeSeenContent(analytics, policy)

    // 4. Discover content per signal × enabled content type.
    const candidates: RecommendationCandidate[] = []
    const supportedTypes = new Set(contentStore.supportedTypes)

    for (const sig of signals) {
      for (const contentType of policy.enabledContentTypes) {
        // Skip types the store doesn't support (graceful degradation, §10 risk).
        if (!supportedTypes.has(contentType)) continue

        // Build the query for this signal × type pair.
        const query = buildQuery(sig, contentType, policy, seenCodes)
        const refs = await contentStore.findContent(query)

        // Wrap each ContentRef in a RecommendationCandidate.
        for (const ref of refs) {
          candidates.push(wrapCandidate(ref, sig))
        }
      }
    }

    // 5. Assemble — deterministic sort + stats.
    const sorted = sortCandidates(candidates)
    const stats = buildStats(sorted)

    return {
      ok: true,
      list: {
        candidates: sorted,
        isEmpty: sorted.length === 0,
        stats,
      },
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unexpected discovery error.',
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a ContentQuery for a given signal × content type pair.
 *
 * Signal-specific filters:
 *  - weak_subject / strong_subject → filter by subject.
 *  - weak_topic / strong_topic → filter by topic.
 *  - retry_simulation / continue_practice → no subject/topic filter (broad).
 */
function buildQuery(
  sig: ExtractedSignal,
  contentType: RecommendationContentType,
  policy: RecommendationPolicy,
  seenCodes: ReadonlySet<string>
): ContentQuery {
  // Build the full filters object in one shot — ContentFilters is readonly.
  const filters: ContentFilters = {
    subjects: sig.subject ? [sig.subject] : undefined,
    topics: sig.topic ? [sig.topic] : undefined,
    excludeCodes: seenCodes.size > 0 ? [...seenCodes] : undefined,
  }

  return {
    contentType,
    filters,
    limit: policy.maxCandidatesPerSignal,
  }
}

/**
 * Wrap a ContentRef into a RecommendationCandidate, attaching the signal's
 * evidence and the content's metadata.
 */
function wrapCandidate(ref: ContentRef, sig: ExtractedSignal): RecommendationCandidate {
  return {
    id: candidateId(ref.contentType, ref.contentId, sig.signal),
    type: ref.contentType,
    content: {
      kind: ref.contentType,
      contentId: ref.contentId,
      title: ref.title,
      slug: ref.slug,
      packageId: ref.packageId,
    },
    signal: sig.signal,
    reason: buildReason(sig, ref),
    evidence: {
      subject: sig.subject,
      topic: sig.topic,
      accuracy: sig.accuracy,
      attemptCount: sig.attemptCount,
    },
    metadata: {
      subject: ref.subject,
      topic: ref.topic,
      difficulty: ref.difficulty,
    },
  }
}

/**
 * Build a human-readable reason for audit/debugging.
 * The Engine MAY surface this; it's primarily for traceability.
 */
function buildReason(sig: ExtractedSignal, ref: ContentRef): string {
  const typeLabel = ref.contentType.replace('_', ' ')
  switch (sig.signal) {
    case 'weak_subject':
      return `Weak subject "${sig.subject}" (accuracy ${sig.accuracy}%) — ${typeLabel} for reinforcement.`
    case 'weak_topic':
      return `Weak topic "${sig.topic}" (accuracy ${sig.accuracy}%) — ${typeLabel} for practice.`
    case 'strong_subject':
      return `Strong subject "${sig.subject}" (accuracy ${sig.accuracy}%) — ${typeLabel} for reinforcement.`
    case 'strong_topic':
      return `Strong topic "${sig.topic}" (accuracy ${sig.accuracy}%) — ${typeLabel} for reinforcement.`
    case 'retry_simulation':
      return `No recent simulation — ${typeLabel} to test readiness.`
    case 'continue_practice':
      return `Practice started but not recent — ${typeLabel} to continue.`
    case 'coverage_gap':
      return `Coverage gap detected — ${typeLabel} to fill the gap.`
    default:
      return `${typeLabel} discovered.`
  }
}

/**
 * Compute the set of already-seen content IDs from recent attempt history.
 * These are excluded from discovery (no re-recommending recently-seen content).
 */
function computeSeenContent(
  analytics: PersonalAnalytics,
  policy: RecommendationPolicy
): ReadonlySet<string> {
  const windowMs = policy.seenContentWindowHours * 60 * 60 * 1000
  const now = Date.now()
  const seen = new Set<string>()

  for (const attempt of analytics.history) {
    const age = Math.abs(now - new Date(attempt.completed_at).getTime())
    if (age < windowMs) {
      seen.add(attempt.exam_set_id)
    }
  }

  return seen
}

/**
 * Deterministic sort: by signal name (alphabetical) → subject → topic → contentId.
 *
 * This is PURELY STRUCTURAL ordering — it exists solely to guarantee that the
 * same inputs always produce the same candidate sequence (determinism
 * contract, Architecture Spec D4/D5). It does NOT imply any business
 * importance, priority, or ranking. The Recommendation Engine decides what
 * matters; the RCD just produces a stable list.
 *
 * Alphabetical signal ordering is chosen because it has no business
 * semantics — 'coverage_gap' sorting before 'weak_subject' is a lexical fact,
 * not a prioritization decision.
 */
function sortCandidates(
  candidates: readonly RecommendationCandidate[]
): readonly RecommendationCandidate[] {
  return [...candidates].sort((a, b) => {
    // Sort by signal name alphabetically (no business priority).
    if (a.signal < b.signal) return -1
    if (a.signal > b.signal) return 1
    // Then by subject alphabetically.
    const subj = (a.metadata.subject ?? '') < (b.metadata.subject ?? '') ? -1
      : (a.metadata.subject ?? '') > (b.metadata.subject ?? '') ? 1 : 0
    if (subj !== 0) return subj
    // Then by topic alphabetically.
    const topic = (a.metadata.topic ?? '') < (b.metadata.topic ?? '') ? -1
      : (a.metadata.topic ?? '') > (b.metadata.topic ?? '') ? 1 : 0
    if (topic !== 0) return topic
    // Final tie-breaker: contentId (stable, unique).
    return a.content.contentId < b.content.contentId ? -1
      : a.content.contentId > b.content.contentId ? 1 : 0
  })
}

/**
 * Build aggregate stats from the candidate list.
 */
function buildStats(
  candidates: readonly RecommendationCandidate[]
): CandidateListStats {
  const bySignal = new Map<DiscoverySignal, number>()
  const byType = new Map<RecommendationContentType, number>()
  for (const c of candidates) {
    bySignal.set(c.signal, (bySignal.get(c.signal) ?? 0) + 1)
    byType.set(c.type, (byType.get(c.type) ?? 0) + 1)
  }
  return {
    totalCandidates: candidates.length,
    bySignal,
    byType,
  }
}

/**
 * Construct an empty CandidateList (for gated / signal-less cases).
 */
function emptyCandidateList(): CandidateList {
  return {
    candidates: [],
    isEmpty: true,
    stats: {
      totalCandidates: 0,
      bySignal: new Map(),
      byType: new Map(),
    },
  }
}
