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

import type {
  BlueprintSlot,
  CandidateSet,
} from '../generator/contracts'
import type { DocumentQuotaEntry } from '../reader/contracts'
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
  /**
   * Document Quota Closure — true when the Blueprint declared the
   * 'quantified-physical' Document Allocation mode. Buckets are then
   * Document×LO cells with HARD counts (exact per-Document and per-LO
   * physical quotas); there is no residual bucket and no soft degradation —
   * short supply fails the run loudly in the Solver.
   */
  readonly documentQuotaMode: boolean
  /**
   * Document Quota Closure cells whose matching Document×LO supply is
   * smaller than the required count. Always EMPTY under the exact joint
   * assignment (cells are chosen from actual supply and can never exceed
   * it): when NO feasible joint assignment exists, the Solver's per-Set
   * quantity validation fails the run loudly instead. Empty in legacy
   * (LO-only) mode. Retained for contract stability.
   */
  readonly insufficientCells: readonly {
    readonly bucketId: string
    readonly setNumber: number
    readonly document: string
    readonly learningObjective: LearningObjective
    readonly requiredCount: number
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

  // Document Quota Closure — quantified-physical mode: hard Document×LO cells.
  const documentQuotas = snapshot.documentQuotas ?? null
  if (documentQuotas !== null && documentQuotas.length > 0) {
    return buildDocumentQuotaDemand(candidateSet, documentQuotas)
  }
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
    documentQuotaMode: false,
    insufficientCells: [],
  }
}

/**
 * Document Quota Closure — quantified-physical demand.
 *
 * Builds ONE demand bucket per non-zero Document×LO cell per Set. The cell
 * counts are NOT authored and NOT derived from any fixed cross-table: the
 * Blueprint authors only the two hard PER-SET MARGINALS (per-Document quotas
 * and per-LO targets); NO Document×LO matrix exists in any contract. The
 * joint cells are chosen FROM ACTUAL CANDIDATE SUPPLY by the exact
 * deterministic transportation solve in `solveJointQuotaCells`:
 *
 *   - each Set's Document quota is a hard marginal (Σ over LOs = quota),
 *   - each Set's LO target is a hard marginal (Σ over Documents = target),
 *   - a cell may take any count 0..supply(document, LO) — each Document may
 *     hold ANY mixture of LOs; nothing prescribes a per-Document LO split,
 *   - across Sets the cells draw from ONE shared supply: the whole run is
 *     solved as ONE global aggregate transportation (Phase A) that is then
 *     decomposed Set by Set (Phase B), so no Set can starve another and no
 *     Question Code is ever demanded twice (cross-Set uniqueness).
 *
 * Global feasibility is exact under the quantified-physical V1 invariant
 * (Stage 6 enforces identical per-Set Document quota vectors; LO marginals
 * are set-wide by contract): the aggregate saturates IFF some assignment
 * across ALL N Sets satisfies every per-Set marginal against the shared
 * supply (see solveJointQuotaCells for the proof); when it cannot, the
 * partial plan is peeled, the short Sets emit partial demand, and the
 * Solver's per-Set quantity invariant fails the run loudly.
 *
 * Deterministic: fixed authored Document order, fixed LO1–LO4 order, fixed
 * augmenting order, sorted candidate codes. No randomness, no retry loops.
 */
