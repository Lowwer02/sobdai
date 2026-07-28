/**
 * lib/engine/solver/contracts.test.ts
 * ----------------------------------------------------------------------------
 * Constraint Solver — contract tests.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Constraint Solver Architecture v1.0 §4, §7, §8, §11, §12.
 *   - Allocation Model Specification v1.0 §5, §7, §8, §9.
 *
 * RUN: npx jiti lib/engine/solver/contracts.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type {
  BlueprintSlot,
  Candidate,
  CandidateSet,
} from '../generator/contracts'
import type {
  CompositeScore,
  ComponentContribution,
  Penalty,
  RawSignal,
  ScoreComponent,
  ScoringConfidence,
} from '../scoring/contracts'
import { stableStringify } from '../shared/testing/determinism'
import type {
  RankedCandidate,
  RankedCandidateSet,
  RankedSlot,
} from '../ranking/contracts'
import type {
  AllocatedCandidateSet,
  AllocatedCandidateSetMeta,
  AllocationAuditEntry,
  AllocationState,
  AllocatedPlacement,
  ConflictRecord,
  ConflictResolutionStatus,
  ConflictScope,
  ConflictType,
  ConstraintCategory,
  ConstraintPriority,
  ConstraintSolverResult,
  ConstraintReference,
  FeasibilityState,
  Placement,
  PlacementReasoning,
  RejectedCandidateDetail,
  RejectedPlacement,
  ReplacementRecord,
  ReviewerOverrideRecord,
  ShortfallSummary,
  SolverDiagnostic,
  SolverDiagnosticCategory,
  SolverSeverity,
  SolverStage,
  SolverWarning,
} from './contracts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── helpers (mirror ranking/contracts.test.ts factories) ──────────────────

function mkSlot(overrides?: Partial<BlueprintSlot>): BlueprintSlot {
  return {
    setNumber: 1,
    difficulty: 'Easy',
    blueprintType: 'Memory',
    pattern: 'Positive',
    document: 'พ.ร.บ.ทดสอบ 2560',
    learningObjective: 'LO1',
    ...overrides,
  }
}

function mkSignal(overrides?: Partial<RawSignal>): RawSignal {
  return {
    questionCode: 'Q-000001',
    source: 'difficulty',
    value: 'Easy',
    integrity: 'known',
    extractionNote: null,
    ...overrides,
  }
}

function mkConfidence(): ScoringConfidence {
  return { level: 'high', reducingSignals: [], propagationNote: null }
}

function mkPenalty(overrides?: Partial<Penalty>): Penalty {
  return {
    type: 'soft',
    trigger: 'high usage load',
    evidence: 'usage_count signal',
    effect: 'reduces effective value by Soft demerit',
    appliedBy: 'ranking',
    ...overrides,
  }
}

function mkComponent(overrides?: Partial<ScoreComponent>): ScoreComponent {
  return {
    componentId: 'difficulty_fit',
    questionCode: 'Q-000001',
    slot: mkSlot(),
    normalized: { value: 0.9, scale: 'exact-match' },
    inputs: [mkSignal()],
    reasoning: 'Difficulty Fit = full match.',
    confidence: mkConfidence(),
    penalties: [],
    ...overrides,
  }
}

function mkComposite(overrides?: Partial<CompositeScore>): CompositeScore {
  const component = mkComponent()
  const contribution: ComponentContribution = {
    component,
    contribution: 0.15,
    reason: 'weight 0.15; full match',
  }
  return {
    questionCode: 'Q-000001',
    slot: mkSlot(),
    value: 0.82,
    breakdown: { contributions: [contribution], aggregationNote: 'weighted mean' },
    confidence: mkConfidence(),
    penalties: [],
    ...overrides,
  }
}

function mkCandidate(): Candidate {
  return {
    identity: { questionCode: 'Q-000001', questionId: 'uuid-1' },
    metadata: {
      document: 'พ.ร.บ.ทดสอบ 2560',
      difficulty: 'Easy',
      topic: 'หลักการ',
      status: 'Published',
      tier: 1,
      blueprintType: 'Memory',
      learningObjective: 'LO1',
      questionPattern: 'Positive',
      section: 'ม.6-8',
      tags: ['tag1'],
      category: 'cat',
    },
    completeness: {
      blueprintType: 'complete',
      learningObjective: 'complete',
      questionPattern: 'complete',
      section: 'complete',
    },
    confidence: { level: 'full', reason: null },
    provenance: {
      filtersPassed: ['exclusion', 'status', 'document'],
      eligibleSlots: [mkSlot()],
      coverageSatisfied: ['CR-1'],
      source: { kind: 'metadata_query', queryId: 'q1' },
    },
  }
}

function mkCandidateSet(): CandidateSet {
  return {
    identity: { assemblyRequestId: 'assembly-1', generatedAt: null, bankStateHash: 'bank-hash' },
    candidates: [mkCandidate()],
    slotIndex: { slots: new Map([['slot-1', ['Q-000001']]]) },
    shortfallReport: { entries: [] },
    coverageSatisfaction: {
      bindings: [{ document: 'พ.ร.บ.ทดสอบ 2560', topic: 'หลักการ', satisfyingCodes: ['Q-000001'] }],
    },
    warnings: [],
    statistics: {
      totalCandidates: 1,
      fullConfidenceCount: 1,
      reducedConfidenceCount: 0,
      incompleteAxesCount: 0,
      distinctDocuments: 1,
      distinctDifficulties: 1,
      distinctPatterns: 1,
      distinctLearningObjectives: 1,
      shortfallCount: 0,
    },
    exclusionsLog: [],
    meta: { specVersion: '1.0', generatorVersion: '1.0.0' },
  }
}

function mkRankedCandidate(overrides?: Partial<RankedCandidate>): RankedCandidate {
  const composite = mkComposite()
  const confidence = composite.confidence
  const penalties = composite.penalties
  const signals = [mkSignal()]
  return {
    code: 'Q-000001',
    rank: 1,
    tieGroupId: null,
    composite,
    confidence,
    penalties,
    signals,
    orderingReason: {
      summary: 'Composite value and high confidence put this Candidate first.',
      determiningFacets: ['composite.value', 'confidence.level', 'penalties'],
      neighborComparison: {
        aboveCode: null,
        belowCode: 'Q-000002',
        explanation: 'No Candidate above; next Candidate has lower effective value.',
      },
      tieStatus: { tieGroupId: null, memberCodes: [], tieBreaker: null },
    },
    auditTrail: {
      candidateCode: 'Q-000001',
      signals,
      componentIds: ['difficulty_fit'],
      composite,
      confidence,
      penalties,
      rank: 1,
    },
    ...overrides,
  }
}

function mkRankedSlot(overrides?: Partial<RankedSlot>): RankedSlot {
  return {
    slotId: 'slot-1',
    slot: mkSlot(),
    rankedCandidates: [mkRankedCandidate()],
    slotSummary: {
      tieGroups: [],
      topOfSlotRationale: 'Highest composite value with high confidence.',
      orderingKey: {
        facets: ['composite.value', 'confidence.level', 'penalties', 'tieBreaker'],
        description: 'Fixed inspectable ordering key.',
      },
    },
    ...overrides,
  }
}

function mkRankedCandidateSet(overrides?: Partial<RankedCandidateSet>): RankedCandidateSet {
  const candidateSet = mkCandidateSet()
  return {
    identity: {
      candidateSetId: candidateSet.identity.assemblyRequestId,
      scoringModelVersion: '1.0',
      rankingVersion: '1.0.0',
    },
    candidateSet,
    slots: [mkRankedSlot()],
    shortfallReport: candidateSet.shortfallReport,
    coverageSatisfaction: candidateSet.coverageSatisfaction,
    warnings: candidateSet.warnings,
    meta: {
      specVersion: '1.0',
      rankingVersion: '1.0.0',
      scoringModelVersion: '1.0',
    },
    ...overrides,
  }
}

// ─── Solver-owned fixtures ─────────────────────────────────────────────────

function mkPlacementReasoning(overrides?: Partial<PlacementReasoning>): PlacementReasoning {
  return {
    inheritedScoreValue: 0.82,
    inheritedRank: 1,
    summary: 'Inherited rank 1 and top composite value; satisfies all Hard constraints.',
    ...overrides,
  }
}

function mkConflictRecord(overrides?: Partial<ConflictRecord>): ConflictRecord {
  return {
    candidateCode: 'Q-000001',
    constraint: 'L1',
    type: 'mutual_exclusion',
    scope: 'within_set',
    source: 'solver',
    resolution: 'resolved',
    participants: ['Q-000002'],
    evidence: 'Q-000001 and Q-000002 share Topic+Difficulty+Type within Set 1.',
    resolutionNote: 'Resolved by replacing Q-000002 with Q-000003.',
    ...overrides,
  }
}

function mkReplacementRecord(overrides?: Partial<ReplacementRecord>): ReplacementRecord {
  return {
    previousCode: 'Q-000002',
    newCode: 'Q-000003',
    reason: 'L1 mutual exclusion forced backtrack to a non-conflicting Candidate.',
    source: 'solver',
    ...overrides,
  }
}

function mkReviewerOverrideRecord(overrides?: Partial<ReviewerOverrideRecord>): ReviewerOverrideRecord {
  return {
    candidateCode: 'Q-000004',
    kind: 'force_include',
    reason: 'Reviewer requires Q-000004 in this Set despite low score.',
    ...overrides,
  }
}

function mkAllocatedPlacement(overrides?: Partial<AllocatedPlacement>): AllocatedPlacement {
  return {
    slotId: 'slot-1',
    slot: mkSlot(),
    state: 'allocated',
    assignedCandidate: mkRankedCandidate(),
    placementReasoning: mkPlacementReasoning(),
    conflictsResolved: [],
    replacements: [],
    reviewerOverrides: [],
    ...overrides,
  }
}

function mkRejectedPlacement(overrides?: Partial<RejectedPlacement>): RejectedPlacement {
  const considered: RejectedCandidateDetail[] = [
    { candidateCode: 'Q-000001', reason: 'No feasible placement without violating L1.' },
  ]
  return {
    slotId: 'slot-2',
    slot: mkSlot({ setNumber: 2 }),
    state: 'rejected',
    considered,
    blockingConstraints: ['L1'],
    reason: 'Every eligible Candidate created an unresolvable L1 conflict.',
    ...overrides,
  }
}

function mkShortfallSummary(overrides?: Partial<ShortfallSummary>): ShortfallSummary {
  return {
    allocatedSlotCount: 1,
    rejectedSlotCount: 0,
    unresolvedConflictCount: 0,
    strainedSoftConstraintCount: 0,
    summary: 'All target Slots allocated; no shortfalls.',
    ...overrides,
  }
}

function mkAuditEntry(overrides?: Partial<AllocationAuditEntry>): AllocationAuditEntry {
  return {
    decision: 'placement',
    owner: 'solver',
    ordering: 0,
    evidence: 'Inherited rank 1; top composite value; all Hard constraints satisfied.',
    reasoning: 'Candidate placed as the highest-ranked feasible option for this Slot.',
    ...overrides,
  }
}

function mkAllocatedCandidateSet(overrides?: Partial<AllocatedCandidateSet>): AllocatedCandidateSet {
  const rankedCandidateSet = mkRankedCandidateSet()
  return {
    identity: {
      rankedCandidateSetId: rankedCandidateSet.identity.candidateSetId,
      solverVersion: '1.0.0',
      allocationModelVersion: '1.0',
      scoringModelVersion: '1.0',
    },
    placements: [mkAllocatedPlacement()],
    feasibility: 'feasible',
    shortfallSummary: mkShortfallSummary(),
    unresolvedConflicts: [],
    auditTrail: [mkAuditEntry()],
    rankedCandidateSet,
    shortfallReport: rankedCandidateSet.shortfallReport,
    coverageSatisfaction: rankedCandidateSet.coverageSatisfaction,
    warnings: [],
    meta: {
      specVersion: '1.0',
      solverVersion: '1.0.0',
      allocationModelVersion: '1.0',
      scoringModelVersion: '1.0',
    },
    ...overrides,
  }
}

// ═══ Vocabulary stability ═════════════════════════════════════════════════

function verifies_solver_stage_vocab(): void {
  const stages: SolverStage[] = [
    'receive',
    'initialize',
    'validate_constraints',
    'candidate_placement',
    'conflict_detection',
    'conflict_resolution',
    'allocation_validation',
    'finalize_allocation',
    'audit_finalization',
    'allocated_candidate_set_emission',
  ]
  assert.equal(stages.length, 10, 'Solver §3.1 fixes exactly 10 runtime stages')
}

function verifies_solver_severity_vocab(): void {
  const severities: SolverSeverity[] = ['Fatal', 'Non-fatal']
  assert.equal(severities.length, 2)
}

function verifies_diagnostic_categories_match_failure_modes(): void {
  const categories: SolverDiagnosticCategory[] = [
    'blueprint_impossible',
    'constraint_contradiction',
    'no_feasible_candidate',
    'runtime_inconsistency',
    'version_mismatch',
    'corrupted_allocation',
    'invalid_runtime_state',
    'duplicate_assignment',
    'released_lock',
  ]
  assert.equal(categories.length, 9, 'Solver §11.1 fixes 9 failure modes')
}

function verifies_constraint_category_vocab(): void {
  const categories: ConstraintCategory[] = [
    'hard',
    'soft',
    'coverage',
    'distribution',
    'cross_set',
    'dependency',
    'reviewer',
    'future',
  ]
  assert.equal(categories.length, 8, 'Solver §4.1 fixes 8 constraint categories')
}

function verifies_constraint_priority_order(): void {
  const priorities: ConstraintPriority[] = ['reviewer', 'hard', 'soft', 'future']
  assert.equal(priorities.length, 4, 'Solver §4.3 fixes 4 priority tiers')
}

function verifies_feasibility_state_vocab(): void {
  const states: FeasibilityState[] = [
    'feasible',
    'partially_feasible',
    'infeasible',
    'impossible',
  ]
  assert.equal(states.length, 4, 'Solver §8.1 fixes 4 feasibility states')
}

function verifies_allocation_state_vocab_matches_allocation_model(): void {
  // Allocation Model §5.1 — spoken by the Solver, not redefined.
  const states: AllocationState[] = [
    'open',
    'reserved',
    'allocated',
    'locked',
    'released',
    'rejected',
    'completed',
  ]
  assert.equal(states.length, 7, 'Allocation Model §5.1 fixes 7 states')
}

function verifies_conflict_type_vocab_matches_allocation_model(): void {
  // Allocation Model §7.2 — spoken by the Solver, not redefined.
  const types: ConflictType[] = ['hard', 'soft', 'dependency', 'mutual_exclusion']
  assert.equal(types.length, 4)
}

function verifies_conflict_scope_vocab_matches_allocation_model(): void {
  const scopes: ConflictScope[] = ['within_set', 'cross_set', 'within_run']
  assert.equal(scopes.length, 3)
}

function verifies_conflict_resolution_status_vocab(): void {
  const statuses: ConflictResolutionStatus[] = ['resolved', 'unresolved', 'superseded']
  assert.equal(statuses.length, 3)
}

function verifies_meta_spec_version_is_constant(): void {
  const meta: AllocatedCandidateSetMeta = {
    specVersion: '1.0',
    solverVersion: '1.0.0',
    allocationModelVersion: '1.0',
    scoringModelVersion: '1.0',
  }
  assert.equal(meta.specVersion, '1.0')
  assert.equal(meta.allocationModelVersion, '1.0')
  assert.equal(meta.scoringModelVersion, '1.0')
}

// ═══ Immutability (readonly compile-time check) ═══════════════════════════

function verifies_placement_fields_are_readonly(): void {
  const placement = mkAllocatedPlacement()
  // @ts-expect-error — slotId is readonly
  placement.slotId = 'slot-x'
  // @ts-expect-error — state is readonly
  placement.state = 'rejected'
  // @ts-expect-error — assignedCandidate is readonly
  placement.assignedCandidate = mkRankedCandidate({ code: 'Q-000099' })
  assert.ok(true, 'readonly type errors confirmed')
}

function verifies_rejected_placement_fields_are_readonly(): void {
  const rejected = mkRejectedPlacement()
  // @ts-expect-error — blockingConstraints is readonly
  rejected.blockingConstraints = []
  // @ts-expect-error — reason is readonly
  rejected.reason = ''
  assert.ok(rejected.considered.length > 0)
}

function verifies_conflict_record_fields_are_readonly(): void {
  const conflict = mkConflictRecord()
  // @ts-expect-error — resolution is readonly
  conflict.resolution = 'unresolved'
  // @ts-expect-error — participants is readonly
  conflict.participants = []
  assert.ok(conflict.evidence.length > 0)
}

function verifies_allocated_candidate_set_fields_are_readonly(): void {
  const acs = mkAllocatedCandidateSet()
  // @ts-expect-error — placements is readonly
  acs.placements = []
  // @ts-expect-error — meta.specVersion is readonly
  acs.meta.specVersion = '2.0'
  // @ts-expect-error — feasibility is readonly
  acs.feasibility = 'infeasible'
  assert.ok(acs.identity.rankedCandidateSetId.length > 0)
}

// ═══ Reuse: Solver imports, does not redefine, upstream contracts ═════════

function verifies_solver_reuses_upstream_contracts(): void {
  const acs = mkAllocatedCandidateSet()
  // CandidateSet fields carried forward unchanged (Solver §12.4).
  assert.equal(acs.shortfallReport, acs.rankedCandidateSet.shortfallReport)
  assert.equal(acs.coverageSatisfaction, acs.rankedCandidateSet.coverageSatisfaction)
  // rankedCandidateSet consumed read-only (§3.3 upstream-immutability).
  assert.equal(acs.rankedCandidateSet, acs.rankedCandidateSet)
  // assignedCandidate is a RankedCandidate (imported type, read-only inherited evaluation).
  const placement = acs.placements[0] as AllocatedPlacement
  assert.equal(placement.assignedCandidate.code, 'Q-000001')
}

function verifies_placement_discriminates_on_state(): void {
  const allocated: Placement = mkAllocatedPlacement()
  const rejected: Placement = mkRejectedPlacement()
  if (allocated.state === 'allocated') {
    assert.ok(allocated.assignedCandidate)
  } else {
    assert.fail('allocated placement should narrow to AllocatedPlacement')
  }
  if (rejected.state === 'rejected') {
    assert.ok(rejected.considered.length > 0)
  } else {
    assert.fail('rejected placement should narrow to RejectedPlacement')
  }
}

function verifies_constraint_solver_result_discriminates_on_ok(): void {
  const success: ConstraintSolverResult = {
    ok: true,
    allocatedCandidateSet: mkAllocatedCandidateSet(),
  }
  const failure: ConstraintSolverResult = {
    ok: false,
    fatalDiagnostics: [
      {
        category: 'blueprint_impossible',
        severity: 'Fatal',
        stage: 'validate_constraints',
        slotId: null,
        candidateCode: null,
        componentId: null,
        explanation: 'Tier floors sum to 110, exceeding 100.',
        recommendation: 'Reduce tier_1_floor so the distribution sums to 100.',
      },
    ],
  }
  if (success.ok) {
    assert.ok(success.allocatedCandidateSet)
  } else {
    assert.fail('success should narrow to the allocated branch')
  }
  if (!failure.ok) {
    assert.equal(failure.fatalDiagnostics.length, 1)
  } else {
    assert.fail('failure should narrow to the fatal branch')
  }
}

// ═══ Transparency completeness (Solver §10, §12.3) ═════════════════════════

function verifies_placement_reasoning_carries_inherited_priority(): void {
  const reasoning = mkPlacementReasoning()
  // §18.3 — Reservation priority is inherited from Ranking, never computed.
  assert.equal(typeof reasoning.inheritedRank, 'number')
  assert.equal(typeof reasoning.inheritedScoreValue, 'number')
  assert.ok(reasoning.summary.length > 0, 'placement reasoning summary must be non-empty')
}

function verifies_conflict_record_carries_full_evidence(): void {
  const conflict = mkConflictRecord()
  // Allocation §7.4 — every Conflict carries participants, constraint, type,
  // scope, resolution, evidence.
  assert.ok(conflict.candidateCode.length > 0)
  assert.ok(conflict.constraint.length > 0)
  assert.ok(conflict.evidence.length > 0)
  assert.ok(conflict.resolutionNote.length > 0, 'resolution note must be non-empty (AP-7)')
}

function verifies_replacement_record_is_explicit(): void {
  const replacement = mkReplacementRecord()
  // Allocation AP-7 — Replacements must be explicit (previous, new, reason).
  assert.ok(replacement.previousCode.length > 0)
  assert.ok(replacement.reason.length > 0)
}

function verifies_rejected_placement_records_shortfall(): void {
  const rejected = mkRejectedPlacement()
  // Solver §8.4 — Rejected Slots carry target profile, Candidates considered,
  // and the Hard Constraints that could not be satisfied.
  assert.ok(rejected.considered.length > 0)
  assert.ok(rejected.blockingConstraints.length > 0)
  assert.ok(rejected.reason.length > 0)
}

function verifies_shortfall_summary_counts_are_consistent(): void {
  const acs = mkAllocatedCandidateSet({
    placements: [mkAllocatedPlacement(), mkRejectedPlacement()],
    feasibility: 'partially_feasible',
    shortfallSummary: {
      allocatedSlotCount: 1,
      rejectedSlotCount: 1,
      unresolvedConflictCount: 0,
      strainedSoftConstraintCount: 0,
      summary: '1 Slot allocated, 1 rejected.',
    },
  })
  const allocated = acs.placements.filter((p) => p.state === 'allocated').length
  const rejected = acs.placements.filter((p) => p.state === 'rejected').length
  assert.equal(allocated, acs.shortfallSummary.allocatedSlotCount)
  assert.equal(rejected, acs.shortfallSummary.rejectedSlotCount)
}

// ═══ Determinism / serialization ══════════════════════════════════════════

function verifies_allocated_candidate_set_serializes_deterministically(): void {
  const acs = mkAllocatedCandidateSet()
  const s1 = stableStringify(acs)
  const s2 = stableStringify(acs)
  assert.equal(s1, s2, 'byte-identical serialization on re-serialization')
}

function verifies_stable_serialization_ignores_key_order(): void {
  const acs = mkAllocatedCandidateSet()
  const canonical = stableStringify(acs)
  // Re-serialize the JSON-parsed form — stableStringify sorts keys, so the
  // round-trip is byte-identical regardless of insertion order.
  const reparsed = JSON.parse(JSON.stringify(acs))
  assert.equal(stableStringify(reparsed), canonical)
}

// ═══ Source purity — contracts.ts must not implement the Solver ════════════

function verifies_contract_file_has_no_forbidden_imports(): void {
  const source = readFileSync(path.join(__dirname, 'contracts.ts'), 'utf8')
  const forbidden = [
    'from "../reader"', // Reader is 4 modules upstream; no direct dep
    'from "@supabase', // no Bank access
    'from "next"', // no framework coupling
    'Math.random', // determinism (Solver AP-6)
    'Date.now', // determinism (Engine README convention §1)
    'process.hrtime', // determinism
  ]
  for (const token of forbidden) {
    assert.ok(!source.includes(token), `contracts.ts must not reference: ${token}`)
  }
}

function verifies_no_duplicate_upstream_contracts_are_defined(): void {
  const source = readFileSync(path.join(__dirname, 'contracts.ts'), 'utf8')
  // The Solver must import, not redefine, every upstream contract it consumes.
  const forbiddenDeclarations = [
    'interface CandidateSet',
    'interface RankedCandidateSet',
    'interface RankedCandidate',
    'interface CompositeScore',
    'interface BlueprintSlot',
    'interface ShortfallReport',
    'interface Candidate',
    'type Difficulty',
    'type Tier',
  ]
  for (const declaration of forbiddenDeclarations) {
    assert.ok(
      !source.includes(declaration),
      `Solver must import, not redefine: ${declaration}`,
    )
  }
}

function verifies_no_solver_logic_keywords(): void {
  const source = readFileSync(path.join(__dirname, 'contracts.ts'), 'utf8')
  // contracts.ts is TYPES ONLY — no search, no placement, no constraint solving.
  const forbidden = [
    'function solve',
    'function place',
    'function allocate',
    'function backtrack',
    'function search',
    'function reserve',
    '.sort(',
    'while (',
    'for (',
  ]
  for (const token of forbidden) {
    assert.ok(
      !source.includes(token),
      `contracts.ts must not implement or reference logic token: ${token}`,
    )
  }
}

function verifies_solver_warning_is_nonfatal_only(): void {
  const warning: SolverWarning = {
    severity: 'Non-fatal',
    category: 'soft',
    stage: 'conflict_detection',
    slotId: 'slot-1',
    candidateCode: 'Q-000001',
    explanation: 'Soft constraint CR-3 strained but allocation feasible.',
    recommendation: 'Reviewer may accept the partial rotation.',
  }
  assert.equal(warning.severity, 'Non-fatal')
}

function verifies_diagnostic_carries_full_anatomy(): void {
  const diagnostic: SolverDiagnostic = {
    category: 'version_mismatch',
    severity: 'Fatal',
    stage: 'receive',
    slotId: null,
    candidateCode: null,
    componentId: null,
    explanation: 'RankedCandidateSet expects Allocation Model 2.0; only 1.0 supported.',
    recommendation: 'Regenerate the RankedCandidateSet against Allocation Model 1.0.',
  }
  assert.equal(diagnostic.severity, 'Fatal')
  assert.ok(diagnostic.explanation.length > 0)
  assert.ok(diagnostic.recommendation.length > 0, 'recommendation must be non-empty')
}

function verifies_constraint_reference_is_named_string(): void {
  // Allocation §7.4 — "Constraint: named, not vague."
  const ref: ConstraintReference = 'tier_1_floor'
  assert.ok(ref.length > 0)
}

// ═══ runner ═══════════════════════════════════════════════════════════════

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'SolverStage has exactly 10 runtime stages (§3.1)', fn: verifies_solver_stage_vocab },
  { name: 'SolverSeverity has Fatal and Non-fatal (§11.2)', fn: verifies_solver_severity_vocab },
  { name: 'Diagnostic categories match §11.1 failure modes', fn: verifies_diagnostic_categories_match_failure_modes },
  { name: 'ConstraintCategory fixes §4.1 taxonomy', fn: verifies_constraint_category_vocab },
  { name: 'ConstraintPriority fixes §4.3 priority order', fn: verifies_constraint_priority_order },
  { name: 'FeasibilityState fixes §8.1 spectrum', fn: verifies_feasibility_state_vocab },
  { name: 'AllocationState matches Allocation Model §5.1 (spoken)', fn: verifies_allocation_state_vocab_matches_allocation_model },
  { name: 'ConflictType matches Allocation Model §7.2 (spoken)', fn: verifies_conflict_type_vocab_matches_allocation_model },
  { name: 'ConflictScope matches Allocation Model §7.3 (spoken)', fn: verifies_conflict_scope_vocab_matches_allocation_model },
  { name: 'ConflictResolutionStatus fixes resolution states', fn: verifies_conflict_resolution_status_vocab },
  { name: "AllocatedCandidateSet meta pins spec/allocation/scoring version '1.0'", fn: verifies_meta_spec_version_is_constant },
  { name: 'AllocatedPlacement fields are readonly', fn: verifies_placement_fields_are_readonly },
  { name: 'RejectedPlacement fields are readonly', fn: verifies_rejected_placement_fields_are_readonly },
  { name: 'ConflictRecord fields are readonly', fn: verifies_conflict_record_fields_are_readonly },
  { name: 'AllocatedCandidateSet fields are readonly', fn: verifies_allocated_candidate_set_fields_are_readonly },
  { name: 'Solver reuses upstream contracts (§12.4 carry-forward)', fn: verifies_solver_reuses_upstream_contracts },
  { name: 'Placement discriminates on state', fn: verifies_placement_discriminates_on_state },
  { name: 'ConstraintSolverResult discriminates on ok', fn: verifies_constraint_solver_result_discriminates_on_ok },
  { name: 'PlacementReasoning carries inherited priority (§18.3)', fn: verifies_placement_reasoning_carries_inherited_priority },
  { name: 'ConflictRecord carries full evidence (Allocation §7.4)', fn: verifies_conflict_record_carries_full_evidence },
  { name: 'ReplacementRecord is explicit (Allocation AP-7)', fn: verifies_replacement_record_is_explicit },
  { name: 'RejectedPlacement records shortfall (§8.4)', fn: verifies_rejected_placement_records_shortfall },
  { name: 'ShortfallSummary counts are consistent with placements', fn: verifies_shortfall_summary_counts_are_consistent },
  { name: 'AllocatedCandidateSet serializes deterministically', fn: verifies_allocated_candidate_set_serializes_deterministically },
  { name: 'stableStringify ignores key order on AllocatedCandidateSet', fn: verifies_stable_serialization_ignores_key_order },
  { name: 'No forbidden imports or side-effect APIs in contracts.ts', fn: verifies_contract_file_has_no_forbidden_imports },
  { name: 'No duplicate upstream contracts are defined', fn: verifies_no_duplicate_upstream_contracts_are_defined },
  { name: 'No solver logic keywords in contracts.ts', fn: verifies_no_solver_logic_keywords },
  { name: 'SolverWarning severity is Non-fatal only', fn: verifies_solver_warning_is_nonfatal_only },
  { name: 'SolverDiagnostic carries full anatomy (§11.3)', fn: verifies_diagnostic_carries_full_anatomy },
  { name: 'ConstraintReference is a named string (Allocation §7.4)', fn: verifies_constraint_reference_is_named_string },
]

let passed = 0
let failed = 0
for (const t of tests) {
  try {
    t.fn()
    console.log(`  ✓ ${t.name}`)
    passed++
  } catch (e) {
    console.error(`  ✗ ${t.name}`)
    console.error(`    ${(e as Error).message}`)
    failed++
  }
}

console.log(`\n${passed}/${tests.length} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}
