/**
 * lib/engine/reader/normalizer.ts
 * ----------------------------------------------------------------------------
 * Reader Stage 4 — Normalization (metadata subset → CanonicalBlueprintMetadata).
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Blueprint Reader Pipeline Architecture v1.0 §8 (Normalization),
 *     §8.4 (Determinism Guarantee), §9 (Canonical Blueprint)
 *   - IG-2 Architecture Amendment v1.0 §5.5 (Section normalization)
 *   - Content Template v2.2 Delta Amendment §5.1 (canonical form rules)
 *   - lib/ig2.ts — single source of truth for Section + enum-axis normalization
 *
 * Stage 4 is a NARROW SUBSET of spec §8 Normalization. The spec's §8 covers
 * the full Blueprint AST → Canonical Blueprint transformation (rule
 * deduplication, terminology standardization, derived-value resolution,
 * canonical ordering of every collection). This stage covers ONLY the
 * metadata block:
 *   - Whitespace normalization (trim, collapse internal runs).
 *   - Line-ending normalization (already handled at Stage 1 source read; here
 *     we normalize any \r\n that survived into metadata string values).
 *   - Unicode NFC normalization (composes Thai combining sequences so two
 *     visually-identical strings byte-compare equal).
 *   - Enum canonicalization (Position ID lowercased to kebab-case; version
 *     strings normalized to MAJOR.MINOR.PATCH with no leading zeros).
 *   - Section normalization — DEFERRED. There are no sections in the metadata
 *     block itself; sections appear in rule content (Stage 5's domain). The
 *     `normalizeSection` helper from lib/ig2.ts is re-exported here for the
 *     Stage 5 implementer's convenience, but NOT applied in Stage 4.
 *   - Deterministic ordering: no collections to order in the metadata block
 *     itself, but the canonical metadata type's field order is fixed.
 *
 * What Stage 4 deliberately does NOT do (per spec §8.3 + user mission scope):
 *   - ❌ Rule normalization (Stage 5+ concern in the user's pipeline).
 *   - ❌ Infer missing data (spec §8.3 — never invent values).
 *   - ❌ Repair conflicts (spec §8.3 — Semantic Validation must pass first).
 *   - ❌ Reduce information below what the Engine needs (spec §8.3).
 *   - ❌ Business-meaning derivation of any kind.
 *
 * PRECONDITION: Stage 3 (metadata validation) has produced zero BLOCKING
 * diagnostics. If Stage 3 found blocking issues, normalization MUST NOT run
 * (spec §8.3 — "if Semantic Validation failed, normalization never runs").
 * Stage 4 does not re-validate; it trusts the caller's gating.
 *
 * Determinism (spec §8.4): pure function. Same BlueprintMetadata in → same
 * CanonicalBlueprintMetadata out. No clocks, no random, no I/O.
 */

import type { BlueprintMetadata } from './loader'
// Relative path (not '@/lib/ig2') to match the rest of the reader/ directory's
// import convention — they all use relative imports. The '@/...' alias works
// under tsc/Next's bundler but NOT under jiti (the test runner); relative
// paths work in both. lib/engine/reader/ → lib/ is two `..`, so `../../ig2`.
// Single source of truth for Section/enum-axis normalization stays in lib/ig2.ts.
import { normalizeSection, normalizeEnumAxis } from '../../ig2'

// Re-export the IG-2 normalizers so the Stage 5+ implementer can import all
// normalization helpers from one place (./normalizer) without reaching into
// lib/ig2.ts directly. Single source of truth stays in lib/ig2.ts.
export { normalizeSection, normalizeEnumAxis }

// ─── CanonicalBlueprintMetadata — Stage 4 output ────────────────────────────

/**
 * The normalized metadata block. This is the metadata portion of the eventual
 * Canonical Blueprint (spec §9); it's separated out because Stage 4 in this
 * session produces ONLY this portion. A later stage will compose it with the
 * normalized rule content into the full Canonical Blueprint.
 *
 * Differences from the raw BlueprintMetadata (loader.ts):
 *  - All string values are NFC-normalized and whitespace-trimmed.
 *  - version strings have leading zeros stripped from each component.
 *  - positionId is lowercased.
 *  - null values are preserved as null (no invention, spec §8.3).
 *  - `sourceLine` and `form` are preserved for audit traceability.
 */
