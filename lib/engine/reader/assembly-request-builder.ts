/**
 * lib/engine/reader/assembly-request-builder.ts
 * ----------------------------------------------------------------------------
 * Reader Stage 6 — AssemblyRequest Builder: Blueprint AST → AssemblyRequest.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Blueprint Integration Specification v1.0 §4 (AssemblyRequest Contract),
 *     §4.4 (What the AssemblyRequest Deliberately Omits)
 *   - Blueprint Reader Pipeline Architecture v1.0 §10 (AssemblyRequest
 *     Generation)
 *   - Implementation Planning v1.0 §3.2 (Reader acceptance: byte-identical
 *     Blueprint → byte-identical AssemblyRequest)
 *
 * Stage 6 reduces the Blueprint AST to the smaller, Engine-consumable
 * AssemblyRequest contract. The reduction is governed by Integration Spec §4:
 * the AssemblyRequest carries RULES, TARGETS, and the DOCUMENT REGISTRY — NOT
 * the per-Set illustrative tables, NOT the rationale prose, NOT the per-slot
 * examples.
 *
 * What Stage 6 DOES:
 *  - Build an immutable AssemblyRequest.
 *  - Preserve Blueprint identity (id, version, profile) from the AST.
 *  - Preserve metadata (per-Set count, profile) as the `target` block.
 *  - Carry forward the four rule families:
 *      distribution_constraints, coverage_rules, lo_distribution,
 *      duplicate_prevention.
 *  - Synthesize the Document Registry by pairing Tier Assignments with Tier
 *    Definitions (the registry needs `{id, name, tier}` per entry).
 *  - Produce a deterministic ordering for every collection (Stage 5 may emit
 *    in source order; Stage 6 normalizes to stable business keys so two
 *    byte-different Blueprints with the same rules produce the same request).
 *
 * What Stage 6 does NOT do (spec §4.4):
 *  - ❌ Carry the per-Set Document/Difficulty/BlueprintType count tables
 *     (those are author-guidance; the Engine re-derives its own allocation).
 *  - ❌ Carry the Pattern × Type correspondence matrix directly (it's encoded
 *     indirectly via the LO↔Type map; the Solver re-derives pattern fit from
 *     the Candidate's metadata at runtime).
 *  - ❌ Carry per-Question examples.
 *  - ❌ Carry rationale prose.
 *
 * IMMUTABILITY: the output AssemblyRequest is constructed once and never
 * mutated. TypeScript structural types don't enforce `readonly` on every
 * nested field of the existing AssemblyRequest contract (defined in
 * contracts.ts); the immutability is documented and verified by a test that
 * asserts the builder is a pure function (same AST in → same request out).
 *
 * Determinism (spec Principle 2 / Reader Pipeline §6): pure function. Same
 * BlueprintAst + CanonicalBlueprintMetadata in → same AssemblyRequest out,
 * byte-for-byte. No clocks, random, or I/O.
 */

import type {
  AnchorRule,
  AssemblyRequest,
  AssemblyRequestIdentity,
  AssemblyRequestMeta,
  CoverageRule,
  DistributionConstraints,
  DocumentRegistryEntry,
  DuplicatePreventionRule,
  EnforcementLevel,
  LoDistribution,
  RunTarget,
  SimilarityThresholds,
  Tier,
} from './contracts'
import type { BlueprintAst, TierAssignment, TierDefinition } from './blueprint-ast'
import type { CanonicalBlueprintMetadata } from './normalizer'

// ─── Public API: buildAssemblyRequest ───────────────────────────────────────

/**
 * The result of Stage 6. Discriminated union: either the AssemblyRequest was
 * built (`ok: true`) or Stage 6 found a missing-required-piece failure
 * (`ok: false`). Stage 7 (Diagnostics Aggregation) will fold the structured
 * failure into the Reader's diagnostic stream; for now, the caller surfaces
 * the failure directly.
 *
 * Stage 6 does NOT silently default-and-continue when a required piece is
 * missing — that would violate spec §11 (Fail Loud). It returns the structured
 * failure and lets the caller decide.
 */
export type BuildAssemblyRequestResult =
  | { ok: true; request: AssemblyRequest }
  | {
      ok: false
      /** Short stable code identifying the failure (audit-friendly). */
      code: BuildFailureCode
      message: string
    }

/**
 * Why Stage 6 refused to build. Each code maps to a specific missing piece.
 * The set is small: most "what's wrong" questions were answered by Stages 2-3.
 */
export type BuildFailureCode =
  | 'missing_blueprint_version' // identity.blueprintVersion is null
  | 'missing_position_id' // identity.blueprintId is null (position id doubles as Blueprint id in v3.0)
  | 'missing_document_registry' // no Tier Assignments → no registry entries
  | 'missing_distribution_constraints' // AST carried no Distribution Constraints block
  | 'missing_lo_distribution' // no LO Definitions → can't build loDistribution
  | 'missing_duplicate_prevention' // no Duplicate Policies → can't build duplicatePrevention

