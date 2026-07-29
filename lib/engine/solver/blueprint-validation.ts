/**
 * lib/engine/solver/blueprint-validation.ts
 * ----------------------------------------------------------------------------
 * Constraint Solver E-4C.3 — Blueprint Constraint Validation.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Constraint Solver Architecture v1.0 §3.2 Stage 3 "Validate Constraints",
 *     §4 (Constraint Categories), §8.1 (Feasibility Model), §11.1
 *     (Blueprint impossible / constraint contradiction).
 *   - IG-5 Contract Amendment: Solver consumes the read-only ConstraintSnapshot
 *     surfaced by AllocationRuntimeState.
 *
 * WHAT THIS MODULE IS.
 *  - Stage 3 static Blueprint feasibility validation.
 *  - Pure validation over the carried ConstraintSnapshot.
 *  - Fatal diagnostic generation for impossible-on-paper constraints.
 *  - Non-fatal warnings for declared constraints whose static binding is absent
 *    or intentionally opaque at this stage.
 *
 * WHAT THIS MODULE IS NOT.
 *  - Does NOT inspect rankings, scores, runtime Slots, occupancy, Candidates, or
 *    placement state.
 *  - Does NOT reserve, assign, replace, backtrack, search, resolve conflicts, or
 *    emit an AllocatedCandidateSet.
 *  - Does NOT mutate AllocationRuntimeState or ConstraintSnapshot.
 */

import type { ConstraintSnapshot } from '../generator/contracts'
import type { AllocationRuntimeState } from './runtime'
import type {
  ConstraintCategory,
  SolverDiagnostic,
  SolverDiagnosticCategory,
  SolverWarning,
} from './contracts'

// ═══════════════════════════════════════════════════════════════════════════
// 1. Output contract for Stage 3
// ═══════════════════════════════════════════════════════════════════════════

export type BlueprintValidationStatus = 'valid' | 'invalid'

