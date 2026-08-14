/**
 * lib/engine/solver/bounded-search.test.ts
 * ----------------------------------------------------------------------------
 * Bounded Search Diagnostics & Root State Tests.
 *
 * RUN: npx jiti lib/engine/solver/bounded-search.test.ts
 */

import assert from 'node:assert/strict'
import type { Candidate, ConstraintSnapshot, Tier } from '../generator/contracts'
import type { PreTieCandidateProfile, PreTieSetCandidateProfiles } from '../ranking/contracts'
import { buildConstraintSnapshot } from '../shared/testing/fixtures'
import { orderCandidates } from './branch-ordering'
import {
  advanceSearchFrame,
  attemptCurrentFrameCandidate,
  backtrackExhaustedChild,
  canVisitNextNode,
  createChildFrameFromAttempt,
  createSearchDiagnostics,
  createSearchFrame,
  createSearchRoot,
  createSearchStack,
  pushSearchFrame,
  replaceTopSearchFrame,
  recordBacktrack,
  recordNodeVisit,
  runBoundedSearch,
  stepSearchTraversal,
  tryBudgetedTransition,
  type FrameAttemptResult,
  type SearchFrame,
  type SearchStack,
} from './bounded-search'
import { buildSetSolverInput } from './set-solver-input'

// ─── Fixture Helpers ─────────────────────────────────────────────────────────

function mkCandidate(questionCode: string, tier: Tier = 1): Candidate {
  return {
    identity: { questionCode, questionId: questionCode },
    metadata: {
      document: 'DOC-A',
      difficulty: 'Easy',
      topic: 'Topic A',
      status: 'Published',
      tier,
      blueprintType: 'Memory',
      learningObjective: 'LO1',
      questionPattern: 'Positive',
      section: 'Sec 1',
      tags: [],
      category: null,
    },
    completeness: {
      blueprintType: 'complete',
      learningObjective: 'complete',
      questionPattern: 'complete',
      section: 'complete',
    },
    confidence: { level: 'full', reason: null },
    provenance: {
      filtersPassed: ['exclusion', 'status', 'document', 'coverage', 'difficulty'],
      eligibleSlots: [],
      coverageSatisfied: [],
      source: { kind: 'metadata_query', queryId: 'q-fixture' },
    },
  }
}

function mkProfile(questionCode: string, tier: Tier = 1): PreTieCandidateProfile {
  return {
    questionCode,
    candidate: mkCandidate(questionCode, tier),
    suitabilityProfiles: [],
  }
}

function mkSnapshot(perSet = 100): ConstraintSnapshot {
  const base = buildConstraintSnapshot()
  return {
    ...base,
    target: { sets: 5, perSet },
    distributionConstraints: {
      ...base.distributionConstraints,
      tier1Floor: 30,
      tier4Ceiling: 25,
    },
  }
}

function mkInput(profiles: readonly PreTieCandidateProfile[], snapshot = mkSnapshot()): ReturnType<typeof buildSetSolverInput> {
  const universe: PreTieSetCandidateProfiles = {
    setNumber: 1,
    profiles,
  }
  return buildSetSolverInput(universe, snapshot)
}

// ─── Tests ───────────────────────────────────────────────────────────────────

function test_initial_diagnostics(): void {
  const d = createSearchDiagnostics()
  assert.equal(d.nodesVisited, 0, 'initial nodesVisited = 0')
  assert.equal(d.backtracks, 0, 'initial backtracks = 0')
}

function test_budget_boundary(): void {
  const budget = { maxNodesVisited: 3 }
  let d = createSearchDiagnostics()

  // nodesVisited = 0,1,2 → true
  for (let i = 0; i < 3; i++) {
    assert.equal(canVisitNextNode(d, budget), true, `canVisitNextNode should be true at nodesVisited=${d.nodesVisited}`)
    d = recordNodeVisit(d)
  }

  // nodesVisited = 3 → false
  assert.equal(d.nodesVisited, 3)
  assert.equal(canVisitNextNode(d, budget), false, 'canVisitNextNode should be false when nodesVisited === maxNodesVisited')
}

function test_record_node_visit(): void {
  const d0 = createSearchDiagnostics()
  const d1 = recordNodeVisit(d0)

  assert.equal(d1.nodesVisited, 1, 'nodesVisited incremented by 1')
  assert.equal(d1.backtracks, 0, 'backtracks unchanged after recordNodeVisit')
}

function test_record_backtrack(): void {
  const d0 = createSearchDiagnostics()
  const d1 = recordBacktrack(d0)

  assert.equal(d1.backtracks, 1, 'backtracks incremented by 1')
  assert.equal(d1.nodesVisited, 0, 'nodesVisited unchanged after recordBacktrack')
}

function test_helpers_immutability(): void {
  const original = createSearchDiagnostics()
  const originalNodesVisited = original.nodesVisited
  const originalBacktracks = original.backtracks

  recordNodeVisit(original)
  assert.equal(original.nodesVisited, originalNodesVisited, 'recordNodeVisit must not mutate input')

  recordBacktrack(original)
  assert.equal(original.backtracks, originalBacktracks, 'recordBacktrack must not mutate input')
}

function test_search_root_state(): void {
  const profiles = [mkProfile('Q-001', 1), mkProfile('Q-002', 2), mkProfile('Q-003', 1)]
  const input = mkInput(profiles)
  const root = createSearchRoot(input)

  // Empty accounting for input.setNumber
  assert.equal(root.accounting.setNumber, 1, 'root accounting setNumber must match input.setNumber')
  assert.equal(root.accounting.placedCount, 0, 'root accounting must start with placedCount = 0')
  assert.equal(root.accounting.selectedQuestionCodes.size, 0, 'root accounting must start with no selected codes')

  // remainingCandidates contains all profiles
  assert.equal(root.remainingCandidates.length, profiles.length, 'remainingCandidates must contain all candidateUniverse profiles')

  // Same CandidateProfile object references
  for (const profile of profiles) {
    const found = root.remainingCandidates.find((c) => c.questionCode === profile.questionCode)
    assert.ok(found !== undefined, `profile ${profile.questionCode} must be present in remainingCandidates`)
    assert.equal(found, profile, 'CandidateProfile reference must be identical (same object)')
  }

  // New array (not same reference as original profiles array)
  assert.notEqual(root.remainingCandidates, profiles, 'remainingCandidates must be a new array, not the original profiles reference')
}

function test_search_root_immutability(): void {
  const profiles = [mkProfile('Q-001', 1), mkProfile('Q-002', 2)]
  const input = mkInput(profiles)

  const originalLength = input.candidateUniverse.profiles.length
  createSearchRoot(input)

  assert.equal(input.candidateUniverse.profiles.length, originalLength, 'candidateUniverse must not be mutated by createSearchRoot')
}

// ─── tryBudgetedTransition Tests ─────────────────────────────────────────────

function mkInputWithSnapshot(
  profiles: readonly PreTieCandidateProfile[],
  tier1Floor: number,
  tier4Ceiling: number,
  perSet: number
): ReturnType<typeof buildSetSolverInput> {
  const base = buildConstraintSnapshot()
  const snapshot: ConstraintSnapshot = {
    ...base,
    target: { sets: 5, perSet },
    distributionConstraints: {
      ...base.distributionConstraints,
      tier1Floor,
      tier4Ceiling,
    },
  }
  return mkInput(profiles, snapshot)
}

function test_attempted_budget_available(): void {
  const candidate = mkProfile('Q-001', 1)
  const pool = [candidate, mkProfile('Q-002', 1)]
  const input = mkInputWithSnapshot(pool, 1, 25, 100)
  const { accounting } = createSearchRoot(input)
  const diagnostics = createSearchDiagnostics() // nodesVisited = 0
  const budget = { maxNodesVisited: 2 }

  const result = tryBudgetedTransition(input, accounting, pool, candidate, diagnostics, budget)

  assert.equal(result.status, 'ATTEMPTED', 'should return ATTEMPTED when budget is available')
  if (result.status === 'ATTEMPTED') {
    assert.equal(result.diagnostics.nodesVisited, 1, 'nodesVisited should become 1 after attempt')
  }
}

function test_exhausted_budget(): void {
  const candidate = mkProfile('Q-001', 1)
  const pool = [candidate, mkProfile('Q-002', 1)]
  const input = mkInputWithSnapshot(pool, 1, 25, 100)
  const { accounting } = createSearchRoot(input)
  const exhaustedDiagnostics = recordNodeVisit(createSearchDiagnostics()) // nodesVisited = 1
  const budget = { maxNodesVisited: 1 }

  const result = tryBudgetedTransition(input, accounting, pool, candidate, exhaustedDiagnostics, budget)

  assert.equal(result.status, 'SEARCH_BUDGET_EXHAUSTED', 'should return SEARCH_BUDGET_EXHAUSTED when budget exhausted')
  if (result.status === 'SEARCH_BUDGET_EXHAUSTED') {
    assert.equal(result.diagnostics, exhaustedDiagnostics, 'diagnostics reference must be unchanged')
  }
}

function test_one_attempt_one_node(): void {
  const candidate = mkProfile('Q-001', 1)
  const pool = [candidate, mkProfile('Q-002', 1)]
  const input = mkInputWithSnapshot(pool, 1, 25, 100)
  const { accounting } = createSearchRoot(input)
  const diagnostics = createSearchDiagnostics()
  const budget = { maxNodesVisited: 5 }

  const result = tryBudgetedTransition(input, accounting, pool, candidate, diagnostics, budget)

  assert.equal(result.status, 'ATTEMPTED')
  if (result.status === 'ATTEMPTED') {
    assert.equal(
      result.diagnostics.nodesVisited - diagnostics.nodesVisited,
      1,
      'exactly one node billed per attempt'
    )
  }
}

function test_pruned_transition_bills_one_node(): void {
  // tier4Ceiling = 0 → any Tier 4 candidate is pruned immediately
  const candidate = mkProfile('Q-T4', 4)
  const pool = [candidate]
  for (let i = 1; i <= 50; i++) pool.push(mkProfile(`Q-T1-${i}`, 1))
  const input = mkInputWithSnapshot(pool, 30, 0, 100)
  const { accounting } = createSearchRoot(input)
  const diagnostics = createSearchDiagnostics()
  const budget = { maxNodesVisited: 5 }

  const result = tryBudgetedTransition(input, accounting, pool, candidate, diagnostics, budget)

  assert.equal(result.status, 'ATTEMPTED')
  if (result.status === 'ATTEMPTED') {
    assert.equal(result.transition.status, 'PRUNED', 'transition must be PRUNED')
    assert.equal(result.diagnostics.nodesVisited, 1, 'PRUNED still bills one node')
  }
}

function test_continue_transition_bills_one_node(): void {
  // perSet = 10, tier1Floor = 3, tier4Ceiling = 25
  // Pool = 10 Tier 1 candidates. Applying Q-001:
  //   - Tier 4: 0 <= 25 ✓
  //   - Tier 1: 0 + 1 placed. remainingPositions = 9. remainingTier1After = 9 >= 2 needed to reach floor ✓
  //   - Universe: 9 distinct >= 9 remaining positions ✓
  //   - placedCount = 1, perSet = 10 → not yet COMPLETE
  //   → CONTINUE
  const candidate = mkProfile('Q-001', 1)
  const pool: PreTieCandidateProfile[] = [candidate]
  for (let i = 2; i <= 10; i++) pool.push(mkProfile(`Q-${String(i).padStart(3, '0')}`, 1))
  const input = mkInputWithSnapshot(pool, 3, 25, 10)
  const { accounting } = createSearchRoot(input)
  const diagnostics = createSearchDiagnostics()
  const budget = { maxNodesVisited: 5 }

  const result = tryBudgetedTransition(input, accounting, pool, candidate, diagnostics, budget)

  assert.equal(result.status, 'ATTEMPTED')
  if (result.status === 'ATTEMPTED') {
    assert.equal(result.transition.status, 'CONTINUE', 'transition must be CONTINUE')
    assert.equal(result.diagnostics.nodesVisited, 1, 'CONTINUE still bills one node')
  }
}