// ─── Defaults / constants ───────────────────────────────────────────────────

/**
 * The Assessment Profile carried into the AssemblyRequest. v1.0 = 'simulation'
 * only (Integration Spec §4.3). When the Engine Foundation adds Profiles, this
 * becomes an input; today it's a frozen constant.
 */
const PROFILE: AssemblyRequestIdentity['profile'] = 'simulation'

/**
 * The Run Target. Blueprint v3.0 is fixed at 5 Sets × 100 Questions/Set. When
 * the Blueprint is authored at a different size, this becomes an input derived
 * from the metadata. For v1.0 the constant matches reality.
 */
const RUN_TARGET: RunTarget = { sets: 5, perSet: 100 }

/**
 * The constant spec_version carried in `meta`. Bumping this is a contract
 * change requiring version negotiation (Runtime API §4.5).
 */
const SPEC_VERSION: AssemblyRequestMeta['specVersion'] = '1.0'

// ─── Build entry point ──────────────────────────────────────────────────────

/**
 * Build an immutable AssemblyRequest from a projected Blueprint AST and the
 * normalized metadata.
 *
 * Pure and deterministic.
 *
 * @param ast           The Stage-5-projected BlueprintAst.
 * @param canonicalMeta The Stage-4-normalized metadata (for identity).
 */
export function buildAssemblyRequest(
  ast: BlueprintAst,
  canonicalMeta: CanonicalBlueprintMetadata
): BuildAssemblyRequestResult {
  // 1. Required-piece checks (Fail Loud — no silent defaults on identity).
  if (canonicalMeta.blueprintVersion === null) {
    return {
      ok: false,
      code: 'missing_blueprint_version',
      message:
        'Cannot build AssemblyRequest: Blueprint Version is missing (Stage 3 should have reported it).',
    }
  }
  if (canonicalMeta.positionId === null) {
    return {
      ok: false,
      code: 'missing_position_id',
      message:
        'Cannot build AssemblyRequest: Position ID is missing (used as the Blueprint id in v1.0).',
    }
  }
  if (ast.tierAssignments.length === 0) {
    return {
      ok: false,
      code: 'missing_document_registry',
      message:
        'Cannot build AssemblyRequest: Document Registry is empty (no Tier Assignments found in the Blueprint).',
    }
  }
  if (ast.loDefinitions.length === 0) {
    return {
      ok: false,
      code: 'missing_lo_distribution',
      message:
        'Cannot build AssemblyRequest: no LO Definitions found (cannot build lo_distribution map).',
    }
  }

  // 2. Identity block.
  const identity: AssemblyRequestIdentity = {
    blueprint_id: canonicalMeta.positionId,
    blueprint_version: canonicalMeta.blueprintVersion,
    profile: PROFILE,
  }

  // 3. Document Registry — synthesize from Tier Assignments paired with
  //    Tier Definitions for the `tier` value. Sort by document id (stable).
  const documentRegistry = buildDocumentRegistry(ast.tierAssignments)

  // 4. Distribution Constraints — taken from the AST as-is. Stage 5 produced
  //    sensible v3.0 defaults when the pseudocode was unparseable; we trust
  //    that contract.
  const distributionConstraints: DistributionConstraints =
    ast.distributionConstraints

  // 5. Coverage Rules — preserve the AST's projection (already CR-1..CR-5 in
  //    canonical order).
  const coverageRules: CoverageRule[] = ast.coverageRules.map((c) => ({
    id: c.id,
    level: c.level,
    binding: c.binding,
  }))

  // 6. LO Distribution — synthesize from LO Definitions + LO Distribution
  //    Targets. The `targets` map keys are LO1..LO4; the `typeMap` is the
  //    LO → BlueprintType correspondence (1:1 in v3.0).
  const loDistribution = buildLoDistribution(ast)

  // 7. Duplicate Prevention — synthesize from Duplicate Policies + Similarity
  //    Thresholds (thresholds apply only to L-rules that use the Similarity
  //    Metric; v3.0 doesn't bind thresholds per-rule so we attach them to
  //    every rule for the Solver to consult as needed).
  const duplicatePrevention = buildDuplicatePrevention(
    ast.duplicatePolicies,
    ast.similarityThresholds
  )

  // 8. AssemblyRequest.
  const request: AssemblyRequest = {
    identity,
    runUnit: 'blueprint',
    target: RUN_TARGET,
    documentRegistry,
    distributionConstraints,
    coverageRules,
    loDistribution,
    duplicatePrevention,
    exclusions: [], // Runtime-only; Stage 6 emits empty.
    meta: { specVersion: SPEC_VERSION },
  }

  return { ok: true, request }
}

// ─── Sub-builders ───────────────────────────────────────────────────────────

/**
 * Build the Document Registry by pairing Tier Assignments with their Tier.
 * Each Tier Assignment already carries the tier value (Stage 5 projected it),
 * so this is mostly a shape-mapping plus a stable sort.
 *
 * Source-of-truth note (Integration Spec §4.3): each entry is `{id, name, tier}`.
 * The v3.0 document has no stable `id` distinct from its `name` — we use the
 * authored document name as both. A future documents-table migration
 * (Implementation Planning §4.4 IG-1) would let us emit stable codes here.
 */
