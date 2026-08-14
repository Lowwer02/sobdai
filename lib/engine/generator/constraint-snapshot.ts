/**
 * lib/engine/generator/constraint-snapshot.ts
 * ----------------------------------------------------------------------------
 * Production projection of Reader-owned AssemblyRequest constraints into the
 * Generator-owned ConstraintSnapshot carried to Ranking and Solver.
 *
 * This module performs structural projection only. It does not validate,
 * normalize, infer, or modify constraint values.
 */

import type { AssemblyRequest } from '../reader/contracts'
import type { ConstraintSnapshot } from './contracts'

/**
 * Projects the approved immutable constraint subset from an AssemblyRequest.
 *
 * Identity, exclusions, metadata, and document display names are deliberately
 * omitted by the existing ConstraintSnapshot contract. Existing constraint
 * objects are retained by reference; only Document Registry entries are
 * narrowed to their approved `{ id, tier }` projection.
 *
 * @spec IG-5 Contract Amendment; Candidate Generation Architecture v1.0 §10
 */
export function projectConstraintSnapshot(
  source: AssemblyRequest
): ConstraintSnapshot {
  return {
    distributionConstraints: source.distributionConstraints,
    coverageRules: source.coverageRules,
    duplicatePrevention: source.duplicatePrevention,
    loDistribution: source.loDistribution,
    patternDistributionTargets: source.patternDistributionTargets,
    documentRegistry: source.documentRegistry.map((entry) => ({
      id: entry.id,
      tier: entry.tier,
    })),
    target: source.target,
    runUnit: source.runUnit,
  }
}
