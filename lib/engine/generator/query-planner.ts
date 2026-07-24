/**
 * lib/engine/generator/query-planner.ts
 * ----------------------------------------------------------------------------
 * Candidate Generator Stage 1 — Query Planner.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Candidate Generation Architecture v1.0 §3 (Query Planning),
 *     §3.2 (Planner Translations), §3.3 (What the Planner Does NOT Do)
 *   - Blueprint Integration Specification v1.0 §4 (AssemblyRequest Contract),
 *     §4.4 (What the AssemblyRequest Deliberately Omits)
 *
 * The Query Planner is a PURE FUNCTION that converts an immutable
 * AssemblyRequest into an immutable QueryPlan. It describes WHAT the
 * Generator should search for — never HOW (no SQL, no Bank access, no filter
 * execution).
 *
 * MAPPING (AssemblyRequest → QueryPlan), per §3.2:
 *
 * | AssemblyRequest field | QueryPlan field | Translation |
 * |---|---|---|
 * | documentRegistry[].name | permittedDocuments | Extract names (closed set) |
 * | coverageRules[] | coverageRequirements[] | Pass-through (ruleId + level + binding) |
 * | loDistribution.targets | learningObjectiveSlots[] | For each LO × each Set: target = round(% × perSet / 100) |
 * | (fixed Difficulty enum) | difficultySlots[] | For each Difficulty × each Set: enumerate the axis; target=0 (TBD by Solver) |
 * | (fixed Pattern enum) | patternSlots[] | For each Pattern × each Set: enumerate the axis; target=0 (TBD by Solver) |
 * | duplicatePrevention[] | duplicateRules[] | Pass-through (ruleId + scope + level) |
 * | exclusions[] | exclusions[] | Direct pass-through |
 *
 * DIFFICULTY/PATTERN TARGET COUNTS: The AssemblyRequest does NOT carry per-axis
 * per-Set Difficulty or Pattern counts (Integration Spec §4.4 — those were in
 * the Blueprint's illustrative tables, intentionally omitted from the
 * AssemblyRequest because the Engine re-derives its own allocation). The Query
 * Plan enumerates these axes (so the filters know which values to admit) with
 * targetCount=0, signaling "filter for this value; the Solver will determine
 * the count from joint constraints." LO targets ARE in the AssemblyRequest
 * (loDistribution.targets), so they carry real counts.
 *
 * WHAT THE PLANNER DOES NOT DO (§3.3):
 *  - ❌ Execute queries or access the Bank.
 *  - ❌ Decide filter order (FILTER_EXECUTION_ORDER in contracts.ts owns that).
 *  - ❌ Interpret duplicate rules as per-Question filters (they're constraint
 *       metadata for the Solver).
 *  - ❌ Infer missing axes or normalize data (Reader already normalized).
 *  - ❌ Validate (Reader already validated).
 *
 * DETERMINISM: pure function. Same AssemblyRequest → same QueryPlan, byte-for-byte.
 * IMMUTABILITY: output is `readonly` at every level; input is never mutated.
 */

import type { AssemblyRequest } from '../reader/contracts'
import type {
  AxisSlot,
  CoverageRequirement,
  DuplicateRuleMetadata,
  QueryPlan,
} from './contracts'
import { FILTER_EXECUTION_ORDER } from './contracts'

// ─── Fixed axis vocabularies (for slot enumeration) ─────────────────────────
// These are the fixed enum values the filters will check against. They mirror
// the reader/contracts enums; the Query Plan enumerates them so the Metadata
// Filtering stage knows the full axis surface without re-deriving it.

const DIFFICULTY_VALUES = ['Easy', 'Medium', 'Hard'] as const
const PATTERN_VALUES = [
  'Positive',
  'Negative',
  'Best Answer',
  'Scenario',
  'Sequence',
  'Matching Concept',
] as const
const LO_VALUES = ['LO1', 'LO2', 'LO3', 'LO4'] as const

// ─── Public API: planQuery ──────────────────────────────────────────────────

/**
 * Convert an immutable AssemblyRequest into an immutable QueryPlan.
 *
 * Pure and deterministic. Never mutates the input.
 *
 * @param request  The AssemblyRequest from the Reader Pipeline.
 */
export function planQuery(request: AssemblyRequest): QueryPlan {
  const setCount = request.target.sets
  const perSet = request.target.perSet

  return {
    coverageRequirements: buildCoverageRequirements(request),
    difficultySlots: buildDifficultySlots(setCount),
    permittedDocuments: buildPermittedDocuments(request),
    patternSlots: buildPatternSlots(setCount),
    learningObjectiveSlots: buildLoSlots(request, setCount, perSet),
    duplicateRules: buildDuplicateRules(request),
    exclusions: buildExclusions(request),
  }
}

// ─── Sub-planners ───────────────────────────────────────────────────────────

/**
 * Translate CoverageRules into CoverageRequirements (§3.2).
 *
 * Direct pass-through: the AssemblyRequest's CoverageRule shape
 * ({ id, level, binding }) maps 1:1 to the QueryPlan's CoverageRequirement
 * ({ ruleId, level, binding }). The binding is opaque at this layer — the
 * Coverage Filter interprets it per rule id.
 */
