/**
 * lib/engine/solver/constraints.ts
 * ----------------------------------------------------------------------------
 * Constraint Solver E-4C.2 — Constraint Satisfaction.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Constraint Solver Architecture v1.0 §4 (Constraint Categories),
 *     §4.3 (Priority and Interaction), §5 (Constraint Evaluation Lifecycle),
 *     §8 (Feasibility Model), §11 (Failure Handling), §18.1 (Generator ceiling).
 *   - Allocation Model Specification v1.0 §5 (Allocation States), §7 (Conflict
 *     Model), §12.1 (Failure Modes), §12.2 (Never Fake Feasibility).
 *
 * WHAT THIS MODULE IS.
 *  - Stage 5 "Constraint Satisfaction" of the Solver evaluation lifecycle
 *    (Solver §5.1 / §5.2): a PURE, READ-ONLY evaluator over an
 *    AllocationRuntimeState snapshot. It applies each applicable constraint's
 *    check against the current occupancy/assignment state and determines the
 *    outcome per the Satisfaction vocabulary (Solver §5.2: satisfied / violated
 *    (Hard) / strained (Soft) / dependency-unmet).
 *  - Produces an immutable ConstraintEvaluationState: per-constraint status,
 *    diagnostics for violations, detected conflicts, and a feasibility verdict
 *    for the whole allocation (Solver §8.1).
 *  - Honors the fixed constraint priority (Solver §4.3): reviewer > hard > soft
 *    > future. No constraint is silently sacrificed — when two Hard constraints
 *    conflict that is surfaced as a Fatal diagnostic (Solver §4.3, §11.1).
 *
 * WHAT THIS MODULE IS NOT.
 *  - Does NOT modify allocations, reserve Candidates, replace Candidates,
 *    resolve conflicts, perform backtracking, or perform search (E-4C.2 mandate;
 *    those are later Solver stages). It returns a NEW immutable evaluation
 *    object; the input AllocationRuntimeState is never mutated (Solver §3.3
 *    upstream-immutability).
 *  - Does NOT emit AllocatedCandidateSet, provide a Runtime API, or build a Draft.
 *  - Does NOT invent constraint rule content, and does NOT report fake success
 *    for Blueprint constraints that have not been evaluated. Per Solver §4.2,
 *    constraint *content* (what the rules say) is owned by the Blueprint via
 *    the AssemblyRequest. The full AssemblyRequest does NOT propagate past the
 *    Generator — only the CandidateSet's derived metadata reaches the Solver.
 *    Blueprint rules (distribution tier floors/ceilings/sumPerSet/anchor,
 *    duplicate prevention L1–L5, coverage CR-1–CR-5, cross-set CR-3/L3, LO
 *    distribution) therefore cannot be authoritatively evaluated here: their
 *    rule declarations, enforcement levels, and numeric thresholds are not in
 *    the Runtime State. Reporting a satisfied/violated verdict for them would
 *    invent rule content (AP-9) and fake feasibility (Solver §8.5). This module
 *    evaluates ONLY allocation-validity constraints whose content is structural
 *    to the Runtime State (capacity, single-assignment, occupancy, eligibility).
 *
 * DETERMINISM (Solver §9). Same AllocationRuntimeState → same
 * ConstraintEvaluationState. All iteration is over fixed, inspectable orderings
 * (stable slot-id order, Question-Code order, fixed category/priority order).
 * No hash-map iteration leaks into the output. Pure function of its input.
 *
 * FAIL LOUD (Solver §11). Structural corruption in the input is Fatal: this
 * module throws rather than returning a fake verdict. Fatal conditions include:
 *  - a Candidate Assigned to two Slots (Allocation §12.1 Duplicate Allocation);
 *  - a Slot over capacity or with occupancy inconsistent with its state;
 *  - an Assigned Candidate whose record is missing from the CandidateSet
 *    (Allocation §12.1 / Solver §11.1 — never silently skipped);
 *  - a Runtime Slot in the `completed` state (Allocation §5.1 — `completed` is a
 *    post-Review terminal state owned by the Reviewer, unreachable during Solver
 *    evaluation; its presence is structural corruption).
 * Infeasibility (a Hard violation search may yet repair, or an unfilled Slot)
 * is NON-fatal and recorded in the returned state (Solver §11.2).
 */

import type { Candidate } from '../generator/contracts'
import type {
  AllocationRuntimeState,
  SlotRuntimeState,
} from './runtime'
import type {
  ConstraintCategory,
  ConstraintPriority,
  ConflictScope,
  ConflictType,
  SolverSeverity,
  SolverStage,
} from './contracts'

