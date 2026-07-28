/**
 * lib/engine/solver/runtime.ts
 * ----------------------------------------------------------------------------
 * Constraint Solver E-4C.1 — Allocation Runtime Initialization.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Constraint Solver Architecture v1.0 §3 (Runtime Pipeline), §3.2 (Stage
 *     Contracts — Stage 2 "Initialize Runtime State"), §13 (Solver State),
 *     §11 (Failure Handling), §18.5 (Statefulness Asymmetry).
 *   - Allocation Model Specification v1.0 §4.10 (Allocation State), §5 (Allocation
 *     States), §6.2 (Runtime Slot), §8.3 (Priority inherited from Ranking).
 *
 * WHAT THIS MODULE IS.
 *  - Stage 2 of the Solver runtime pipeline: Initialize Runtime State
 *    (Solver §3.2). It consumes an immutable RankedCandidateSet read-only and
 *    builds the empty Allocation Runtime State that later Solver stages
 *    (constraint validation, placement, conflict detection/resolution) mutate.
 *  - Instantiates Runtime Slots (one per Blueprint Slot, Allocation Model §6.2):
 *    each slot is in the `open` state with no occupancy, no reservations, no
 *    assignments, no conflicts (Allocation Model §5.1 — `open` is the initial
 *    state; §4.10 — Allocation State at init holds all Slots with empty
 *    occupancy).
 *  - Builds Candidate runtime state: for every Candidate appearing in the
 *    RankedCandidateSet, tracks which Slots it is under consideration for and
 *    the inherited Reservation priority (Solver §18.3 — priority is *inherited*
 *    from Ranking, never *computed* here).
 *  - Initializes Allocation progress tracking: pure counts derived from the
 *    empty state (zero assigned, zero reserved, zero rejected, zero conflicts).
 *  - Exposes read-only allocation helpers: pure getters over the runtime state.
 *    They never make a placement decision, never reserve, never assign — they
 *    only answer structural questions about the initialized state.
 *  - Performs runtime validation: Fatal guards on malformed input (Solver §3.2
 *     "Fatal on malformed input"; §11.1). This is NOT Blueprint-feasibility
 *     validation (Stage 3, out of scope) and NOT constraint satisfaction.
 *
 * WHAT THIS MODULE IS NOT.
 *  - Does NOT perform Constraint Satisfaction, Backtracking, or Search
 *    (Solver §3.1 Stages 3–6; later sessions).
 *  - Does NOT perform Conflict Detection, Conflict Resolution, or Replacement
 *    (Solver §3.1 Stages 4–6; Allocation Model §7, §9).
 *  - Does NOT make Allocation decisions: never reserves, assigns, releases,
 *    replaces, rejects, or locks a Slot (Allocation Model §5.2 transitions are
 *    owned by the Solver's placement stages, not by initialization).
 *  - Does NOT emit AllocatedCandidateSet (Solver §3.1 Stage 10; later session).
 *  - Does NOT provide a Runtime API, a Draft Builder, or any I/O.
 *  - Does NOT mutate the RankedCandidateSet (Solver §3.3 upstream-immutability;
 *    AP-1, AP-3). The consumed input is held read-only.
 *  - Does NOT query the Bank, read Question content, use time, randomness,
 *    React/UI/API code, or hidden mutable state.
 *
 * STATEFULNESS BOUNDARY (Solver §13, §18.5). The Solver is stateful *within a
 * run*. This module builds the initial Runtime State — it is a pure function of
 * the RankedCandidateSet (Allocation Model §3.4: "the AllocatedCandidateSet is a
 * pure function of the RankedCandidateSet... the state is reconstructed
 * identically on each run"). The returned state object is `readonly`; later
 * stages construct fresh state snapshots (Checkpoints/Rollbacks, §13.4) rather
 * than mutating this initialization output in place. No state persists across
 * runs (Solver AP-12).
 *
 * DETERMINISM (Solver §9). Same RankedCandidateSet → same Allocation Runtime
 * State. All iteration is over fixed, inspectable orderings: Slots are sorted by
 * a stable slot-id string (mirrors Ranking's stableSlotId convention); Candidates
 * are sorted by Question Code. No hash-map iteration leaks into the output.
 */

import type { BlueprintSlot } from '../generator/contracts'
import type {
  RankedCandidate,
  RankedCandidateSet,
  RankedSlot,
} from '../ranking/contracts'
import type { AllocationState } from './contracts'

