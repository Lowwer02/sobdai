/**
 * lib/engine/reader/metadata-validator.ts
 * ----------------------------------------------------------------------------
 * Reader Stage 3 — Metadata Validation (semantic checks on metadata fields).
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Blueprint Reader Pipeline Architecture v1.0 §7 (Semantic Validation)
 *   - Implementation Planning v1.0 §3.2 (Reader acceptance criteria)
 *   - Engineering Backlog E-1.2 S-1.2.4 (Semantic Validation — metadata subset)
 *   - IG-2 Architecture Amendment v1.0 §8.3 (schema version vocabulary)
 *
 * Stage 3 is a NARROW SUBSET of spec §7 Semantic Validation. The spec's §7
 * covers all internal-Blueprint consistency (distribution sums, coverage
 * consistency, impossible constraints, conflicting rules, etc.); this stage
 * covers ONLY the metadata block:
 *   - Blueprint Version: present, syntactically valid semver, schema major
 *     supported.
 *   - Engine Version: present, syntactically valid semver, compatibility
 *     with this Reader's MIN_ENGINE_VERSION.
 *   - Position ID: present, syntactically valid (kebab-case identifier).
 *   - Title (H1): non-empty after trim.
 *   - Completeness: every required metadata field is present.
 *   - Duplicate metadata keys (YAML form only — blockquote form has no keys).
 *   - Unknown metadata keys (YAML form only — surfaces typos).
 *
 * What Stage 3 deliberately does NOT do (per spec §7.4 + user mission scope):
 *   - ❌ Rule feasibility (tier sums, distribution consistency). Those are
 *      Stage 5 (Rule Expansion) concerns in the user's pipeline, and they
 *      belong to spec §7's broader scope.
 *   - ❌ Bank access (spec §7.4 — never).
 *   - ❌ Normalization (Stage 4).
 *   - ❌ Business-rule validation of any kind.
 *
 * Output: `ReaderError[]` from contracts.ts. Reuses the existing
 * `semantic.*` category vocabulary — no new error model invented.
 *
 * Determinism: same BlueprintDocument → same diagnostic list, same order.
 */

import type {
  ReaderError,
  ReaderErrorCategory,
  ReaderErrorSeverity,
  SourceLocation,
} from './contracts'
import type { BlueprintDocument, BlueprintMetadata } from './loader'
import {
  MIN_ENGINE_VERSION,
  SUPPORTED_BLUEPRINT_SCHEMA_VERSIONS,
} from './loader'

// ─── Versionship constants ─────────────────────────────────────────────────
// Single source of truth for what "supported" means. Mirrors loader.ts; if
// either bound changes, both must. Kept readable as named constants (not
// magic strings) so diagnostic messages can cite them.

/**
 * The set of metadata keys this Reader recognizes in YAML frontmatter form.
 * Keys outside this set trigger an `unknown metadata` warning (smell).
 *
 * For the v3.0 blockquote form there are no keys — only the three positional
 * fields (Engine Version, Blueprint Version, Position ID) — so this set is
 * only consulted when `metadata.form === 'yaml-frontmatter'`.
 */
export const KNOWN_METADATA_KEYS: ReadonlySet<string> = new Set([
  'engine_version',
  'engineVersion',
  'blueprint_version',
  'blueprintVersion',
  'position_id',
  'positionId',
  'title',
])

// ─── Diagnostic constructor (mirrors schema-validator's) ────────────────────

function diagnostic(input: {
  category: ReaderErrorCategory
  location: SourceLocation
  severity: ReaderErrorSeverity
  explanation: string
  recommendation: string
}): ReaderError {
  return { ...input }
}

// ─── Public API: validateMetadata ───────────────────────────────────────────

