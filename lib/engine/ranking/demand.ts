/**
 * lib/engine/ranking/demand.ts
 * ----------------------------------------------------------------------------
 * Quantified allocation demand derived from the CandidateSet's Constraint
 * Snapshot (question_pattern universal-null release + KSB 3.0.1 quantity fix).
 *
 * WHY THIS MODULE EXISTS.
 * The QueryPlan's `AxisSlot.targetCount` (LO buckets 24/34/24/18 for KSB
 * 3.0.1, summing to `target.perSet`) was dead metadata: Ranking grouped
 * Candidates by their own axis values and the Solver placed exactly one
 * Candidate per group, so a 100-Question Set produced one placement per
 * axis value (6/100). This module turns the authored quantities into an
 * executable per-Set demand: one demand unit per final Question.
 *
 * QUANTITY OWNERSHIP (joint multi-axis accounting).
 *  - `target.perSet` is the authoritative physical Set size (hard).
 *  - The Learning Objective distribution is the ONLY authored per-axis
 *    quantity split of that size (Integration Spec §4.4 deliberately omits
 *    Difficulty/Pattern counts; those axes are advisory attributes here).
 *  - LO bucket demand = round(target% × perSet / 100) — the same formula
 *    the Query Planner uses — so one Question contributes to exactly one
 *    LO bucket and the axis totals can never inflate the Set size.
 *  - A residual bucket absorbs `perSet − Σ LO demand` (rounding drift or
 *    degraded LO supply) so a successful Set is always exactly `perSet`.
 *
 * DEGRADED LO SUPPLY (soft coverage).
 * If a bucket's matching supply is smaller than its demand, the bucket keeps
 * only the matching instances and the difference moves to the residual
 * bucket, which draws from every remaining Candidate. LO coverage then
 * degrades advisory (reported as `degradedBuckets`) while the physical Set
 * size stays exact. Insufficient TOTAL supply is NOT absorbed here: unfilled
 * demand units surface in the Solver and fail the per-Set quantity validation
 * loudly.
 *
 * DETERMINISM: pure function of the CandidateSet. Buckets are emitted in
 * fixed LO order per Set, residuals last; Candidate codes are sorted.
 */

import type { BlueprintSlot, CandidateSet } from '../generator/contracts'
import type { LearningObjective } from '../shared/assessment-vocabulary'

type SetNumber = BlueprintSlot['setNumber']

const LO_ORDER: readonly LearningObjective[] = ['LO1', 'LO2', 'LO3', 'LO4']

/** One quantified allocation bucket: `requiredCount` final Question placements. */
export interface AllocationDemandBucket {
  /** The Blueprint slot descriptor the placements belong to. */
  readonly slot: BlueprintSlot
  /** Stable bucket id; demand instances are suffixed `|demand=NNNN`. */
  readonly bucketId: string
  /** How many distinct final Question placements this bucket demands. */
  readonly requiredCount: number
  /**
   * The Learning Objective this bucket fills, or null for the residual
   * bucket (which accepts any remaining Candidate).
   */
  readonly learningObjective: LearningObjective | null
  /** Candidate Codes eligible for this bucket, in deterministic order. */
  readonly candidateCodes: readonly string[]
}

/** Quantified per-Set allocation demand. */
export interface AllocationDemand {
  /**
   * True when the Blueprint authors LO quantities (Σ targetCount > 0).
   * Legacy Blueprints without authored quantities keep the historical
   * one-placement-per-observed-slot behavior.
   */
  readonly quantified: boolean
  readonly perSet: number
  readonly setNumbers: readonly number[]
  /** Every Candidate Code present in the CandidateSet, sorted. */
  readonly knownCodes: readonly string[]
  readonly buckets: readonly AllocationDemandBucket[]
  /** Buckets whose matching supply is smaller than their authored demand. */
  readonly degradedBuckets: readonly {
    readonly bucketId: string
    readonly learningObjective: LearningObjective
    readonly authoredCount: number
    readonly matchingSupply: number
  }[]
}