function buildDocumentQuotaDemand(
  candidateSet: CandidateSet,
  documentQuotas: readonly DocumentQuotaEntry[]
): AllocationDemand {
  const snapshot = candidateSet.constraintSnapshot
  const perSet = snapshot.target.perSet
  const setCount = snapshot.target.sets
  const setNumbers: readonly SetNumber[] = Array.from(
    { length: setCount },
    (_, index) => (index + 1) as SetNumber
  )

  const codesByDocLo = new Map<string, string[]>()
  const allCodes: string[] = []
  for (const candidate of candidateSet.candidates) {
    const code = candidate.identity.questionCode
    allCodes.push(code)
    const lo = candidate.metadata.learningObjective
    if (lo === null) continue
    const key = `${cellKeyPrefix(candidate.metadata.document)}|${lo}`
    const existing = codesByDocLo.get(key)
    if (existing === undefined) codesByDocLo.set(key, [code])
    else existing.push(code)
  }
  allCodes.sort(compareStrings)
  for (const codes of codesByDocLo.values()) codes.sort(compareStrings)

  // Authored document order — first appearance across the per-Set quotas
  // (Stage 6 preserves the Master-Table row order verbatim).
  const documentOrder: string[] = []
  for (const quota of documentQuotas) {
    if (!documentOrder.includes(quota.document)) documentOrder.push(quota.document)
  }
  const loTargets = LO_ORDER.map(
    (lo) => Math.round(((snapshot.loDistribution.targets[lo] ?? 0) * perSet) / 100)
  )
  const supply: number[][] = documentOrder.map((document) =>
    LO_ORDER.map((lo) => codesByDocLo.get(`${cellKeyPrefix(document)}|${lo}`)?.length ?? 0)
  )

  const cells = solveJointQuotaCells({
    setNumbers,
    documentOrder,
    documentQuotas,
    loTargets,
    supply,
  })

  const buckets: AllocationDemandBucket[] = []
  for (const cell of cells) {
    const document = documentOrder[cell.docIndex]!
    const lo = LO_ORDER[cell.loIndex]!
    const slot: BlueprintSlot = {
      setNumber: cell.setNumber,
      document,
      learningObjective: lo,
    }
    buckets.push({
      slot,
      bucketId: bucketIdFor(slot),
      requiredCount: cell.count,
      learningObjective: lo,
      candidateCodes: codesByDocLo.get(`${cellKeyPrefix(document)}|${lo}`) ?? [],
    })
  }

  return {
    quantified: true,
    perSet,
    setNumbers,
    knownCodes: allCodes,
    buckets,
    degradedBuckets: [],
    documentQuotaMode: true,
    insufficientCells: [],
  }
}

// ─── Exact joint Document×LO assignment (deterministic transportation) ──────

/** One chosen joint cell: `count` Questions of one LO from one Document in one Set. */
interface JointQuotaCell {
  readonly setNumber: SetNumber
  readonly docIndex: number
  readonly loIndex: number
  readonly count: number
}

/**
 * Choose the per-Set Document×LO cells FROM ACTUAL SUPPLY so that every Set's
 * two hard marginals hold exactly — solved as ONE GLOBAL feasibility problem:
 *
 *   Phase A (aggregate): one integral max-flow over the WHOLE run,
 *     source ─Σ_N quotas→ Document ─supply→ (Document,LO) ─Σ_N targets→ LO → sink
 *     yielding an integral AGGREGATE plan X ≤ actual supply whose row sums are
 *     the total per-Document demand across all N Sets and whose column sums
 *     are the total per-LO demand across all N Sets.
 *
 *   Phase B (deterministic decomposition): peel the Sets one at a time
 *     (ascending — the Engine's historical slot-consumption order) from the
 *     aggregate plan, each peel an exact max-flow against the REMAINING
 *     aggregate, with that Set's own Document quotas and LO targets.
 *
 * EXACTNESS (why this is not a heuristic — quantified-physical V1 invariant):
 * Stage 6 refuses ('invalid_document_quotas') any quantified-physical
 * Blueprint whose per-Set Document quota vectors are not identical, so every
 * request reaching this solver has ALL N Sets sharing the SAME Document
 * marginals q and (set-wide by contract) the same LO marginals t. Under that
 * invariant, Gale's condition for the transportation network
 * source→Document(q)→cell(X)→LO(t)→sink shows ANY integral aggregate X with
 * margins (N·q, N·t) admits a single-Set peel x ≤ X with margins (q, t):
 * for Document set D′ and LO set L′ the peel needs
 * q(D′) − t(L′) ≤ X(D′, L\L′), and with X(D′, L′) ≤ min(N·q(D′), N·t(L′)):
 *   - if q(D′) ≤ t(L′) the bound is ≤ 0 and holds trivially (X ≥ 0);
 *   - else X(D′, L\L′) = N·q(D′) − X(D′, L′) ≥ N·(q(D′) − t(L′)) ≥ q(D′) − t(L′).
 * Induction over the peels decomposes X into N per-Set matrices, so — under
 * the uniform-marginals invariant — aggregate saturation ⟺ a global N-Set
 * assignment exists. (For NON-uniform per-Set quota vectors this guarantee
 * does NOT hold: a saturating aggregate can admit no per-Set peel. Such
 * shapes are rejected at Stage 6 and never reach this function.) An earlier
 * Set can therefore never starve a later Set: every Set peels from the SAME
 * globally-consistent plan, never from raw supply.
 *
 * Per Set, the marginals are exact by construction (Σ over LOs = quota;
 * Σ over Documents = target), cell counts never exceed actual supply, and
 * the per-Set decrements of the aggregate are exactly the no-cross-Set-code-
 * reuse guarantee. No Document×LO matrix is authored or manufactured: the
 * cells are a pure function of live candidate supply (Phase A capacities).
 *
 * Determinism: fixed authored Document order, fixed LO1–LO4 order, fixed
 * first-path augmenting order, Sets ascending. Pure function; no randomness,
 * no retry loops.
 *
 * When NO feasible global assignment exists, Phase A cannot saturate; the
 * partial plan is peeled and the short Sets emit partial demand, so the
 * downstream per-Set quantity invariant fails the run loudly.
 */