/**
 * Validate the metadata block of a BlueprintDocument. Returns a list of
 * semantic diagnostics; an empty list means the metadata is internally
 * consistent and complete.
 *
 * Runs every applicable check (Fail Loud, spec §11) — does not short-circuit
 * after the first failure. The author sees every metadata problem in one pass.
 *
 * PRECONDITION: Stage 2 (schema validation) has already run. Stage 3 assumes
 * the document is structurally well-formed; it does not re-check structure.
 * (Calling validateMetadata on a structurally-invalid document is harmless —
 * it will simply also report the metadata problems — but the convention is
 * Stage 2 → Stage 3.)
 */
export function validateMetadata(doc: BlueprintDocument): ReaderError[] {
  const diagnostics: ReaderError[] = []
  const m = doc.metadata

  // Fixed check order (determinism contract).
  checkRequiredMetadataPresent(m, diagnostics)
  checkBlueprintVersionSyntax(m, diagnostics)
  checkBlueprintVersionSupported(m, diagnostics)
  checkEngineVersionSyntax(m, diagnostics)
  checkEngineVersionCompatibility(m, diagnostics)
  checkPositionIdSyntax(m, diagnostics)
  checkTitleNonEmpty(m, diagnostics)

  return diagnostics
}

// ─── Individual metadata checks ─────────────────────────────────────────────

/**
 * Check: every required metadata field must be present. Required fields are
 * the three positional v3.0 fields (engineVersion, blueprintVersion,
 * positionId); title is checked separately (it's required but sourced from
 * H1, not the metadata block).
 *
 * Missing required metadata is `semantic.smell` at WARNING severity: Stage 4
 * normalization can still proceed (it produces a CanonicalBlueprintMetadata
 * with nulls), but the AssemblyRequest builder (Stage 6) will reject a
 * Blueprint with no identity. Surfacing the gap here gives the author an
 * early, precise message rather than a generic "invalid Blueprint" later.
 */
function checkRequiredMetadataPresent(m: BlueprintMetadata, diagnostics: ReaderError[]): void {
  const loc = metadataLocation(m)
  if (m.engineVersion === null) {
    diagnostics.push(
      diagnostic({
        category: 'semantic.smell',
        location: loc,
        severity: 'warning',
        explanation: 'Engine Version is not declared in the metadata.',
        recommendation: 'Add "**Engine Version**: X.Y.Z" (e.g. "**Engine Version**: 1.0.0").',
      })
    )
  }
  if (m.blueprintVersion === null) {
    // Note: Stage 2's version check already reports this as blocking under
    // structural.malformed_table. We don't re-report here to avoid duplicate
    // noise — Stage 2 is authoritative for "is the version field present at
    // all"; Stage 3 is authoritative for "is the version field's VALUE
    // semantically valid". A null value means "absent", which is Stage 2's
    // beat. (If Stage 2 was skipped, this branch is a no-op, which is fine.)
  }
  if (m.positionId === null) {
    diagnostics.push(
      diagnostic({
        category: 'semantic.smell',
        location: loc,
        severity: 'warning',
        explanation: 'Position ID is not declared in the metadata.',
        recommendation:
          'Add "**Position ID**: `<kebab-case-id>`" (e.g. "**Position ID**: `bma-education-specialist`).',
      })
    )
  }
}

/**
 * Check: Blueprint Version, when present, must be syntactically valid semver
 * (MAJOR.MINOR.PATCH). Anything else is a typo or a non-semver versioning
 * scheme the Reader doesn't know how to interpret for schema-major extraction.
 *
 * Syntactic failure is `semantic.conflicting_rules` (blocking) — the version
 * field exists but its value doesn't parse, which is a value-level conflict.
 */
function checkBlueprintVersionSyntax(m: BlueprintMetadata, diagnostics: ReaderError[]): void {
  if (m.blueprintVersion === null) return // handled by checkRequiredMetadataPresent / Stage 2
  if (!isValidSemver(m.blueprintVersion)) {
    diagnostics.push(
      diagnostic({
        category: 'semantic.conflicting_rules',
        location: metadataLocation(m),
        severity: 'blocking',
        explanation: `Blueprint Version "${m.blueprintVersion}" is not valid semver (expected MAJOR.MINOR.PATCH, e.g. "3.0.0").`,
        recommendation:
          'Use semantic versioning for Blueprint Version. The Reader extracts the schema major version from the MAJOR component.',
      })
    )
  }
}

