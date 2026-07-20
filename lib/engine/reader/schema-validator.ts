/**
 * lib/engine/reader/schema-validator.ts
 * ----------------------------------------------------------------------------
 * Reader Stage 2 — Schema (Structural) Validation.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Blueprint Reader Pipeline Architecture v1.0 §6 (Structural Validation),
 *     §11 (Fail Fast / Loud / Deterministic), §7 (Reader Error Anatomy)
 *   - Engineering Backlog E-1.2 S-1.2.3 (Structural Validation)
 *   - Implementation Planning v1.0 §3.2 (Reader acceptance: malformed
 *     Blueprint produces structured errors with source locations)
 *
 * Stage 2 validates STRUCTURE ONLY. It answers: "does this document have the
 * right shape?" — required sections present, no duplicates, tables well-formed,
 * headings at the right levels, metadata blocks present, schema version
 * supported, YAML (if present) parseable.
 *
 * What Stage 2 deliberately does NOT do (those are Stage 3+ concerns):
 *  - ❌ Business-rule validation (CR-1 bindings, LO% targets, tier arithmetic).
 *  - ❌ Semantic validation (impossible constraints, conflicting rules).
 *  - ❌ Normalization (canonical enums, document aliasing).
 *  - ❌ Rule expansion / AssemblyRequest building.
 *
 * Output: a list of `ReaderError` from contracts.ts. Reuses the existing
 * `ReaderErrorCategory` vocabulary (structural.* + generation.*) — no new
 * error model invented (Engineering E-1.2A mission constraint).
 *
 * Determinism: same BlueprintDocument → same diagnostic list, same order.
 */

import type {
  ReaderError,
  ReaderErrorCategory,
  ReaderErrorSeverity,
} from './contracts'
import type { BlueprintDocument } from './loader'
import type {
  HeadingNode,
  MarkdownNode,
  TableNode,
} from './markdown-ast'

// ─── Required H2 sections ───────────────────────────────────────────────────
// Derived from real Blueprint v3.0 (verified: Blueprint/simulation_exam_blueprint.md).
// These are the sections the Engine consumes; their absence means Stage 3+
// cannot proceed. Each section is identified by its CANONICAL PREFIX — the
// real document uses localized headers (e.g. "Distribution Rules — Tier System"
// or future "กฎการกระจาย — ระบบ Tier"), so the validator matches by structural
// prefix, not exact string. Prefix matching also tolerates trailing subtitles
// (e.g. "Set 1 — กฎหมายหลักการศึกษา").

export interface RequiredSection {
  /**
   * Stable id for diagnostic messages. NOT shown to authors; used in tests
   * and audit trails.
   */
  id: string
  /**
   * Heading prefix(es) that satisfy this requirement. Matched case-sensitively
   * against the heading text after trim. A heading satisfies if it EQUALS the
   * prefix OR starts with `prefix + " "` / `prefix + "—"` / `prefix + "-"`.
   * Multiple prefixes = OR (any one satisfies).
   */
  prefixes: readonly string[]
  /** Minimum heading level (1..6). Typically 2 (H2). */
  minLevel: number
  /** Maximum heading level. Typically 2 — required sections are H2. */
  maxLevel: number
  /**
   * If false, missing section is a WARNING (Stage 3+ may still proceed with
   * reduced capability). If true (default), missing section is BLOCKING.
   */
  blocking: boolean
}

/**
 * The required-section contract for Blueprint v3.x. Adding a section is
 * additive; removing one is a schema-version bump (Stage 2's
 * `unsupported schema version` path).
 *
 * The set mirrors Blueprint v3.0's actual H2 inventory:
 *   - 5 rule sections (Tier System, Coverage Rules, LO Mapping, Pattern Layer,
 *     Duplicate Prevention)
 *   - 1 distribution table section
 *   - 5 Set sections (Set 1..Set 5)
 */