// ═══════════════════════════════════════════════════════════════════════════
// 1. Constraint identification (Solver §5.1 Discovery; §4.1 categories)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The set of constraints this evaluator can authoritatively check over the
 * Allocation Runtime State (Solver §5.1 Discovery). EXACT vocabulary — adding
 * an id is a Solver contract change.
 *
 * Each id names a constraint whose *content is present in the Runtime State* —
 * i.e. a constraint whose rule is structural to allocation validity, not a
 * Blueprint rule whose thresholds live in the AssemblyRequest:
 *  - `allocation_capacity`   — a Slot holds at most one Candidate (Allocation
 *                              Model §4.1 capacity).
 *  - `single_assignment`     — a Candidate is Assigned to at most one Slot
 *                              (Allocation §12.1 Duplicate Allocation).
 *  - `valid_occupancy`       — a Slot's occupancy is internally consistent
 *                              (state ↔ reserved/assigned codes).
 *  - `placement_eligibility` — an Assigned Candidate was under consideration
 *                              for its Slot (Solver §18.3 inherited
 *                              consideration set, read-only from Ranking).
 *
 * Blueprint constraint rules — distribution (tier floors/ceilings, sumPerSet,
 * anchor), duplicate prevention (L1–L5: scope/level/similarity thresholds),
 * coverage (CR-1–CR-5: enforcement level + binding), cross-set rules (CR-3, L3),
 * LO distribution — are owned by the Blueprint via the AssemblyRequest, which is
 * consumed by the Generator and does NOT propagate to the Solver (only
 * `assemblyRequestId` reaches the Runtime State). This evaluator therefore does
 * NOT report satisfied/violated verdicts for Blueprint rules: doing so would
 * invent rule content (Solver §4.2, AP-9) and fake feasibility (Solver §8.5).
 * Blueprint-rule evaluation is a later stage's responsibility once rule content
 * is wired into the Solver input.
 */
export type ConstraintId =
  | 'allocation_capacity'
  | 'single_assignment'
  | 'valid_occupancy'
  | 'placement_eligibility'

/**
 * The satisfaction outcome for one constraint check (Solver §5.2 Satisfaction).
 * EXACT vocabulary — the frozen Solver Architecture defines exactly these four
 * outcomes and no others. Do not invent additional satisfaction states.
 *
 * - 'satisfied'        — the constraint holds for the current state.
 * - 'violated'         — a Hard constraint is broken; blocks placement.
 * - 'strained'         — a Soft constraint is strained; warns, does not block.
 * - 'dependency_unmet' — a Dependency constraint's prerequisite is unmet.
 */
export type ConstraintSatisfaction =
  | 'satisfied'
  | 'violated'
  | 'strained'
  | 'dependency_unmet'

/**
 * The exhaustive set of ConstraintSatisfaction values (Solver §5.2). Exported as
 * a value (not just a type) so contract/runtime tests can assert vocabulary
 * stability without re-listing the union. Mirrors how the Solver contracts test
 * pins vocabularies.
 */
export const CONSTRAINT_SATISFACTION_VALUES: readonly ConstraintSatisfaction[] = [
  'satisfied',
  'violated',
  'strained',
  'dependency_unmet',
]

// ═══════════════════════════════════════════════════════════════════════════
// 2. Constraint evaluation records (Solver §5.2 Evaluation + Satisfaction)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * One evaluated constraint (Solver §5.2). The result of applying a constraint's
 * check against the current Allocation State. Immutable.
 */
export interface ConstraintEvaluation {
  /** Which constraint was evaluated (Solver §5.1 Discovery). */
  readonly constraintId: ConstraintId
  /** Conceptual category (Solver §4.1 taxonomy). */
  readonly category: ConstraintCategory
  /** Fixed priority tier (Solver §4.3). */
  readonly priority: ConstraintPriority
  /** Satisfaction outcome (Solver §5.2). */
  readonly satisfaction: ConstraintSatisfaction
  /** Enforcement severity implied by the satisfaction + category. */
  readonly severity: SolverSeverity
  /**
   * The set id (Allocation Group, Allocation Model §4.9) this evaluation is
   * scoped to, or null for run-wide checks. Codes/ids only — never objects.
   */
  readonly setScope: 1 | 2 | 3 | 4 | 5 | null
  /** Slot ids implicated when the check is slot-scoped; empty otherwise. */
  readonly slotIds: readonly string[]
  /** Candidate codes implicated; empty when none. */
  readonly candidateCodes: readonly string[]
  /** Plain-language evidence. Never empty when not 'satisfied'. */
  readonly evidence: string
}