export interface CanonicalBlueprintMetadata {
  /** NFC + trimmed. null if absent (Stage 4 does NOT invent). */
  readonly engineVersion: string | null
  /** NFC + trimmed + leading-zero-stripped. null if absent. */
  readonly blueprintVersion: string | null
  /** NFC + trimmed + lowercased (kebab-case is enforced by Stage 3). null if absent. */
  readonly positionId: string | null
  /** NFC + whitespace-collapsed. null if H1 was absent. NOT trimmed to a max length. */
  readonly title: string | null
  /** Preserved from raw metadata for audit. */
  readonly sourceLine: number | null
  /** Preserved from raw metadata for audit. */
  readonly form: BlueprintMetadata['form']
}

// ─── Public API: normalizeMetadata ──────────────────────────────────────────

/**
 * Normalize a validated BlueprintMetadata into its canonical form.
 *
 * Pure and deterministic (spec §8.4). No side effects, no I/O.
 *
 * Does NOT validate — the caller MUST ensure Stage 3 has produced zero
 * blocking diagnostics before invoking this. Normalization of invalid input
 * is undefined behavior (not crash-prone, but the output is meaningless).
 *
 * @param m  The raw metadata block from Stage 1's BlueprintDocument.
 */
export function normalizeMetadata(m: BlueprintMetadata): CanonicalBlueprintMetadata {
  return {
    engineVersion: m.engineVersion !== null ? normalizeVersion(m.engineVersion) : null,
    blueprintVersion: m.blueprintVersion !== null ? normalizeVersion(m.blueprintVersion) : null,
    positionId: m.positionId !== null ? normalizePositionId(m.positionId) : null,
    title: m.title !== null ? normalizeText(m.title) : null,
    sourceLine: m.sourceLine,
    form: m.form,
  }
}

// ─── Normalization primitives ───────────────────────────────────────────────

/**
 * Normalize a free-text metadata value: NFC compose, normalize line endings,
 * collapse internal whitespace runs to single spaces, trim ends.
 *
 * Applied to the title (the only free-text metadata field).
 */
function normalizeText(raw: string): string {
  // NFC first — composes Thai combining sequences so visually-identical
  // strings byte-compare equal.
  let s = raw.normalize('NFC')
  // Line-ending normalization: any CR / CR+LF → LF. Then we collapse all
  // whitespace (including the newlines we just normalized) to single spaces.
  s = s.replace(/\r\n?/g, '\n')
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

/**
 * Normalize a semver version string: NFC, trim, strip leading zeros from each
 * numeric component. Pre-release/build suffixes are preserved verbatim if
 * present (Blueprint versioning doesn't use them today, but we don't destroy
 * information spec §8.3).
 *
 * Examples:
 *   '1.0.0'     → '1.0.0'
 *   ' 3.0.0 '   → '3.0.0'
 *   '01.00.00'  → '1.0.0'
 *   '3.0'       → '3.0'         (not enforced to 3 components — Stage 3 reports)
 */
function normalizeVersion(raw: string): string {
  const trimmed = raw.normalize('NFC').trim()
  // Split on dot, strip leading zeros from each numeric component, rejoin.
  return trimmed
    .split('.')
    .map((component) => normalizeVersionComponent(component))
    .join('.')
}

/**
 * Normalize one version component: if it's all digits, strip leading zeros
 * (but preserve a single '0' if the component is zero). Non-numeric components
 * (pre-release identifiers like 'alpha') are returned trimmed, untouched.
 */
function normalizeVersionComponent(component: string): string {
  const c = component.trim()
  if (/^\d+$/.test(c)) {
    // Numeric: strip leading zeros. '0' stays '0'; '01' → '1'; '00' → '0'.
    return String(parseInt(c, 10))
  }
  return c
}

/**
 * Normalize a Position ID: NFC, trim, lowercase. The kebab-case structure
 * is preserved (Stage 3 validates it; we don't restructure here).
 */
function normalizePositionId(raw: string): string {
  return raw.normalize('NFC').trim().toLowerCase()
}
