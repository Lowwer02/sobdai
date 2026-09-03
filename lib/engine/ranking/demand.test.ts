/**
 * lib/engine/ranking/demand.test.ts
 * ----------------------------------------------------------------------------
 * Unit tests for quantified allocation demand (KSB 3.0.1 quantity fix).
 *
 * RUN: npx jiti lib/engine/ranking/demand.test.ts
 */

import assert from 'node:assert/strict'

import type { Candidate, CandidateSet } from '../generator/contracts'
import type { ConstraintSnapshot } from '../generator/contracts'
import { buildConstraintSnapshot } from '../shared/testing/fixtures'
import { buildAllocationDemand } from './demand'

function makeSnapshot(
  overrides?: {
    readonly perSet?: number
    readonly sets?: number
    readonly targets?: Partial<Record<'LO1' | 'LO2' | 'LO3' | 'LO4', number>>
  }
): ConstraintSnapshot {
  const base = buildConstraintSnapshot()
  const perSet = overrides?.perSet ?? 100
  const sets = (overrides?.sets ?? 5) as 1 | 2 | 3 | 4 | 5
  return {
    ...base,
    target: { ...base.target, perSet, sets },
    loDistribution: {
      ...base.loDistribution,
      targets: {
        LO1: overrides?.targets?.LO1 ?? 0,
        LO2: overrides?.targets?.LO2 ?? 0,
        LO3: overrides?.targets?.LO3 ?? 0,
        LO4: overrides?.targets?.LO4 ?? 0,
      },
    },
  }
}

function candidateSet(
  codes: readonly string[],
  loByCode: ReadonlyMap<string, 'LO1' | 'LO2' | 'LO3' | 'LO4' | null>,
  constraintSnapshot: ConstraintSnapshot
): CandidateSet {
  const candidates: Candidate[] = codes.map((code) => ({
    identity: { questionCode: code, questionId: code },
    metadata: {
      document: 'D',
      difficulty: 'Easy',
      topic: 't',
      status: 'Published',
      tier: 1,
      blueprintType: 'Memory',
      learningObjective: loByCode.get(code) ?? null,
      questionPattern: null,
      section: null,
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
      filtersPassed: [],
      eligibleSlots: [],
      coverageSatisfied: [],
      source: { kind: 'metadata_query', queryId: 'fixture' },
    },
  })) as unknown as Candidate[]
  return {
    identity: { assemblyRequestId: 'demand-test', generatedAt: null, bankStateHash: 'h' },
    candidates,
    slotIndex: { slots: new Map() },
    shortfallReport: { entries: [] },
    coverageSatisfaction: { bindings: [] },
    constraintSnapshot,
    warnings: [],
    statistics: {} as CandidateSet['statistics'],
    exclusionsLog: [],
    meta: { specVersion: '1.0', generatorVersion: '1.0.0' },
  }
}

function verifies_ksb_demand_matches_authored_quantities(): void {
  // KSB 3.0.1: LO1 24 / LO2 34 / LO3 24 / LO4 18, one Set of 100.
  const snapshot = makeSnapshot({ perSet: 100, sets: 1, targets: { LO1: 24, LO2: 34, LO3: 24, LO4: 18 } })
  const codes = ['Q1', 'Q2', 'Q3']
  const lo = new Map([['Q1', 'LO1' as const], ['Q2', 'LO3' as const], ['Q3', null]])
  const demand = buildAllocationDemand(candidateSet(codes, lo, snapshot))

  assert.equal(demand.quantified, true)
  assert.equal(demand.perSet, 100)
  const loBuckets = demand.buckets.filter((bucket) => bucket.learningObjective !== null)
  // Authored demand (24/34/24/18) is capped by matching supply; the gap
  // degrades to the residual bucket and is reported.
  assert.deepEqual(
    loBuckets.map((bucket) => `${bucket.learningObjective}:${bucket.requiredCount}`),
    ['LO1:1', 'LO2:0', 'LO3:1', 'LO4:0'],
    'buckets are capped by matching supply'
  )
  assert.deepEqual(
    demand.degradedBuckets.map((bucket) => `${bucket.learningObjective}:${bucket.authoredCount}`),
    ['LO1:24', 'LO2:34', 'LO3:24', 'LO4:18'],
    'every authored LO quantity is accounted for'
  )
  // LO supply (1/0/1/0) is below demand: shortfall degrades to the residual
  // bucket so the Set still demands exactly 100 physical placements.
  const totalDemand = demand.buckets.reduce((sum, bucket) => sum + bucket.requiredCount, 0)
  assert.equal(totalDemand, 100)
  assert.equal(demand.degradedBuckets.length, 4)
}

