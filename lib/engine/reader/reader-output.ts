/**
 * lib/engine/reader/reader-output.ts
 * ----------------------------------------------------------------------------
 * Reader Stage 8 — Reader Output: build the final ReadBlueprintResult.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Blueprint Reader Pipeline Architecture v1.0 §3 (entry-point return type),
 *     §10 (AssemblyRequest Generation), §11 (Fail Fast / Loud / Deterministic)
 *   - Implementation Planning v1.0 §3.2 (Reader acceptance: byte-identical
 *     Blueprint → byte-identical AssemblyRequest)
 *   - Engineering Backlog E-1.2 S-1.2.7 / S-1.2.8 (Stage 7 + Stage 8)
 *
 * Stage 8 is the orchestrator that wires Stages 1–7 together and produces the
 * final ReaderResult. It does NOT itself validate, project, or build — those
 * are the responsibilities of Stages 2, 3, 5, and 6 respectively. Stage 8's
 * sole job is:
 *   1. Run each stage in fixed order.
 *   2. Aggregate diagnostics (Stage 7) at each halt point.
 *   3. Decide ok=true vs ok=false based on whether any halt-severity
 *      diagnostic was emitted.
 *   4. Construct the immutable ReadBlueprintResult carrying everything the
 *      Application needs: metadata, diagnostics, executionMeta, and (on
 *      success) the AssemblyRequest.
 *
 * HALT SEMANTICS (Reader Pipeline §7.3):
 *   - Stage 1 refusal (empty/non-text input) → ok=false immediately, no
 *     further stages run. diagnostics is empty (Stage 1 doesn't emit
 *     ReaderErrors; it returns a typed refusal).
 *   - Stage 2 emits a fatal/blocking → ok=false, Stage 3+ skipped.
 *   - Stage 3 emits a fatal/blocking → ok=false, Stage 5+ skipped.
 *   - Stage 5 emits a fatal/blocking → ok=false, Stage 6 skipped.
 *   - Stage 6 refuses (missing required piece) → ok=false.
 *   - All stages pass with only warnings (or no diagnostics) → ok=true.
 *
 * What Stage 8 DELIBERATELY DOES NOT DO:
 *   - ❌ Execute the AssemblyRequest. That's the Runtime API's job.
 *   - ❌ Call the Candidate Generator / Ranking / Solver. Those are Engine
 *      internals the Reader never touches.
 *   - ❌ Access databases or external services (spec §7.4).
 *   - ❌ Auto-repair or override halt decisions (spec §7.3 — override pathway
 *      exists for "advanced users" but is NOT implemented in v1.0 Reader).
 *
 * DETERMINISM (Reader Pipeline Principle 2): pure function of the source
 * string. Same source + same Reader version → same ReaderResult, byte-for-byte.
 * The only non-deterministic field (timestampIso) is caller-supplied; if the
 * caller passes null, the result is fully deterministic.
 *
 * IMMUTABILITY: every field of the returned ReaderResult is `readonly`. The
 * nested AssemblyRequest and BlueprintAst are also `readonly`-typed. Stage 8
 * constructs the result once and never mutates.
 */

import type {
  AssemblyRequest,
  ReadBlueprintResult,
  ReaderError,
  ReaderExecutionMeta,
} from './contracts'
import type { BlueprintDocument } from './loader'
import { loadBlueprint } from './loader'
import { validateSchema } from './schema-validator'
import { validateMetadata } from './metadata-validator'
import { normalizeMetadata, type CanonicalBlueprintMetadata } from './normalizer'
import { projectToBlueprintAst } from './ast-projection'
import {
  buildAssemblyRequest,
  type BuildAssemblyRequestResult,
} from './assembly-request-builder'
import {
  aggregateDiagnostics,
  containsHaltDiagnostic,
  type DiagnosticSources,
} from './diagnostics-aggregator'

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * The Reader implementation version. Bumped when the Reader's behavior
 * changes in a way that affects the AssemblyRequest produced from a given
 * Blueprint (e.g. a projection rule change). Purely additive bumps don't
 * require a bump — only output-shaping changes do.
 *
 * Carried in ReaderExecutionMeta.readerVersion.
 */