/**
 * A constraint diagnostic surfacing a violation/strain (Solver §11.3 "Fail Loud":
 * category, location, severity, explanation, recommendation). Distinct from the
 * Solver's terminal `SolverDiagnostic` (contracts.ts), which is the post-Finalize
 * audit form. This is the in-search evaluation form.
 */
export interface ConstraintDiagnostic {
  readonly constraintId: ConstraintId
  readonly category: ConstraintCategory
  readonly priority: ConstraintPriority
  readonly severity: SolverSeverity
  readonly stage: SolverStage
  readonly setScope: 1 | 2 | 3 | 4 | 5 | null
  readonly slotId: string | null
  readonly candidateCode: string | null
  readonly explanation: string
  readonly recommendation: string
}

/**
 * One conflict detected by constraint evaluation (Allocation Model §7). Internal
 * runtime form; the output `ConflictRecord` (contracts.ts) is the post-Finalize
 * audit form built by later stages. Carries the participants, the constraint at
 * issue, the type/scope, and resolution status (always 'unresolved' here —
 * Conflict Resolution is a later stage, Solver §7).
 */
export interface ConstraintConflict {
  readonly constraintId: ConstraintId
  readonly candidateCode: string
  readonly constraint: string
  readonly type: ConflictType
  readonly scope: ConflictScope
  readonly resolution: 'unresolved'
  readonly participants: readonly string[]
  readonly evidence: string
}

/**
 * Remaining-capacity tracking (Solver §13.2; Allocation Model §4.1 capacity).
 * Per-Slot, how many more Candidates may be placed. Capacity is 1 per Slot in
 * Blueprint v3.0 (Allocation Model §4.1: "typically 1 Question per slot").
 */
export interface SlotCapacity {
  readonly slotId: string
  /** Maximum Candidates the Slot can hold (1 in v1.0). */
  readonly capacity: number
  /** Candidates currently occupying the Slot (0 or 1). */
  readonly occupied: number
  /** capacity - occupied. Zero when the Slot is full. */
  readonly remaining: number
}

/**
 * Allocation-validity tracking (Allocation Model §5.2; §12.1). The aggregate
 * structural validity of the current occupancy. Fatal corruption (duplicate
 * assignment, capacity overflow) is thrown before this record is built; this
 * record captures the non-Fatal validity facts later stages consume.
 */
export interface AllocationValidity {
  /** Total Slots in the allocation. */
  readonly totalSlots: number
  /** Slots whose occupancy is consistent and within capacity. */
  readonly validSlotCount: number
  /** Slots currently filled (reserved or allocated) — i.e. occupied > 0. */
  readonly filledSlotCount: number
  /** Slots currently open (unfilled). */
  readonly openSlotCount: number
  /** Distinct Candidates assigned (single-assignment holds by construction). */
  readonly assignedCandidateCount: number
  /** True iff every Slot is within capacity and occupancy is consistent. */
  readonly allSlotsValid: boolean
}

/**
 * Feasibility tracking for the current snapshot (Solver §8.1). The verdict is
 * derived from the constraint evaluations: any Hard violation that the Solver
 * could still repair by re-placement is 'infeasible_so_far' (search continues);
 * structural impossibility is Fatal (thrown). The terminal 'feasible' /
 * 'partially_feasible' verdicts are produced by the Finalize stage, not here —
 * this module reports the *current* feasibility state of the snapshot.
 */