function test_complete_transition_bills_one_node(): void {
  // perSet = 1, tier1Floor = 1, tier4Ceiling = 1
  // Pool has one Tier 1 candidate. Placing it completes the allocation.
  const candidate = mkProfile('Q-001', 1)
  const pool = [candidate]
  const input = mkInputWithSnapshot(pool, 1, 1, 1)
  const { accounting } = createSearchRoot(input)
  const diagnostics = createSearchDiagnostics()
  const budget = { maxNodesVisited: 5 }

  const result = tryBudgetedTransition(input, accounting, pool, candidate, diagnostics, budget)

  assert.equal(result.status, 'ATTEMPTED')
  if (result.status === 'ATTEMPTED') {
    assert.equal(result.transition.status, 'COMPLETE', 'transition must be COMPLETE')
    assert.equal(result.diagnostics.nodesVisited, 1, 'COMPLETE still bills one node')
  }
}

function test_remaining_candidates_after_attempt(): void {
  const candidate = mkProfile('Q-001', 1)
  const other1 = mkProfile('Q-002', 1)
  const other2 = mkProfile('Q-003', 2)
  const pool = [candidate, other1, other2]
  const input = mkInputWithSnapshot(pool, 1, 25, 100)
  const { accounting } = createSearchRoot(input)
  const diagnostics = createSearchDiagnostics()
  const budget = { maxNodesVisited: 5 }

  const result = tryBudgetedTransition(input, accounting, pool, candidate, diagnostics, budget)

  assert.equal(result.status, 'ATTEMPTED')
  if (result.status === 'ATTEMPTED') {
    const codes = result.remainingCandidates.map((c) => c.questionCode)
    assert.equal(codes.includes('Q-001'), false, 'attempted candidate must be excluded from remainingCandidates')
    assert.equal(codes.includes('Q-002'), true, 'Q-002 must be preserved in remainingCandidates')
    assert.equal(codes.includes('Q-003'), true, 'Q-003 must be preserved in remainingCandidates')
    assert.equal(result.remainingCandidates.length, 2, 'remainingCandidates must have 2 profiles after removing current candidate')
  }
}

function test_remaining_counts_drive_transition(): void {
  // perSet = 10, tier1Floor = 30 → unreachable → PRUNED
  // Only 5 candidates total (all Tier 1). After removing candidate, 4 remain.
  // remainingPositions = 10 - 1 = 9, remainingDistinct = 4 < 9 → universe prune.
  const candidate = mkProfile('Q-001', 1)
  const pool = [candidate, mkProfile('Q-002', 1), mkProfile('Q-003', 1), mkProfile('Q-004', 1), mkProfile('Q-005', 1)]
  const input = mkInputWithSnapshot(pool, 30, 25, 10)
  const { accounting } = createSearchRoot(input)
  const diagnostics = createSearchDiagnostics()
  const budget = { maxNodesVisited: 5 }

  const result = tryBudgetedTransition(input, accounting, pool, candidate, diagnostics, budget)

  assert.equal(result.status, 'ATTEMPTED')
  if (result.status === 'ATTEMPTED') {
    assert.equal(result.transition.status, 'PRUNED', 'must be PRUNED due to universe insufficiency')
  }
}

function test_parent_state_immutability(): void {
  const candidate = mkProfile('Q-001', 1)
  const pool = [candidate, mkProfile('Q-002', 1)]
  const input = mkInputWithSnapshot(pool, 1, 25, 100)
  const { accounting } = createSearchRoot(input)
  const diagnostics = createSearchDiagnostics()
  const budget = { maxNodesVisited: 5 }

  const initialPlaced = accounting.placedCount
  const initialNodes = diagnostics.nodesVisited
  const initialPoolLen = pool.length

  tryBudgetedTransition(input, accounting, pool, candidate, diagnostics, budget)

  assert.equal(accounting.placedCount, initialPlaced, 'parent accounting must not be mutated')
  assert.equal(diagnostics.nodesVisited, initialNodes, 'input diagnostics must not be mutated')
  assert.equal(pool.length, initialPoolLen, 'input candidates array must not be mutated')
}

// ─── createSearchFrame Tests ──────────────────────────────────────────────────────

function test_frame_accounting_reference(): void {
  const pool = [mkProfile('Q-001', 1), mkProfile('Q-002', 2)]
  const input = mkInput(pool)
  const { accounting } = createSearchRoot(input)
  const frame = createSearchFrame(input, accounting, pool, [])

  assert.equal(frame.accounting, accounting, 'frame.accounting must be the same reference as input accounting')
}

function test_frame_remaining_candidates(): void {
  const p1 = mkProfile('Q-001', 1)
  const p2 = mkProfile('Q-002', 2)
  const pool = [p1, p2]
  const input = mkInput(pool)
  const { accounting } = createSearchRoot(input)
  const frame = createSearchFrame(input, accounting, pool, [])

  // Same object references
  assert.equal(frame.remainingCandidates.find((c) => c.questionCode === 'Q-001'), p1, 'Q-001 reference must be identical')
  assert.equal(frame.remainingCandidates.find((c) => c.questionCode === 'Q-002'), p2, 'Q-002 reference must be identical')
  // All preserved
  assert.equal(frame.remainingCandidates.length, 2, 'all remainingCandidates must be preserved')
  // New array
  assert.notEqual(frame.remainingCandidates, pool, 'remainingCandidates must be a new array')
}

function test_frame_selected_candidates(): void {
  const pool = [mkProfile('Q-001', 1), mkProfile('Q-002', 2)]
  const sel1 = mkProfile('Q-A', 1)
  const sel2 = mkProfile('Q-B', 2)
  const selected = [sel1, sel2]
  const input = mkInput(pool)
  const { accounting } = createSearchRoot(input)
  const frame = createSearchFrame(input, accounting, pool, selected)

  // Same object references
  assert.equal(frame.selectedCandidates.find((c) => c.questionCode === 'Q-A'), sel1, 'Q-A reference must be identical')
  assert.equal(frame.selectedCandidates.find((c) => c.questionCode === 'Q-B'), sel2, 'Q-B reference must be identical')
  // All preserved
  assert.equal(frame.selectedCandidates.length, 2, 'all selectedCandidates must be preserved')
  // New array
  assert.notEqual(frame.selectedCandidates, selected, 'selectedCandidates must be a new array')
}

function test_frame_next_candidate_index_zero(): void {
  const pool = [mkProfile('Q-001', 1)]
  const input = mkInput(pool)
  const { accounting } = createSearchRoot(input)
  const frame = createSearchFrame(input, accounting, pool, [])

  assert.equal(frame.nextCandidateIndex, 0, 'nextCandidateIndex must always be 0 on creation')
}

function test_frame_ordered_candidates_tier1_first(): void {
  const base = buildConstraintSnapshot()
  const snapshot: ConstraintSnapshot = {
    ...base,
    target: { sets: 5, perSet: 100 },
    distributionConstraints: { ...base.distributionConstraints, tier1Floor: 30, tier4Ceiling: 25 },
  }
  const pool = [
    mkProfile('Q-C', 2),
    mkProfile('Q-A', 1),
    mkProfile('Q-D', 2),
    mkProfile('Q-B', 1),
  ]
  const universe: PreTieSetCandidateProfiles = { setNumber: 1, profiles: pool }
  const input = buildSetSolverInput(universe, snapshot)
  const { accounting } = createSearchRoot(input) // T1 count = 0 < 30
  const frame = createSearchFrame(input, accounting, pool, [])

  assert.deepEqual(
    frame.orderedCandidates.map((c) => c.questionCode),
    ['Q-A', 'Q-B', 'Q-C', 'Q-D'],
    'orderedCandidates: Tier 1 first lexically, then non-Tier 1 lexically'
  )
}

function test_frame_ordering_determinism(): void {
  const pool1 = [mkProfile('Q-003', 1), mkProfile('Q-001', 1), mkProfile('Q-002', 2)]
  const pool2 = [mkProfile('Q-002', 2), mkProfile('Q-003', 1), mkProfile('Q-001', 1)]

  const base = buildConstraintSnapshot()
  const snapshot: ConstraintSnapshot = {
    ...base,
    target: { sets: 5, perSet: 100 },
    distributionConstraints: { ...base.distributionConstraints, tier1Floor: 30, tier4Ceiling: 25 },
  }

  const mkUniverseInput = (pool: PreTieCandidateProfile[]): ReturnType<typeof buildSetSolverInput> =>
    buildSetSolverInput({ setNumber: 1, profiles: pool }, snapshot)

  const input1 = mkUniverseInput([...pool1])
  const input2 = mkUniverseInput([...pool2])
  const { accounting: acc1 } = createSearchRoot(input1)
  const { accounting: acc2 } = createSearchRoot(input2)

  const frame1 = createSearchFrame(input1, acc1, pool1, [])
  const frame2 = createSearchFrame(input2, acc2, pool2, [])

  assert.deepEqual(
    frame1.orderedCandidates.map((c) => c.questionCode),
    frame2.orderedCandidates.map((c) => c.questionCode),
    'orderedCandidates must be identical regardless of input order'
  )
}

function test_frame_immutability(): void {
  const pool = [mkProfile('Q-001', 1), mkProfile('Q-002', 2)]
  const selected = [mkProfile('Q-A', 1)]
  const input = mkInput(pool)
  const { accounting } = createSearchRoot(input)

  const poolLenBefore = pool.length
  const selectedLenBefore = selected.length
  const placedBefore = accounting.placedCount

  createSearchFrame(input, accounting, pool, selected)

  assert.equal(pool.length, poolLenBefore, 'input pool must not be mutated')
  assert.equal(selected.length, selectedLenBefore, 'input selected must not be mutated')
  assert.equal(accounting.placedCount, placedBefore, 'accounting must not be mutated')
}

// ─── advanceSearchFrame Tests ─────────────────────────────────────────────────────

function mkFrameWithCandidates(count: number): ReturnType<typeof createSearchFrame> {
  const pool = Array.from({ length: count }, (_, i) => mkProfile(`Q-${String(i + 1).padStart(3, '0')}`, 1))
  const input = mkInput(pool)
  const { accounting } = createSearchRoot(input)
  return createSearchFrame(input, accounting, pool, [])
}

function test_advance_normal(): void {
  const frame0 = mkFrameWithCandidates(3)
  assert.equal(frame0.nextCandidateIndex, 0, 'initial index must be 0')

  const frame1 = advanceSearchFrame(frame0)
  assert.equal(frame1.nextCandidateIndex, 1, 'index must advance to 1')
}

function test_advance_repeated(): void {
  const frame0 = mkFrameWithCandidates(3)
  const frame1 = advanceSearchFrame(frame0)
  const frame2 = advanceSearchFrame(frame1)

  assert.equal(frame1.nextCandidateIndex, 1, 'first advance: index = 1')
  assert.equal(frame2.nextCandidateIndex, 2, 'second advance: index = 2')
}

function test_advance_last_sibling(): void {
  // orderedCandidates.length = 3, index 2 → 3 is allowed
  const frame0 = mkFrameWithCandidates(3)
  const frame1 = advanceSearchFrame(frame0)
  const frame2 = advanceSearchFrame(frame1)
  const frame3 = advanceSearchFrame(frame2) // index 2 → 3 (now exhausted state)

  assert.equal(frame3.nextCandidateIndex, 3, 'advancing to length is allowed')
  assert.equal(frame3.nextCandidateIndex, frame3.orderedCandidates.length, 'frame is now exhausted')
}

function test_advance_exhausted_fail_loud(): void {
  // orderedCandidates.length = 2, advance twice to reach index 2 (exhausted)
  const frame0 = mkFrameWithCandidates(2)
  const frame1 = advanceSearchFrame(frame0)
  const frame2 = advanceSearchFrame(frame1) // index 2 === length → exhausted

  assert.throws(
    () => advanceSearchFrame(frame2),
    (err: Error) =>
      err.message.includes('Fatal BoundedSearch error') &&
      err.message.includes('advanceSearchFrame called on exhausted frame'),
    'must fail loud when advancing an already exhausted frame'
  )
}