function buildCoverageRequirements(request: AssemblyRequest): readonly CoverageRequirement[] {
  return request.coverageRules.map((rule) => ({
    ruleId: rule.id,
    level: rule.level,
    binding: rule.binding,
  }))
}

/**
 * Extract the closed set of permitted document names from the Document
 * Registry (§3.2: "Documents → closed set of permitted documents").
 *
 * The Document Registry carries { id, name, tier }. The Query Plan needs only
 * the NAMES (what the Document Filter matches against). Tier is a derived
 * property (§3.5) and is NOT carried in the Query Plan — the Generator's
 * Discovery stage derives it per Candidate via the Document Registry at
 * runtime.
 *
 * Sorted alphabetically for deterministic output order.
 */
function buildPermittedDocuments(request: AssemblyRequest): readonly string[] {
  const names = request.documentRegistry.map((entry) => entry.name)
  // Deduplicate (a document shouldn't appear twice) + sort for determinism.
  return [...new Set(names)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

/**
 * Enumerate per-Set Difficulty slots (§3.2).
 *
 * For each Set (1..setCount) × each Difficulty value (Easy/Medium/Hard),
 * create an AxisSlot. targetCount is 0 because the AssemblyRequest does NOT
 * carry per-axis-per-Set Difficulty targets (Integration Spec §4.4 — those
 * were illustrative). The Solver determines actual counts from joint
 * constraints.
 *
 * Ordering: Set-major (all difficulties for Set 1, then Set 2, ...).
 * Within a Set, difficulties in enum order (Easy, Medium, Hard).
 */
function buildDifficultySlots(setCount: number): readonly AxisSlot[] {
  const slots: AxisSlot[] = []
  for (let set = 1; set <= setCount; set++) {
    for (const difficulty of DIFFICULTY_VALUES) {
      slots.push({
        setNumber: set as AxisSlot['setNumber'],
        axisValue: difficulty,
        targetCount: 0,
      })
    }
  }
  return slots
}

/**
 * Enumerate per-Set Pattern slots (§3.2).
 *
 * For each Set × each Pattern value (Positive/Negative/Best Answer/Scenario/
 * Sequence/Matching Concept), create an AxisSlot. targetCount is 0 (same
 * rationale as Difficulty — the AssemblyRequest does not carry per-axis
 * Pattern targets).
 */
function buildPatternSlots(setCount: number): readonly AxisSlot[] {
  const slots: AxisSlot[] = []
  for (let set = 1; set <= setCount; set++) {
    for (const pattern of PATTERN_VALUES) {
      slots.push({
        setNumber: set as AxisSlot['setNumber'],
        axisValue: pattern,
        targetCount: 0,
      })
    }
  }
  return slots
}

/**
 * Build per-Set LO slots WITH real target counts (§3.2).
 *
 * Unlike Difficulty/Pattern, the AssemblyRequest DOES carry LO targets
 * (loDistribution.targets — a percentage per LO). The Query Planner computes
 * the per-Set question count: `round(targets[LO] * perSet / 100)`.
 *
 * The LO values are enumerated in canonical order (LO1..LO4), matching the
 * loDistribution.targets keys.
 */
function buildLoSlots(
  request: AssemblyRequest,
  setCount: number,
  perSet: number
): readonly AxisSlot[] {
  const slots: AxisSlot[] = []
  for (let set = 1; set <= setCount; set++) {
    for (const lo of LO_VALUES) {
      const percent = request.loDistribution.targets[lo] ?? 0
      const targetCount = Math.round((percent * perSet) / 100)
      slots.push({
        setNumber: set as AxisSlot['setNumber'],
        axisValue: lo,
        targetCount,
      })
    }
  }
  return slots
}

/**
 * Translate DuplicatePreventionRules into DuplicateRuleMetadata (§3.2).
 *
 * Direct pass-through: { id, scope, level } → { ruleId, scope, level }.
 * The similarity thresholds (if present) are NOT carried in the Query Plan —
 * they're constraint metadata the Solver consumes directly from the
 * AssemblyRequest. The Query Plan records the RULE STRUCTURE so the
 * Generator knows the full L1–L5 surface.
 */
function buildDuplicateRules(request: AssemblyRequest): readonly DuplicateRuleMetadata[] {
  return request.duplicatePrevention.map((rule) => ({
    ruleId: rule.id,
    scope: rule.scope,
    level: rule.level,
  }))
}

/**
 * Pass through the exclusions list (§3.2).
 *
 * The AssemblyRequest's exclusions are runtime-only Question Codes to exclude.
 * The Query Plan carries them verbatim — the Exclusion Filter (first in
 * FILTER_EXECUTION_ORDER) will apply them. Sorted for deterministic output.
 */
function buildExclusions(request: AssemblyRequest): readonly string[] {
  return [...request.exclusions].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

// ─── Execution-order export (for downstream stages) ─────────────────────────
// The Query Planner does NOT decide filter order (§3.3). But it re-exports
// FILTER_EXECUTION_ORDER from contracts.ts so downstream stages import it
// from one place (the query-planner module), not from contracts directly.
// This is a convenience re-export, not a decision.

export { FILTER_EXECUTION_ORDER }
