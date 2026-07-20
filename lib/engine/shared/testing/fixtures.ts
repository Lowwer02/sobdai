/**
 * lib/engine/shared/testing/fixtures.ts
 * ----------------------------------------------------------------------------
 * Assessment Engine — test fixture builders.
 *
 * Source of truth: Implementation Planning v1.0 §6.1 (per-module unit tests),
 * §2.3 (Test fixtures parallel with everything — Day 1).
 *
 * Deterministic builders for Engine inputs. Every fixture is a pure function
 * of its arguments — no Math.random, no Date.now, no I/O. This guarantees
 * property tests are reproducible (the same test passes tomorrow on the same
 * seed, per the determinism contract).
 *
 * Two categories:
 *  - well-formed fixtures (valid AssemblyRequests, candidate Banks, etc.) —
 *    for happy-path and property tests.
 *  - malformed fixtures (structurally broken Blueprints, Bank with missing
 *    IG-2 axes, infeasible Blueprints) — for Fail Fast / Loud surfacing tests.
 *
 * Backlog: E-X.1 (Cross-Cutting Infrastructure). Consumed by every module's
 * test suite.
 */

import type {
  AssemblyRequest,
  AssemblyRequestIdentity,
  AnchorRule,
  BlueprintType,
  CoverageRule,
  Difficulty,
  DistributionConstraints,
  DocumentRegistryEntry,
  DuplicatePreventionRule,
  LearningObjective,
  LoDistribution,
  QuestionPattern,
  RunTarget,
  Tier,
} from '../../reader/contracts'

// ─── Atomic builders ────────────────────────────────────────────────────────
// Each builder returns a fresh object — never a shared reference. Tests must
// be able to mutate a fixture without polluting other tests. (A shared frozen
// fixture would be an alternative, but it pushes mutation errors to runtime
// instead of compile time; fresh-build is safer for a fixture library.)

/**
 * Build a Document Registry entry. Tier defaults to 1 (Core).
 */
export function buildDocument(opts: {
  id: string
  name?: string
  tier?: Tier
}): DocumentRegistryEntry {
  return {
    id: opts.id,
    name: opts.name ?? opts.id,
    tier: opts.tier ?? 1,
  }
}

/**
 * Build a minimal Anchor rule matching Blueprint v3.0's defaults
 * (bonus +5, max 1 per Set).
 */
export function buildAnchorRule(opts?: Partial<AnchorRule>): AnchorRule {
  return {
    bonus: opts?.bonus ?? 5,
    maxPerSet: opts?.maxPerSet ?? 1,
  }
}

/**
 * Build Distribution Constraints. Defaults mirror Blueprint v3.0:
 *   sum_per_set = 100, tier1_floor ≥ 30, tier4_ceiling ≤ 25.
 */
export function buildDistributionConstraints(
  opts?: Partial<DistributionConstraints>
): DistributionConstraints {
  return {
    sumPerSet: opts?.sumPerSet ?? 100,
    tierMinMax: opts?.tierMinMax ?? {
      1: [30, 100],
      2: [0, 100],
      3: [0, 100],
      4: [0, 25],
    },
    tier1Floor: opts?.tier1Floor ?? 30,
    tier4Ceiling: opts?.tier4Ceiling ?? 25,
    anchor: opts?.anchor === undefined ? buildAnchorRule() : opts.anchor,
  }
}

/**
 * Build a Coverage Rule. `binding` defaults to null (rule-specific binding
 * belongs in the consuming module's tests).
 */
export function buildCoverageRule(opts: {
  id: CoverageRule['id']
  level?: CoverageRule['level']
  binding?: unknown
}): CoverageRule {
  return {
    id: opts.id,
    level: opts.level ?? 'hard',
    binding: opts.binding ?? null,
  }
}

/**
 * Build the LO Distribution. Defaults to an even 25% split across LO1–LO4
 * with the canonical LO↔BlueprintType correspondence.
 */
export function buildLoDistribution(opts?: {
  targets?: Partial<Record<LearningObjective, number>>
  typeMap?: Partial<Record<LearningObjective, readonly BlueprintType[]>>
}): LoDistribution {
  const allLos: LearningObjective[] = ['LO1', 'LO2', 'LO3', 'LO4']
  const defaultTypeMap: Record<LearningObjective, readonly BlueprintType[]> = {
    LO1: ['Memory'],
    LO2: ['Concept'],
    LO3: ['Procedure'],
    LO4: ['Scenario'],
  }
  const targets = allLos.reduce(
    (acc, lo) => {
      acc[lo] = opts?.targets?.[lo] ?? 25
      return acc
    },
    {} as Record<LearningObjective, number>
  )
  const typeMap = allLos.reduce(
    (acc, lo) => {
      acc[lo] = opts?.typeMap?.[lo] ?? defaultTypeMap[lo]
      return acc
    },
    {} as Record<LearningObjective, readonly BlueprintType[]>
  )
  return { targets, typeMap }
}