export const REQUIRED_SECTIONS: readonly RequiredSection[] = [
  {
    id: 'tier-system',
    prefixes: ['Distribution Rules', 'กฎการกระจาย'],
    minLevel: 2, maxLevel: 2, blocking: true,
  },
  {
    id: 'coverage-rules',
    prefixes: ['Coverage Rules', 'กฎครอบคลุม'],
    minLevel: 2, maxLevel: 2, blocking: true,
  },
  {
    id: 'lo-mapping',
    prefixes: ['Learning Objectives', 'LO Mapping', 'วัตถุประสงค์'],
    minLevel: 2, maxLevel: 2, blocking: true,
  },
  {
    id: 'pattern-layer',
    prefixes: ['Question Pattern Layer', 'รูปแบบโจทย์'],
    minLevel: 2, maxLevel: 2, blocking: true,
  },
  {
    id: 'duplicate-prevention',
    prefixes: ['Duplicate Prevention', 'การป้องกันข้อสอบซ้ำ'],
    minLevel: 2, maxLevel: 2, blocking: true,
  },
  {
    id: 'distribution-master',
    prefixes: ['Distribution Master Table', 'ตารางกระจายหลัก'],
    minLevel: 2, maxLevel: 2, blocking: true,
  },
  {
    id: 'set-1',
    prefixes: ['Set 1'],
    minLevel: 2, maxLevel: 2, blocking: true,
  },
  {
    id: 'set-2',
    prefixes: ['Set 2'],
    minLevel: 2, maxLevel: 2, blocking: true,
  },
  {
    id: 'set-3',
    prefixes: ['Set 3'],
    minLevel: 2, maxLevel: 2, blocking: true,
  },
  {
    id: 'set-4',
    prefixes: ['Set 4'],
    minLevel: 2, maxLevel: 2, blocking: true,
  },
  {
    id: 'set-5',
    prefixes: ['Set 5'],
    minLevel: 2, maxLevel: 2, blocking: true,
  },
]

// ─── Supported schema versions (mirror loader.ts) ───────────────────────────
// Kept in sync with SUPPORTED_BLUEPRINT_SCHEMA_VERSIONS in loader.ts. Imported
// here so the version check has a single source of truth.

import { SUPPORTED_BLUEPRINT_SCHEMA_VERSIONS } from './loader'

// ─── Diagnostic constructor ─────────────────────────────────────────────────
// Centralizes ReaderError construction so every diagnostic carries the full
// anatomy (category, location, severity, explanation, recommendation) — never
// a half-reported error (spec §11 Fail Loud).

function diagnostic(input: {
  category: ReaderErrorCategory
  location: import('./contracts').SourceLocation
  severity: ReaderErrorSeverity
  explanation: string
  recommendation: string
}): ReaderError {
  return { ...input }
}

// ─── Public API: validateSchema ─────────────────────────────────────────────

/**
 * Validate the structural schema of a BlueprintDocument. Returns a list of
 * diagnostics; an empty list means the document is structurally well-formed
 * (Stage 3 may proceed). A non-empty list does NOT abort further checks —
 * the validator runs every applicable rule and reports all findings, so the
 * author can fix everything in one pass (spec §11 Fail Loud).
 *
 * Pure and deterministic: same document → same diagnostics, same order.
 */
export function validateSchema(doc: BlueprintDocument): ReaderError[] {
  const diagnostics: ReaderError[] = []

  // Order of checks is fixed (determinism contract). Each appends to the list.
  checkMetadataPresent(doc, diagnostics)
  checkSchemaVersionSupported(doc, diagnostics)
  checkTitlePresent(doc, diagnostics)
  checkRequiredSections(doc, diagnostics)
  checkDuplicateSections(doc, diagnostics)
  checkHeadingHierarchy(doc, diagnostics)
  checkTablesWellFormed(doc, diagnostics)
  checkSetSectionsComplete(doc, diagnostics)

  return diagnostics
}

// ─── Individual structural checks ───────────────────────────────────────────
// Each check appends zero or more diagnostics. None of them short-circuit —
// Fail Loud means we report every structural problem we find.