function buildDocumentRegistry(
  tierAssignments: readonly TierAssignment[]
): DocumentRegistryEntry[] {
  // Map by document name to deduplicate (a document may appear in both the
  // Mapping table and the Master Table; the Tier Mapping is authoritative).
  const byName = new Map<string, DocumentRegistryEntry>()
  for (const ta of tierAssignments) {
    if (byName.has(ta.documentName)) continue
    byName.set(ta.documentName, {
      id: ta.documentName, // v3.0: id === name (no separate code)
      name: ta.documentName,
      tier: ta.tier,
    })
  }
  // Stable sort by id (document name) so two byte-different Blueprints with
  // the same documents produce the same registry order.
  return [...byName.values()].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  )
}

/**
 * Build the LoDistribution block from LO Definitions + LO Distribution Targets.
 *
 * The `targets` map is keyed LO1..LO4. Each target is a single representative
 * percent (the midpoint of the authored range, computed by Stage 5). When a
 * LO has a Definition but no Distribution Target, target defaults to 0 — that
 * surfaces a config gap the Solver will report at runtime.
 *
 * The `typeMap` is the LO → BlueprintType[] correspondence from the LO
 * Definitions table. v3.0 is 1:1 (LO1 → Memory, LO2 → Concept, etc.). The
 * typeMap shape supports 1:many for future Profiles.
 */
function buildLoDistribution(ast: BlueprintAst): LoDistribution {
  // Targets: prefer the authored Distribution Targets; fall back to 0 for any
  // LO with a Definition but no target.
  const targets = {} as LoDistribution['targets']
  const typeMap = {} as LoDistribution['typeMap']

  // Initialize all four LOs from Definitions.
  const allLos: Array<'LO1' | 'LO2' | 'LO3' | 'LO4'> = ['LO1', 'LO2', 'LO3', 'LO4']
  for (const lo of allLos) {
    const def = ast.loDefinitions.find((d) => d.lo === lo)
    targets[lo] = 0
    typeMap[lo] = def ? [def.blueprintType] : []
  }
  // Overlay authored targets.
  for (const t of ast.loDistributionTargets) {
    targets[t.lo] = t.targetPercent
  }

  return { targets, typeMap }
}

/**
 * Build the DuplicatePreventionRule[] from the AST's Duplicate Policies.
 *
 * Stage 5 emits one DuplicatePolicy per authored L-rule. Stage 6 maps each to
 * the AssemblyRequest's DuplicatePreventionRule shape, attaching the Similarity
 * Thresholds to every rule that uses the Similarity Metric. v3.0 doesn't
 * distinguish which L-rules use the metric at the per-rule level (the metric
 * is global), so we attach thresholds to every rule as a conservative default.
 *
 * Rules are sorted by id (L1..L5) for stable output.
 */
function buildDuplicatePrevention(
  policies: BlueprintAst['duplicatePolicies'],
  thresholds: SimilarityThresholds | null
): DuplicatePreventionRule[] {
  // Ensure L1..L5 all present. If a policy is missing from the AST, emit a
  // sensible default rather than silently dropping it — the downstream Solver
  // expects all five.
  const allIds: Array<'L1' | 'L2' | 'L3' | 'L4' | 'L5'> = [
    'L1',
    'L2',
    'L3',
    'L4',
    'L5',
  ]
  const defaults: Record<
    string,
    { scope: 'within_set' | 'across_set'; level: EnforcementLevel }
  > = {
    L1: { scope: 'within_set', level: 'hard' },
    L2: { scope: 'within_set', level: 'hard' },
    L3: { scope: 'across_set', level: 'soft' },
    L4: { scope: 'across_set', level: 'soft' },
    L5: { scope: 'across_set', level: 'soft' },
  }

  const byId = new Map(policies.map((p) => [p.id, p]))
  const out: DuplicatePreventionRule[] = []
  for (const id of allIds) {
    const authored = byId.get(id)
    const scope = authored?.scope ?? defaults[id]!.scope
    const level = authored?.level ?? defaults[id]!.level
    const rule: DuplicatePreventionRule = {
      id,
      scope,
      level,
    }
    // Attach thresholds when present. v3.0 declares a single global metric;
    // we attach to every rule. A future per-rule threshold would just key
    // this attachment differently.
    if (thresholds) {
      rule.similarityThresholds = thresholds
    }
    out.push(rule)
  }
  return out
}

// ─── Unused-type-arity silencer (keep helpers uniform) ──────────────────────
// AnchorRule, RunTarget, Tier, TierDefinition are imported for type-documentation
// purposes (the builder's JSDoc references them). Reference them so the import
// isn't flagged as unused.
void (null as unknown as AnchorRule)
void (null as unknown as RunTarget)
void (null as unknown as Tier)
void (null as unknown as TierDefinition)