function test_advance_reference_preservation(): void {
  const pool = [mkProfile('Q-001', 1), mkProfile('Q-002', 2), mkProfile('Q-003', 1)]
  const input = mkInput(pool)
  const { accounting } = createSearchRoot(input)
  const frame0 = createSearchFrame(input, accounting, pool, [mkProfile('Q-A', 1)])
  const frame1 = advanceSearchFrame(frame0)

  assert.equal(frame1.accounting, frame0.accounting, 'accounting reference must be preserved')
  assert.equal(frame1.remainingCandidates, frame0.remainingCandidates, 'remainingCandidates reference must be preserved')
  assert.equal(frame1.orderedCandidates, frame0.orderedCandidates, 'orderedCandidates reference must be preserved')
  assert.equal(frame1.selectedCandidates, frame0.selectedCandidates, 'selectedCandidates reference must be preserved')
}

function test_advance_immutability(): void {
  const frame0 = mkFrameWithCandidates(3)
  const indexBefore = frame0.nextCandidateIndex

  advanceSearchFrame(frame0)

  assert.equal(frame0.nextCandidateIndex, indexBefore, 'original frame must not be mutated')
}


// ─── attemptCurrentFrameCandidate Tests ──────────────────────────────────────

function mkAttemptFrame(
  tier1Floor: number,
  tier4Ceiling: number,
  perSet: number,
  profiles: PreTieCandidateProfile[]
): { frame: ReturnType<typeof createSearchFrame>; input: ReturnType<typeof buildSetSolverInput> } {
  const base = buildConstraintSnapshot()
  const snapshot: ConstraintSnapshot = {
    ...base,
    target: { sets: 5, perSet },
    distributionConstraints: { ...base.distributionConstraints, tier1Floor, tier4Ceiling },
  }
  const input = buildSetSolverInput({ setNumber: 1, profiles }, snapshot)
  const { accounting } = createSearchRoot(input)
  const frame = createSearchFrame(input, accounting, profiles, [])
  return { frame, input }
}

function test_attempt_frame_exhausted(): void {
  const profiles = [mkProfile('Q-001', 1)]
  const { frame, input } = mkAttemptFrame(1, 25, 100, profiles)
  const diagnostics = createSearchDiagnostics()
  const budget = { maxNodesVisited: 5 }

  // Advance past all candidates to exhaust the frame
  const exhaustedFrame = advanceSearchFrame(frame) // index 1 === length 1

  const result = attemptCurrentFrameCandidate(input, exhaustedFrame, diagnostics, budget)

  assert.equal(result.status, 'FRAME_EXHAUSTED', 'must return FRAME_EXHAUSTED')
  if (result.status === 'FRAME_EXHAUSTED') {
    assert.equal(result.frame, exhaustedFrame, 'frame reference must be unchanged')
    assert.equal(result.diagnostics, diagnostics, 'diagnostics reference must be unchanged')
    assert.equal(result.diagnostics.nodesVisited, 0, 'no node must be consumed')
  }
}

function test_attempt_budget_exhausted(): void {
  const profiles = [mkProfile('Q-001', 1), mkProfile('Q-002', 1)]
  const { frame, input } = mkAttemptFrame(1, 25, 100, profiles)
  const exhaustedDiagnostics = recordNodeVisit(createSearchDiagnostics()) // nodesVisited = 1
  const budget = { maxNodesVisited: 1 } // already at limit

  const result = attemptCurrentFrameCandidate(input, frame, exhaustedDiagnostics, budget)

  assert.equal(result.status, 'SEARCH_BUDGET_EXHAUSTED', 'must return SEARCH_BUDGET_EXHAUSTED')
  if (result.status === 'SEARCH_BUDGET_EXHAUSTED') {
    assert.equal(result.frame, frame, 'frame must NOT advance')
    assert.equal(result.frame.nextCandidateIndex, 0, 'frame index must remain 0')
    assert.equal(result.diagnostics.nodesVisited, 1, 'nodesVisited must not change')
  }
}

function test_attempt_continue(): void {
  // perSet=10, tier1Floor=3, tier4Ceiling=25, 10 Tier 1 candidates
  const profiles = Array.from({ length: 10 }, (_, i) => mkProfile(`Q-${String(i + 1).padStart(3, '0')}`, 1))
  const { frame, input } = mkAttemptFrame(3, 25, 10, profiles)
  const diagnostics = createSearchDiagnostics()
  const budget = { maxNodesVisited: 10 }

  const result = attemptCurrentFrameCandidate(input, frame, diagnostics, budget)

  assert.equal(result.status, 'ATTEMPTED')
  if (result.status === 'ATTEMPTED') {
    assert.equal(result.transition.status, 'CONTINUE', 'transition must be CONTINUE')
    assert.equal(result.parentFrame.nextCandidateIndex, 1, 'frame index must advance to 1')
    assert.equal(result.diagnostics.nodesVisited, 1, 'exactly one node billed')
  }
}

function test_attempt_pruned(): void {
  // tier4Ceiling=0 → any Tier 4 candidate is pruned
  const tier4 = mkProfile('Q-T4', 4)
  const fillers = Array.from({ length: 50 }, (_, i) => mkProfile(`Q-F${i}`, 1))
  const profiles = [tier4, ...fillers]
  const { frame, input } = mkAttemptFrame(30, 0, 100, profiles)
  const diagnostics = createSearchDiagnostics()
  const budget = { maxNodesVisited: 10 }

  const result = attemptCurrentFrameCandidate(input, frame, diagnostics, budget)

  assert.equal(result.status, 'ATTEMPTED')
  if (result.status === 'ATTEMPTED') {
    assert.equal(result.transition.status, 'PRUNED', 'transition must be PRUNED')
    assert.equal(result.parentFrame.nextCandidateIndex, 1, 'frame still advances exactly 1')
    assert.equal(result.diagnostics.nodesVisited, 1, 'one node billed for PRUNED')
  }
}

function test_attempt_complete(): void {
  // perSet=1, tier1Floor=1, tier4Ceiling=1 → one Tier 1 candidate completes allocation
  const profiles = [mkProfile('Q-001', 1)]
  const { frame, input } = mkAttemptFrame(1, 1, 1, profiles)
  const diagnostics = createSearchDiagnostics()
  const budget = { maxNodesVisited: 5 }

  const result = attemptCurrentFrameCandidate(input, frame, diagnostics, budget)

  assert.equal(result.status, 'ATTEMPTED')
  if (result.status === 'ATTEMPTED') {
    assert.equal(result.transition.status, 'COMPLETE', 'transition must be COMPLETE')
    assert.equal(result.parentFrame.nextCandidateIndex, 1, 'frame advances exactly 1')
    assert.equal(result.diagnostics.nodesVisited, 1, 'one node billed for COMPLETE')
  }
}

function test_attempt_candidate_selection(): void {
  // Frame must attempt orderedCandidates[nextCandidateIndex]
  const p1 = mkProfile('Q-001', 1)
  const p2 = mkProfile('Q-002', 1)
  const p3 = mkProfile('Q-003', 1)
  const profiles = [p3, p1, p2] // unsorted input
  const { frame, input } = mkAttemptFrame(3, 25, 100, profiles)
  const diagnostics = createSearchDiagnostics()
  const budget = { maxNodesVisited: 5 }

  // orderedCandidates will be lexically sorted [Q-001, Q-002, Q-003]
  const result = attemptCurrentFrameCandidate(input, frame, diagnostics, budget)

  assert.equal(result.status, 'ATTEMPTED')
  if (result.status === 'ATTEMPTED') {
    assert.equal(
      result.candidate.questionCode,
      frame.orderedCandidates[0]!.questionCode,
      'candidate must equal orderedCandidates[0]'
    )
  }
}

function test_attempt_remaining_candidates(): void {
  const p1 = mkProfile('Q-001', 1)
  const p2 = mkProfile('Q-002', 1)
  const p3 = mkProfile('Q-003', 2)
  const profiles = [p1, p2, p3]
  const { frame, input } = mkAttemptFrame(1, 25, 100, profiles)
  const diagnostics = createSearchDiagnostics()
  const budget = { maxNodesVisited: 5 }

  const result = attemptCurrentFrameCandidate(input, frame, diagnostics, budget)

  assert.equal(result.status, 'ATTEMPTED')
  if (result.status === 'ATTEMPTED') {
    const attemptedCode = result.candidate.questionCode
    const remaining = result.remainingCandidates.map((c) => c.questionCode)
    assert.equal(remaining.includes(attemptedCode), false, 'attempted candidate must be excluded')
    assert.equal(result.remainingCandidates.length, profiles.length - 1, 'all other candidates preserved')
  }
}

function test_attempt_immutability(): void {
  const profiles = [mkProfile('Q-001', 1), mkProfile('Q-002', 1)]
  const { frame, input } = mkAttemptFrame(1, 25, 100, profiles)
  const diagnostics = createSearchDiagnostics()
  const budget = { maxNodesVisited: 5 }

  const indexBefore = frame.nextCandidateIndex
  const nodesBefore = diagnostics.nodesVisited
  const placedBefore = frame.accounting.placedCount

  attemptCurrentFrameCandidate(input, frame, diagnostics, budget)

  assert.equal(frame.nextCandidateIndex, indexBefore, 'original frame index must not be mutated')
  assert.equal(diagnostics.nodesVisited, nodesBefore, 'original diagnostics must not be mutated')
  assert.equal(frame.accounting.placedCount, placedBefore, 'accounting must not be mutated')
}

// ─── createChildFrameFromAttempt Tests ───────────────────────────────────────

function mkContinueAttempt(
  profiles: PreTieCandidateProfile[],
  selected: readonly PreTieCandidateProfile[] = [],
  tier1Floor = 3,
  tier4Ceiling = 25,
  perSet = 10
): {
  attempt: Extract<FrameAttemptResult, { status: 'ATTEMPTED' }>
  input: ReturnType<typeof buildSetSolverInput>
  originalFrame: SearchFrame
} {
  const base = buildConstraintSnapshot()
  const snapshot: ConstraintSnapshot = {
    ...base,
    target: { sets: 5, perSet },
    distributionConstraints: { ...base.distributionConstraints, tier1Floor, tier4Ceiling },
  }
  const input = buildSetSolverInput({ setNumber: 1, profiles }, snapshot)
  const { accounting } = createSearchRoot(input)
  const frame = createSearchFrame(input, accounting, profiles, selected)
  const diagnostics = createSearchDiagnostics()
  const budget = { maxNodesVisited: 10 }
  const result = attemptCurrentFrameCandidate(input, frame, diagnostics, budget)

  assert.equal(result.status, 'ATTEMPTED', 'fixture must produce ATTEMPTED')
  if (result.status !== 'ATTEMPTED') {
    throw new Error('fixture setup failed: expected ATTEMPTED')
  }
  assert.equal(result.transition.status, 'CONTINUE', 'fixture must produce CONTINUE transition')

  return { attempt: result, input, originalFrame: frame }
}

function test_child_accounting_from_transition(): void {
  const profiles = Array.from({ length: 10 }, (_, i) => mkProfile(`Q-${String(i + 1).padStart(3, '0')}`, 1))
  const { attempt, input } = mkContinueAttempt(profiles)
  const child = createChildFrameFromAttempt(input, attempt)

  assert.equal(
    child.accounting,
    attempt.transition.accounting,
    'child.accounting must be the post-apply accounting from the CONTINUE transition'
  )
  assert.equal(child.accounting.placedCount, 1, 'child accounting must reflect one placement')
}

function test_child_remaining_candidates(): void {
  const profiles = Array.from({ length: 10 }, (_, i) => mkProfile(`Q-${String(i + 1).padStart(3, '0')}`, 1))
  const { attempt, input } = mkContinueAttempt(profiles)
  const child = createChildFrameFromAttempt(input, attempt)

  assert.notEqual(
    child.remainingCandidates,
    attempt.remainingCandidates,
    'child.remainingCandidates must be a new array'
  )
  assert.equal(
    child.remainingCandidates.length,
    attempt.remainingCandidates.length,
    'child remaining pool must preserve all post-attempt candidates'
  )
  for (const rem of attempt.remainingCandidates) {
    const found = child.remainingCandidates.find((c) => c.questionCode === rem.questionCode)
    assert.ok(found !== undefined, `remaining candidate ${rem.questionCode} must be present in child pool`)
    assert.equal(found, rem, 'CandidateProfile references must be identical')
  }
}