/**
 * Check: metadata block (blockquote or frontmatter) must be present.
 *
 * The metadata carries Engine/Blueprint/Position IDs the Reader needs. If no
 * metadata was found at all, that's blocking — Stage 3 cannot determine which
 * Blueprint this is.
 */
function checkMetadataPresent(doc: BlueprintDocument, diagnostics: ReaderError[]): void {
  if (doc.metadata.form === 'none') {
    diagnostics.push(
      diagnostic({
        category: 'structural.missing_section',
        location: { startLine: 1, endLine: 1 },
        severity: 'blocking',
        explanation:
          'No metadata block found. Expected a blockquote line with "**Engine Version**: ... | **Blueprint Version**: ... | **Position ID**: ..." or a YAML frontmatter block.',
        recommendation:
          'Add the metadata blockquote at the top of the document, immediately after the H1 title.',
      })
    )
  }
}

/**
 * Check: the declared Blueprint schema version must be supported by this
 * Reader. The schema version is derived from the major version of the
 * `Blueprint Version` metadata field (e.g. "3.0.0" → "3").
 *
 * An unsupported version is `structural.invalid_hierarchy` (matches the spec's
 * category for "the document's overall shape isn't what I know how to parse").
 * Severity is blocking — Stage 3's projection rules are version-specific.
 */
function checkSchemaVersionSupported(doc: BlueprintDocument, diagnostics: ReaderError[]): void {
  const bv = doc.metadata.blueprintVersion
  if (bv === null) {
    // Missing Blueprint Version specifically (metadata block may exist but
    // omit this key). Reported as malformed metadata, not missing section.
    diagnostics.push(
      diagnostic({
        category: 'structural.malformed_table', // nearest fit: malformed metadata block
        location: doc.metadata.sourceLine
          ? { startLine: doc.metadata.sourceLine, endLine: doc.metadata.sourceLine }
          : { startLine: 1, endLine: 1 },
        severity: 'blocking',
        explanation:
          'Blueprint Version is not declared in the metadata. The Reader cannot determine which schema version to apply.',
        recommendation:
          'Add "**Blueprint Version**: X.Y.Z" to the metadata block (e.g. "**Blueprint Version**: 3.0.0").',
      })
    )
    return
  }
  const major = bv.split('.')[0]?.trim()
  if (!major || !SUPPORTED_BLUEPRINT_SCHEMA_VERSIONS.has(major)) {
    diagnostics.push(
      diagnostic({
        category: 'structural.invalid_hierarchy',
        location: doc.metadata.sourceLine
          ? { startLine: doc.metadata.sourceLine, endLine: doc.metadata.sourceLine }
          : { startLine: 1, endLine: 1 },
        severity: 'blocking',
        explanation: `Unsupported Blueprint schema version: "${bv}". This Reader supports major versions: ${[...SUPPORTED_BLUEPRINT_SCHEMA_VERSIONS].join(', ')}.`,
        recommendation: `Use a supported Blueprint major version (${[...SUPPORTED_BLUEPRINT_SCHEMA_VERSIONS].join(', ')}), or upgrade the Reader to support "${major}".x.`,
      })
    )
  }
}

/**
 * Check: the document must have an H1 title. The H1 is the Blueprint's name
 * ("Simulation Exam Blueprint — v3.0"). Missing H1 = blocking.
 */
function checkTitlePresent(doc: BlueprintDocument, diagnostics: ReaderError[]): void {
  if (doc.metadata.title === null) {
    diagnostics.push(
      diagnostic({
        category: 'structural.missing_section',
        location: { startLine: 1, endLine: 1 },
        severity: 'blocking',
        explanation: 'Document has no H1 title. Every Blueprint must begin with a single # heading.',
        recommendation: 'Add an H1 at line 1, e.g. "# Simulation Exam Blueprint — v3.0".',
      })
    )
  }
}

/**
 * Check: every required section must be present (matched by heading prefix).
 * Missing blocking sections are blocking; missing non-blocking are warnings.
 */