// ═══════════════════════════════════════════════════════════════════════════
// 1. Runtime state contracts (Solver §13.2 Runtime State; Allocation §4.10)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The initial occupancy of a Runtime Slot at initialization (Allocation Model
 * §4.4 Occupancy; §6.2 Runtime Slot). At Stage 2 every Slot is `open` with no
 * occupant — Reservations and Assignments are born during the placement stages
 * (Solver §3.1 Stages 4–6), never at initialization.
 *
 * `reservedCandidateCode` / `assignedCandidateCode` are typed for structural
 * completeness of the Runtime Slot shape; at initialization they are always
 * `null`. Later placement stages will construct updated Runtime Slot snapshots.
 */
export interface SlotOccupancy {
  /** The current Allocation State of this Slot (Allocation Model §5.1). */
  readonly state: AllocationState
  /** The tentatively-held Candidate's Code, or null when not reserved. */
  readonly reservedCandidateCode: string | null
  /** The confirmed-placed Candidate's Code, or null when not assigned. */
  readonly assignedCandidateCode: string | null
}

/**
 * A Runtime Slot (Allocation Model §6.2): a Blueprint Slot wrapped with its
 * current Allocation State, occupancy, and per-Slot history.
 *
 * At initialization (Stage 2): state is `open`, occupancy is empty, and every
 * history list is empty. The history fields are present so the Runtime Slot
 * shape matches what later placement/conflict stages append to (Allocation Model
 * §6.2 "Tracks history (Reservations, Replacements, Conflicts)") — this module
 * only ever emits the empty form.
 *
 * IMMUTABLE: this is the *initial* snapshot. Later stages emit new snapshots
 * rather than mutating this one (Checkpoint/Rollback semantics, §13.4).
 */
export interface SlotRuntimeState {
  /** Stable slot id string (mirrors RankedSlot.slotId). */
  readonly slotId: string
  /** The immutable Blueprint Slot this Runtime Slot wraps (Allocation §6.1). */
  readonly slot: BlueprintSlot
  /** Which Candidates are under consideration for this Slot, by Code, in
   *  inherited-Ranking order (Solver §18.3). Empty when the RankedSlot had no
   *  candidates. Codes only — full records live on CandidateRuntimeState. */
  readonly candidateCodes: readonly string[]
  /** Current occupancy (Allocation Model §4.4). `open` + nulls at init. */
  readonly occupancy: SlotOccupancy
  /** Reservation history for this Slot (Allocation §8). Empty at init. */
  readonly reservationHistory: readonly ReservationRuntimeEntry[]
  /** Replacement history for this Slot (Allocation §9). Empty at init. */
  readonly replacementHistory: readonly ReplacementRuntimeEntry[]
  /** Conflicts currently involving this Slot (Allocation §7). Empty at init. */
  readonly conflicts: readonly ConflictRuntimeEntry[]
}

/**
 * Candidate runtime state (Solver §13.2 Runtime State tracks "all Slots,
 * occupancy, Reservations, Assignments"). Per-Candidate view: which Slots the
 * Candidate is under consideration for, and whether it has been assigned
 * anywhere. At initialization no Candidate is reserved or assigned — those are
 * placement-stage outcomes.
 *
 * `inheritedPrioritySlotIds` preserves the inherited Reservation priority per
 * Slot (Allocation Model §8.3): for each Slot this Candidate could fill, its
 * 1-based rank within that Slot's ordering. Priority is *inherited read-only
 * from Ranking* (Solver §18.3); this module never computes or alters it.
 */
export interface CandidateRuntimeState {
  /** Question Code (the immutable unit of exchange, Engine Foundation §4.1). */
  readonly candidateCode: string
  /** Slots this Candidate is under consideration for, by stable slot id. */
  readonly considerationSlotIds: readonly string[]
  /**
   * Inherited Reservation priority per Slot (Allocation Model §8.3, Solver
   * §18.3). Map slot id → 1-based rank within that Slot's RankedCandidate
   * ordering. Read-only from Ranking; never recomputed here.
   */
  readonly inheritedPrioritySlotIds: ReadonlyMap<string, number>
  /** The Slot this Candidate is currently reserved for, or null. Null at init. */
  readonly reservedSlotId: string | null
  /** The Slot this Candidate is currently assigned to, or null. Null at init. */
  readonly assignedSlotId: string | null
}