function test_child_selected_candidates(): void {
  const sel1 = mkProfile('Q-PREV-A', 1)
  const sel2 = mkProfile('Q-PREV-B', 1)
  const profiles = Array.from({ length: 10 }, (_, i) => mkProfile(`Q-${String(i + 1).padStart(3, '0')}`, 1))
  const { attempt, input } = mkContinueAttempt(profiles, [sel1, sel2])
  const child = createChildFrameFromAttempt(input, attempt)

  assert.notEqual(child.selectedCandidates, attempt.parentFrame.selectedCandidates, 'child selectedCandidates must be a new array')
  assert.equal(child.selectedCandidates.length, 3, 'child path must append exactly one candidate to parent path')
  assert.equal(child.selectedCandidates[0], sel1, 'parent selected path entry 0 preserved')
  assert.equal(child.selectedCandidates[1], sel2, 'parent selected path entry 1 preserved')
  assert.equal(child.selectedCandidates[2], attempt.candidate, 'attempted candidate appended exactly once at end')
  assert.equal(
    child.selectedCandidates.filter((c) => c === attempt.candidate).length,
    1,
    'attempted candidate must appear exactly once in child path'
  )
}

function test_child_next_candidate_index_zero(): void {
  const profiles = Array.from({ length: 10 }, (_, i) => mkProfile(`Q-${String(i + 1).padStart(3, '0')}`, 1))
  const { attempt, input } = mkContinueAttempt(profiles)
  const child = createChildFrameFromAttempt(input, attempt)

  assert.equal(child.nextCandidateIndex, 0, 'child frame must start at nextCandidateIndex = 0')
}

function test_child_ordering_recomputed_from_new_accounting(): void {
  const profiles = [
    mkProfile('Q-C', 2),
    mkProfile('Q-A', 1),
    mkProfile('Q-D', 2),
    mkProfile('Q-B', 1),
    mkProfile('Q-E', 1),
    mkProfile('Q-F', 1),
    mkProfile('Q-G', 1),
    mkProfile('Q-H', 1),
    mkProfile('Q-I', 1),
    mkProfile('Q-J', 1),
  ]
  const { attempt, input, originalFrame } = mkContinueAttempt(profiles)
  const child = createChildFrameFromAttempt(input, attempt)

  const expectedOrder = orderCandidates(
    child.accounting,
    child.remainingCandidates,
    input.constraintSnapshot
  )

  assert.deepEqual(
    child.orderedCandidates.map((c) => c.questionCode),
    expectedOrder.map((c) => c.questionCode),
    'child orderedCandidates must match orderCandidates computed from NEW child accounting'
  )
  assert.notDeepEqual(
    child.orderedCandidates.map((c) => c.questionCode),
    originalFrame.orderedCandidates.map((c) => c.questionCode),
    'child ordering must differ from parent ordering after accounting/pool change'
  )
  assert.equal(
    child.orderedCandidates.some((c) => c.questionCode === attempt.candidate.questionCode),
    false,
    'attempted candidate must not appear in child orderedCandidates'
  )
}

function test_child_parent_frame_immutability(): void {
  const profiles = Array.from({ length: 10 }, (_, i) => mkProfile(`Q-${String(i + 1).padStart(3, '0')}`, 1))
  const { attempt, input, originalFrame } = mkContinueAttempt(profiles)
  const parentFrame = attempt.parentFrame

  const parentIndexBefore = parentFrame.nextCandidateIndex
  const parentSelectedBefore = [...parentFrame.selectedCandidates]
  const parentRemainingBefore = [...parentFrame.remainingCandidates]
  const parentOrderedBefore = [...parentFrame.orderedCandidates]
  const parentPlacedBefore = parentFrame.accounting.placedCount

  const originalIndexBefore = originalFrame.nextCandidateIndex
  const originalSelectedBefore = [...originalFrame.selectedCandidates]
  const originalPlacedBefore = originalFrame.accounting.placedCount

  createChildFrameFromAttempt(input, attempt)

  assert.equal(parentFrame.nextCandidateIndex, parentIndexBefore, 'parentFrame index must not change')
  assert.deepEqual(
    parentFrame.selectedCandidates.map((c) => c.questionCode),
    parentSelectedBefore.map((c) => c.questionCode),
    'parentFrame selectedCandidates must not change'
  )
  assert.deepEqual(
    parentFrame.remainingCandidates.map((c) => c.questionCode),
    parentRemainingBefore.map((c) => c.questionCode),
    'parentFrame remainingCandidates must not change'
  )
  assert.deepEqual(
    parentFrame.orderedCandidates.map((c) => c.questionCode),
    parentOrderedBefore.map((c) => c.questionCode),
    'parentFrame orderedCandidates must not change'
  )
  assert.equal(parentFrame.accounting.placedCount, parentPlacedBefore, 'parentFrame accounting must not change')

  assert.equal(originalFrame.nextCandidateIndex, originalIndexBefore, 'original frame index must not change')
  assert.deepEqual(
    originalFrame.selectedCandidates.map((c) => c.questionCode),
    originalSelectedBefore.map((c) => c.questionCode),
    'original frame selectedCandidates must not change'
  )
  assert.equal(originalFrame.accounting.placedCount, originalPlacedBefore, 'original frame accounting must not change')
}

function test_child_pruned_attempt_fail_loud(): void {
  const tier4 = mkProfile('Q-T4', 4)
  const fillers = Array.from({ length: 50 }, (_, i) => mkProfile(`Q-F${i}`, 1))
  const profiles = [tier4, ...fillers]
  const { frame, input } = mkAttemptFrame(30, 0, 100, profiles)
  const diagnostics = createSearchDiagnostics()
  const budget = { maxNodesVisited: 10 }

  const result = attemptCurrentFrameCandidate(input, frame, diagnostics, budget)
  assert.equal(result.status, 'ATTEMPTED')
  if (result.status !== 'ATTEMPTED') {
    throw new Error('fixture setup failed: expected ATTEMPTED')
  }
  assert.equal(result.transition.status, 'PRUNED')

  assert.throws(
    () => createChildFrameFromAttempt(input, result),
    (err: Error) =>
      err.message.includes('Fatal BoundedSearch error') &&
      err.message.includes("createChildFrameFromAttempt requires a CONTINUE transition, received 'PRUNED'"),
    'PRUNED attempt must fail loud'
  )
}

function test_child_complete_attempt_fail_loud(): void {
  const profiles = [mkProfile('Q-001', 1)]
  const { frame, input } = mkAttemptFrame(1, 1, 1, profiles)
  const diagnostics = createSearchDiagnostics()
  const budget = { maxNodesVisited: 5 }

  const result = attemptCurrentFrameCandidate(input, frame, diagnostics, budget)
  assert.equal(result.status, 'ATTEMPTED')
  if (result.status !== 'ATTEMPTED') {
    throw new Error('fixture setup failed: expected ATTEMPTED')
  }
  assert.equal(result.transition.status, 'COMPLETE')

  assert.throws(
    () => createChildFrameFromAttempt(input, result),
    (err: Error) =>
      err.message.includes('Fatal BoundedSearch error') &&
      err.message.includes("createChildFrameFromAttempt requires a CONTINUE transition, received 'COMPLETE'"),
    'COMPLETE attempt must fail loud'
  )
}

// ─── Search Stack / Backtrack Tests ──────────────────────────────────────────

function mkStackFrame(candidateCount: number, advanceBy = 0): SearchFrame {
  const pool = Array.from({ length: candidateCount }, (_, i) =>
    mkProfile(`Q-${String(i + 1).padStart(3, '0')}`, 1)
  )
  const input = mkInput(pool)
  const { accounting } = createSearchRoot(input)
  let frame = createSearchFrame(input, accounting, pool, [])
  for (let i = 0; i < advanceBy; i++) {
    frame = advanceSearchFrame(frame)
  }
  return frame
}

function mkExhaustedFrame(candidateCount: number): SearchFrame {
  return mkStackFrame(candidateCount, candidateCount)
}

function test_stack_root(): void {
  const rootFrame = mkStackFrame(3)
  const stack = createSearchStack(rootFrame)

  assert.equal(stack.frames.length, 1, 'root stack must contain exactly one frame')
  assert.equal(stack.frames[0], rootFrame, 'root frame reference must be preserved')
  assert.notEqual(stack.frames, [rootFrame], 'frames must be a new array')
}

function test_stack_push_child(): void {
  const parentFrame = mkStackFrame(3, 1)
  const childFrame = mkStackFrame(2)
  const rootStack = createSearchStack(parentFrame)
  const pushed = pushSearchFrame(rootStack, childFrame)

  assert.equal(pushed.frames.length, 2, 'stack must have parent and child')
  assert.equal(pushed.frames[0], parentFrame, 'parent frame reference must be preserved')
  assert.equal(pushed.frames[1], childFrame, 'child frame must be appended exactly once')
  assert.notEqual(pushed.frames, rootStack.frames, 'push must return a new frames array')
}

function test_stack_push_multiple(): void {
  const rootFrame = mkStackFrame(3)
  const child1 = mkStackFrame(2)
  const child2 = mkStackFrame(2, 1)

  const stack0 = createSearchStack(rootFrame)
  const stack1 = pushSearchFrame(stack0, child1)
  const stack2 = pushSearchFrame(stack1, child2)

  assert.deepEqual(
    stack2.frames.map((f) => f.nextCandidateIndex),
    [0, 0, 1],
    'frame order must be preserved with newest child on top'
  )
  assert.equal(stack2.frames[0], rootFrame, 'root reference preserved')
  assert.equal(stack2.frames[1], child1, 'first child reference preserved')
  assert.equal(stack2.frames[2], child2, 'newest child is top frame')
}

function test_backtrack_exhausted_child(): void {
  const parentFrame = mkStackFrame(3, 1)
  const exhaustedChild = mkExhaustedFrame(2)
  const stack = pushSearchFrame(createSearchStack(parentFrame), exhaustedChild)

  const result = backtrackExhaustedChild(stack, createSearchDiagnostics())

  assert.equal(result.stack.frames.length, 1, 'top child must be removed')
  assert.equal(result.stack.frames[0], parentFrame, 'parent becomes top frame again')
  assert.equal(result.stack.frames[0]!.nextCandidateIndex, 1, 'parent frame reference preserved with advanced index')
}

function test_backtrack_diagnostics(): void {
  const parentFrame = mkStackFrame(3, 1)
  const exhaustedChild = mkExhaustedFrame(2)
  const stack = pushSearchFrame(createSearchStack(parentFrame), exhaustedChild)
  const diagnostics = recordNodeVisit(recordNodeVisit(createSearchDiagnostics())) // nodesVisited = 2

  const result = backtrackExhaustedChild(stack, diagnostics)

  assert.equal(result.diagnostics.backtracks, 1, 'one child pop must increment backtracks by 1')
  assert.equal(result.diagnostics.nodesVisited, 2, 'nodesVisited must remain unchanged')
}

function test_backtrack_non_exhausted_child_fail_loud(): void {
  const parentFrame = mkStackFrame(3, 1)
  const nonExhaustedChild = mkStackFrame(2, 0) // index 0, not exhausted
  const stack = pushSearchFrame(createSearchStack(parentFrame), nonExhaustedChild)

  assert.throws(
    () => backtrackExhaustedChild(stack, createSearchDiagnostics()),
    (err: Error) =>
      err.message.includes('Fatal BoundedSearch error') &&
      err.message.includes('backtrackExhaustedChild requires exhausted top frame'),
    'non-exhausted child must fail loud'
  )
}

function test_backtrack_root_only_fail_loud(): void {
  const rootFrame = mkExhaustedFrame(2)
  const stack = createSearchStack(rootFrame)

  assert.throws(
    () => backtrackExhaustedChild(stack, createSearchDiagnostics()),
    (err: Error) =>
      err.message.includes('Fatal BoundedSearch error') &&
      err.message.includes('backtrackExhaustedChild cannot pop root frame'),
    'root-only stack must fail loud'
  )
  assert.equal(stack.frames.length, 1, 'root must never be popped')
  assert.equal(stack.frames[0], rootFrame, 'root frame must remain intact')
}

