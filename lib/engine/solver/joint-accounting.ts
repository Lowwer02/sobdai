/**
 * lib/engine/solver/joint-accounting.ts
 * ----------------------------------------------------------------------------
 * Per-Set Physical Solver Joint Accounting State.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Constraint Solver Architecture v1.0 §3, §13.
 *   - Allocation Model Specification v1.0 §4.
 *
 * WHAT THIS MODULE IS.
 *  - Defines the joint accounting state for single-Set physical allocation.
 *  - Tracks selected questionCodes, placed count, and multi-dimensional distribution counters
 *    (document, tier, difficulty, LO, pattern).
 *  - Disjoined from search execution, backtracking, or constraint checking.
 */

import type {
  Candidate,
  Difficulty,
  LearningObjective,
  QuestionPattern,
  Tier,
} from '../generator/contracts'
import type { PositionSetNumber } from './position-slot'

/**
 * Null bucket key used for absent / optional dimensions (LO, Pattern).
 */
export const NULL_BUCKET = '__NULL__' as const
export type NullBucket = typeof NULL_BUCKET

/**
 * Joint accounting state for one active Set.
 */
export interface JointAccountingState {
  readonly setNumber: PositionSetNumber
  readonly selectedQuestionCodes: ReadonlySet<string>
  readonly placedCount: number
  readonly documentCounts: ReadonlyMap<string, number>
  readonly tierCounts: ReadonlyMap<Tier, number>
  readonly difficultyCounts: ReadonlyMap<Difficulty, number>
  readonly learningObjectiveCounts: ReadonlyMap<LearningObjective | typeof NULL_BUCKET, number>
  readonly patternCounts: ReadonlyMap<QuestionPattern | typeof NULL_BUCKET, number>
}

/**
 * Creates a fresh empty JointAccountingState for an active Set.
 *
 * @param setNumber 1-based active Set number (1..5)
 * @returns Fresh JointAccountingState with empty selections and empty counter maps
 */
export function createJointAccounting(setNumber: number): JointAccountingState {
  if (typeof setNumber !== 'number' || !Number.isInteger(setNumber) || setNumber < 1 || setNumber > 5) {
    throw new Error(
      `Fatal JointAccounting error: setNumber must be an integer (1..5), received ${String(setNumber)}`
    )
  }

  return {
    setNumber: setNumber as PositionSetNumber,
    selectedQuestionCodes: new Set<string>(),
    placedCount: 0,
    documentCounts: new Map<string, number>(),
    tierCounts: new Map<Tier, number>(),
    difficultyCounts: new Map<Difficulty, number>(),
    learningObjectiveCounts: new Map<LearningObjective | typeof NULL_BUCKET, number>(),
    patternCounts: new Map<QuestionPattern | typeof NULL_BUCKET, number>(),
  }
}

/**
 * Pure function that applies a candidate to a JointAccountingState.
 *
 * Simultaneously increments all matching distribution accounting counters
 * (document, tier, difficulty, LO, pattern) and adds the questionCode to
 * selectedQuestionCodes.
 *
 * @param state Current JointAccountingState
 * @param candidate Candidate to place
 * @returns A NEW JointAccountingState snapshot (immutable update)
 * @throws Error if candidate.identity.questionCode is already selected
 */