/**
 * Build a Duplicate Prevention Rule. Defaults match L1 (within-set, hard).
 */
export function buildDuplicatePreventionRule(opts: {
  id: DuplicatePreventionRule['id']
  scope?: DuplicatePreventionRule['scope']
  level?: DuplicatePreventionRule['level']
}): DuplicatePreventionRule {
  return {
    id: opts.id,
    scope: opts.scope ?? 'within_set',
    level: opts.level ?? 'hard',
  }
}

/**
 * Build a Run Target. Defaults to Blueprint v3.0 (5 sets × 100 questions).
 */
export function buildRunTarget(opts?: Partial<RunTarget>): RunTarget {
  return {
    sets: opts?.sets ?? 5,
    perSet: opts?.perSet ?? 100,
  }
}

/**
 * Build the AssemblyRequest identity block. Defaults to Blueprint v3.0.
 */
export function buildIdentity(opts?: Partial<AssemblyRequestIdentity>): AssemblyRequestIdentity {
  return {
    blueprint_id: opts?.blueprint_id ?? 'simulation_exam_blueprint',
    blueprint_version: opts?.blueprint_version ?? '3.0',
    profile: opts?.profile ?? 'simulation',
  }
}

// ─── Composite builders ─────────────────────────────────────────────────────

/**
 * Build a complete, VALID AssemblyRequest matching Blueprint v3.0's shape.
 *
 * Use as the base for happy-path tests; override individual fields to test
 * variations. Returns a fresh object every call (no shared reference).
 *
 * Defaults reflect Blueprint v3.0 business constants (Implementation Planning
 * Appendix / Integration Spec §4.3): 5 sets × 100 questions, 12 documents,
 * even LO split, full CR-1…CR-5 + L1–L5 coverage.
 */
export function buildAssemblyRequest(
  overrides?: Partial<AssemblyRequest>
): AssemblyRequest {
  const documentRegistry: DocumentRegistryEntry[] = [
    buildDocument({ id: 'LAW-ACT-HED-2562', name: 'พระราชบัญญัติการอุดมศึกษา พ.ศ.2562', tier: 1 }),
    buildDocument({ id: 'LAW-PRIVATE-2546', name: 'พ.ร.บ.สถาบันอุดมศึกษาเอกชน พ.ศ.2546', tier: 1 }),
    buildDocument({ id: 'LAW-PDPA-2562', name: 'พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ.2562', tier: 2 }),
    buildDocument({ id: 'PLAN-HED-2566', name: 'แผนด้านการอุดมศึกษา พ.ศ.2566', tier: 2 }),
    buildDocument({ id: 'FRAMEWORK-STI-2566', name: 'กรอบนโยบายฯ อววน.', tier: 3 }),
    buildDocument({ id: 'POLICY-EDU-2565', tier: 3 }),
    buildDocument({ id: 'STRATEGY-NATIONAL-2565', tier: 4 }),
    buildDocument({ id: 'MANUAL-PROC-2564', tier: 4 }),
  ]

  const coverageRules: CoverageRule[] = [
    buildCoverageRule({ id: 'CR-1', level: 'hard' }),
    buildCoverageRule({ id: 'CR-2', level: 'hard' }),
    buildCoverageRule({ id: 'CR-3', level: 'hard' }),
    buildCoverageRule({ id: 'CR-4', level: 'soft' }),
    buildCoverageRule({ id: 'CR-5', level: 'soft' }),
  ]

  const duplicatePrevention: DuplicatePreventionRule[] = [
    buildDuplicatePreventionRule({ id: 'L1', scope: 'within_set', level: 'hard' }),
    buildDuplicatePreventionRule({ id: 'L2', scope: 'within_set', level: 'hard' }),
    buildDuplicatePreventionRule({ id: 'L3', scope: 'across_set', level: 'hard' }),
    buildDuplicatePreventionRule({ id: 'L4', scope: 'across_set', level: 'soft' }),
    buildDuplicatePreventionRule({ id: 'L5', scope: 'across_set', level: 'soft' }),
  ]

  return {
    identity: buildIdentity(overrides?.identity),
    runUnit: 'blueprint',
    target: buildRunTarget(overrides?.target),
    documentRegistry: overrides?.documentRegistry ?? documentRegistry,
    distributionConstraints: buildDistributionConstraints(overrides?.distributionConstraints),
    coverageRules: overrides?.coverageRules ?? coverageRules,
    loDistribution: buildLoDistribution(overrides?.loDistribution),
    duplicatePrevention: overrides?.duplicatePrevention ?? duplicatePrevention,
    exclusions: overrides?.exclusions ?? [],
    meta: { specVersion: '1.0' },
  }
}

// ─── Edge-case fixtures (malformed / infeasible) ────────────────────────────
// These encode the Fail Fast / Loud surfacing scenarios from Reader Pipeline §6
// and Implementation Planning §6.1. Each produces a deliberate contract
// violation that the module under test MUST surface as a structured error.