function test_backtrack_empty_stack_fail_loud(): void {
  const emptyStack: SearchStack = { frames: [] }

  assert.throws(
    () => backtrackExhaustedChild(emptyStack, createSearchDiagnostics()),
    (err: Error) =>
      err.message.includes('Fatal BoundedSearch error') &&
      err.message.includes('backtrackExhaustedChild called on empty stack'),
    'empty stack must fail loud'
  )
}

function test_stack_backtrack_immutability(): void {
  const parentFrame = mkStackFrame(3, 1)
  const exhaustedChild = mkExhaustedFrame(2)
  const stack = pushSearchFrame(createSearchStack(parentFrame), exhaustedChild)
  const diagnostics = createSearchDiagnostics()

  const framesBefore = stack.frames
  const framesLenBefore = stack.frames.length
  const backtracksBefore = diagnostics.backtracks
  const nodesBefore = diagnostics.nodesVisited

  backtrackExhaustedChild(stack, diagnostics)

  assert.equal(stack.frames, framesBefore, 'original stack.frames reference must be unchanged')
  assert.equal(stack.frames.length, framesLenBefore, 'original stack.frames length must be unchanged')
  assert.equal(diagnostics.backtracks, backtracksBefore, 'input diagnostics.backtracks must not be mutated')
  assert.equal(diagnostics.nodesVisited, nodesBefore, 'input diagnostics.nodesVisited must not be mutated')
}

function test_backtrack_resume_next_sibling(): void {
  const parentFrame = mkStackFrame(3, 1) // already advanced: nextCandidateIndex = 1
  assert.equal(parentFrame.nextCandidateIndex, 1, 'fixture: parent must start advanced')

  const exhaustedChild = mkExhaustedFrame(2)
  const stack = pushSearchFrame(createSearchStack(parentFrame), exhaustedChild)

  const result = backtrackExhaustedChild(stack, createSearchDiagnostics())

  assert.equal(
    result.stack.frames[0]!.nextCandidateIndex,
    1,
    'after backtrack, parent must still be at nextCandidateIndex = 1 to resume next sibling'
  )
  assert.equal(result.stack.frames[0], parentFrame, 'returned parent must be the same already-advanced frame')
}

// ─── replaceTopSearchFrame Tests ─────────────────────────────────────────────

function test_replace_top_single_frame(): void {
  const rootFrame = mkStackFrame(3, 0)
  const advancedRoot = advanceSearchFrame(rootFrame)
  const stack = createSearchStack(rootFrame)

  const replaced = replaceTopSearchFrame(stack, advancedRoot)

  assert.equal(replaced.frames.length, 1, 'single-frame stack length must remain 1')
  assert.equal(replaced.frames[0], advancedRoot, 'replacement must be exact top reference')
  assert.notEqual(replaced.frames[0], rootFrame, 'top frame must be replaced, not original root')
  assert.equal(replaced.frames[0]!.nextCandidateIndex, 1, 'advanced root must be at next sibling index')
}

function test_replace_top_multi_frame(): void {
  const rootFrame = mkStackFrame(3, 0)
  const parentFrame = mkStackFrame(3, 1)
  const childFrame = mkStackFrame(2, 0)
  const advancedChild = advanceSearchFrame(childFrame)

  const stack = pushSearchFrame(pushSearchFrame(createSearchStack(rootFrame), parentFrame), childFrame)
  const replaced = replaceTopSearchFrame(stack, advancedChild)

  assert.equal(replaced.frames.length, 3, 'stack depth must remain unchanged')
  assert.equal(replaced.frames[0], rootFrame, 'root reference must be preserved')
  assert.equal(replaced.frames[1], parentFrame, 'parent reference must be preserved')
  assert.equal(replaced.frames[2], advancedChild, 'only top frame must be replaced')
  assert.notEqual(replaced.frames[2], childFrame, 'original child must not remain on stack')
}

function test_replace_top_exactly_once(): void {
  const rootFrame = mkStackFrame(3, 0)
  const parentFrame = mkStackFrame(3, 1)
  const childFrame = mkStackFrame(2, 0)
  const advancedChild = advanceSearchFrame(childFrame)
  const stack = pushSearchFrame(pushSearchFrame(createSearchStack(rootFrame), parentFrame), childFrame)

  const replaced = replaceTopSearchFrame(stack, advancedChild)

  assert.equal(
    replaced.frames.filter((f) => f === advancedChild).length,
    1,
    'replacement must appear exactly once in frames'
  )
}

function test_replace_top_empty_stack_fail_loud(): void {
  const emptyStack: SearchStack = { frames: [] }
  const replacement = mkStackFrame(2, 1)

  assert.throws(
    () => replaceTopSearchFrame(emptyStack, replacement),
    (err: Error) =>
      err.message.includes('Fatal BoundedSearch error') &&
      err.message.includes('replaceTopSearchFrame called on empty stack'),
    'empty stack must fail loud'
  )
}

function test_replace_top_immutability(): void {
  const rootFrame = mkStackFrame(3, 0)
  const parentFrame = mkStackFrame(3, 1)
  const childFrame = mkStackFrame(2, 0)
  const advancedChild = advanceSearchFrame(childFrame)
  const stack = pushSearchFrame(pushSearchFrame(createSearchStack(rootFrame), parentFrame), childFrame)

  const framesBefore = stack.frames
  const framesLenBefore = stack.frames.length
  const topBefore = stack.frames[stack.frames.length - 1]

  replaceTopSearchFrame(stack, advancedChild)

  assert.equal(stack.frames, framesBefore, 'original stack.frames reference must be unchanged')
  assert.equal(stack.frames.length, framesLenBefore, 'original stack.frames length must be unchanged')
  assert.equal(stack.frames[stack.frames.length - 1], topBefore, 'original top frame must remain on input stack')
}

function test_replace_top_dfs_composition(): void {
  const parentAtA = mkStackFrame(3, 0) // nextCandidateIndex = 0 → candidate A next
  assert.equal(parentAtA.nextCandidateIndex, 0, 'fixture: parent starts at candidate A')

  const parentAtB = advanceSearchFrame(parentAtA) // attempted A → now at candidate B
  assert.equal(parentAtB.nextCandidateIndex, 1, 'fixture: advanced parent at candidate B')

  let stack = createSearchStack(parentAtA)
  assert.equal(stack.frames[0]!.nextCandidateIndex, 0, 'initial stack: parent at candidate A')

  stack = replaceTopSearchFrame(stack, parentAtB)
  assert.equal(stack.frames[0]!.nextCandidateIndex, 1, 'after replace: parent at candidate B')

  const continueChild = mkStackFrame(2, 0)
  const exhaustedChild = mkExhaustedFrame(2)
  stack = pushSearchFrame(stack, continueChild)
  stack = replaceTopSearchFrame(stack, exhaustedChild)

  const result = backtrackExhaustedChild(stack, createSearchDiagnostics())

  assert.equal(result.stack.frames.length, 1, 'final stack must contain only parent')
  assert.equal(result.stack.frames[0], parentAtB, 'final parent must be the advanced parent at candidate B')
  assert.equal(result.stack.frames[0]!.nextCandidateIndex, 1, 'final parent must remain at candidate B for next sibling')
}

// ─── stepSearchTraversal Tests ───────────────────────────────────────────────

function mkTraversalSetup(
  profiles: PreTieCandidateProfile[],
  tier1Floor: number,
  tier4Ceiling: number,
  perSet: number,
  advanceBy = 0
): { input: ReturnType<typeof buildSetSolverInput>; frame: SearchFrame } {
  const base = buildConstraintSnapshot()
  const snapshot: ConstraintSnapshot = {
    ...base,
    target: { sets: 5, perSet },
    distributionConstraints: { ...base.distributionConstraints, tier1Floor, tier4Ceiling },
  }
  const input = buildSetSolverInput({ setNumber: 1, profiles }, snapshot)
  const { accounting } = createSearchRoot(input)
  let frame = createSearchFrame(input, accounting, profiles, [])
  for (let i = 0; i < advanceBy; i++) {
    frame = advanceSearchFrame(frame)
  }
  return { input, frame }
}

function test_step_root_exhausted(): void {
  const pool = Array.from({ length: 2 }, (_, i) => mkProfile(`Q-${String(i + 1).padStart(3, '0')}`, 1))
  const { input, frame } = mkTraversalSetup(pool, 1, 25, 100, 2)
  const exhaustedRoot = frame
  const stack = createSearchStack(exhaustedRoot)
  const diagnostics = createSearchDiagnostics()

  const result = stepSearchTraversal(input, stack, diagnostics, { maxNodesVisited: 100 })

  assert.equal(result.status, 'ROOT_EXHAUSTED')
  if (result.status === 'ROOT_EXHAUSTED') {
    assert.equal(result.diagnostics, diagnostics, 'diagnostics reference must be unchanged')
    assert.equal(result.diagnostics.backtracks, 0, 'backtracks must remain unchanged')
    assert.equal(result.diagnostics.nodesVisited, 0, 'nodesVisited must remain unchanged')
  }
}

function test_step_exhausted_child_backtrack(): void {
  const parentPool = Array.from({ length: 3 }, (_, i) => mkProfile(`Q-${String(i + 1).padStart(3, '0')}`, 1))
  const { input, frame: parentFrame } = mkTraversalSetup(parentPool, 1, 25, 100, 1)
  const exhaustedChild = mkExhaustedFrame(2)
  const stack = pushSearchFrame(createSearchStack(parentFrame), exhaustedChild)
  const diagnostics = recordNodeVisit(createSearchDiagnostics())

  const result = stepSearchTraversal(input, stack, diagnostics, { maxNodesVisited: 100 })

  assert.equal(result.status, 'ADVANCED')
  if (result.status === 'ADVANCED') {
    assert.equal(result.stack.frames.length, 1, 'exhausted child must be popped')
    assert.equal(result.stack.frames[0], parentFrame, 'parent must become top frame again')
    assert.equal(result.diagnostics.backtracks, 1, 'backtracks must increment by 1')
    assert.equal(result.diagnostics.nodesVisited, 1, 'nodesVisited must remain unchanged')
  }
}

function test_step_budget_exhausted(): void {
  const pool = Array.from({ length: 3 }, (_, i) => mkProfile(`Q-${String(i + 1).padStart(3, '0')}`, 1))
  const { input, frame } = mkTraversalSetup(pool, 1, 25, 100, 0)
  const stack = createSearchStack(frame)
  const diagnostics = recordNodeVisit(createSearchDiagnostics())
  const budget = { maxNodesVisited: 1 }

  const topIndexBefore = stack.frames[stack.frames.length - 1]!.nextCandidateIndex
  const framesBefore = stack.frames

  const result = stepSearchTraversal(input, stack, diagnostics, budget)

  assert.equal(result.status, 'SEARCH_BUDGET_EXHAUSTED')
  if (result.status === 'SEARCH_BUDGET_EXHAUSTED') {
    assert.equal(result.diagnostics.nodesVisited, 1, 'no additional node must be consumed')
    assert.equal(stack.frames, framesBefore, 'input stack must be unchanged')
    assert.equal(
      stack.frames[stack.frames.length - 1]!.nextCandidateIndex,
      topIndexBefore,
      'top frame index must remain unchanged'
    )
  }
}

function test_step_pruned(): void {
  const candidate = mkProfile('Q-T4', 4)
  const { input, frame } = mkTraversalSetup([candidate], 0, 0, 100, 0)
  const stack = createSearchStack(frame)
  const diagnostics = createSearchDiagnostics()

  const result = stepSearchTraversal(input, stack, diagnostics, { maxNodesVisited: 10 })

  assert.equal(result.status, 'ADVANCED')
  if (result.status === 'ADVANCED') {
    assert.equal(result.stack.frames.length, 1, 'PRUNED must not push a child frame')
    assert.equal(result.stack.frames[0]!.nextCandidateIndex, 1, 'parent top must be replaced with advanced frame')
    assert.equal(result.diagnostics.nodesVisited, 1, 'nodesVisited must increment by 1')
    assert.equal(result.diagnostics.backtracks, 0, 'backtracks must remain unchanged')
  }
}