export interface FeasibilityTracking {
  /** Count of Hard constraints currently violated in this snapshot. */
  readonly hardViolationCount: number
  /** Count of Soft constraints currently strained. */
  readonly softStrainCount: number
  /** Count of Dependency constraints currently unmet. */
  readonly unmetDependencyCount: number
  /** True iff no Hard constraint is violated in this snapshot. */
  readonly noHardViolations: boolean
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Constraint Evaluation State — Stage 5 output (Solver §5, §8)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The Constraint Evaluation State — E-4C.2 output. An immutable, pure projection
 * of constraint satisfaction over one AllocationRuntimeState snapshot.
 *
 * Contains ONLY the constraint-evaluation data later Solver stages (conflict
 * detection, conflict resolution, finalization) consume. Does NOT contain
 * placement decisions, replacements, or AllocatedCandidateSet fields.
 *
 * The consumed `runtimeState` is held read-only for traceability; it is never
 * modified by this module (the input reference is carried unchanged).
 */
export interface ConstraintEvaluationState {
  /** The Runtime State this evaluation was computed over (read-only). */
  readonly runtimeState: AllocationRuntimeState
  /** One evaluation per applicable constraint, in deterministic order. */
  readonly evaluations: readonly ConstraintEvaluation[]
  /** Diagnostics for every non-satisfied evaluation (violations/strains/etc). */
  readonly diagnostics: readonly ConstraintDiagnostic[]
  /** Conflicts materialized from Hard violations (Allocation Model §7). */
  readonly conflicts: readonly ConstraintConflict[]
  /** Per-Slot remaining capacity (Solver §13.2; Allocation §4.1). */
  readonly capacities: readonly SlotCapacity[]
  /** Aggregate allocation validity (Allocation §5.2, §12.1). */
  readonly validity: AllocationValidity
  /** Feasibility tracking for this snapshot (Solver §8). */
  readonly feasibility: FeasibilityTracking
  /** Evaluations keyed by constraint id for O(1) lookup. */
  readonly evaluationsById: ReadonlyMap<ConstraintId, ConstraintEvaluation>
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Public API — Constraint Satisfaction (Solver §5)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Evaluate constraint satisfaction over an AllocationRuntimeState snapshot
 * (Solver §5.1 Evaluation + §5.2 Satisfaction). Pure and read-only: returns a
 * NEW immutable ConstraintEvaluationState; the input is never mutated.
 *
 * Fatal guards throw on structural corruption (Allocation Model §12.1 Duplicate
 * Allocation; Solver §11.1) before any evaluation record is built. Non-fatal
 * infeasibility (a Hard violation that search may yet repair, or an unfilled
 * Slot) is recorded in the returned state, not thrown.
 *
 * @spec Constraint Solver Architecture v1.0 §4, §5, §8, §11, §18.1.
 * @spec Allocation Model Specification v1.0 §4.1, §5, §7, §12.
 */
export function evaluateConstraints(
  runtimeState: AllocationRuntimeState
): ConstraintEvaluationState {
  assertStructurallySoundRuntimeState(runtimeState)

  const candidateByCode = indexCandidates(runtimeState)
  const assignments = collectAssignments(runtimeState, candidateByCode)

  // Allocation-validity checks (Fatal on corruption; satisfied/eval record otherwise).
  // These are the only constraints whose content is structural to the Runtime
  // State. Blueprint rules (distribution, duplicate prevention, coverage,
  // cross-set, LO) are NOT evaluated here — their content is unreachable and
  // reporting a verdict would fake feasibility (Solver §8.5, AP-9).
  const capacityEvals = evaluateCapacity(runtimeState)
  const singleAssignmentEvals = evaluateSingleAssignment(assignments)
  const validOccupancyEvals = evaluateValidOccupancy(runtimeState)
  const eligibilityEvals = evaluatePlacementEligibility(runtimeState, assignments)

  const evaluations = collectEvaluations([
    capacityEvals,
    singleAssignmentEvals,
    validOccupancyEvals,
    eligibilityEvals,
  ])

  const diagnostics = buildDiagnostics(evaluations)
  const conflicts = buildConflicts(evaluations)
  const capacities = computeCapacities(runtimeState)
  const validity = computeValidity(runtimeState, capacityEvals, validOccupancyEvals)
  const feasibility = computeFeasibility(evaluations)

  return {
    runtimeState,
    evaluations,
    diagnostics,
    conflicts,
    capacities,
    validity,
    feasibility,
    evaluationsById: new Map(evaluations.map((e) => [e.constraintId, e])),
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Read-only constraint helpers (Solver §13.2 — pure projections)
// ═══════════════════════════════════════════════════════════════════════════
// Pure getters over a ConstraintEvaluationState. They never re-evaluate, never
// mutate, never make a placement decision.

/**
 * Look up the evaluation for one constraint id. Returns `undefined` when the
 * constraint was not applicable to this snapshot. Pure projection.
 */
export function getEvaluation(
  state: ConstraintEvaluationState,
  constraintId: ConstraintId
): ConstraintEvaluation | undefined {
  return state.evaluationsById.get(constraintId)
}

/**
 * Whether a specific constraint is currently satisfied. Returns `false` for any
 * non-'satisfied' outcome. Pure projection.
 */
export function isSatisfied(
  state: ConstraintEvaluationState,
  constraintId: ConstraintId
): boolean {
  return state.evaluationsById.get(constraintId)?.satisfaction === 'satisfied'
}

/**
 * Remaining capacity for a Slot (how many more Candidates may be placed).
 * Returns `undefined` when the Slot is unknown. Pure projection.
 */
export function remainingCapacity(
  state: ConstraintEvaluationState,
  slotId: string
): number | undefined {
  return state.capacities.find((c) => c.slotId === slotId)?.remaining
}

/**
 * All Hard violations recorded against the snapshot, in deterministic order.
 * Pure projection (Solver §8.1 feasibility input).
 */
export function hardViolations(
  state: ConstraintEvaluationState
): readonly ConstraintEvaluation[] {
  return state.evaluations.filter((e) => e.satisfaction === 'violated')
}

/**
 * Whether the snapshot has any Hard violation. Pure projection; makes no
 * judgment about whether search can repair it (that is Conflict Resolution).
 */
export function hasHardViolation(state: ConstraintEvaluationState): boolean {
  return state.feasibility.hardViolationCount > 0
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. Assignment collection (read-only projection of the Runtime State)
// ═══════════════════════════════════════════════════════════════════════════

/** One (Candidate, Slot, Set) placement drawn read-only from the Runtime State. */
interface Assignment {
  readonly candidateCode: string
  readonly slotId: string
  readonly setNumber: 1 | 2 | 3 | 4 | 5
  readonly candidate: Candidate
}

function indexCandidates(
  runtimeState: AllocationRuntimeState
): ReadonlyMap<string, Candidate> {
  // The Runtime State carries the RankedCandidateSet read-only (runtime.ts).
  // The full Candidate records (metadata: tier/topic/difficulty/type) live on
  // the CandidateSet. Index them by Question Code for O(1) lookup.
  const map = new Map<string, Candidate>()
  for (const candidate of runtimeState.rankedCandidateSet.candidateSet.candidates) {
    map.set(candidate.identity.questionCode, candidate)
  }
  return map
}

function collectAssignments(
  runtimeState: AllocationRuntimeState,
  candidateByCode: ReadonlyMap<string, Candidate>
): readonly Assignment[] {
  const assignments: Assignment[] = []
  for (const slot of runtimeState.slots) {
    // A Slot is "occupied by an assignment" when its occupancy state is
    // 'allocated' or 'locked' AND it carries an assignedCandidateCode. Reserved
    // slots hold a tentative occupant, not an assignment (Allocation §8.1).
    const code = slot.occupancy.assignedCandidateCode
    if (!isAssignmentState(slot.occupancy.state) || code === null) continue
    const candidate = candidateByCode.get(code)
    // An Assigned Candidate whose record is missing from the CandidateSet is
    // structural corruption (Allocation §12.1; Solver §11.1). Fail loud — never
    // silently skip, which would let a phantom assignment pass evaluation.
    if (candidate === undefined) {
      throw new Error(
        `Fatal Constraint Satisfaction error: assigned Candidate ${code} in Slot ${slot.slotId} is missing from the CandidateSet.`
      )
    }
    assignments.push({
      candidateCode: code,
      slotId: slot.slotId,
      setNumber: slot.slot.setNumber,
      candidate,
    })
  }
  return assignments
}

function isAssignmentState(state: string): boolean {
  return state === 'allocated' || state === 'locked'
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. Constraint evaluators (Solver §5.2)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Allocation capacity: each Slot holds at most one Candidate (Allocation Model
 * §4.1). At the data-structure level a SlotRuntimeState tracks a single
 * occupant; a capacity overflow is structural corruption and is caught by the
 * soundness guard (Fatal). This evaluator records the capacity fact for every
 * Slot as 'satisfied' (the guard already threw on overflow).
 */
function evaluateCapacity(runtimeState: AllocationRuntimeState): readonly ConstraintEvaluation[] {
  return runtimeState.slots.map((slot) => ({
    constraintId: 'allocation_capacity' as const,
    category: 'hard' as const,
    priority: 'hard' as const,
    satisfaction: 'satisfied' as const,
    severity: 'Non-fatal' as const,
    setScope: slot.slot.setNumber,
    slotIds: [slot.slotId],
    candidateCodes: occupiedCandidateCodes(slot),
    evidence: `Slot ${slot.slotId} within capacity (1).`,
  }))
}

/**
 * Single-assignment: a Candidate is Assigned to at most one Slot (Allocation
 * Model §12.1 Duplicate Allocation). Fatal corruption is caught by the soundness
 * guard; this evaluator confirms the invariant per assigned Candidate.
 */
function evaluateSingleAssignment(assignments: readonly Assignment[]): readonly ConstraintEvaluation[] {
  const byCode = new Map<string, Assignment[]>()
  for (const a of assignments) {
    const list = byCode.get(a.candidateCode) ?? []
    list.push(a)
    byCode.set(a.candidateCode, list)
  }
  return [...byCode.entries()]
    .sort(([a], [b]) => compareStrings(a, b))
    .map(([code, list]) => ({
      constraintId: 'single_assignment' as const,
      category: 'hard' as const,
      priority: 'hard' as const,
      // The soundness guard already threw on >1 assignment, so this is always
      // 'satisfied' here; the record exists for audit completeness.
      satisfaction: 'satisfied' as const,
      severity: 'Non-fatal' as const,
      setScope: list[0]!.setNumber,
      slotIds: list.map((a) => a.slotId),
      candidateCodes: [code],
      evidence: `Candidate ${code} assigned to exactly one Slot (${list[0]!.slotId}).`,
    }))
}

/**
 * Valid occupancy: a Slot's occupancy fields are internally consistent with its
 * state (Allocation Model §5.1). Reserved ⇒ reservedCandidateCode set &
 * assignedCandidateCode null; Assigned (allocated/locked) ⇒ assignedCandidateCode
 * set & reservedCandidateCode null; Open ⇒ both null. Inconsistency is Fatal
 * (caught by the soundness guard); this evaluator records consistency per Slot.
 */
function evaluateValidOccupancy(runtimeState: AllocationRuntimeState): readonly ConstraintEvaluation[] {
  return runtimeState.slots.map((slot) => {
    const occ = slot.occupancy
    return {
      constraintId: 'valid_occupancy' as const,
      category: 'hard' as const,
      priority: 'hard' as const,
      satisfaction: 'satisfied' as const,
      severity: 'Non-fatal' as const,
      setScope: slot.slot.setNumber,
      slotIds: [slot.slotId],
      candidateCodes: occupiedCandidateCodes(slot),
      evidence: `Slot ${slot.slotId} occupancy consistent with state '${occ.state}'.`,
    }
  })
}

/**
 * Placement eligibility: an Assigned Candidate must have been under consideration
 * for its Slot (Solver §18.3 — inherited consideration set read-only from
 * Ranking). Assigning a Candidate to a Slot it was never considered for is a
 * Hard violation (would defeat the RankedCandidateSet's authority).
 */
function evaluatePlacementEligibility(
  runtimeState: AllocationRuntimeState,
  assignments: readonly Assignment[]
): readonly ConstraintEvaluation[] {
  return assignments.map((a) => {
    const slot = runtimeState.slotsById.get(a.slotId)
    const eligible = slot !== undefined && slot.candidateCodes.includes(a.candidateCode)
    return {
      constraintId: 'placement_eligibility' as const,
      category: 'hard' as const,
      priority: 'hard' as const,
      satisfaction: (eligible ? 'satisfied' : 'violated') as ConstraintSatisfaction,
      severity: (eligible ? 'Non-fatal' : 'Fatal') as SolverSeverity,
      setScope: a.setNumber,
      slotIds: [a.slotId],
      candidateCodes: [a.candidateCode],
      evidence: eligible
        ? `Candidate ${a.candidateCode} was under consideration for Slot ${a.slotId}.`
        : `Candidate ${a.candidateCode} was NOT under consideration for Slot ${a.slotId}.`,
    }
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. Derived projections: diagnostics, conflicts, capacities, validity, feasibility
// ═══════════════════════════════════════════════════════════════════════════

function collectEvaluations(
  groups: readonly (readonly ConstraintEvaluation[])[]
): readonly ConstraintEvaluation[] {
  // Flatten in fixed group order, then sort within by (priority, constraintId,
  // first slotId) for deterministic, inspectable output (Solver §9.3 Ordering).
  const flat = groups.flat()
  return [...flat].sort(compareEvaluations)
}

function compareEvaluations(a: ConstraintEvaluation, b: ConstraintEvaluation): number {
  return (
    comparePriority(a.priority, b.priority) ||
    compareStrings(a.constraintId, b.constraintId) ||
    compareStrings(a.slotIds[0] ?? '', b.slotIds[0] ?? '') ||
    compareStrings(a.candidateCodes[0] ?? '', b.candidateCodes[0] ?? '')
  )
}

function buildDiagnostics(
  evaluations: readonly ConstraintEvaluation[]
): readonly ConstraintDiagnostic[] {
  const diagnostics: ConstraintDiagnostic[] = []
  for (const e of evaluations) {
    if (e.satisfaction === 'satisfied') continue
    diagnostics.push({
      constraintId: e.constraintId,
      category: e.category,
      priority: e.priority,
      severity: e.severity,
      stage: 'conflict_detection',
      setScope: e.setScope,
      slotId: e.slotIds[0] ?? null,
      candidateCode: e.candidateCodes[0] ?? null,
      explanation: e.evidence,
      recommendation: recommendationFor(e),
    })
  }
  return diagnostics
}

function recommendationFor(e: ConstraintEvaluation): string {
  switch (e.constraintId) {
    case 'placement_eligibility':
      return 'Replace the Candidate with one under consideration for this Slot, or move it to an eligible Slot.'
    case 'single_assignment':
    case 'valid_occupancy':
    case 'allocation_capacity':
      return 'Restore consistent occupancy; this is structural corruption that should not occur.'
    default:
      return 'Review the constraint evaluation evidence.'
  }
}

function buildConflicts(
  evaluations: readonly ConstraintEvaluation[]
): readonly ConstraintConflict[] {
  // All constraints evaluated here are allocation-validity constraints: their
  // conflicts are within-run scope (Allocation §7.3) and 'hard' type (the only
  // violation-producing constraint, placement_eligibility, is a Hard rule).
  // Conflict Resolution is a later stage, so resolution is always 'unresolved'.
  const conflicts: ConstraintConflict[] = []
  for (const e of evaluations) {
    if (e.satisfaction !== 'violated') continue
    const participants = e.candidateCodes
    for (const code of participants) {
      conflicts.push({
        constraintId: e.constraintId,
        candidateCode: code,
        constraint: e.constraintId,
        type: 'hard',
        scope: 'within_run',
        resolution: 'unresolved', // Conflict Resolution is a later stage (Solver §7).
        participants,
        evidence: e.evidence,
      })
    }
  }
  // Deduplicate by (constraintId, candidateCode) deterministically.
  const seen = new Set<string>()
  const unique: ConstraintConflict[] = []
  for (const c of conflicts.sort((a, b) =>
    compareStrings(`${a.constraintId}|${a.candidateCode}`, `${b.constraintId}|${b.candidateCode}`)
  )) {
    const key = `${c.constraintId}|${c.candidateCode}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(c)
  }
  return unique
}

function computeCapacities(runtimeState: AllocationRuntimeState): readonly SlotCapacity[] {
  return runtimeState.slots.map((slot) => {
    const occupied = occupiedCandidateCodes(slot).length
    return {
      slotId: slot.slotId,
      capacity: 1, // Allocation Model §4.1: capacity 1 in v1.0.
      occupied,
      remaining: Math.max(0, 1 - occupied),
    }
  })
}

function computeValidity(
  runtimeState: AllocationRuntimeState,
  capacityEvals: readonly ConstraintEvaluation[],
  occupancyEvals: readonly ConstraintEvaluation[]
): AllocationValidity {
  const totalSlots = runtimeState.slots.length
  // Capacity and occupancy evaluations are each 1:1 with Slots and, after the
  // soundness guard, are always 'satisfied' (Fatal corruption already threw).
  // A Slot counts as valid iff BOTH its evaluations are satisfied. Because the
  // evaluator order matches runtimeState.slots order, the two arrays are
  // positionally aligned; pair them to count valid Slots deterministically.
  const validSlotCount = capacityEvals.reduce((count, capEval, index) => {
    const occEval = occupancyEvals[index]
    const bothSatisfied =
      capEval.satisfaction === 'satisfied' && occEval?.satisfaction === 'satisfied'
    return count + (bothSatisfied ? 1 : 0)
  }, 0)
  const filledSlotCount = runtimeState.slots.filter((s) => occupiedCandidateCodes(s).length > 0).length
  const openSlotCount = totalSlots - filledSlotCount
  const assignedCandidateCount = new Set(
    runtimeState.slots
      .filter((s) => isAssignmentState(s.occupancy.state) && s.occupancy.assignedCandidateCode !== null)
      .map((s) => s.occupancy.assignedCandidateCode as string)
  ).size
  return {
    totalSlots,
    validSlotCount,
    filledSlotCount,
    openSlotCount,
    assignedCandidateCount,
    allSlotsValid: validSlotCount === totalSlots,
  }
}

function computeFeasibility(evaluations: readonly ConstraintEvaluation[]): FeasibilityTracking {
  let hardViolationCount = 0
  let softStrainCount = 0
  let unmetDependencyCount = 0
  for (const e of evaluations) {
    if (e.satisfaction === 'violated') hardViolationCount++
    else if (e.satisfaction === 'strained') softStrainCount++
    else if (e.satisfaction === 'dependency_unmet') unmetDependencyCount++
  }
  return {
    hardViolationCount,
    softStrainCount,
    unmetDependencyCount,
    noHardViolations: hardViolationCount === 0,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. Runtime validation — Fatal guards (Solver §11.1; Allocation §12.1)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate the Runtime State is structurally sound for constraint evaluation
 * (Solver §11.1; Allocation Model §12.1). Throws Fatal on the first structural
 * defect. Does NOT assess feasibility. Fatal conditions:
 *  - a Runtime Slot in the `completed` state (Allocation §5.1 — post-Review
 *    terminal; unreachable during Solver evaluation);
 *  - a Candidate Assigned to two Slots (Allocation §12.1 Duplicate Allocation);
 *  - a Slot over capacity (Allocation §4.1);
 *  - a Slot whose occupancy contradicts its state (Allocation §5.1).
 */
function assertStructurallySoundRuntimeState(runtimeState: AllocationRuntimeState): void {
  // (a) No Runtime Slot may be in the `completed` state (Allocation §5.1).
  //     `completed` is a post-Review terminal state owned by the Reviewer
  //     (reachable only via `Locked → Completed`). It cannot exist during
  //     Solver evaluation; its presence is structural corruption.
  for (const slot of runtimeState.slots) {
    if (slot.occupancy.state === 'completed') {
      throw new Error(
        `Fatal Constraint Satisfaction error: Slot ${slot.slotId} is in the 'completed' state, which is a post-Review terminal state unreachable during Solver evaluation.`
      )
    }
  }

  // (b) No Candidate Assigned to two Slots (Allocation §12.1 Duplicate Allocation;
  //     Solver §11.1 duplicate_assignment).
  const assignedSlotsByCandidate = new Map<string, string[]>()
  for (const slot of runtimeState.slots) {
    const code = slot.occupancy.assignedCandidateCode
    if (isAssignmentState(slot.occupancy.state) && code !== null) {
      const list = assignedSlotsByCandidate.get(code) ?? []
      list.push(slot.slotId)
      assignedSlotsByCandidate.set(code, list)
    }
  }
  for (const [code, slots] of assignedSlotsByCandidate) {
    if (slots.length > 1) {
      throw new Error(
        `Fatal Constraint Satisfaction error: Candidate ${code} assigned to multiple Slots (${slots
          .sort(compareStrings)
          .join(', ')}).`
      )
    }
  }

  // (c) No Slot over capacity (Allocation §4.1; Solver §11.1 corrupted_allocation).
  for (const slot of runtimeState.slots) {
    const occupants = occupiedCandidateCodes(slot)
    if (occupants.length > 1) {
      throw new Error(
        `Fatal Constraint Satisfaction error: Slot ${slot.slotId} over capacity (${occupants.length} > 1).`
      )
    }
  }

  // (d) Occupancy consistent with state (Allocation §5.1; Solver §11.1
  //     invalid_runtime_state).
  for (const slot of runtimeState.slots) {
    assertOccupancyConsistent(slot)
  }
}

function assertOccupancyConsistent(slot: SlotRuntimeState): void {
  const { state, reservedCandidateCode, assignedCandidateCode } = slot.occupancy
  const reserved = state === 'reserved'
  const assigned = isAssignmentState(state)
  const open = state === 'open' || state === 'released' || state === 'rejected'
  if (open && (reservedCandidateCode !== null || assignedCandidateCode !== null)) {
    throw new Error(
      `Fatal Constraint Satisfaction error: Slot ${slot.slotId} state '${state}' cannot carry an occupant.`
    )
  }
  if (reserved && (reservedCandidateCode === null || assignedCandidateCode !== null)) {
    throw new Error(
      `Fatal Constraint Satisfaction error: Slot ${slot.slotId} state 'reserved' requires a reserved occupant.`
    )
  }
  if (assigned && (assignedCandidateCode === null || reservedCandidateCode !== null)) {
    throw new Error(
      `Fatal Constraint Satisfaction error: Slot ${slot.slotId} state '${state}' requires an assigned occupant.`
    )
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 10. Deterministic helpers (Solver §9.3 Ordering pillar)
// ═══════════════════════════════════════════════════════════════════════════

function occupiedCandidateCodes(slot: SlotRuntimeState): readonly string[] {
  const codes: string[] = []
  if (slot.occupancy.reservedCandidateCode !== null) codes.push(slot.occupancy.reservedCandidateCode)
  if (slot.occupancy.assignedCandidateCode !== null) codes.push(slot.occupancy.assignedCandidateCode)
  return codes
}

function comparePriority(a: ConstraintPriority, b: ConstraintPriority): number {
  return priorityOrder(a) - priorityOrder(b)
}

function priorityOrder(p: ConstraintPriority): number {
  // Solver §4.3 fixed order: reviewer > hard > soft > future. Lower ordinal =
  // higher priority, so sort ascending.
  switch (p) {
    case 'reviewer':
      return 0
    case 'hard':
      return 1
    case 'soft':
      return 2
    case 'future':
      return 3
  }
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