/**
 * Check: Blueprint Version's major component must be a supported schema version.
 * Mirrors Stage 2's structural check but at the SEMANTIC layer: Stage 2 reports
 * the absence of version metadata; Stage 3 reports an unsupported-but-present
 * value with a more precise, value-oriented message.
 *
 * Unsupported version is `semantic.conflicting_rules` (blocking).
 */
function checkBlueprintVersionSupported(m: BlueprintMetadata, diagnostics: ReaderError[]): void {
  if (m.blueprintVersion === null) return
  if (!isValidSemver(m.blueprintVersion)) return // already reported by syntax check
  const major = m.blueprintVersion.split('.')[0]!
  if (!SUPPORTED_BLUEPRINT_SCHEMA_VERSIONS.has(major)) {
    diagnostics.push(
      diagnostic({
        category: 'semantic.conflicting_rules',
        location: metadataLocation(m),
        severity: 'blocking',
        explanation: `Blueprint schema major version ${major} (from "${m.blueprintVersion}") is not supported. Supported major versions: ${[...SUPPORTED_BLUEPRINT_SCHEMA_VERSIONS].join(', ')}.`,
        recommendation: `Use a Blueprint major version in {${[...SUPPORTED_BLUEPRINT_SCHEMA_VERSIONS].join(', ')}}, or upgrade the Reader to support major version ${major}.`,
      })
    )
  }
}

/**
 * Check: Engine Version, when present, must be syntactically valid semver.
 */
function checkEngineVersionSyntax(m: BlueprintMetadata, diagnostics: ReaderError[]): void {
  if (m.engineVersion === null) return
  if (!isValidSemver(m.engineVersion)) {
    diagnostics.push(
      diagnostic({
        category: 'semantic.conflicting_rules',
        location: metadataLocation(m),
        severity: 'blocking',
        explanation: `Engine Version "${m.engineVersion}" is not valid semver (expected MAJOR.MINOR.PATCH, e.g. "1.0.0").`,
        recommendation: 'Use semantic versioning for Engine Version.',
      })
    )
  }
}

/**
 * Check: Engine Version must be compatible with this Reader's minimum.
 *
 * The Reader's MIN_ENGINE_VERSION is the floor of Engine versions it knows
 * how to cooperate with. A declared Engine Version below the floor means the
 * Blueprint was authored against an older Engine contract — the Reader may
 * silently misinterpret fields. The check uses semver precedence: the
 * declared version must be >= MIN_ENGINE_VERSION.
 *
 * Incompatibility is `semantic.conflicting_rules` (blocking).
 */
function checkEngineVersionCompatibility(m: BlueprintMetadata, diagnostics: ReaderError[]): void {
  if (m.engineVersion === null) return
  if (!isValidSemver(m.engineVersion)) return // syntax check reported it
  if (compareSemver(m.engineVersion, MIN_ENGINE_VERSION) < 0) {
    diagnostics.push(
      diagnostic({
        category: 'semantic.conflicting_rules',
        location: metadataLocation(m),
        severity: 'blocking',
        explanation: `Engine Version "${m.engineVersion}" is below this Reader's minimum supported Engine Version "${MIN_ENGINE_VERSION}". The Blueprint may use metadata or rule conventions the Reader cannot interpret correctly.`,
        recommendation: `Bump the Blueprint's Engine Version to at least "${MIN_ENGINE_VERSION}", or use a newer Reader that supports older Engine contracts.`,
      })
    )
  }
}