function test_step_continue(): void {
  const profiles = Array.from({ length: 10 }, (_, i) => mkProfile(`Q-${String(i + 1).padStart(3, '0')}`, 1))
  const { input, frame } = mkTraversalSetup(profiles, 3, 25, 10, 0)
  const stack = createSearchStack(frame)
  const diagnostics = createSearchDiagnostics()
  const attemptedCode = frame.orderedCandidates[0]!.questionCode

  const result = stepSearchTraversal(input, stack, diagnostics, { maxNodesVisited: 10 })

  assert.equal(result.status, 'ADVANCED')
  if (result.status === 'ADVANCED') {
    assert.equal(result.stack.frames.length, 2, 'CONTINUE must push exactly one child frame')
    assert.equal(result.stack.frames[0]!.nextCandidateIndex, 1, 'parent must be advanced on stack')
    const child = result.stack.frames[1]!
    assert.equal(
      child.selectedCandidates.filter((c) => c.questionCode === attemptedCode).length,
      1,
      'child selected path must include attempted candidate exactly once'
    )
    assert.equal(child.selectedCandidates[child.selectedCandidates.length - 1]!.questionCode, attemptedCode)
    assert.equal(result.diagnostics.nodesVisited, 1, 'nodesVisited must increment by 1')
  }
}

function test_step_complete(): void {
  const candidate = mkProfile('Q-001', 1)
  const { input, frame } = mkTraversalSetup([candidate], 1, 1, 1, 0)
  const stack = createSearchStack(frame)
  const diagnostics = createSearchDiagnostics()

  const result = stepSearchTraversal(input, stack, diagnostics, { maxNodesVisited: 5 })

  assert.equal(result.status, 'COMPLETE')
  if (result.status === 'COMPLETE') {
    assert.equal(result.selectedCandidates.length, 1, 'selected path must contain one candidate')
    assert.equal(result.selectedCandidates[0]!.questionCode, 'Q-001')
    assert.equal(
      result.selectedCandidates.filter((c) => c.questionCode === 'Q-001').length,
      1,
      'candidate must appear exactly once in selected path'
    )
    assert.equal(result.finalAccounting.placedCount, 1, 'finalAccounting must reflect completed placement')
    assert.equal(result.diagnostics.nodesVisited, 1, 'nodesVisited must increment by 1')
  }
}

function test_step_resume_sibling_regression(): void {
  const candidateA = mkProfile('Q-001', 1)
  const candidateB = mkProfile('Q-002', 1)
  const candidateTier4 = mkProfile('Q-T4', 4)
  const { input, frame } = mkTraversalSetup([candidateA, candidateB, candidateTier4], 1, 0, 3, 0)

  assert.equal(frame.nextCandidateIndex, 0, 'parent must start at candidate A')
  assert.equal(frame.orderedCandidates[0]!.questionCode, 'Q-001', 'candidate A must be first sibling')

  let stack = createSearchStack(frame)
  let diagnostics = createSearchDiagnostics()

  const continueStep = stepSearchTraversal(input, stack, diagnostics, { maxNodesVisited: 20 })
  assert.equal(continueStep.status, 'ADVANCED')
  if (continueStep.status !== 'ADVANCED') {
    throw new Error('fixture setup failed: expected CONTINUE step on candidate A')
  }
  stack = continueStep.stack
  diagnostics = continueStep.diagnostics
  assert.equal(stack.frames.length, 2, 'CONTINUE must push child')
  assert.equal(stack.frames[0]!.nextCandidateIndex, 1, 'parent must advance past candidate A')

  const childContinueStep = stepSearchTraversal(input, stack, diagnostics, { maxNodesVisited: 20 })
  assert.equal(childContinueStep.status, 'ADVANCED')
  if (childContinueStep.status !== 'ADVANCED') {
    throw new Error('fixture setup failed: expected child CONTINUE step on candidate B')
  }
  stack = childContinueStep.stack
  diagnostics = childContinueStep.diagnostics
  assert.equal(stack.frames.length, 3, 'child CONTINUE must push grandchild')

  const grandchildPruneStep = stepSearchTraversal(input, stack, diagnostics, { maxNodesVisited: 20 })
  assert.equal(grandchildPruneStep.status, 'ADVANCED')
  if (grandchildPruneStep.status !== 'ADVANCED') {
    throw new Error('fixture setup failed: expected grandchild PRUNED step')
  }
  stack = grandchildPruneStep.stack
  diagnostics = grandchildPruneStep.diagnostics

  const grandchildBacktrackStep = stepSearchTraversal(input, stack, diagnostics, { maxNodesVisited: 20 })
  assert.equal(grandchildBacktrackStep.status, 'ADVANCED')
  if (grandchildBacktrackStep.status !== 'ADVANCED') {
    throw new Error('fixture setup failed: expected grandchild backtrack step')
  }
  stack = grandchildBacktrackStep.stack
  diagnostics = grandchildBacktrackStep.diagnostics
  assert.equal(stack.frames.length, 2, 'grandchild exhaustion must pop back to child')

  const childPruneStep = stepSearchTraversal(input, stack, diagnostics, { maxNodesVisited: 20 })
  assert.equal(childPruneStep.status, 'ADVANCED')
  if (childPruneStep.status !== 'ADVANCED') {
    throw new Error('fixture setup failed: expected child PRUNED step on tier4 sibling')
  }
  stack = childPruneStep.stack
  diagnostics = childPruneStep.diagnostics
  assert.equal(
    stack.frames[stack.frames.length - 1]!.nextCandidateIndex,
    stack.frames[stack.frames.length - 1]!.orderedCandidates.length,
    'child must be exhausted after all sibling attempts'
  )

  const backtrackStep = stepSearchTraversal(input, stack, diagnostics, { maxNodesVisited: 20 })
  assert.equal(backtrackStep.status, 'ADVANCED')
  if (backtrackStep.status === 'ADVANCED') {
    assert.equal(backtrackStep.stack.frames.length, 1, 'child must be popped after exhaustion')
    const parent = backtrackStep.stack.frames[0]!
    assert.equal(parent.nextCandidateIndex, 1, 'parent must resume at candidate B, not candidate A')
    assert.equal(parent.orderedCandidates[1]!.questionCode, 'Q-002', 'next sibling must be candidate B')
    assert.equal(parent.orderedCandidates[0]!.questionCode, 'Q-001', 'candidate A must remain the prior attempted sibling')
  }
}

function test_step_immutability(): void {
  const profiles = Array.from({ length: 10 }, (_, i) => mkProfile(`Q-${String(i + 1).padStart(3, '0')}`, 1))
  const { input, frame } = mkTraversalSetup(profiles, 3, 25, 10, 0)
  const stack = createSearchStack(frame)
  const diagnostics = createSearchDiagnostics()

  const framesBefore = stack.frames
  const stackLenBefore = stack.frames.length
  const topIndexBefore = frame.nextCandidateIndex
  const placedBefore = frame.accounting.placedCount
  const backtracksBefore = diagnostics.backtracks
  const nodesBefore = diagnostics.nodesVisited

  stepSearchTraversal(input, stack, diagnostics, { maxNodesVisited: 10 })

  assert.equal(stack.frames, framesBefore, 'input stack.frames must not be mutated')
  assert.equal(stack.frames.length, stackLenBefore, 'input stack depth must not change')
  assert.equal(frame.nextCandidateIndex, topIndexBefore, 'input frame index must not be mutated')
  assert.equal(frame.accounting.placedCount, placedBefore, 'input frame accounting must not be mutated')
  assert.equal(diagnostics.backtracks, backtracksBefore, 'input diagnostics.backtracks must not be mutated')
  assert.equal(diagnostics.nodesVisited, nodesBefore, 'input diagnostics.nodesVisited must not be mutated')
}

// ─── runBoundedSearch Driver Tests ───────────────────────────────────────────

function mkRunInputForSet(
  setNumber: 1 | 2 | 3 | 4 | 5,
  profiles: readonly PreTieCandidateProfile[],
  tier1Floor: number,
  tier4Ceiling: number,
  perSet: number
): ReturnType<typeof buildSetSolverInput> {
  const base = buildConstraintSnapshot()
  const snapshot: ConstraintSnapshot = {
    ...base,
    target: { sets: 5, perSet },
    distributionConstraints: { ...base.distributionConstraints, tier1Floor, tier4Ceiling },
  }
  return buildSetSolverInput({ setNumber, profiles: [...profiles] }, snapshot)
}

// Case 1: COMPLETE — simple deterministic first-path completion.
function test_run_complete_simple_path(): void {
  const perSet = 3
  const profiles = [mkProfile('Q-001', 1), mkProfile('Q-002', 1), mkProfile('Q-003', 1)]
  const input = mkRunInputForSet(1, profiles, perSet, perSet, perSet)
  const budget = { maxNodesVisited: 50 }

  const result = runBoundedSearch(input, budget)

  assert.equal(result.status, 'COMPLETE', 'should reach COMPLETE on the simple path')
  if (result.status === 'COMPLETE') {
    assert.equal(result.selectedCandidates.length, perSet, 'selectedCandidates.length === target.perSet')
    assert.equal(result.finalAccounting.placedCount, perSet, 'finalAccounting.placedCount === target.perSet')
    const codes = result.selectedCandidates.map((c) => c.questionCode)
    assert.equal(new Set(codes).size, codes.length, 'selected questionCodes must be unique')
    assert.ok(result.diagnostics.nodesVisited > 0, 'nodesVisited must be > 0')
    assert.ok(
      result.diagnostics.nodesVisited <= budget.maxNodesVisited,
      'nodesVisited must stay within budget'
    )
    assert.deepEqual(codes, ['Q-001', 'Q-002', 'Q-003'], 'deterministic first-path selection')
  }
}

// Case 2: driver-level backtrack proof.
//
// A COMPLETE outcome with backtracks >= 1 is impossible under the locked v1
// constraint set (perSet, within-Set uniqueness, tier1Floor, tier4Ceiling): the
// T1-first-then-lexical ordering always completes on the first descent when any
// solution exists. We therefore do NOT assert "COMPLETE => backtracks === 0"
// (that is an incidental property of the current constraint/order combination,
// not a long-term Search contract), and we do NOT add forbidden constraints to
// force a backtracking COMPLETE.
//
// Instead this case proves the runBoundedSearch driver loop itself performs
// CONTINUE-child-push -> child exhaustion -> backtrack -> resume-sibling, using
// an INFEASIBLE input where that sequence IS constructible.
//
// Fixture: perSet = 3, tier1Floor = 1, tier4Ceiling = 0.
// Universe = [Q-001 (T1), Q-T4A (T4), Q-T4B (T4)].
//
// Trace:
//  - Root (floor unmet) orders Tier 1 first: [Q-001, Q-T4A, Q-T4B].
//  - Q-001 (T1): placedCount=1, tier1=1 (floor met). remainingPositions=2,
//    remainingDistinct=2 (both T4) so universe OK; tier4=0 so ceiling OK;
//    tier1 maxReachable=1 >= floor 1; not complete -> CONTINUE. Child pushed
//    over remaining=[Q-T4A, Q-T4B].   [>=1 CONTINUE descent]
//  - Child (floor met, lexical): Q-T4A -> tier4=1 > ceiling 0 -> PRUNED;
//    Q-T4B -> PRUNED. Child exhausted -> driver backtracks to the
//    already-advanced root (index now 1).   [backtracks += 1]
//  - Root resumes sibling Q-T4A -> PRUNED; Q-T4B -> PRUNED. Root exhausted ->
//    ROOT_EXHAUSTED -> PROVEN_INFEASIBLE.
function test_run_driver_backtrack_on_infeasible(): void {
  // tier4Ceiling = 0 forbids every Tier 4 candidate; the single Tier 1 reaches
  // the floor so the first pick CONTINUEs, but only Tier 4 candidates remain,
  // so the child subtree cannot complete and must exhaust -> backtrack.
  const profiles = [mkProfile('Q-001', 1), mkProfile('Q-T4A', 4), mkProfile('Q-T4B', 4)]
  const input = mkRunInputForSet(1, profiles, 1, 0, 3) // perSet=3, floor=1, ceiling=0
  const budget = { maxNodesVisited: 50 }

  const result = runBoundedSearch(input, budget)

  assert.notEqual(result.status, 'SEARCH_BUDGET_EXHAUSTED', 'must not be reported as budget exhaustion')
  assert.equal(result.status, 'PROVEN_INFEASIBLE', 'infeasible input must be proven infeasible')
  assert.ok(
    result.diagnostics.backtracks >= 1,
    `driver must backtrack at least once after a CONTINUE child exhausts (got ${result.diagnostics.backtracks})`
  )
  assert.ok(
    result.diagnostics.nodesVisited < budget.maxNodesVisited,
    `infeasibility must be proven without budget exhaustion (visited ${result.diagnostics.nodesVisited}, budget ${budget.maxNodesVisited})`
  )
}