function checkRequiredSections(doc: BlueprintDocument, diagnostics: ReaderError[]): void {
  const headings = headingNodes(doc)
  for (const req of REQUIRED_SECTIONS) {
    const found = headings.some((h) => sectionMatches(h, req))
    if (!found) {
      diagnostics.push(
        diagnostic({
          category: 'structural.missing_section',
          // No location — the section is absent. Point at the document start
          // so the author has somewhere to scroll from.
          location: { startLine: 1, endLine: doc.lineCount || 1 },
          severity: req.blocking ? 'blocking' : 'warning',
          explanation: `Required section "${req.prefixes[0]}" is missing (matched by prefix(es): ${req.prefixes.map((p) => `"${p}"`).join(', ')}).`,
          recommendation: `Add an H${req.minLevel} heading starting with one of: ${req.prefixes.map((p) => `"${p}"`).join(', ')}.`,
        })
      )
    }
  }
}

/**
 * Check: no duplicated required sections. A document with two "## Coverage
 * Rules" sections is structurally ambiguous — Stage 3 wouldn't know which to
 * project. Duplicates are blocking.
 *
 * Only required sections are checked for duplicates. Two prose paragraphs with
 * the same text are legal Markdown and not the validator's concern.
 */
function checkDuplicateSections(doc: BlueprintDocument, diagnostics: ReaderError[]): void {
  const headings = headingNodes(doc)
  for (const req of REQUIRED_SECTIONS) {
    const matches = headings.filter((h) => sectionMatches(h, req))
    if (matches.length > 1) {
      for (const h of matches.slice(1)) {
        // Report every duplicate after the first.
        diagnostics.push(
          diagnostic({
            category: 'structural.duplicate_section',
            location: { startLine: h.location.startLine, endLine: h.location.startLine },
            severity: 'blocking',
            explanation: `Duplicate section "${req.prefixes[0]}" (matched heading "${h.text}"). Required sections must appear exactly once.`,
            recommendation: `Remove this duplicate heading (line ${h.location.startLine}); keep only the first occurrence.`,
          })
        )
      }
    }
  }
}

/**
 * Check: heading hierarchy is sane. Specifically: no H3+ without a preceding
 * H2 in the same chain (jump from H1 to H3 is suspicious), and no heading
 * level deeper than 6 (invalid Markdown).
 *
 * This is intentionally minimal — Stage 2 is structural, not stylistic.
 */
function checkHeadingHierarchy(doc: BlueprintDocument, diagnostics: ReaderError[]): void {
  const headings = headingNodes(doc)
  let prevLevel = 0
  for (const h of headings) {
    if (h.level > 6) {
      diagnostics.push(
        diagnostic({
          category: 'structural.invalid_hierarchy',
          location: { startLine: h.location.startLine, endLine: h.location.startLine },
          severity: 'blocking',
          explanation: `Heading level ${h.level} exceeds the Markdown maximum (6).`,
          recommendation: `Reduce the heading at line ${h.location.startLine} to level 6 or shallower.`,
        })
      )
    }
    // Skip-skip: H1 then H3 (no H2 between). H2 then H4+ is the same fault.
    if (prevLevel > 0 && h.level > prevLevel + 1) {
      diagnostics.push(
        diagnostic({
          category: 'structural.invalid_hierarchy',
          location: { startLine: h.location.startLine, endLine: h.location.startLine },
          severity: 'warning',
          explanation: `Heading "${h.text}" (level ${h.level}) skips from level ${prevLevel} — levels should increment by one.`,
          recommendation: `Insert an intermediate heading level between ${prevLevel} and ${h.level}, or promote this heading to level ${prevLevel + 1}.`,
        })
      )
    }
    prevLevel = h.level
  }
}

/**
 * Check: every GFM pipe table is structurally well-formed.
 *
 * "Well-formed" here means: has a header row, has a separator row, and every
 * data row has at most one more or one fewer cell than the header (tolerates
 * trailing-pipe variation). A table without a separator row isn't a GFM table
 * at all — the parser would have classified it as paragraphs.
 *
 * Cell-count mismatch is a blocking structural error: a malformed row in the
 * Pattern Distribution Target table would silently shift values in Stage 3.
 *
 * Note: the parser only emits TableNode when the separator row is present
 * (see markdown-ast.ts). So this check focuses on cell-count consistency.
 */