function solveJointQuotaCells(input: {
  readonly setNumbers: readonly SetNumber[]
  readonly documentOrder: readonly string[]
  readonly documentQuotas: readonly DocumentQuotaEntry[]
  readonly loTargets: readonly number[]
  readonly supply: readonly (readonly number[])[]
}): readonly JointQuotaCell[] {
  const { setNumbers, documentOrder, documentQuotas, loTargets, supply } = input

  const quotaOf = (setNumber: SetNumber, docIdx: number): number =>
    documentQuotas.find(
      (q) => q.setNumber === setNumber && q.document === documentOrder[docIdx]
    )?.count ?? 0

  // Phase A — the global aggregate plan over the whole run.
  const aggregateRows = documentOrder.map((_, docIdx) =>
    setNumbers.reduce((total, setNumber) => total + quotaOf(setNumber, docIdx), 0)
  )
  const aggregateCols = loTargets.map((target) => target * setNumbers.length)
  const aggregate = solveTransportationFlow(aggregateRows, aggregateCols, supply)

  // Phase B — deterministic per-Set decomposition (peel) of the aggregate.
  const remaining = aggregate.map((row) => [...row])
  const cells: JointQuotaCell[] = []
  for (const setNumber of setNumbers) {
    const rows = documentOrder.map((_, docIdx) => quotaOf(setNumber, docIdx))
    const setFlow = solveTransportationFlow(rows, loTargets, remaining)
    for (let docIdx = 0; docIdx < documentOrder.length; docIdx++) {
      for (let loIdx = 0; loIdx < LO_ORDER.length; loIdx++) {
        const count = setFlow[docIdx]![loIdx]!
        if (count > 0) {
          cells.push({ setNumber, docIndex: docIdx, loIndex: loIdx, count })
          remaining[docIdx]![loIdx]! -= count
        }
      }
    }
  }
  return cells
}

// ─── Deterministic integral transportation (single max-flow core) ───────────

/**
 * Integral transportation solve: choose flows[d][l] ≥ 0 so that
 * Σ_l flows[d][l] ≤ rowSupplies[d], Σ_d flows[d][l] ≤ colDemands[l], and
 * flows[d][l] ≤ cellCaps[d][l] — maximizing the total. Plain residual-edge
 * Ford-Fulkerson over source → rows → cells (edge capacities) → columns →
 * sink: fixed construction order (authored row order × fixed column order)
 * and fixed first-path DFS augmentation make the integral result
 * deterministic; integral capacities ⇒ integral flows. Returns the net flow
 * matrix (never negative).
 */