// Case 3: SEARCH_BUDGET_EXHAUSTED — solvable input, intentionally tiny budget.
function test_run_search_budget_exhausted(): void {
  const perSet = 3
  const profiles = [mkProfile('Q-001', 1), mkProfile('Q-002', 1), mkProfile('Q-003', 1)]
  const input = mkRunInputForSet(1, profiles, perSet, perSet, perSet)
  const budget = { maxNodesVisited: 2 } // too small to reach perSet = 3

  const result = runBoundedSearch(input, budget)

  assert.notEqual(result.status, 'PROVEN_INFEASIBLE', 'budget exhaustion must NEVER be reported as infeasible')
  assert.equal(result.status, 'SEARCH_BUDGET_EXHAUSTED')
  assert.equal(
    result.diagnostics.nodesVisited,
    budget.maxNodesVisited,
    'nodesVisited must equal maxNodesVisited at exhaustion'
  )
}

// Case 4: PROVEN_INFEASIBLE — small universe, fully exhaustible within budget, no
// valid allocation exists.
function test_run_proven_infeasible(): void {
  // perSet = 2, tier1Floor = 2, but only one Tier 1 candidate exists.
  const profiles = [mkProfile('Q-001', 1), mkProfile('Q-002', 2)]
  const input = mkRunInputForSet(1, profiles, 2, 3, 2)
  const budget = { maxNodesVisited: 50 }

  const result = runBoundedSearch(input, budget)

  assert.equal(result.status, 'PROVEN_INFEASIBLE')
  assert.notEqual(result.status, 'COMPLETE', 'no COMPLETE allocation may be returned')
  assert.ok(
    result.diagnostics.nodesVisited < budget.maxNodesVisited,
    'budget must NOT be exhausted when proving infeasibility'
  )
}

// Case 5: Empty candidate universe.
function test_run_empty_universe_infeasible(): void {
  const input = mkRunInputForSet(1, [], 0, 3, 3)
  const budget = { maxNodesVisited: 10 }

  const result = runBoundedSearch(input, budget)

  assert.equal(result.status, 'PROVEN_INFEASIBLE', 'empty universe must be PROVEN_INFEASIBLE')
  assert.equal(result.diagnostics.nodesVisited, 0, 'no node may be visited on an empty universe')
  assert.equal(result.diagnostics.backtracks, 0, 'no backtrack may occur on an empty universe')
}

// Case 6: Determinism — identical input + budget yields identical results.
function test_run_determinism(): void {
  const perSet = 3
  const mkInput = () =>
    mkRunInputForSet(
      1,
      [mkProfile('Q-001', 1), mkProfile('Q-002', 1), mkProfile('Q-003', 1)],
      perSet,
      perSet,
      perSet
    )
  const budget = { maxNodesVisited: 50 }

  const r1 = runBoundedSearch(mkInput(), budget)
  const r2 = runBoundedSearch(mkInput(), budget)

  assert.equal(r1.status, r2.status, 'status must be identical across runs')
  assert.equal(r1.diagnostics.nodesVisited, r2.diagnostics.nodesVisited, 'nodesVisited must match')
  assert.equal(r1.diagnostics.backtracks, r2.diagnostics.backtracks, 'backtracks must match')
  if (r1.status === 'COMPLETE' && r2.status === 'COMPLETE') {
    assert.deepEqual(
      r1.selectedCandidates.map((c) => c.questionCode),
      r2.selectedCandidates.map((c) => c.questionCode),
      'selected questionCodes must be identical when COMPLETE'
    )
  }
}

// Case 7: Within-Set uniqueness on COMPLETE.
function test_run_within_set_uniqueness(): void {
  const perSet = 4
  const profiles = Array.from({ length: perSet }, (_, i) => mkProfile(`Q-${String(i + 1).padStart(3, '0')}`, 1))
  const input = mkRunInputForSet(1, profiles, perSet, perSet, perSet)
  const result = runBoundedSearch(input, { maxNodesVisited: 50 })

  assert.equal(result.status, 'COMPLETE')
  if (result.status === 'COMPLETE') {
    const codes = result.selectedCandidates.map((c) => c.questionCode)
    assert.equal(codes.length, perSet)
    assert.equal(new Set(codes).size, perSet, 'all selected questionCodes must be distinct within the Set')
  }
}

// Case 8: Cross-Set independence — Set 1 and Set 2 both contain Q-001 and may use
// it independently with no shared state.
function test_run_cross_set_independence(): void {
  const perSet = 3
  const set1Profiles = [mkProfile('Q-001', 1), mkProfile('Q-002', 1), mkProfile('Q-003', 1)]
  const set2Profiles = [mkProfile('Q-001', 1), mkProfile('Q-004', 1), mkProfile('Q-005', 1)]
  const input1 = mkRunInputForSet(1, set1Profiles, perSet, perSet, perSet)
  const input2 = mkRunInputForSet(2, set2Profiles, perSet, perSet, perSet)
  const budget = { maxNodesVisited: 50 }

  const r1 = runBoundedSearch(input1, budget)
  const r2 = runBoundedSearch(input2, budget)

  assert.equal(r1.status, 'COMPLETE')
  assert.equal(r2.status, 'COMPLETE')
  if (r1.status === 'COMPLETE' && r2.status === 'COMPLETE') {
    // Both Sets may select Q-001 independently — no cross-Set collision.
    assert.ok(
      r1.selectedCandidates.some((c) => c.questionCode === 'Q-001'),
      'Set 1 may select Q-001'
    )
    assert.ok(
      r2.selectedCandidates.some((c) => c.questionCode === 'Q-001'),
      'Set 2 may independently select Q-001'
    )
    // Set 1's selection must only draw from Set 1's universe.
    const set1Codes = new Set(set1Profiles.map((p) => p.questionCode))
    for (const c of r1.selectedCandidates) {
      assert.ok(set1Codes.has(c.questionCode), `Set 1 selection ${c.questionCode} must come from Set 1 universe`)
    }
    // Set 2's selection must only draw from Set 2's universe.
    const set2Codes = new Set(set2Profiles.map((p) => p.questionCode))
    for (const c of r2.selectedCandidates) {
      assert.ok(set2Codes.has(c.questionCode), `Set 2 selection ${c.questionCode} must come from Set 2 universe`)
    }
  }
}

// Case 9: Budget invariant — nodesVisited <= maxNodesVisited for every outcome.
function test_run_budget_invariant(): void {
  const completeProfiles = [mkProfile('Q-001', 1), mkProfile('Q-002', 1), mkProfile('Q-003', 1)]
  const infeasibleProfiles = [mkProfile('Q-001', 1), mkProfile('Q-002', 2)]

  const cases: Array<{ input: ReturnType<typeof buildSetSolverInput>; budget: { maxNodesVisited: number } }> = [
    { input: mkRunInputForSet(1, completeProfiles, 3, 3, 3), budget: { maxNodesVisited: 50 } },
    { input: mkRunInputForSet(1, completeProfiles, 3, 3, 3), budget: { maxNodesVisited: 2 } },
    { input: mkRunInputForSet(1, infeasibleProfiles, 2, 3, 2), budget: { maxNodesVisited: 50 } },
    { input: mkRunInputForSet(1, [], 0, 3, 3), budget: { maxNodesVisited: 10 } },
  ]

  for (const { input, budget } of cases) {
    const result = runBoundedSearch(input, budget)
    assert.ok(
      result.diagnostics.nodesVisited <= budget.maxNodesVisited,
      `nodesVisited (${result.diagnostics.nodesVisited}) must never exceed maxNodesVisited (${budget.maxNodesVisited}) [status=${result.status}]`
    )
  }
}

// Case 10: Immutability — runBoundedSearch must not mutate its input.
function test_run_immutability(): void {
  const profiles = [mkProfile('Q-001', 1), mkProfile('Q-002', 1), mkProfile('Q-003', 1)]
  const input = mkRunInputForSet(1, profiles, 3, 3, 3)

  const profilesArrayRefBefore = input.candidateUniverse.profiles
  const profilesLengthBefore = input.candidateUniverse.profiles.length
  const snapshotRefBefore = input.constraintSnapshot
  const targetRefBefore = input.constraintSnapshot.target
  const distributionRefBefore = input.constraintSnapshot.distributionConstraints
  const setNumberBefore = input.setNumber
  const firstCodeBefore = input.candidateUniverse.profiles[0]!.questionCode

  runBoundedSearch(input, { maxNodesVisited: 50 })

  assert.equal(input.candidateUniverse.profiles, profilesArrayRefBefore, 'candidateUniverse.profiles reference must be unchanged')
  assert.equal(input.candidateUniverse.profiles.length, profilesLengthBefore, 'candidateUniverse.profiles length must be unchanged')
  assert.equal(input.constraintSnapshot, snapshotRefBefore, 'constraintSnapshot reference must be unchanged')
  assert.equal(input.constraintSnapshot.target, targetRefBefore, 'constraintSnapshot.target reference must be unchanged')
  assert.equal(input.constraintSnapshot.distributionConstraints, distributionRefBefore, 'distributionConstraints reference must be unchanged')
  assert.equal(input.setNumber, setNumberBefore, 'setNumber must be unchanged')
  assert.equal(input.candidateUniverse.profiles[0]!.questionCode, firstCodeBefore, 'profile questionCodes must be unchanged')
}