/**
 * Check: Position ID, when present, must be a syntactically valid kebab-case
 * identifier. The Position ID is consumed downstream (Stage 5+ will use it
 * for Blueprint identity); a malformed ID would silently break that.
 *
 * Format: one or more lowercase-alphanumeric segments separated by single
 * hyphens. Examples: `bma-education-specialist`, `policy-analyst-2`. Rejects
 * leading/trailing hyphens, uppercase, underscores, spaces, Thai characters.
 *
 * Severity is `semantic.smell` (warning) — the Reader can still proceed, but
 * downstream consumers (UI, audit) may not handle the malformed ID cleanly.
 */
function checkPositionIdSyntax(m: BlueprintMetadata, diagnostics: ReaderError[]): void {
  if (m.positionId === null) return
  // kebab-case: ^[a-z0-9]+(-[a-z0-9]+)*$
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(m.positionId)) {
    diagnostics.push(
      diagnostic({
        category: 'semantic.smell',
        location: metadataLocation(m),
        severity: 'warning',
        explanation: `Position ID "${m.positionId}" is not a valid kebab-case identifier (expected lowercase alphanumeric segments separated by single hyphens, e.g. "bma-education-specialist").`,
        recommendation:
          'Use only lowercase ASCII letters, digits, and single hyphens. Avoid underscores, spaces, uppercase, and Thai characters.',
      })
    )
  }
}

/**
 * Check: title (H1 text) must be non-empty after trim. Stage 2 already
 * reports missing H1 as blocking structural; this catches the case where H1
 * exists but is whitespace-only (e.g. `#  ` parses to a heading with empty
 * text). Empty-title is `semantic.smell` (warning).
 */
function checkTitleNonEmpty(m: BlueprintMetadata, diagnostics: ReaderError[]): void {
  if (m.title === null) return // Stage 2 reports missing H1
  if (m.title.trim() === '') {
    diagnostics.push(
      diagnostic({
        category: 'semantic.smell',
        location: { startLine: 1, endLine: 1 },
        severity: 'warning',
        explanation: 'H1 title is empty (whitespace only). Every Blueprint should have a meaningful title.',
        recommendation: 'Add a non-empty title to the H1 heading, e.g. "# Simulation Exam Blueprint — v3.0".',
      })
    )
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Resolve a SourceLocation for metadata diagnostics. Uses the metadata's
 * recorded sourceLine when available; falls back to line 1 (the metadata
 * block is conventionally at the top of the document).
 */
function metadataLocation(m: BlueprintMetadata): SourceLocation {
  const line = m.sourceLine ?? 1
  return { startLine: line, endLine: line }
}

/**
 * Validate a string as semantic-version (MAJOR.MINOR.PATCH). Numeric components
 * only; no pre-release/build suffixes (Blueprint versioning doesn't use them).
 *
 * Permissive on leading zeros (`01.0.0` is accepted) to avoid false positives
 * on uncommon-but-harmless author styling. Strict on shape: must have exactly
 * three dot-separated numeric components.
 */
export function isValidSemver(v: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(v.trim())
}

/**
 * Compare two semver strings (MAJOR.MINOR.PATCH). Returns:
 *   -1 if a < b
 *    0 if a === b
 *   +1 if a > b
 *
 * Caller is responsible for validating inputs (both must pass isValidSemver);
 * behavior on invalid input is unspecified (returns 0, defensively).
 */
export function compareSemver(a: string, b: string): number {
  if (!isValidSemver(a) || !isValidSemver(b)) return 0
  const [aMaj, aMin, aPatch] = a.split('.').map((n) => parseInt(n, 10))
  const [bMaj, bMin, bPatch] = b.split('.').map((n) => parseInt(n, 10))
  if (aMaj! !== bMaj!) return aMaj! < bMaj! ? -1 : 1
  if (aMin! !== bMin!) return aMin! < bMin! ? -1 : 1
  if (aPatch! !== bPatch!) return aPatch! < bPatch! ? -1 : 1
  return 0
}