function solveTransportationFlow(
  rowSupplies: readonly number[],
  colDemands: readonly number[],
  cellCaps: readonly (readonly number[])[]
): number[][] {
  const rowCount = rowSupplies.length
  const colCount = colDemands.length
  const source = 0
  const rowNode = (rowIdx: number): number => 1 + rowIdx
  const colNode = (colIdx: number): number => 1 + rowCount + colIdx
  const sink = 1 + rowCount + colCount

  interface FlowEdge {
    to: number
    cap: number
    rev: number
    flow: number
  }
  const graph: FlowEdge[][] = Array.from({ length: sink + 1 }, () => [])
  const addEdge = (from: number, to: number, cap: number): FlowEdge => {
    const forward: FlowEdge = { to, cap, rev: graph[to]!.length, flow: 0 }
    const backward: FlowEdge = { to: from, cap: 0, rev: graph[from]!.length, flow: 0 }
    graph[from]!.push(forward)
    graph[to]!.push(backward)
    return forward
  }

  // Row → cell edges — the transportation matrix is their net flow.
  const cellEdges: Array<Array<{ colIdx: number; edge: FlowEdge }>> =
    Array.from({ length: rowCount }, () => [] as Array<{ colIdx: number; edge: FlowEdge }>)
  for (let rowIdx = 0; rowIdx < rowCount; rowIdx++) {
    if (rowSupplies[rowIdx]! <= 0) continue
    addEdge(source, rowNode(rowIdx), rowSupplies[rowIdx]!)
    for (let colIdx = 0; colIdx < colCount; colIdx++) {
      if (colDemands[colIdx]! <= 0) continue
      const cap = cellCaps[rowIdx]![colIdx]!
      if (cap <= 0) continue
      cellEdges[rowIdx]!.push({
        colIdx,
        edge: addEdge(rowNode(rowIdx), colNode(colIdx), cap),
      })
    }
  }
  for (let colIdx = 0; colIdx < colCount; colIdx++) {
    if (colDemands[colIdx]! <= 0) continue
    addEdge(colNode(colIdx), sink, colDemands[colIdx]!)
  }

  // Augment along the FIRST path found by a fixed-order DFS (adjacency arrays
  // in construction order), pushing ONE consistent bottleneck across every
  // edge of that path. Each augmentation strictly increases the flow, so the
  // loop terminates; the final value is the max flow regardless of augmenting
  // order (Ford-Fulkerson).
  const findAugmentingPath = (
    node: number,
    path: FlowEdge[],
    visited: boolean[]
  ): boolean => {
    if (node === sink) return true
    visited[node] = true
    for (const edge of graph[node]!) {
      if (edge.cap <= 0 || visited[edge.to]) continue
      path.push(edge)
      if (findAugmentingPath(edge.to, path, visited)) return true
      path.pop()
    }
    return false
  }
  for (;;) {
    const path: FlowEdge[] = []
    const visited = new Array<boolean>(sink + 1).fill(false)
    if (!findAugmentingPath(source, path, visited)) break
    const push = Math.min(...path.map((edge) => edge.cap))
    for (const edge of path) {
      const partner = graph[edge.to]![edge.rev]!
      edge.cap -= push
      partner.cap += push
      // Signed bookkeeping: pushing a residual (backward) edge CANCELS flow
      // on its forward partner — the NET flow is what the cell carries.
      edge.flow += push
      partner.flow -= push
    }
  }

  // Dense result matrix indexed [rowIdx][colIdx] — rows/columns with no
  // constructed edges must still occupy their positions (skipped zero-cap
  // cells would otherwise shift the array positions onto the wrong column).
  const dense: number[][] = Array.from({ length: rowCount }, () =>
    new Array<number>(colCount).fill(0)
  )
  for (let rowIdx = 0; rowIdx < rowCount; rowIdx++) {
    for (const { colIdx, edge } of cellEdges[rowIdx]!) {
      dense[rowIdx]![colIdx] = Math.max(0, edge.flow)
    }
  }
  return dense
}

function cellKeyPrefix(document: string): string {
  return JSON.stringify(document)
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