// Case 11: Production-scale Tier-4 prune stress.
//
// 480-candidate universe matching the verified real KSB-EDU-2026-V10 tier
// distribution (T1=80, T2=160, T3=80, T4=160) under the REAL blueprint
// constraints (tier1Floor=30, tier4Ceiling=25, perSet=100). Tier-4 questionCodes
// are arranged lexically BEFORE every placeable candidate, so once the Tier-4
// ceiling is reached the remaining 135 Tier-4 candidates are re-pruned at every
// subsequent depth. This proves a FEASIBLE COMPLETE can require nodesVisited far
// greater than perSet (PRUNED candidates are re-billed across depths) while
// backtracks remain exactly 0. The high budget is TEST-ONLY and is NOT a
// production-budget recommendation.
function test_run_production_scale_tier4_prune_stress(): void {
  const perSet = 100
  const tier1Floor = 30   // real blueprint: SUM(tier_1) >= 30
  const tier4Ceiling = 25 // real blueprint: SUM(tier_4) <= 25

  // T4 codes (A*) sort before T1 (B*), T2 (C*), T3 (D*) so T4 leads lexically
  // once the floor is met, forcing repeated ceiling pruning of the 135 excess T4.
  const profiles: PreTieCandidateProfile[] = []
  for (let i = 0; i < 160; i++) profiles.push(mkProfile(`A${String(i).padStart(3, '0')}`, 4)) // Tier 4 = 160
  for (let i = 0; i < 80; i++) profiles.push(mkProfile(`B${String(i).padStart(3, '0')}`, 1))  // Tier 1 = 80
  for (let i = 0; i < 160; i++) profiles.push(mkProfile(`C${String(i).padStart(3, '0')}`, 2)) // Tier 2 = 160
  for (let i = 0; i < 80; i++) profiles.push(mkProfile(`D${String(i).padStart(3, '0')}`, 3))  // Tier 3 = 80

  const input = mkRunInputForSet(1, profiles, tier1Floor, tier4Ceiling, perSet)
  const budget = { maxNodesVisited: 1_000_000 } // TEST-ONLY; NOT a production recommendation

  // Immutability snapshot, re-checked after both runs.
  const profilesRefBefore = input.candidateUniverse.profiles
  const profilesLengthBefore = input.candidateUniverse.profiles.length

  const result = runBoundedSearch(input, budget)

  assert.equal(result.status, 'COMPLETE', 'feasible production-scale input must reach COMPLETE')
  assert.notEqual(result.status, 'SEARCH_BUDGET_EXHAUSTED', 'must not exhaust under the high TEST-ONLY budget')

  if (result.status === 'COMPLETE') {
    const codes = result.selectedCandidates.map((c) => c.questionCode)
    assert.equal(result.selectedCandidates.length, perSet, 'placedCount === perSet (100)')
    assert.equal(new Set(codes).size, perSet, 'all 100 placed questionCodes must be unique')
    assert.equal(result.diagnostics.backtracks, 0, 'feasible COMPLETE must not backtrack')

    // nodesVisited far exceeds perSet: the 135 excess Tier-4 candidates are
    // re-pruned at every depth after the ceiling fills.
    assert.ok(
      result.diagnostics.nodesVisited > perSet,
      `nodesVisited (${result.diagnostics.nodesVisited}) must exceed perSet (${perSet}) due to repeated Tier-4 pruning`
    )
    assert.ok(
      result.diagnostics.nodesVisited > 1000,
      `substantial repeated pruning must be exercised (nodesVisited=${result.diagnostics.nodesVisited})`
    )
    assert.ok(
      result.diagnostics.nodesVisited <= budget.maxNodesVisited,
      'nodesVisited must remain within budget'
    )

    // The Tier-4 ceiling genuinely constrains placement.
    const tier4Placed = result.selectedCandidates.filter((c) => c.candidate.metadata.tier === 4).length
    assert.ok(
      tier4Placed > 0 && tier4Placed <= tier4Ceiling,
      `Tier-4 placements (${tier4Placed}) must be within the ceiling (${tier4Ceiling})`
    )

    // Determinism: identical input + budget yields an identical result.
    const result2 = runBoundedSearch(mkRunInputForSet(1, profiles, tier1Floor, tier4Ceiling, perSet), budget)
    assert.equal(result2.status, 'COMPLETE', 'second run must also COMPLETE')
    if (result2.status === 'COMPLETE') {
      assert.deepEqual(
        result2.selectedCandidates.map((c) => c.questionCode),
        codes,
        'repeated run must select identical questionCodes in identical order'
      )
      assert.equal(result2.diagnostics.nodesVisited, result.diagnostics.nodesVisited, 'nodesVisited must be deterministic')
      assert.equal(result2.diagnostics.backtracks, result.diagnostics.backtracks, 'backtracks must be deterministic')
    }

    // Immutability: the input universe is unchanged after both runs.
    assert.equal(input.candidateUniverse.profiles, profilesRefBefore, 'input profiles array reference must be unchanged')
    assert.equal(input.candidateUniverse.profiles.length, profilesLengthBefore, 'input profiles length must be unchanged (480)')
  }
}

const tests = [
  { name: '1. Initial diagnostics (nodesVisited=0, backtracks=0)', fn: test_initial_diagnostics },
  { name: '2. Budget boundary (maxNodesVisited=3)', fn: test_budget_boundary },
  { name: '3. recordNodeVisit (nodesVisited+1, backtracks unchanged)', fn: test_record_node_visit },
  { name: '4. recordBacktrack (backtracks+1, nodesVisited unchanged)', fn: test_record_backtrack },
  { name: '5. Diagnostic helpers immutability', fn: test_helpers_immutability },
  { name: '6. Search root state (accounting, remainingCandidates)', fn: test_search_root_state },
  { name: '7. Search root immutability (candidateUniverse not mutated)', fn: test_search_root_immutability },
  { name: '8. tryBudgetedTransition: ATTEMPTED when budget available', fn: test_attempted_budget_available },
  { name: '9. tryBudgetedTransition: SEARCH_BUDGET_EXHAUSTED when budget exhausted', fn: test_exhausted_budget },
  { name: '10. tryBudgetedTransition: one attempt bills exactly one node', fn: test_one_attempt_one_node },
  { name: '11. tryBudgetedTransition: PRUNED transition bills one node', fn: test_pruned_transition_bills_one_node },
  { name: '12. tryBudgetedTransition: CONTINUE transition bills one node', fn: test_continue_transition_bills_one_node },
  { name: '13. tryBudgetedTransition: COMPLETE transition bills one node', fn: test_complete_transition_bills_one_node },
  { name: '14. tryBudgetedTransition: remainingCandidates excludes attempted candidate', fn: test_remaining_candidates_after_attempt },
  { name: '15. tryBudgetedTransition: remaining counts drive downstream transition', fn: test_remaining_counts_drive_transition },
  { name: '16. tryBudgetedTransition: parent state immutability', fn: test_parent_state_immutability },
  { name: '17. createSearchFrame: accounting reference preserved', fn: test_frame_accounting_reference },
  { name: '18. createSearchFrame: remainingCandidates copied correctly', fn: test_frame_remaining_candidates },
  { name: '19. createSearchFrame: selectedCandidates copied correctly', fn: test_frame_selected_candidates },
  { name: '20. createSearchFrame: nextCandidateIndex = 0', fn: test_frame_next_candidate_index_zero },
  { name: '21. createSearchFrame: orderedCandidates Tier 1 first then lexical', fn: test_frame_ordered_candidates_tier1_first },
  { name: '22. createSearchFrame: ordering determinism', fn: test_frame_ordering_determinism },
  { name: '23. createSearchFrame: immutability', fn: test_frame_immutability },
  { name: '24. advanceSearchFrame: normal advance (0→1)', fn: test_advance_normal },
  { name: '25. advanceSearchFrame: repeated advance (0→1→2)', fn: test_advance_repeated },
  { name: '26. advanceSearchFrame: last sibling advance (length-1→length)', fn: test_advance_last_sibling },
  { name: '27. advanceSearchFrame: exhausted frame fail-loud', fn: test_advance_exhausted_fail_loud },
  { name: '28. advanceSearchFrame: reference preservation', fn: test_advance_reference_preservation },
  { name: '29. advanceSearchFrame: immutability', fn: test_advance_immutability },
  { name: '30. attemptCurrentFrameCandidate: FRAME_EXHAUSTED', fn: test_attempt_frame_exhausted },
  { name: '31. attemptCurrentFrameCandidate: SEARCH_BUDGET_EXHAUSTED', fn: test_attempt_budget_exhausted },
  { name: '32. attemptCurrentFrameCandidate: ATTEMPTED + CONTINUE', fn: test_attempt_continue },
  { name: '33. attemptCurrentFrameCandidate: ATTEMPTED + PRUNED', fn: test_attempt_pruned },
  { name: '34. attemptCurrentFrameCandidate: ATTEMPTED + COMPLETE', fn: test_attempt_complete },
  { name: '35. attemptCurrentFrameCandidate: candidate selection', fn: test_attempt_candidate_selection },
  { name: '36. attemptCurrentFrameCandidate: remainingCandidates correct', fn: test_attempt_remaining_candidates },
  { name: '37. attemptCurrentFrameCandidate: immutability', fn: test_attempt_immutability },
  { name: '38. createChildFrameFromAttempt: child accounting from transition', fn: test_child_accounting_from_transition },
  { name: '39. createChildFrameFromAttempt: child remainingCandidates', fn: test_child_remaining_candidates },
  { name: '40. createChildFrameFromAttempt: child selectedCandidates path', fn: test_child_selected_candidates },
  { name: '41. createChildFrameFromAttempt: child nextCandidateIndex = 0', fn: test_child_next_candidate_index_zero },
  { name: '42. createChildFrameFromAttempt: child ordering recomputed from new accounting', fn: test_child_ordering_recomputed_from_new_accounting },
  { name: '43. createChildFrameFromAttempt: parent frame immutability', fn: test_child_parent_frame_immutability },
  { name: '44. createChildFrameFromAttempt: PRUNED attempt fail-loud', fn: test_child_pruned_attempt_fail_loud },
  { name: '45. createChildFrameFromAttempt: COMPLETE attempt fail-loud', fn: test_child_complete_attempt_fail_loud },
  { name: '46. createSearchStack: root stack single frame', fn: test_stack_root },
  { name: '47. pushSearchFrame: parent and child order', fn: test_stack_push_child },
  { name: '48. pushSearchFrame: multiple children newest on top', fn: test_stack_push_multiple },
  { name: '49. backtrackExhaustedChild: pop exhausted child only', fn: test_backtrack_exhausted_child },
  { name: '50. backtrackExhaustedChild: diagnostics increment', fn: test_backtrack_diagnostics },
  { name: '51. backtrackExhaustedChild: non-exhausted child fail-loud', fn: test_backtrack_non_exhausted_child_fail_loud },
  { name: '52. backtrackExhaustedChild: root-only stack fail-loud', fn: test_backtrack_root_only_fail_loud },
  { name: '53. backtrackExhaustedChild: empty stack fail-loud', fn: test_backtrack_empty_stack_fail_loud },
  { name: '54. stack/backtrack: immutability', fn: test_stack_backtrack_immutability },
  { name: '55. backtrackExhaustedChild: resume next sibling regression', fn: test_backtrack_resume_next_sibling },
  { name: '56. replaceTopSearchFrame: single-frame replacement', fn: test_replace_top_single_frame },
  { name: '57. replaceTopSearchFrame: multi-frame top only', fn: test_replace_top_multi_frame },
  { name: '58. replaceTopSearchFrame: replacement exactly once', fn: test_replace_top_exactly_once },
  { name: '59. replaceTopSearchFrame: empty stack fail-loud', fn: test_replace_top_empty_stack_fail_loud },
  { name: '60. replaceTopSearchFrame: immutability', fn: test_replace_top_immutability },
  { name: '61. replaceTopSearchFrame: DFS composition regression', fn: test_replace_top_dfs_composition },
  { name: '62. stepSearchTraversal: ROOT_EXHAUSTED', fn: test_step_root_exhausted },
  { name: '63. stepSearchTraversal: exhausted child backtrack', fn: test_step_exhausted_child_backtrack },
  { name: '64. stepSearchTraversal: SEARCH_BUDGET_EXHAUSTED', fn: test_step_budget_exhausted },
  { name: '65. stepSearchTraversal: PRUNED sibling', fn: test_step_pruned },
  { name: '66. stepSearchTraversal: CONTINUE sibling', fn: test_step_continue },
  { name: '67. stepSearchTraversal: COMPLETE sibling', fn: test_step_complete },
  { name: '68. stepSearchTraversal: resume-sibling regression', fn: test_step_resume_sibling_regression },
  { name: '69. stepSearchTraversal: immutability', fn: test_step_immutability },
  { name: '70. runBoundedSearch: COMPLETE simple first-path', fn: test_run_complete_simple_path },
  { name: '71. runBoundedSearch: driver backtrack (CONTINUE->exhaust->resume) on infeasible', fn: test_run_driver_backtrack_on_infeasible },
  { name: '72. runBoundedSearch: SEARCH_BUDGET_EXHAUSTED (not infeasible)', fn: test_run_search_budget_exhausted },
  { name: '73. runBoundedSearch: PROVEN_INFEASIBLE within budget', fn: test_run_proven_infeasible },
  { name: '74. runBoundedSearch: empty universe PROVEN_INFEASIBLE (0 nodes)', fn: test_run_empty_universe_infeasible },
  { name: '75. runBoundedSearch: determinism (same status/selection/diagnostics)', fn: test_run_determinism },
  { name: '76. runBoundedSearch: within-Set uniqueness on COMPLETE', fn: test_run_within_set_uniqueness },
  { name: '77. runBoundedSearch: cross-Set independence (Q-001 in both Sets)', fn: test_run_cross_set_independence },
  { name: '78. runBoundedSearch: budget invariant (nodesVisited <= max)', fn: test_run_budget_invariant },
  { name: '79. runBoundedSearch: immutability of input', fn: test_run_immutability },
  { name: '80. runBoundedSearch: production-scale Tier-4 prune stress (480 candidates)', fn: test_run_production_scale_tier4_prune_stress },
]

let passed = 0
let failed = 0

for (const t of tests) {
  try {
    t.fn()
    console.log(`  ✓ ${t.name}`)
    passed++
  } catch (err) {
    console.error(`  ✗ ${t.name}`)
    console.error(`    ${(err as Error).message}`)
    failed++
  }
}

console.log(`\n${passed}/${tests.length} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}
