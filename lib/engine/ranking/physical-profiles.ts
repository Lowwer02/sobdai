/**
 * lib/engine/ranking/physical-profiles.ts
 * ----------------------------------------------------------------------------
 * Pure pre-tie Physical Candidate Profile builder.
 *
 * Produces PreTieSetCandidateProfiles from CandidateSet + CompositeScore[]
 * BEFORE tie resolution, so ALL candidates are included and no maxTieGroupSize
 * constraint is applied.
 *
 * This is the adapter-boundary input for the Physical Solver when the legacy
 * Ranking stage fails due to tie overflow.
 */

import type { CandidateSet } from '../generator/contracts'
import type { CompositeScore } from '../scoring/contracts'
import type { BlueprintSlot } from '../generator/contracts'
import type {
  PreTieAxisProfile,
  PreTieCandidateProfile,
  PreTieSetCandidateProfiles,
} from './contracts'

// ─── Stable Slot Identity ────────────────────────────────────────────────────
//
// Implements the same canonical formula used by ranking/runtime.ts
// (stableSlotId). This ensures slotIds produced here are byte-identical
// to those in RankedSlot.slotId, so the Physical Solver can correlate
// pre-tie profiles with Blueprint slot metadata.

function stableSlotId(slot: BlueprintSlot): string {
  return [
    `set=${slot.setNumber}`,
    `document=${slot.document ?? '*'}`,
    `difficulty=${slot.difficulty ?? '*'}`,
    `blueprintType=${slot.blueprintType ?? '*'}`,
    `pattern=${slot.pattern ?? '*'}`,
    `learningObjective=${slot.learningObjective ?? '*'}`,
  ].join('|')
}

// ─── Structural Validation ───────────────────────────────────────────────────

/**
 * Validates that CompositeScores reference only known question codes.
 */
function assertNoUnknownQuestionCodes(
  candidateSet: CandidateSet,
  compositeScores: readonly CompositeScore[]
): void {
  const knownCodes = new Set(
    candidateSet.candidates.map((c) => c.identity.questionCode)
  )
  for (const score of compositeScores) {
    if (!knownCodes.has(score.questionCode)) {
      throw new Error(
        `buildPhysicalCandidateProfiles: CompositeScore references unknown questionCode '${score.questionCode}'`
      )
    }
  }
}

/**
 * Validates that CompositeScores reference only active set numbers.
 */
function assertNoInactiveSetNumbers(
  activeSets: readonly number[],
  compositeScores: readonly CompositeScore[]
): void {
  const activeSetSet = new Set(activeSets)
  for (const score of compositeScores) {
    if (!activeSetSet.has(score.slot.setNumber)) {
      throw new Error(
        `buildPhysicalCandidateProfiles: CompositeScore references inactive setNumber ${score.slot.setNumber} for questionCode '${score.questionCode}'`
      )
    }
  }
}

/**
 * Validates no duplicate CompositeScore for the same (questionCode × logical slot).
 * Mirrors assertNoDuplicateCandidateSlot from ranking/runtime.ts.
 */
function assertNoDuplicateSlotScore(
  compositeScores: readonly CompositeScore[]
): void {
  const seen = new Set<string>()
  for (const score of compositeScores) {
    const key = `${stableSlotId(score.slot)}\0${score.questionCode}`
    if (seen.has(key)) {
      throw new Error(
        `buildPhysicalCandidateProfiles: duplicate CompositeScore for '${score.questionCode}' in slot ${stableSlotId(score.slot)}`
      )
    }
    seen.add(key)
  }
}

// ─── Builder ─────────────────────────────────────────────────────────────────

/**
 * Builds per-Set pre-tie candidate profiles for the Physical Solver.
 *
 * Semantics:
 *  - EVERY candidate in candidateSet.candidates appears in EVERY active Set.
 *  - CompositeScores are grouped by (setNumber + questionCode + slotId).
 *  - Candidates with zero matching scores appear with suitabilityProfiles: [].
 *  - NO rank is assigned. NO tie resolution is performed.
 *  - 163 same-axis candidates are valid input — no truncation occurs.
 *
 * Ordering:
 *  - Sets in ascending setNumber.
 *  - CandidateProfiles in candidateSet.candidates insertion order.
 *  - suitabilityProfiles sorted by slotId ascending (stable, deterministic).
 *
 * Inputs are not mutated.
 */
export function buildPhysicalCandidateProfiles(
  candidateSet: CandidateSet,
  compositeScores: readonly CompositeScore[]
): readonly PreTieSetCandidateProfiles[] {
  const targetSetCount = candidateSet.constraintSnapshot.target.sets

  const activeSets: number[] = Array.from(
    { length: targetSetCount },
    (_, i) => i + 1
  )

  // Structural validation
  assertNoUnknownQuestionCodes(candidateSet, compositeScores)
  assertNoInactiveSetNumbers(activeSets, compositeScores)
  assertNoDuplicateSlotScore(compositeScores)

  // Build axis-profile lookup: key = `${setNumber}\0${questionCode}\0${slotId}`
  // value = PreTieAxisProfile
  const axisMap = new Map<string, PreTieAxisProfile>()
  // Also build a per-set+code list for ordering
  // key = `${setNumber}\0${questionCode}` → sorted PreTieAxisProfile[]
  const profilesBySetAndCode = new Map<string, PreTieAxisProfile[]>()

  for (const score of compositeScores) {
    const setNum = score.slot.setNumber
    const slotId = stableSlotId(score.slot)
    const profile: PreTieAxisProfile = {
      slotId,
      slot: score.slot,
      compositeScore: score,
    }
    const setCodeKey = `${setNum}\0${score.questionCode}`
    const existing = profilesBySetAndCode.get(setCodeKey)
    if (existing === undefined) {
      profilesBySetAndCode.set(setCodeKey, [profile])
    } else {
      existing.push(profile)
    }
  }

  // Sort axis profiles within each candidate×set by slotId ascending
  for (const profiles of profilesBySetAndCode.values()) {
    profiles.sort((a, b) => (a.slotId < b.slotId ? -1 : a.slotId > b.slotId ? 1 : 0))
  }

  // Build per-Set output
  return activeSets.map((setNum) => {
    const profiles: PreTieCandidateProfile[] = candidateSet.candidates.map((candidate) => {
      const code = candidate.identity.questionCode
      const setCodeKey = `${setNum}\0${code}`
      const suitabilityProfiles = profilesBySetAndCode.get(setCodeKey) ?? []
      return {
        questionCode: code,
        candidate,
        suitabilityProfiles,
      }
    })

    return {
      setNumber: setNum as 1 | 2 | 3 | 4 | 5,
      profiles,
    }
  })
}