function checkTablesWellFormed(doc: BlueprintDocument, diagnostics: ReaderError[]): void {
  for (const node of doc.ast.nodes) {
    if (node.kind !== 'table') continue
    const table = node as TableNode
    const headerRow = table.rows.find((r) => r.isHeader)
    if (!headerRow) {
      // Should not happen given the parser's table detection, but defensive.
      diagnostics.push(
        diagnostic({
          category: 'structural.malformed_table',
          location: { startLine: node.location.startLine, endLine: node.location.startLine },
          severity: 'blocking',
          explanation: 'Table has no header row.',
          recommendation: `Ensure the table at line ${node.location.startLine} begins with a header row followed by a separator (| --- |).`,
        })
      )
      continue
    }
    const headerColCount = headerRow.cells.length
    for (const row of table.rows) {
      if (row.isHeader) continue
      // GFM rule: data-row cell count must match header cell count exactly.
      // (Trailing-empty-cell variation is already normalized away by the
      // parser's splitRow — what's left is a true count mismatch.)
      if (row.cells.length !== headerColCount) {
        diagnostics.push(
          diagnostic({
            category: 'structural.malformed_table',
            location: { startLine: node.location.startLine, endLine: node.location.endLine },
            severity: 'blocking',
            explanation: `Table starting at line ${node.location.startLine} has a row with ${row.cells.length} cells; the header declares ${headerColCount}. Cell count must match.`,
            recommendation: `Fix the row at line ${node.location.startLine} to have exactly ${headerColCount} pipe-separated cells.`,
          })
        )
        break // one diagnostic per table is enough; further rows are follow-ons
      }
    }
  }
}

/**
 * Check: Set 1..Set 5 sections must all be present (the document declares a
 * 5-set run). This overlaps with REQUIRED_SECTIONS but produces a clearer
 * aggregate diagnostic when MORE THAN ONE Set is missing (a partial-Build
 * signal that's distinct from "one section absent").
 *
 * Implementation: count missing Set sections; if ≥2 are missing, emit one
 * aggregated diagnostic in addition to the per-section ones.
 */
function checkSetSectionsComplete(doc: BlueprintDocument, diagnostics: ReaderError[]): void {
  const headings = headingNodes(doc)
  const setReqs = REQUIRED_SECTIONS.filter((r) => r.id.startsWith('set-'))
  const missing = setReqs.filter((req) => !headings.some((h) => sectionMatches(h, req)))
  if (missing.length >= 2) {
    diagnostics.push(
      diagnostic({
        category: 'structural.missing_section',
        location: { startLine: 1, endLine: doc.lineCount || 1 },
        severity: 'blocking',
        explanation: `${missing.length} of 5 Set sections are missing (${missing.map((m) => m.id).join(', ')}). A complete Blueprint declares Set 1 through Set 5.`,
        recommendation: 'Add the missing Set sections. Each must be an H2 heading starting with "Set N".',
      })
    )
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function headingNodes(doc: BlueprintDocument): HeadingNode[] {
  return doc.ast.nodes.filter(
    (n): n is HeadingNode => n.kind === 'heading'
  )
}

/**
 * Does a heading satisfy a RequiredSection? True if the heading is at the
 * required level and its text matches one of the prefixes (exact, or
 * prefix-followed-by-separator).
 */
function sectionMatches(h: HeadingNode, req: RequiredSection): boolean {
  if (h.level < req.minLevel || h.level > req.maxLevel) return false
  const text = h.text.trim()
  return req.prefixes.some((p) => {
    if (text === p) return true
    // Prefix followed by a separator: space, em-dash, en-dash, hyphen, colon.
    return new RegExp(`^${escapeRegex(p)}(\\s|—|–|-|:)`).test(text)
  })
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