export interface BlueprintValidationResult {
  readonly status: BlueprintValidationStatus
  readonly fatalDiagnostics: readonly SolverDiagnostic[]
  readonly warnings: readonly SolverWarning[]
  readonly constraintSnapshot: ConstraintSnapshot
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Public API
// ═══════════════════════════════════════════════════════════════════════════

export function validateBlueprintConstraints(
  runtimeState: AllocationRuntimeState
): BlueprintValidationResult {
  const constraintSnapshot = runtimeState.constraintSnapshot
  const fatalDiagnostics: SolverDiagnostic[] = []
  const warnings: SolverWarning[] = []

  validateRunContext(constraintSnapshot, fatalDiagnostics)
  validateDistributionConstraints(constraintSnapshot, fatalDiagnostics)
  validateDocumentTierConsistency(constraintSnapshot, fatalDiagnostics)
  validateCoverageConstraints(constraintSnapshot, fatalDiagnostics, warnings)
  validateDuplicatePreventionConstraints(constraintSnapshot, fatalDiagnostics)
  validateLearningObjectiveDistribution(constraintSnapshot, fatalDiagnostics)

  const sortedFatalDiagnostics = [...fatalDiagnostics].sort(compareDiagnostics)
  const sortedWarnings = [...warnings].sort(compareWarnings)

  return {
    status: sortedFatalDiagnostics.length === 0 ? 'valid' : 'invalid',
    fatalDiagnostics: sortedFatalDiagnostics,
    warnings: sortedWarnings,
    constraintSnapshot,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Static validation checks
// ═══════════════════════════════════════════════════════════════════════════

function validateRunContext(
  snapshot: ConstraintSnapshot,
  diagnostics: SolverDiagnostic[]
): void {
  if (snapshot.runUnit !== 'blueprint') {
    diagnostics.push(
      fatal(
        'blueprint_impossible',
        'distribution',
        `Unsupported runUnit '${String(snapshot.runUnit)}'.`,
        "Use runUnit 'blueprint' for the Solver's co-allocated run."
      )
    )
  }

  if (!isPositiveInteger(snapshot.target.sets)) {
    diagnostics.push(
      fatal(
        'blueprint_impossible',
        'distribution',
        `Run target sets must be a positive integer; received ${String(snapshot.target.sets)}.`,
        'Correct the Blueprint target.sets before solving.'
      )
    )
  } else if (snapshot.target.sets > 5) {
    diagnostics.push(
      fatal(
        'blueprint_impossible',
        'cross_set',
        `Run target declares ${snapshot.target.sets} Sets, but the frozen Solver allocation vocabulary supports Sets 1-5.`,
        'Reduce target.sets to the supported Blueprint v3.0 range.'
      )
    )
  }

  if (!isPositiveInteger(snapshot.target.perSet)) {
    diagnostics.push(
      fatal(
        'blueprint_impossible',
        'distribution',
        `Run target perSet must be a positive integer; received ${String(snapshot.target.perSet)}.`,
        'Correct the Blueprint target.perSet before solving.'
      )
    )
  }
}

function validateDistributionConstraints(
  snapshot: ConstraintSnapshot,
  diagnostics: SolverDiagnostic[]
): void {
  const distribution = snapshot.distributionConstraints
  const sumPerSet = distribution.sumPerSet

  if (!isPositiveInteger(sumPerSet)) {
    diagnostics.push(
      fatal(
        'blueprint_impossible',
        'distribution',
        `distributionConstraints.sumPerSet must be a positive integer; received ${String(sumPerSet)}.`,
        'Correct distributionConstraints.sumPerSet before solving.'
      )
    )
  }

  if (isPositiveInteger(sumPerSet) && isPositiveInteger(snapshot.target.perSet) && sumPerSet !== snapshot.target.perSet) {
    diagnostics.push(
      fatal(
        'constraint_contradiction',
        'distribution',
        `distributionConstraints.sumPerSet (${sumPerSet}) does not match target.perSet (${snapshot.target.perSet}).`,
        'Align distributionConstraints.sumPerSet with target.perSet.'
      )
    )
  }

  const bounds = tierBounds(snapshot, diagnostics)
  if (bounds === null || !isPositiveInteger(sumPerSet)) return

  const effectiveMin = {
    1: Math.max(bounds[1].min, distribution.tier1Floor),
    2: bounds[2].min,
    3: bounds[3].min,
    4: bounds[4].min,
  }
  const effectiveMax = {
    1: bounds[1].max,
    2: bounds[2].max,
    3: bounds[3].max,
    4: Math.min(bounds[4].max, distribution.tier4Ceiling),
  }

  if (!isNonNegativeInteger(distribution.tier1Floor)) {
    diagnostics.push(
      fatal(
        'blueprint_impossible',
        'distribution',
        `tier1Floor must be a non-negative integer; received ${String(distribution.tier1Floor)}.`,
        'Correct distributionConstraints.tier1Floor.'
      )
    )
  } else if (distribution.tier1Floor > bounds[1].max) {
    diagnostics.push(
      fatal(
        'constraint_contradiction',
        'distribution',
        `tier1Floor (${distribution.tier1Floor}) exceeds Tier 1 maximum (${bounds[1].max}).`,
        'Lower tier1Floor or raise the Tier 1 maximum.'
      )
    )
  }

  if (!isNonNegativeInteger(distribution.tier4Ceiling)) {
    diagnostics.push(
      fatal(
        'blueprint_impossible',
        'distribution',
        `tier4Ceiling must be a non-negative integer; received ${String(distribution.tier4Ceiling)}.`,
        'Correct distributionConstraints.tier4Ceiling.'
      )
    )
  } else if (distribution.tier4Ceiling < bounds[4].min) {
    diagnostics.push(
      fatal(
        'constraint_contradiction',
        'distribution',
        `tier4Ceiling (${distribution.tier4Ceiling}) is below Tier 4 minimum (${bounds[4].min}).`,
        'Raise tier4Ceiling or lower the Tier 4 minimum.'
      )
    )
  }

  const totalMin = effectiveMin[1] + effectiveMin[2] + effectiveMin[3] + effectiveMin[4]
  const totalMax = effectiveMax[1] + effectiveMax[2] + effectiveMax[3] + effectiveMax[4]

  if (totalMin > sumPerSet) {
    diagnostics.push(
      fatal(
        'blueprint_impossible',
        'distribution',
        `Tier minimums require at least ${totalMin} questions per Set, exceeding sumPerSet ${sumPerSet}.`,
        'Reduce one or more Tier minimums/floors, or raise sumPerSet.'
      )
    )
  }

  if (totalMax < sumPerSet) {
    diagnostics.push(
      fatal(
        'blueprint_impossible',
        'distribution',
        `Tier maximums allow at most ${totalMax} questions per Set, below sumPerSet ${sumPerSet}.`,
        'Raise one or more Tier maximums/ceilings, or lower sumPerSet.'
      )
    )
  }

  validateAnchor(distribution.anchor, diagnostics)
}

function validateDocumentTierConsistency(
  snapshot: ConstraintSnapshot,
  diagnostics: SolverDiagnostic[]
): void {
  const seen = new Set<string>()
  const tierCounts = { 1: 0, 2: 0, 3: 0, 4: 0 }

  for (const entry of snapshot.documentRegistry) {
    if (typeof entry.id !== 'string' || entry.id.length === 0) {
      diagnostics.push(
        fatal(
          'blueprint_impossible',
          'distribution',
          'Document Registry contains an empty document id.',
          'Give every Document Registry entry a stable id.'
        )
      )
      continue
    }
    if (seen.has(entry.id)) {
      diagnostics.push(
        fatal(
          'constraint_contradiction',
          'distribution',
          `Document Registry contains duplicate document id '${entry.id}'.`,
          'Deduplicate the Document Registry before solving.'
        )
      )
    }
    seen.add(entry.id)
    if (isTier(entry.tier)) tierCounts[entry.tier] += 1
    else {
      diagnostics.push(
        fatal(
          'blueprint_impossible',
          'distribution',
          `Document '${entry.id}' has unsupported Tier '${String(entry.tier)}'.`,
          'Assign each document a Tier in 1, 2, 3, or 4.'
        )
      )
    }
  }

  if (snapshot.target.perSet > 0 && snapshot.documentRegistry.length === 0) {
    diagnostics.push(
      fatal(
        'blueprint_impossible',
        'distribution',
        'Document Registry is empty but target.perSet requires questions.',
        'Add at least one document to the Document Registry.'
      )
    )
  }

  const bounds = tierBounds(snapshot, [])
  if (bounds === null) return
  for (const tier of TIERS) {
    const required = tier === 1
      ? Math.max(bounds[tier].min, snapshot.distributionConstraints.tier1Floor)
      : bounds[tier].min
    if (required > 0 && tierCounts[tier] === 0) {
      diagnostics.push(
        fatal(
          'blueprint_impossible',
          'distribution',
          `Tier ${tier} requires at least ${required} questions but no Tier ${tier} document exists in the Snapshot.`,
          `Add a Tier ${tier} document or revise the Tier ${tier} minimum.`
        )
      )
    }
  }
}

function validateCoverageConstraints(
  snapshot: ConstraintSnapshot,
  diagnostics: SolverDiagnostic[],
  warnings: SolverWarning[]
): void {
  const seen = new Set<string>()
  const documentIds = new Set(snapshot.documentRegistry.map((entry) => entry.id))

  for (const rule of snapshot.coverageRules) {
    if (!isCoverageRuleId(rule.id)) {
      diagnostics.push(
        fatal(
          'blueprint_impossible',
          'coverage',
          `Unsupported coverage rule id '${String(rule.id)}'.`,
          'Use only CR-1 through CR-5 coverage rules.'
        )
      )
      continue
    }
    if (seen.has(rule.id)) {
      diagnostics.push(
        fatal(
          'constraint_contradiction',
          'coverage',
          `Coverage rule '${rule.id}' is declared more than once.`,
          'Deduplicate coverage rules so each CR id is declared once.'
        )
      )
    }
    seen.add(rule.id)

    if (!isEnforcementLevel(rule.level)) {
      diagnostics.push(
        fatal(
          'blueprint_impossible',
          'coverage',
          `Coverage rule '${rule.id}' has unsupported enforcement level '${String(rule.level)}'.`,
          "Use enforcement level 'hard' or 'soft'."
        )
      )
    }

    if (rule.binding === null || rule.binding === undefined) {
      warnings.push(
        warning(
          'coverage',
          `Coverage rule '${rule.id}' has no static binding in the Constraint Snapshot.`,
          'Static validation preserves the rule for later stages but cannot prove coverage content.'
        )
      )
      continue
    }

    if (rule.id === 'CR-1' && isCr1Binding(rule.binding)) {
      validateCr1Binding(rule.binding, documentIds, rule.level, diagnostics, warnings)
    } else {
      warnings.push(
        warning(
          'coverage',
          `Coverage rule '${rule.id}' uses a binding shape that Stage 3 treats as opaque.`,
          'Validate the rule-specific binding in the stage that owns its semantics.'
        )
      )
    }
  }
}

function validateDuplicatePreventionConstraints(
  snapshot: ConstraintSnapshot,
  diagnostics: SolverDiagnostic[]
): void {
  const seen = new Set<string>()
  for (const rule of snapshot.duplicatePrevention) {
    if (!isDuplicateRuleId(rule.id)) {
      diagnostics.push(
        fatal(
          'blueprint_impossible',
          'cross_set',
          `Unsupported duplicate-prevention rule id '${String(rule.id)}'.`,
          'Use only L1 through L5 duplicate-prevention rules.'
        )
      )
      continue
    }
    if (seen.has(rule.id)) {
      diagnostics.push(
        fatal(
          'constraint_contradiction',
          'cross_set',
          `Duplicate-prevention rule '${rule.id}' is declared more than once.`,
          'Deduplicate duplicate-prevention rules so each L id is declared once.'
        )
      )
    }
    seen.add(rule.id)

    if (rule.scope !== 'within_set' && rule.scope !== 'across_set') {
      diagnostics.push(
        fatal(
          'blueprint_impossible',
          'cross_set',
          `Duplicate-prevention rule '${rule.id}' has unsupported scope '${String(rule.scope)}'.`,
          "Use scope 'within_set' or 'across_set'."
        )
      )
    }
    if (!isEnforcementLevel(rule.level)) {
      diagnostics.push(
        fatal(
          'blueprint_impossible',
          'cross_set',
          `Duplicate-prevention rule '${rule.id}' has unsupported enforcement level '${String(rule.level)}'.`,
          "Use enforcement level 'hard' or 'soft'."
        )
      )
    }
    if (rule.similarityThresholds !== undefined) {
      const { block, warn } = rule.similarityThresholds
      if (!isProbability(block) || !isProbability(warn)) {
        diagnostics.push(
          fatal(
            'blueprint_impossible',
            'cross_set',
            `Duplicate-prevention rule '${rule.id}' has similarity thresholds outside [0, 1].`,
            'Correct similarityThresholds.block and similarityThresholds.warn.'
          )
        )
      } else if (warn > block) {
        diagnostics.push(
          fatal(
            'constraint_contradiction',
            'cross_set',
            `Duplicate-prevention rule '${rule.id}' has warn threshold ${warn} above block threshold ${block}.`,
            'Set warn less than or equal to block.'
          )
        )
      }
    }
  }
}

function validateLearningObjectiveDistribution(
  snapshot: ConstraintSnapshot,
  diagnostics: SolverDiagnostic[]
): void {
  let total = 0
  for (const lo of LOS) {
    const target = snapshot.loDistribution.targets[lo]
    if (!isNonNegativeNumber(target)) {
      diagnostics.push(
        fatal(
          'blueprint_impossible',
          'distribution',
          `LO target '${lo}' must be a non-negative number; received ${String(target)}.`,
          'Correct the LO distribution targets.'
        )
      )
      continue
    }
    total += target

    const count = (snapshot.target.perSet * target) / 100
    if (isPositiveInteger(snapshot.target.perSet) && !Number.isInteger(count)) {
      diagnostics.push(
        fatal(
          'blueprint_impossible',
          'distribution',
          `LO target '${lo}' yields fractional per-Set count ${count}.`,
          'Choose LO percentages that produce whole-question counts for target.perSet.'
        )
      )
    }

    const mappedTypes = snapshot.loDistribution.typeMap[lo]
    if (!Array.isArray(mappedTypes)) {
      diagnostics.push(
        fatal(
          'blueprint_impossible',
          'distribution',
          `LO typeMap '${lo}' is missing or malformed.`,
          'Declare a BlueprintType correspondence list for every LO.'
        )
      )
      continue
    }
    if (target > 0 && mappedTypes.length === 0) {
      diagnostics.push(
        fatal(
          'blueprint_impossible',
          'distribution',
          `LO target '${lo}' is ${target}% but has no allowed BlueprintTypes.`,
          `Add at least one BlueprintType to loDistribution.typeMap.${lo}.`
        )
      )
    }
    const seenTypes = new Set<string>()
    for (const blueprintType of mappedTypes) {
      if (!isBlueprintType(blueprintType)) {
        diagnostics.push(
          fatal(
            'blueprint_impossible',
            'distribution',
            `LO typeMap '${lo}' contains unsupported BlueprintType '${String(blueprintType)}'.`,
            'Use only Memory, Concept, Procedure, or Scenario.'
          )
        )
      } else if (seenTypes.has(blueprintType)) {
        diagnostics.push(
          fatal(
            'constraint_contradiction',
            'distribution',
            `LO typeMap '${lo}' repeats BlueprintType '${blueprintType}'.`,
            'Remove duplicate BlueprintType entries from the LO typeMap.'
          )
        )
      }
      seenTypes.add(String(blueprintType))
    }
  }

  if (Number.isFinite(total) && total !== 100) {
    diagnostics.push(
      fatal(
        'constraint_contradiction',
        'distribution',
        `LO targets sum to ${total}, not 100.`,
        'Adjust LO targets so they sum to exactly 100.'
      )
    )
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Helpers
// ═══════════════════════════════════════════════════════════════════════════

const TIERS = [1, 2, 3, 4] as const
const LOS = ['LO1', 'LO2', 'LO3', 'LO4'] as const
const COVERAGE_RULE_IDS = ['CR-1', 'CR-2', 'CR-3', 'CR-4', 'CR-5'] as const
const DUPLICATE_RULE_IDS = ['L1', 'L2', 'L3', 'L4', 'L5'] as const
const BLUEPRINT_TYPES = ['Memory', 'Concept', 'Procedure', 'Scenario'] as const

type Tier = (typeof TIERS)[number]
type TierBounds = Record<Tier, { readonly min: number; readonly max: number }>

function tierBounds(
  snapshot: ConstraintSnapshot,
  diagnostics: SolverDiagnostic[]
): TierBounds | null {
  const result = {} as Record<Tier, { readonly min: number; readonly max: number }>
  let ok = true
  for (const tier of TIERS) {
    const bounds = snapshot.distributionConstraints.tierMinMax[tier]
    if (!Array.isArray(bounds) || bounds.length !== 2) {
      diagnostics.push(
        fatal(
          'blueprint_impossible',
          'distribution',
          `Tier ${tier} min/max bounds are missing or malformed.`,
          `Declare distributionConstraints.tierMinMax.${tier} as [min, max].`
        )
      )
      ok = false
      continue
    }
    const [min, max] = bounds
    if (!isNonNegativeInteger(min) || !isNonNegativeInteger(max)) {
      diagnostics.push(
        fatal(
          'blueprint_impossible',
          'distribution',
          `Tier ${tier} bounds must be non-negative integers.`,
          `Correct distributionConstraints.tierMinMax.${tier}.`
        )
      )
      ok = false
      continue
    }
    if (min > max) {
      diagnostics.push(
        fatal(
          'constraint_contradiction',
          'distribution',
          `Tier ${tier} minimum ${min} exceeds maximum ${max}.`,
          `Lower the Tier ${tier} minimum or raise its maximum.`
        )
      )
      ok = false
    }
    result[tier] = { min, max }
  }
  return ok ? result : null
}

function validateAnchor(
  anchor: ConstraintSnapshot['distributionConstraints']['anchor'],
  diagnostics: SolverDiagnostic[]
): void {
  if (anchor === null) return
  if (!isNonNegativeInteger(anchor.bonus)) {
    diagnostics.push(
      fatal(
        'blueprint_impossible',
        'distribution',
        `Anchor bonus must be a non-negative integer; received ${String(anchor.bonus)}.`,
        'Correct distributionConstraints.anchor.bonus.'
      )
    )
  }
  if (!isNonNegativeInteger(anchor.maxPerSet)) {
    diagnostics.push(
      fatal(
        'blueprint_impossible',
        'distribution',
        `Anchor maxPerSet must be a non-negative integer; received ${String(anchor.maxPerSet)}.`,
        'Correct distributionConstraints.anchor.maxPerSet.'
      )
    )
  }
}

type Cr1Binding = {
  readonly kind: 'document_topic_pairs'
  readonly pairs: readonly { readonly document: string; readonly topic: string }[]
}

function isCr1Binding(binding: unknown): binding is Cr1Binding {
  if (binding === null || typeof binding !== 'object') return false
  const candidate = binding as { readonly kind?: unknown; readonly pairs?: unknown }
  return candidate.kind === 'document_topic_pairs' && Array.isArray(candidate.pairs)
}

function validateCr1Binding(
  binding: Cr1Binding,
  documentIds: ReadonlySet<string>,
  level: unknown,
  diagnostics: SolverDiagnostic[],
  warnings: SolverWarning[]
): void {
  for (const pair of binding.pairs) {
    const document = pair.document
    const topic = pair.topic
    if (typeof document !== 'string' || document.length === 0 || typeof topic !== 'string' || topic.length === 0) {
      diagnostics.push(
        fatal(
          'blueprint_impossible',
          'coverage',
          'CR-1 document-topic binding contains an empty document or topic.',
          'Correct every CR-1 document_topic_pairs entry.'
        )
      )
      continue
    }
    if (!documentIds.has(document)) {
      const message = `CR-1 references document '${document}', which is absent from the Constraint Snapshot Document Registry.`
      if (level === 'hard') {
        diagnostics.push(
          fatal(
            'blueprint_impossible',
            'coverage',
            message,
            'Add the referenced document to the Document Registry or revise CR-1.'
          )
        )
      } else {
        warnings.push(
          warning(
            'coverage',
            message,
            'Soft CR-1 may remain unsatisfied unless the document reference is corrected.'
          )
        )
      }
    }
  }
}

function fatal(
  category: SolverDiagnosticCategory,
  constraintCategory: ConstraintCategory,
  explanation: string,
  recommendation: string
): SolverDiagnostic {
  return {
    category,
    severity: 'Fatal',
    stage: 'validate_constraints',
    slotId: null,
    candidateCode: null,
    componentId: null,
    explanation: `${constraintCategory}: ${explanation}`,
    recommendation,
  }
}

function warning(
  category: ConstraintCategory,
  explanation: string,
  recommendation: string
): SolverWarning {
  return {
    severity: 'Non-fatal',
    category,
    stage: 'validate_constraints',
    slotId: null,
    candidateCode: null,
    explanation,
    recommendation,
  }
}

function compareDiagnostics(a: SolverDiagnostic, b: SolverDiagnostic): number {
  return (
    compareStrings(a.category, b.category) ||
    compareStrings(a.explanation, b.explanation) ||
    compareStrings(a.recommendation, b.recommendation)
  )
}

function compareWarnings(a: SolverWarning, b: SolverWarning): number {
  return (
    compareStrings(a.category ?? '', b.category ?? '') ||
    compareStrings(a.explanation, b.explanation) ||
    compareStrings(a.recommendation, b.recommendation)
  )
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === 'number' && value > 0
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === 'number' && value >= 0
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isProbability(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

function isTier(value: unknown): value is Tier {
  return value === 1 || value === 2 || value === 3 || value === 4
}

function isEnforcementLevel(value: unknown): boolean {
  return value === 'hard' || value === 'soft'
}

function isCoverageRuleId(value: unknown): boolean {
  return typeof value === 'string' && COVERAGE_RULE_IDS.includes(value as never)
}

function isDuplicateRuleId(value: unknown): boolean {
  return typeof value === 'string' && DUPLICATE_RULE_IDS.includes(value as never)
}

function isBlueprintType(value: unknown): boolean {
  return typeof value === 'string' && BLUEPRINT_TYPES.includes(value as never)
}