/**
 * Allocation progress tracking (Solver §13.2; derived counts over the Runtime
 * State). At initialization every count that reflects a placement-stage outcome
 * is zero; only the structural totals (slot/candidate counts) are non-zero.
 *
 * These are pure projections of the runtime state — never mutated directly.
 * Later stages recompute progress from updated snapshots.
 */
export interface AllocationProgress {
  /** Total Runtime Slots instantiated (one per Blueprint Slot). */
  readonly totalSlots: number
  /** Slots currently in the `open` state. Equals totalSlots at init. */
  readonly openSlotCount: number
  /** Slots currently `reserved`. Zero at init. */
  readonly reservedSlotCount: number
  /** Slots currently `allocated`. Zero at init. */
  readonly allocatedSlotCount: number
  /** Slots currently `locked`. Zero at init. */
  readonly lockedSlotCount: number
  /** Slots currently `rejected`. Zero at init. */
  readonly rejectedSlotCount: number
  /** Slots currently `released`. Zero at init. */
  readonly releasedSlotCount: number
  /** Distinct Candidates under consideration across all Slots. */
  readonly totalCandidates: number
  /** Candidates currently reserved somewhere. Zero at init. */
  readonly reservedCandidateCount: number
  /** Candidates currently assigned somewhere. Zero at init. */
  readonly assignedCandidateCount: number
  /** Conflicts currently recorded. Zero at init. */
  readonly unresolvedConflictCount: number
}

// ─── Per-Slot history entry shapes (empty at init; populated by later stages) ─
// These mirror the Allocation Model vocabulary spoken by the Solver. They are
// *runtime* (internal) shapes — distinct from the output `ConflictRecord` /
// `ReplacementRecord` in contracts.ts, which are the post-Finalize audit forms.
// At Stage 2 only the empty arrays are ever produced; the types are defined so
// the Runtime Slot shape is complete and later stages append entries of these
// shapes without redefining the Slot structure.

/**
 * One Reservation made on a Slot during solving (Allocation Model §8). Internal
 * runtime record; the AllocatedCandidateSet emits only Reservation *outcomes*
 * (Assignment or Release), never live Reservations (Allocation §8.1, AP-4).
 */
export interface ReservationRuntimeEntry {
  readonly candidateCode: string
  /** Inherited priority (1-based rank) at the moment of reservation. */
  readonly inheritedPriority: number
  readonly outcome: 'active' | 'promoted' | 'released'
  readonly reason: string
}

/**
 * One Replacement performed on a Slot (Allocation Model §9). Internal runtime
 * record; the output `ReplacementRecord` is the post-Finalize audit form.
 */
export interface ReplacementRuntimeEntry {
  readonly previousCode: string
  readonly newCode: string | null
  readonly reason: string
  readonly source: 'solver' | 'reviewer'
}

/**
 * One Conflict currently involving a Slot (Allocation Model §7). Internal
 * runtime record; the output `ConflictRecord` is the post-Finalize audit form.
 */
export interface ConflictRuntimeEntry {
  readonly candidateCode: string
  readonly constraint: string
  readonly type: 'hard' | 'soft' | 'dependency' | 'mutual_exclusion'
  readonly scope: 'within_set' | 'cross_set' | 'within_run'
  readonly resolution: 'resolved' | 'unresolved' | 'superseded'
  readonly participants: readonly string[]
  readonly evidence: string
}

/**
 * The Allocation Runtime State — Stage 2 output (Solver §3.2; §13.2 Runtime
 * State; Allocation Model §4.10). The complete initial snapshot of all Runtime
 * Slots, Candidate runtime state, and derived progress.
 *
 * This is the data later Solver stages (constraint validation, placement,
 * conflict detection/resolution, finalization) consume and evolve. It is NOT
 * the AllocatedCandidateSet (Stage 10) and carries no placement decisions.
 *
 * `rankedCandidateSet` is held read-only for traceability (Solver §3.3
 * upstream-immutability); it is never modified.
 */