const READER_VERSION = '1.0.0' as const

// ─── Public API: readBlueprint ──────────────────────────────────────────────

/**
 * Optional inputs to readBlueprint. All fields optional; the Reader has
 * sensible defaults (no timestamp, no exclusions, no execution options yet).
 */
export interface ReadBlueprintOptions {
  /**
   * Caller-supplied ISO timestamp for audit. The Reader NEVER reads the wall
   * clock itself (would violate determinism). Null when absent.
   */
  readonly timestampIso?: string | null
}

/**
 * Read a Blueprint source string end-to-end through Stages 1–8 and produce
 * the final ReaderResult.
 *
 * This is the Reader's single public entry point. Applications call this
 * (via the Runtime API in a later Epic); they never call internal stages.
 *
 * Pure and deterministic given (source, options.timestampIso). Same source +
 * same timestamp → same ReaderResult.
 *
 * @param source   The verbatim Blueprint Markdown source.
 * @param options  Optional caller inputs (currently just timestamp).
 */
export function readBlueprint(
  source: string,
  options: ReadBlueprintOptions = {}
): ReadBlueprintResult {
  const timestampIso = options.timestampIso ?? null

  // ─── Stage 1: Load ───────────────────────────────────────────────────────
  const loaded = loadBlueprint(source)
  if (!loaded.ok) {
    // Stage 1 refusal: empty/non-text input. No further stages run. No
    // diagnostics (Stage 1 returns a typed refusal, not ReaderErrors).
    // Metadata is a synthetic empty block; executionMeta reflects the
    // unknown-schema state.
    return buildFailureResult({
      diagnostics: [],
      metadata: EMPTY_METADATA,
      schemaVersionMajor: null,
      timestampIso,
      assemblyRequest: null,
    })
  }
  const doc: BlueprintDocument = loaded.document

  // ─── Stage 2: Schema Validation ──────────────────────────────────────────
  const stage2Diagnostics = validateSchema(doc)
  if (containsHaltDiagnostic(stage2Diagnostics)) {
    return buildFailureResult({
      diagnostics: aggregateOnly(stage2Diagnostics),
      metadata: normalizeMetadata(doc.metadata),
      schemaVersionMajor: extractSchemaMajor(doc.metadata.blueprintVersion),
      timestampIso,
      assemblyRequest: null,
    })
  }

  // ─── Stage 3: Metadata Validation ────────────────────────────────────────
  const stage3Diagnostics = validateMetadata(doc)
  if (containsHaltDiagnostic(stage3Diagnostics)) {
    return buildFailureResult({
      diagnostics: aggregate(stage2Diagnostics, stage3Diagnostics),
      metadata: normalizeMetadata(doc.metadata),
      schemaVersionMajor: extractSchemaMajor(doc.metadata.blueprintVersion),
      timestampIso,
      assemblyRequest: null,
    })
  }

  // ─── Stage 4: Normalization ──────────────────────────────────────────────
  const canonicalMeta = normalizeMetadata(doc.metadata)

  // ─── Stage 5: AST Projection ─────────────────────────────────────────────
  const ast = projectToBlueprintAst(doc, canonicalMeta)
  // Stage 5 currently emits no diagnostics. Plumb an empty source so the
  // aggregator's stage order is exercised uniformly; a future Stage 5 that
  // emits diagnostics (e.g. projection-time referential-integrity checks)
  // adds them here without changing Stage 8's structure.
  const stage5Diagnostics: readonly ReaderError[] = []

  // ─── Stage 6: AssemblyRequest Builder ────────────────────────────────────
  const buildResult: BuildAssemblyRequestResult = buildAssemblyRequest(ast, canonicalMeta)
  if (!buildResult.ok) {
    // Stage 6 refusal: synthesize a single ReaderError representing the
    // failure so the diagnostics list explains WHY no AssemblyRequest was
    // produced. This is the one place Stage 8 fabricates a diagnostic — the
    // build failures are typed (BuildFailureCode) but the ReaderError model
    // is the universal diagnostic currency, so we translate.
    const buildFailureDiagnostic: ReaderError = {
      category: 'generation.missing_contract_field',
      location: { startLine: 1, endLine: doc.lineCount || 1 },
      severity: 'blocking',
      explanation: `${buildFailure.code}: ${buildFailure.message}`,
      recommendation:
        'Fix the Blueprint so all required pieces are present (see the Stage 6 build-failure code in the explanation).',
    }
    return buildFailureResult({
      diagnostics: aggregate(stage2Diagnostics, stage3Diagnostics, [
        buildFailureDiagnostic,
      ]),
      metadata: canonicalMeta,
      schemaVersionMajor: extractSchemaMajor(canonicalMeta.blueprintVersion),
      timestampIso,
      assemblyRequest: null,
    })
  }
  const assemblyRequest: AssemblyRequest = buildResult.request

  // ─── Stage 7: Diagnostics Aggregation (success path) ─────────────────────
  const diagnostics = aggregate(stage2Diagnostics, stage3Diagnostics, stage5Diagnostics)

  // ─── Stage 8: ReaderResult (success) ─────────────────────────────────────
  const executionMeta: ReaderExecutionMeta = {
    readerVersion: READER_VERSION,
    schemaVersionMajor: extractSchemaMajor(canonicalMeta.blueprintVersion),
    timestampIso,
  }

  return {
    ok: true,
    diagnostics,
    metadata: canonicalMeta,
    executionMeta,
    assemblyRequest,
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Synthetic empty metadata used only when Stage 1 refuses the input (no
 * document to extract metadata from). All fields null; form='none'.
 */
const EMPTY_METADATA: CanonicalBlueprintMetadata = {
  engineVersion: null,
  blueprintVersion: null,
  positionId: null,
  title: null,
  sourceLine: null,
  form: 'none',
}

/**
 * Extract the schema major version from a Blueprint Version string.
 * Returns null when the version is absent or non-semver (Stage 3 will have
 * already reported the latter).
 */
function extractSchemaMajor(blueprintVersion: string | null): string | null {
  if (!blueprintVersion) return null
  const m = blueprintVersion.match(/^(\d+)\./)
  return m ? m[1]! : null
}

/**
 * Aggregator shortcut for the common case of 2–3 stage sources.
 * Keeps the call sites in readBlueprint readable.
 */
function aggregate(
  s2: readonly ReaderError[],
  s3: readonly ReaderError[],
  s5: readonly ReaderError[]
): readonly ReaderError[] {
  const sources: DiagnosticSources = {
    stage2Schema: s2,
    stage3Metadata: s3,
    stage5Projection: s5,
  }
  return aggregateDiagnostics(sources)
}

/** Aggregator shortcut for a single stage source (Stage 2-only halt). */
function aggregateOnly(s2: readonly ReaderError[]): readonly ReaderError[] {
  return aggregateDiagnostics({ stage2Schema: s2 })
}

/**
 * Construct a failure ReaderResult. Centralized so every failure path
 * produces the same shape (no chance of a missing field).
 */
function buildFailureResult(input: {
  diagnostics: readonly ReaderError[]
  metadata: CanonicalBlueprintMetadata
  schemaVersionMajor: string | null
  timestampIso: string | null
  assemblyRequest: null
}): ReadBlueprintResult {
  const executionMeta: ReaderExecutionMeta = {
    readerVersion: READER_VERSION,
    schemaVersionMajor: input.schemaVersionMajor,
    timestampIso: input.timestampIso,
  }
  return {
    ok: false,
    diagnostics: input.diagnostics,
    metadata: input.metadata,
    executionMeta,
  }
}
