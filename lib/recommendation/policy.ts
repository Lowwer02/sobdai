/**
 * lib/recommendation/policy.ts
 * ----------------------------------------------------------------------------
 * Default Recommendation Policy.
 *
 * Source of truth: Recommendation Candidate Discovery Architecture v1.0 §3.2, D6.
 *
 * The Policy externalizes discovery rules (thresholds, caps, enabled types)
 * so tuning is a configuration change, not a code change. v1 ships a default
 * matching today's hardcoded constants in lib/assessment/recommendation.ts.
 */

import type { RecommendationPolicy, RecommendationContentType, DiscoverySignal } from './contracts'

/**
 * All content types the RCD can discover in v1.0.
 * Adding a type here = enabling it in the default Policy.
 */
const ALL_V1_CONTENT_TYPES: readonly RecommendationContentType[] = [
  'summary',
  'question',
  'exam_set',
  'package',
]

/**
 * All discovery signals active in v1.0.
 * `coverage_gap` is deferred (needs Blueprint integration not yet built).
 */
const ALL_V1_SIGNALS: readonly DiscoverySignal[] = [
  'weak_subject',
  'weak_topic',
  'strong_subject',
  'strong_topic',
  'retry_simulation',
  'continue_practice',
  // 'coverage_gap' — deferred (needs Blueprint-required-area data)
]

/**
 * The default Recommendation Policy for v1.0.
 *
 * Thresholds mirror the hardcoded constants in lib/assessment/recommendation.ts
 * (WEAK_ACCURACY = 50, STRONG_ACCURACY = 80, MIN_QUESTIONS_FOR_EVIDENCE = 3).
 * Externalizing them here makes tuning a config change.
 */
export const DEFAULT_RECOMMENDATION_POLICY: RecommendationPolicy = {
  version: '1.0.0',
  weakTopicAccuracyThreshold: 50,
  strongTopicAccuracyThreshold: 80,
  minQuestionsForEvidence: 3,
  maxCandidatesPerSignal: 10,
  enabledContentTypes: ALL_V1_CONTENT_TYPES,
  seenContentWindowHours: 48,
  signals: ALL_V1_SIGNALS,
}