export interface AllocationRuntimeState {
  /** Identity of the consumed RankedCandidateSet (read-only reference kept). */
  readonly rankedCandidateSet: RankedCandidateSet
  /** One Runtime Slot per Blueprint Slot, in stable slot-id order. */
  readonly slots: readonly SlotRuntimeState[]
  /** Per-Candidate runtime state, keyed by slot id for O(1) lookup. */
  readonly slotsById: ReadonlyMap<string, SlotRuntimeState>
  /** Per-Candidate runtime state, in stable Question-Code order. */
  readonly candidates: readonly CandidateRuntimeState[]
  /** Per-Candidate runtime state, keyed by candidate Code for O(1) lookup. */
  readonly candidatesByCode: ReadonlyMap<string, CandidateRuntimeState>
  /** Derived progress counts (pure projection of the state above). */
  readonly progress: AllocationProgress
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Public API — Allocation Runtime Initialization (Solver §3.2 Stage 2)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Initialize the Allocation Runtime State from an immutable RankedCandidateSet
 * (Solver §3.2 Stage 2 "Initialize Runtime State": "Instantiate Runtime Slots;
 * empty Allocation State"; Allocation Model §6.2).
 *
 * Every Runtime Slot starts `open` with empty occupancy and empty history.
 * Every Candidate starts unreserved and unassigned, carrying only the
 * consideration slots and inherited Reservation priority read from Ranking.
 *
 * Fatal guards (Solver §3.2 "Fatal on malformed input"; §11.1) reject structurally
 * malformed input *before* any state is built. This is NOT Blueprint-feasibility
 * validation (Stage 3) and NOT constraint satisfaction.
 *
 * @spec Constraint Solver Architecture v1.0 §3.2 (Stage 2), §13 (Solver State).
 * @spec Allocation Model Specification v1.0 §4.10, §5.1, §6.2, §8.3.
 */
export function initializeAllocationRuntime(
  rankedCandidateSet: RankedCandidateSet
): AllocationRuntimeState {
  assertWellFormedRankedCandidateSet(rankedCandidateSet)

  const slots = buildSlotRuntimeStates(rankedCandidateSet.slots)
  assertNoDuplicateSlotIds(slots)

  const slotsById = new Map<string, SlotRuntimeState>(slots.map((s) => [s.slotId, s]))
  const candidates = buildCandidateRuntimeStates(rankedCandidateSet.slots, slotsById)
  const candidatesByCode = new Map<string, CandidateRuntimeState>(
    candidates.map((c) => [c.candidateCode, c])
  )
  assertNoDuplicateCandidateCodes(candidates)
  assertNoCandidateAssignedToMultipleSlots(candidates)

  return {
    rankedCandidateSet,
    slots,
    slotsById,
    candidates,
    candidatesByCode,
    progress: computeProgress(slots, candidates),
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Read-only allocation helpers (Solver §13.2 — pure projections)
// ═══════════════════════════════════════════════════════════════════════════
// These answer structural questions about the runtime state. They NEVER make a
// placement decision, never reserve, never assign, never reject, never lock.
// They are pure functions of an immutable state snapshot.

/**
 * Look up a Runtime Slot by its stable slot id. Returns `undefined` when no such
 * slot exists (callers decide whether that is an error). Pure projection.
 */
export function getSlot(
  state: AllocationRuntimeState,
  slotId: string
): SlotRuntimeState | undefined {
  return state.slotsById.get(slotId)
}

/**
 * Look up Candidate runtime state by Question Code. Returns `undefined` when the
 * Candidate is not under consideration in any Slot. Pure projection.
 */
export function getCandidate(
  state: AllocationRuntimeState,
  candidateCode: string
): CandidateRuntimeState | undefined {
  return state.candidatesByCode.get(candidateCode)
}

/**
 * The Codes of all Candidates under consideration for a Slot, in inherited
 * Ranking order (Solver §18.3 — priority inherited read-only). Empty list when
 * the Slot is unknown or has no candidates. Pure projection.
 */
export function considerationOrder(
  state: AllocationRuntimeState,
  slotId: string
): readonly string[] {
  return state.slotsById.get(slotId)?.candidateCodes ?? EMPTY_STRING_LIST
}

/**
 * Whether a Candidate is under consideration for a Slot. Pure projection; makes
 * no feasibility judgement (that is constraint evaluation, Stage 3+, out of
 * scope here).
 */
export function isUnderConsideration(
  state: AllocationRuntimeState,
  candidateCode: string,
  slotId: string
): boolean {
  const candidate = state.candidatesByCode.get(candidateCode)
  if (candidate === undefined) return false
  return candidate.considerationSlotIds.includes(slotId)
}

/**
 * The inherited Reservation priority (1-based rank) of a Candidate within a
 * Slot's ordering, or `undefined` when the Candidate is not under consideration
 * for that Slot (Allocation Model §8.3; Solver §18.3). Priority is inherited
 * read-only from Ranking; never computed here.
 */
export function inheritedPriority(
  state: AllocationRuntimeState,
  candidateCode: string,
  slotId: string
): number | undefined {
  return state.candidatesByCode.get(candidateCode)?.inheritedPrioritySlotIds.get(slotId)
}

const EMPTY_STRING_LIST: readonly string[] = Object.freeze([] as const)

// ═══════════════════════════════════════════════════════════════════════════
// 4. Slot runtime state construction (Allocation Model §6.2)
// ═══════════════════════════════════════════════════════════════════════════

function buildSlotRuntimeStates(
  rankedSlots: readonly RankedSlot[]
): readonly SlotRuntimeState[] {
  return rankedSlots
    .map(toSlotRuntimeState)
    .sort((a, b) => compareStrings(a.slotId, b.slotId))
}

function toSlotRuntimeState(rankedSlot: RankedSlot): SlotRuntimeState {
  // Candidate Codes preserve the inherited Ranking order (Solver §18.3). The
  // RankedSlot is already deterministically ordered (Candidate Ranking §5.4);
  // we read it as-given, never re-sort by score.
  const candidateCodes = rankedSlot.rankedCandidates.map((c) => c.code)
  return {
    slotId: rankedSlot.slotId,
    slot: rankedSlot.slot,
    candidateCodes,
    occupancy: EMPTY_OCCUPANCY,
    reservationHistory: EMPTY_HISTORY,
    replacementHistory: EMPTY_HISTORY,
    conflicts: EMPTY_HISTORY,
  }
}

const EMPTY_OCCUPANCY: SlotOccupancy = Object.freeze({
  state: 'open',
  reservedCandidateCode: null,
  assignedCandidateCode: null,
}) as SlotOccupancy

const EMPTY_HISTORY: readonly never[] = Object.freeze([]) as readonly never[]

// ═══════════════════════════════════════════════════════════════════════════
// 5. Candidate runtime state construction (Solver §18.3 inherited priority)
// ═══════════════════════════════════════════════════════════════════════════

function buildCandidateRuntimeStates(
  rankedSlots: readonly RankedSlot[],
  slotsById: ReadonlyMap<string, SlotRuntimeState>
): readonly CandidateRuntimeState[] {
  // Accumulate per-Candidate consideration slots + inherited priorities across
  // all RankedSlots. A Candidate may be under consideration for several Slots
  // (Allocation Model §6.3: "A Candidate may be eligible for multiple Candidate
  // Slots"). Use a temporary mutable map; emit frozen immutable records.
  const byCode = new Map<
    string,
    { slotIds: string[]; priorities: Map<string, number> }
  >()

  for (const rankedSlot of rankedSlots) {
    // Only record consideration for slots that exist in the runtime (defensive —
    // the slot set is derived from the same rankedSlots, so this always holds).
    if (!slotsById.has(rankedSlot.slotId)) continue
    for (const candidate of rankedSlot.rankedCandidates) {
      let entry = byCode.get(candidate.code)
      if (entry === undefined) {
        entry = { slotIds: [], priorities: new Map() }
        byCode.set(candidate.code, entry)
      }
      entry.slotIds.push(rankedSlot.slotId)
      // Inherited priority: 1-based rank within this Slot's ordering (Solver
      // §18.3). Read-only from Ranking — never recomputed.
      entry.priorities.set(rankedSlot.slotId, candidate.rank)
    }
  }

  return [...byCode.entries()]
    .map(([code, entry]) => toCandidateRuntimeState(code, entry))
    .sort((a, b) => compareStrings(a.candidateCode, b.candidateCode))
}

function toCandidateRuntimeState(
  code: string,
  entry: { slotIds: string[]; priorities: Map<string, number> }
): CandidateRuntimeState {
  // Sort consideration slots by stable slot id so the list is order-invariant
  // w.r.t. RankedSlot iteration order (Determinism, Solver §9.3).
  const sortedSlotIds = [...entry.slotIds].sort(compareStrings)
  return {
    candidateCode: code,
    considerationSlotIds: Object.freeze(sortedSlotIds) as readonly string[],
    inheritedPrioritySlotIds: new Map(entry.priorities),
    reservedSlotId: null,
    assignedSlotId: null,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. Allocation progress tracking (Solver §13.2 — derived counts)
// ═══════════════════════════════════════════════════════════════════════════

function computeProgress(
  slots: readonly SlotRuntimeState[],
  candidates: readonly CandidateRuntimeState[]
): AllocationProgress {
  const byState = countByState(slots)
  return {
    totalSlots: slots.length,
    openSlotCount: byState.open,
    reservedSlotCount: byState.reserved,
    allocatedSlotCount: byState.allocated,
    lockedSlotCount: byState.locked,
    rejectedSlotCount: byState.rejected,
    releasedSlotCount: byState.released,
    totalCandidates: candidates.length,
    // All placement-stage outcome counts are zero at initialization (Slots are
    // open, no Candidate reserved/assigned, no conflicts recorded).
    reservedCandidateCount: 0,
    assignedCandidateCount: 0,
    unresolvedConflictCount: 0,
  }
}

function countByState(slots: readonly SlotRuntimeState[]): Record<AllocationState, number> {
  const counts: Record<AllocationState, number> = {
    open: 0,
    reserved: 0,
    allocated: 0,
    locked: 0,
    released: 0,
    rejected: 0,
    completed: 0,
  }
  for (const slot of slots) {
    counts[slot.occupancy.state] += 1
  }
  return counts
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. Runtime validation — Fatal guards (Solver §3.2, §11.1)
// ═══════════════════════════════════════════════════════════════════════════
// Stage 2 fails Fatal on *malformed input* (Solver §3.2). These guards check
// structural well-formedness of the RankedCandidateSet as consumed by the
// Solver. They do NOT validate Blueprint feasibility (Stage 3), do NOT evaluate
// constraints, and do NOT detect placement conflicts.

/**
 * Validate the RankedCandidateSet is well-formed for Solver consumption
 * (Solver §3.2 "Fatal on malformed input"; §11.1). Throws on the first
 * structural defect. Does not assess feasibility.
 */
function assertWellFormedRankedCandidateSet(rankedCandidateSet: RankedCandidateSet): void {
  if (rankedCandidateSet === null || typeof rankedCandidateSet !== 'object') {
    throw new Error('Fatal Allocation Runtime error: RankedCandidateSet is not an object')
  }
  if (rankedCandidateSet.identity === undefined) {
    throw new Error('Fatal Allocation Runtime error: RankedCandidateSet.identity is missing')
  }
  if (rankedCandidateSet.meta === undefined) {
    throw new Error('Fatal Allocation Runtime error: RankedCandidateSet.meta is missing')
  }
  // Version pinning (Allocation Model §16.7; Solver §11.1 version_mismatch).
  // The Solver speaks Allocation Model v1.0 exactly (Solver §0). A future
  // Ranking carrying an unsupported Allocation Model version is Fatal.
  assertSupportedAllocationModelVersion(rankedCandidateSet)
  if (!Array.isArray(rankedCandidateSet.slots)) {
    throw new Error('Fatal Allocation Runtime error: RankedCandidateSet.slots is not an array')
  }
  for (const rankedSlot of rankedCandidateSet.slots) {
    assertWellFormedRankedSlot(rankedSlot)
  }
}

function assertSupportedAllocationModelVersion(rankedCandidateSet: RankedCandidateSet): void {
  // The RankedCandidateSet carries scoring+ranking versions; the Allocation
  // Model version is fixed by the Solver contract at '1.0' (Solver §0, contracts
  // AllocatedCandidateSetIdentity.allocationModelVersion: '1.0'). We validate
  // the upstream spec versions the Solver pins are present and exact.
  const scoring = rankedCandidateSet.identity.scoringModelVersion
  if (scoring !== '1.0') {
    throw new Error(
      `Fatal Allocation Runtime error: unsupported Scoring Model version '${scoring}' (expected '1.0')`
    )
  }
  const rankingSpec = rankedCandidateSet.meta.specVersion
  if (rankingSpec !== '1.0') {
    throw new Error(
      `Fatal Allocation Runtime error: unsupported RankedCandidateSet spec version '${rankingSpec}' (expected '1.0')`
    )
  }
}

function assertWellFormedRankedSlot(rankedSlot: RankedSlot): void {
  if (rankedSlot === null || typeof rankedSlot !== 'object') {
    throw new Error('Fatal Allocation Runtime error: RankedSlot is not an object')
  }
  if (typeof rankedSlot.slotId !== 'string' || rankedSlot.slotId.length === 0) {
    throw new Error('Fatal Allocation Runtime error: RankedSlot.slotId is empty')
  }
  if (rankedSlot.slot === undefined) {
    throw new Error(
      `Fatal Allocation Runtime error: RankedSlot '${rankedSlot.slotId}' has no Blueprint slot`
    )
  }
  if (!Array.isArray(rankedSlot.rankedCandidates)) {
    throw new Error(
      `Fatal Allocation Runtime error: RankedSlot '${rankedSlot.slotId}' rankedCandidates is not an array`
    )
  }
  const seenRanks = new Set<number>()
  let lastRank = 0
  for (const candidate of rankedSlot.rankedCandidates) {
    assertWellFormedRankedCandidate(rankedSlot.slotId, candidate)
    // Ranks are 1-based and strictly increasing within a Slot (Candidate Ranking
    // §5.4 total order). A non-increasing or duplicate rank is malformed input.
    if (!Number.isInteger(candidate.rank) || candidate.rank < 1) {
      throw new Error(
        `Fatal Allocation Runtime error: RankedSlot '${rankedSlot.slotId}' has non-positive/non-integer rank ${candidate.rank} for ${candidate.code}`
      )
    }
    if (seenRanks.has(candidate.rank)) {
      throw new Error(
        `Fatal Allocation Runtime error: RankedSlot '${rankedSlot.slotId}' has duplicate rank ${candidate.rank}`
      )
    }
    if (candidate.rank <= lastRank) {
      throw new Error(
        `Fatal Allocation Runtime error: RankedSlot '${rankedSlot.slotId}' ranks are not strictly increasing at rank ${candidate.rank}`
      )
    }
    seenRanks.add(candidate.rank)
    lastRank = candidate.rank
  }
}

function assertWellFormedRankedCandidate(slotId: string, candidate: RankedCandidate): void {
  if (candidate === null || typeof candidate !== 'object') {
    throw new Error(
      `Fatal Allocation Runtime error: RankedCandidate in slot '${slotId}' is not an object`
    )
  }
  if (typeof candidate.code !== 'string' || candidate.code.length === 0) {
    throw new Error(
      `Fatal Allocation Runtime error: RankedCandidate in slot '${slotId}' has empty code`
    )
  }
  // The inherited Composite value must be finite and in [0,1] (Scoring Model);
  // it is consumed read-only later for placement reasoning. Malformed here =
  // malformed input, Fatal.
  const value = candidate.composite?.value
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(
      `Fatal Allocation Runtime error: RankedCandidate '${candidate.code}' in slot '${slotId}' has out-of-range composite value`
    )
  }
}

function assertNoDuplicateSlotIds(slots: readonly SlotRuntimeState[]): void {
  const seen = new Set<string>()
  for (const slot of slots) {
    if (seen.has(slot.slotId)) {
      throw new Error(
        `Fatal Allocation Runtime error: duplicate slot id '${slot.slotId}'`
      )
    }
    seen.add(slot.slotId)
  }
}

function assertNoDuplicateCandidateCodes(candidates: readonly CandidateRuntimeState[]): void {
  // Defensive: buildCandidateRuntimeStates keys by code, so duplicates cannot
  // arise unless the input itself is malformed. Guard loudly regardless.
  const seen = new Set<string>()
  for (const candidate of candidates) {
    if (seen.has(candidate.candidateCode)) {
      throw new Error(
        `Fatal Allocation Runtime error: duplicate Candidate code '${candidate.candidateCode}'`
      )
    }
    seen.add(candidate.candidateCode)
  }
}

function assertNoCandidateAssignedToMultipleSlots(
  _candidates: readonly CandidateRuntimeState[]
): void {
  // At initialization no Candidate is assigned anywhere, so this invariant
  // (Allocation Model §12.1 "Duplicate Allocation"; Solver §11.1
  // `duplicate_assignment`) is trivially satisfied. The guard exists as a
  // structural seam: later placement stages will re-check it on every snapshot.
  // No-op at Stage 2 by construction (assignedSlotId is always null here).
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. Deterministic helpers (Solver §9.3 Ordering pillar)
// ═══════════════════════════════════════════════════════════════════════════

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