/**
 * A Blueprint whose distribution constraints are arithmetically impossible:
 * tier1_floor (70) + tier4_floor (40) = 110, already exceeds sum_per_set (100)
 * before any Tier-2/Tier-3 questions are placed.
 *
 * Reader MUST emit `semantic.impossible_constraint` (Reader Pipeline §6).
 */
export function buildInfeasibleDistributionRequest(): AssemblyRequest {
  return buildAssemblyRequest({
    distributionConstraints: buildDistributionConstraints({
      sumPerSet: 100,
      tierMinMax: {
        1: [70, 100],
        2: [0, 0],
        3: [0, 0],
        4: [40, 40],
      },
      tier1Floor: 70,
      tier4Ceiling: 40,
    }),
  })
}

/**
 * A Blueprint with NO documents in the registry. The Generator cannot draw
 * any Candidates; every Slot is infeasible.
 *
 * Reader MAY accept this (it's structurally valid); Generator MUST emit a
 * Shortfall warning covering every Slot.
 */
export function buildEmptyDocumentRegistryRequest(): AssemblyRequest {
  return buildAssemblyRequest({
    documentRegistry: [],
  })
}

/**
 * A Blueprint whose LO targets don't sum to 100. Reader MUST emit
 * `semantic.distribution_inconsistency` (Reader Pipeline §6).
 */
export function buildInconsistentLoDistributionRequest(): AssemblyRequest {
  return buildAssemblyRequest({
    loDistribution: buildLoDistribution({
      targets: { LO1: 50, LO2: 50, LO3: 50, LO4: 50 }, // sums to 200, not 100
    }),
  })
}

// ─── Synthetic Bank row (for Generator/Ranking tests) ───────────────────────
// The Bank lives outside the Engine; tests inject synthetic rows. This shape
// mirrors what the Generator will receive from the Bank adapter (E-2 work).
// Kept here so the synthetic-Bank fixture stays consistent with the IG-2 axes
// the Amendment will eventually pin.

/**
 * Difficulty union, mirrored here so Bank fixtures don't import the Bank's
 * own types (which don't yet exist for the new axes).
 */
export type { Difficulty, QuestionPattern, BlueprintType, LearningObjective }

/**
 * A synthetic Bank row. Mirrors the existing `questions` columns plus the
 * four IG-2 axes (blueprint_type, learning_objective, question_pattern,
 * section) — currently NULL pending IG-2 closure, modelled as optional.
 *
 * The Generator's filters read these; Ranking's Components score on them.
 * A Bank row with NULL IG-2 axes produces a Candidate with reduced
 * Confidence (Scoring §11 — IG-2 propagation rule).
 */
export interface SyntheticBankRow {
  /** Immutable Question Code (migration 026). */
  questionCode: string
  /** Existing column (migration 019). */
  document: string
  /** Existing column. */
  difficulty: Difficulty
  /** Existing column. */
  subject: string | null
  /** Existing column. */
  topic: string | null
  /** Existing column. */
  law: string | null
  /** Existing column. */
  status: string
  // IG-2 axes (pending Architecture Amendment / E-0 closure):
  blueprintType?: BlueprintType | null
  learningObjective?: LearningObjective | null
  questionPattern?: QuestionPattern | null
  section?: string | null
}

/**
 * Build a synthetic Bank row with sensible defaults. Override individual
 * fields per test. The `questionCode` is required (it's the immutable
 * business identifier — no Bank row exists without one).
 */
export function buildBankRow(opts: Partial<SyntheticBankRow> & {
  questionCode: string
}): SyntheticBankRow {
  return {
    questionCode: opts.questionCode,
    document: opts.document ?? 'LAW-ACT-HED-2562',
    difficulty: opts.difficulty ?? 'Easy',
    subject: opts.subject ?? null,
    topic: opts.topic ?? null,
    law: opts.law ?? null,
    status: opts.status ?? 'Published',
    blueprintType: opts.blueprintType ?? null,
    learningObjective: opts.learningObjective ?? null,
    questionPattern: opts.questionPattern ?? null,
    section: opts.section ?? null,
  }
}

/**
 * Build N synthetic Bank rows with sequential Question Codes
 * (Q-000001, Q-000002, ...). All other fields default; pass `overrides`
 * to apply uniformly (e.g. all from one Document, all Easy).
 *
 * Used by Generator scale tests (E-2.6): build a 100k-row synthetic Bank
 * and verify CandidateSet size is bounded by Blueprint structure.
 */
export function buildBankRows(
  count: number,
  overrides?: Partial<SyntheticBankRow>
): SyntheticBankRow[] {
  return Array.from({ length: count }, (_, i) => {
    const seq = String(i + 1).padStart(6, '0')
    return buildBankRow({
      ...overrides,
      questionCode: `Q-${seq}`,
    })
  })
}