export function applyCandidate(
  state: JointAccountingState,
  candidate: Candidate
): JointAccountingState {
  if (!state) {
    throw new Error('Fatal JointAccounting error: state is required')
  }
  if (!candidate || !candidate.identity || !candidate.identity.questionCode) {
    throw new Error('Fatal JointAccounting error: candidate with valid identity is required')
  }

  const code = candidate.identity.questionCode
  if (state.selectedQuestionCodes.has(code)) {
    throw new Error(
      `Fatal JointAccounting error: candidate '${code}' is already selected in Set ${state.setNumber}`
    )
  }

  const selectedQuestionCodes = new Set(state.selectedQuestionCodes)
  selectedQuestionCodes.add(code)

  const documentCounts = new Map(state.documentCounts)
  const doc = candidate.metadata.document
  documentCounts.set(doc, (documentCounts.get(doc) ?? 0) + 1)

  const tierCounts = new Map(state.tierCounts)
  const tier = candidate.metadata.tier
  tierCounts.set(tier, (tierCounts.get(tier) ?? 0) + 1)

  const difficultyCounts = new Map(state.difficultyCounts)
  const diff = candidate.metadata.difficulty
  difficultyCounts.set(diff, (difficultyCounts.get(diff) ?? 0) + 1)

  const learningObjectiveCounts = new Map(state.learningObjectiveCounts)
  const loKey: LearningObjective | typeof NULL_BUCKET = candidate.metadata.learningObjective ?? NULL_BUCKET
  learningObjectiveCounts.set(loKey, (learningObjectiveCounts.get(loKey) ?? 0) + 1)

  const patternCounts = new Map(state.patternCounts)
  const patternKey: QuestionPattern | typeof NULL_BUCKET = candidate.metadata.questionPattern ?? NULL_BUCKET
  patternCounts.set(patternKey, (patternCounts.get(patternKey) ?? 0) + 1)

  return {
    setNumber: state.setNumber,
    selectedQuestionCodes,
    placedCount: state.placedCount + 1,
    documentCounts,
    tierCounts,
    difficultyCounts,
    learningObjectiveCounts,
    patternCounts,
  }
}

/**
 * Pure function that removes a candidate from a JointAccountingState.
 *
 * Simultaneously decrements all matching distribution accounting counters
 * (document, tier, difficulty, LO, pattern) and removes the questionCode from
 * selectedQuestionCodes. If a counter bucket reaches 0, it is deleted from the Map.
 *
 * @param state Current JointAccountingState
 * @param candidate Candidate to remove
 * @returns A NEW JointAccountingState snapshot (immutable update)
 * @throws Error if candidate is not selected, or if any counter would become negative
 */
export function removeCandidate(
  state: JointAccountingState,
  candidate: Candidate
): JointAccountingState {
  if (!state) {
    throw new Error('Fatal JointAccounting error: state is required')
  }
  if (!candidate || !candidate.identity || !candidate.identity.questionCode) {
    throw new Error('Fatal JointAccounting error: candidate with valid identity is required')
  }

  const code = candidate.identity.questionCode
  if (!state.selectedQuestionCodes.has(code)) {
    throw new Error(
      `Fatal JointAccounting error: candidate '${code}' is not selected in Set ${state.setNumber}`
    )
  }

  if (state.placedCount <= 0) {
    throw new Error('Fatal JointAccounting error: cannot decrement placedCount below 0')
  }

  const selectedQuestionCodes = new Set(state.selectedQuestionCodes)
  selectedQuestionCodes.delete(code)

  const documentCounts = new Map(state.documentCounts)
  decrementCounterMap(documentCounts, candidate.metadata.document, 'documentCounts')

  const tierCounts = new Map(state.tierCounts)
  decrementCounterMap(tierCounts, candidate.metadata.tier, 'tierCounts')

  const difficultyCounts = new Map(state.difficultyCounts)
  decrementCounterMap(difficultyCounts, candidate.metadata.difficulty, 'difficultyCounts')

  const learningObjectiveCounts = new Map(state.learningObjectiveCounts)
  const loKey: LearningObjective | typeof NULL_BUCKET = candidate.metadata.learningObjective ?? NULL_BUCKET
  decrementCounterMap(learningObjectiveCounts, loKey, 'learningObjectiveCounts')

  const patternCounts = new Map(state.patternCounts)
  const patternKey: QuestionPattern | typeof NULL_BUCKET = candidate.metadata.questionPattern ?? NULL_BUCKET
  decrementCounterMap(patternCounts, patternKey, 'patternCounts')

  return {
    setNumber: state.setNumber,
    selectedQuestionCodes,
    placedCount: state.placedCount - 1,
    documentCounts,
    tierCounts,
    difficultyCounts,
    learningObjectiveCounts,
    patternCounts,
  }
}

function decrementCounterMap<K>(map: Map<K, number>, key: K, mapName: string): void {
  const current = map.get(key)
  if (current === undefined || current <= 0) {
    throw new Error(
      `Fatal JointAccounting error: cannot decrement missing or zero-count bucket '${String(key)}' in ${mapName}`
    )
  }
  const next = current - 1
  if (next === 0) {
    map.delete(key)
  } else {
    map.set(key, next)
  }
}