/**
 * Build the quantified allocation demand from the CandidateSet's constraint
 * snapshot. Pure and deterministic.
 */
export function buildAllocationDemand(
  candidateSet: CandidateSet
): AllocationDemand {
  const snapshot = candidateSet.constraintSnapshot
  const perSet = snapshot.target.perSet
  const setCount = snapshot.target.sets
  const setNumbers: readonly SetNumber[] = Array.from(
    { length: setCount },
    (_, index) => (index + 1) as SetNumber
  )

  const codesByLo = new Map<LearningObjective, string[]>()
  const allCodes: string[] = []
  for (const candidate of candidateSet.candidates) {
    const code = candidate.identity.questionCode
    allCodes.push(code)
    const lo = candidate.metadata.learningObjective
    if (lo === null) continue
    const existing = codesByLo.get(lo)
    if (existing === undefined) {
      codesByLo.set(lo, [code])
    } else {
      existing.push(code)
    }
  }
  allCodes.sort(compareStrings)
  for (const codes of codesByLo.values()) codes.sort(compareStrings)

  const buckets: AllocationDemandBucket[] = []
  const degradedBuckets: {
    bucketId: string
    learningObjective: LearningObjective
    authoredCount: number
    matchingSupply: number
  }[] = []
  let totalLoDemand = 0

  for (const setNumber of setNumbers) {
    let setLoDemand = 0
    const setBuckets: AllocationDemandBucket[] = []
    for (const lo of LO_ORDER) {
      const percent = snapshot.loDistribution.targets[lo] ?? 0
      const targetCount = Math.round((percent * perSet) / 100)
      if (targetCount <= 0) continue
      const matching = codesByLo.get(lo) ?? []
      const fillCount = Math.min(targetCount, matching.length)
      const slot: BlueprintSlot = { setNumber, learningObjective: lo }
      setBuckets.push({
        slot,
        bucketId: bucketIdFor(slot),
        requiredCount: fillCount,
        learningObjective: lo,
        candidateCodes: matching,
      })
      if (fillCount < targetCount) {
        degradedBuckets.push({
          bucketId: bucketIdFor(slot),
          learningObjective: lo,
          authoredCount: targetCount,
          matchingSupply: matching.length,
        })
      }
      setLoDemand += fillCount
    }
    totalLoDemand += setLoDemand

    // Residual bucket absorbs rounding drift and degraded LO supply so every
    // Set still demands exactly `perSet` final Question placements.
    const residual = perSet - setLoDemand
    if (residual > 0) {
      const slot: BlueprintSlot = { setNumber }
      setBuckets.push({
        slot,
        bucketId: bucketIdFor(slot),
        requiredCount: residual,
        learningObjective: null,
        candidateCodes: allCodes,
      })
    }
    buckets.push(...setBuckets)
  }

  return {
    quantified: totalLoDemand > 0,
    perSet,
    setNumbers,
    knownCodes: allCodes,
    buckets,
    degradedBuckets,
  }
}

/**
 * Stable bucket id. LO buckets mirror the historical `stableSlotId` shape so
 * emitted demand instance ids read consistently; the residual bucket sorts
 * after every LO bucket within a Set ('quantity' > 'learningObjective').
 */
function bucketIdFor(slot: BlueprintSlot): string {
  return [
    `set=${slot.setNumber}`,
    `document=${slot.document ?? '*'}`,
    `difficulty=${slot.difficulty ?? '*'}`,
    `blueprintType=${slot.blueprintType ?? '*'}`,
    `pattern=${slot.pattern ?? '*'}`,
    slot.learningObjective === undefined
      ? 'quantity=residual'
      : `learningObjective=${slot.learningObjective}`,
  ].join('|')
}

/** Deterministic demand-instance id: one final Question placement. */
export function demandInstanceId(bucketId: string, index: number): string {
  return `${bucketId}|demand=${String(index).padStart(4, '0')}`
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