function verifies_full_supply_has_no_residual(): void {
  const snapshot = makeSnapshot({ perSet: 100, sets: 1, targets: { LO1: 24, LO2: 34, LO3: 24, LO4: 18 } })
  const codes: string[] = []
  const lo = new Map<string, 'LO1' | 'LO2' | 'LO3' | 'LO4'>()
  let seq = 0
  for (const [value, count] of [['LO1', 24], ['LO2', 34], ['LO3', 24], ['LO4', 18]] as const) {
    for (let i = 0; i < count; i++) {
      seq += 1
      const code = `Q-${String(seq).padStart(6, '0')}`
      codes.push(code)
      lo.set(code, value)
    }
  }
  const demand = buildAllocationDemand(candidateSet(codes, lo, snapshot))
  const totalDemand = demand.buckets.reduce((sum, bucket) => sum + bucket.requiredCount, 0)
  assert.equal(totalDemand, 100)
  assert.equal(demand.buckets.some((bucket) => bucket.learningObjective === null), false,
    'ample supply needs no residual bucket')
  assert.equal(demand.degradedBuckets.length, 0)
}

function verifies_unquantified_blueprint_is_legacy(): void {
  const demand = buildAllocationDemand(candidateSet(['Q1'], new Map(), makeSnapshot()))
  assert.equal(demand.quantified, false, 'no authored LO quantities → legacy behavior')
}

function verifies_multi_axis_does_not_inflate_set_size(): void {
  // Difficulty/pattern axes carry no authored quantity: total demand stays
  // exactly perSet even though Candidates also carry those axes.
  const snapshot = makeSnapshot({ perSet: 50, sets: 2, targets: { LO1: 60, LO2: 40 } })
  const codes = Array.from({ length: 120 }, (_, index) => `Q-${index}`)
  const lo = new Map(codes.map((code, index) => [code, index % 2 === 0 ? 'LO1' as const : 'LO2' as const]))
  const demand = buildAllocationDemand(candidateSet(codes, lo, snapshot))
  const perSetDemand = new Map<number, number>()
  for (const bucket of demand.buckets) {
    perSetDemand.set(
      bucket.slot.setNumber,
      (perSetDemand.get(bucket.slot.setNumber) ?? 0) + bucket.requiredCount
    )
  }
  assert.deepEqual([...perSetDemand.entries()], [[1, 50], [2, 50]],
    'demand per Set is exactly perSet — never the sum of all axis targets')
}

function verifies_candidate_codes_are_eligibility_scoped(): void {
  const snapshot = makeSnapshot({ perSet: 100, sets: 1, targets: { LO1: 75, LO2: 25 } })
  const lo = new Map([['A', 'LO1' as const], ['B', 'LO1' as const], ['C', 'LO2' as const]])
  const demand = buildAllocationDemand(candidateSet(['A', 'B', 'C'], lo, snapshot))
  const lo1 = demand.buckets.find((bucket) => bucket.learningObjective === 'LO1')
  if (lo1 === undefined) {
    console.error('DEBUG buckets:', JSON.stringify(demand, null, 1).slice(0, 900))
    throw new Error('LO1 bucket missing')
  }
  assert.deepEqual(lo1.candidateCodes, ['A', 'B'])
  const residual = demand.buckets.find((bucket) => bucket.learningObjective === null)!
  assert.ok(residual.requiredCount >= 1)
  assert.deepEqual(residual.candidateCodes, ['A', 'B', 'C'],
    'the residual bucket may draw from every remaining Candidate')
}

// ─── runner ─────────────────────────────────────────────────────────────────

const tests: readonly { readonly name: string; readonly fn: () => void }[] = [
  { name: 'KSB authored quantities become executable bucket demand', fn: verifies_ksb_demand_matches_authored_quantities },
  { name: 'Full supply: no residual bucket, no degradation', fn: verifies_full_supply_has_no_residual },
  { name: 'Unquantified Blueprint stays legacy', fn: verifies_unquantified_blueprint_is_legacy },
  { name: 'Multi-axis demand never inflates the per-Set size', fn: verifies_multi_axis_does_not_inflate_set_size },
  { name: 'Bucket eligibility is LO-scoped; residual accepts all', fn: verifies_candidate_codes_are_eligibility_scoped },
]

let failed = 0
for (const test of tests) {
  try {
    test.fn()
    console.log(`  ✓ ${test.name}`)
  } catch (error) {
    failed += 1
    console.error(`  ✗ ${test.name}`)
    console.error(error)
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
