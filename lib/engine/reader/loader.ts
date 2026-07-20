/**
 * lib/engine/reader/loader.ts
 * ----------------------------------------------------------------------------
 * Reader Stage 1 — Blueprint Loader.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Blueprint Reader Pipeline Architecture v1.0 §3 (Markdown AST),
 *     §11 (Fail Fast / Loud / Deterministic)
 *   - Engineering Backlog E-1.2 S-1.2.1 (Document Reader)
 *   - IG-2 Architecture Amendment §5.4 (Blueprint version vocabulary)
 *
 * Stage 1 responsibilities (Engineering E-1.2A mission):
 *  - Load Blueprint Markdown source (from string; file reading is the caller's
 *    job — keeps the Loader pure and deterministic).
 *  - Detect and extract YAML frontmatter if present (Blueprint v3.0 does not
 *    use frontmatter today; this is forward-compat for other source formats).
 *  - Extract metadata from the document body (Blueprint v3.0 uses a blockquote
 *    line: "> **Engine Version**: 1.0.0 | **Blueprint Version**: 3.0.0 | ...").
 *  - Parse the source into a Markdown AST (delegates to ./markdown-ast).
 *  - Produce an IMMUTABLE BlueprintDocument.
 *
 * No semantic validation. No normalization. No transformation beyond parsing.
 *
 * Determinism contract (spec Principle 2): byte-identical source → byte-identical
 * BlueprintDocument. No I/O, no clocks, no random.
 */

import { parseMarkdown, type MarkdownAst } from './markdown-ast'
import type { SourceLocation } from './contracts'

// ─── Supported Blueprint schema versions ────────────────────────────────────
// The Reader accepts the schema versions it knows how to parse. Other versions
// are not rejected HERE (Stage 2 will diagnose `structural.invalid_hierarchy`
// for unsupported schema versions per the spec's category vocabulary) — Stage 1
// just records what was found. This list powers Stage 2's version check.

/**
 * Blueprint schema versions this Reader implementation supports. Adding a
 * version is additive. A version not in this set triggers Stage 2 to emit
 * `structural.invalid_hierarchy` ("unsupported schema version").
 *
 * NOTE: this is the SCHEMA version (the structural contract the document
 * follows), distinct from the document's own `Blueprint Version` metadata
 * (which is a free-form string like "3.0.0"). The schema version is derived
 * from the major version of the metadata's Blueprint Version field.
 */
export const SUPPORTED_BLUEPRINT_SCHEMA_VERSIONS: ReadonlySet<string> = new Set([
  '3', // Blueprint v3.x (current frozen source-of-truth document)
])

/**
 * The currently-required minimum Engine Version a Blueprint must declare.
 * Older Engine Version declarations are still parsed but Stage 2 may warn.
 * Kept here (not in contracts.ts) because it's a Reader implementation
 * concern, not a downstream-contract concern.
 */
export const MIN_ENGINE_VERSION = '1.0.0'

// ─── Metadata block ────────────────────────────────────────────────────────

/**
 * Blueprint document metadata extracted from the source. Every field is
 * optional — Stage 1 records what it found; Stage 2 decides whether what's
 * missing is fatal.
 *
 * All values are raw strings exactly as authored (post-trim). No normalization,
 * no parsing into structured types — that's Stage 3+ work.
 */
export interface BlueprintMetadata {
  /**
   * The Engine Version declared in the document (e.g. "1.0.0"). Source: the
   * blockquote line "**Engine Version**: X.Y.Z" for Blueprint v3.0, or YAML
   * frontmatter `engine_version` for future formats. null when absent.
   */
  engineVersion: string | null
  /**
   * The Blueprint Version declared in the document (e.g. "3.0.0"). Source:
   * the blockquote line "**Blueprint Version**: X.Y.Z" or YAML
   * `blueprint_version`. null when absent.
   */
  blueprintVersion: string | null
  /**
   * The Position ID declared in the document (e.g. "bma-education-specialist").
   * Source: blockquote "**Position ID**: `...`" or YAML `position_id`.
   * null when absent.
   */
  positionId: string | null
  /**
   * The document title (the H1 text). Null when the document has no H1.
   * Stored verbatim (no trimming of internal whitespace).
   */
  title: string | null
  /**
   * The 1-indexed source line where the metadata was extracted from. Used by
   * Stage 2 to point diagnostics at the right location. For YAML frontmatter,
   * this is the line of the opening `---`. For the v3.0 blockquote form, it's
   * the blockquote line.
   */
  sourceLine: number | null
  /**
   * The form in which the metadata was found. Drives Stage 2 diagnostics:
   * a missing-metadata error message is more useful when it can say "expected
   * a YAML frontmatter block" vs "expected a metadata blockquote".
   */
  form: 'yaml-frontmatter' | 'blockquote' | 'none'
}

// ─── BlueprintDocument — Stage 1 output ─────────────────────────────────────

/**
 * The immutable output of Stage 1. Combines the verbatim source, the parsed
 * Markdown AST, and the extracted metadata block. No business meaning.
 *
 * IMMUTABLE CONTRACT: callers MUST NOT mutate this object or its nested AST.
 * TypeScript `readonly` modifiers would express this but break structural
 * compatibility with the existing `MarkdownAst` type; the immutability
 * contract is documented and enforced by convention. (The determinism
 * property tests verify byte-identical output across runs — any mutation
 * would surface as a flaky property test.)
 */
export interface BlueprintDocument {
  /** Verbatim source string. */
  readonly source: string
  /** Parsed Markdown AST (no business meaning). */
  readonly ast: MarkdownAst
  /** Extracted metadata block (raw strings, no normalization). */
  readonly metadata: BlueprintMetadata
  /** Byte length of the source (convenience for diagnostics / size guards). */
  readonly byteLength: number
  /** Line count of the source (convenience for line-range bounds checking). */
  readonly lineCount: number
}

// ─── Loader result (success | structured failure) ───────────────────────────

/**
 * Stage 1 Loader result. Stage 1 itself is permissive (it parses whatever it
 * can); the discriminant `ok` distinguishes "I produced a document" from "the
 * input was structurally unparseable even at the byte level" (empty input,
 * non-text input). Schema-level problems (missing sections, bad version) are
 * NOT diagnosed here — they're Stage 2's responsibility.
 *
 * A successful Stage 1 (`ok: true`) does NOT imply a valid Blueprint; it only
 * means the bytes were turned into a Markdown AST. Stage 2 decides validity.
 */
export type LoadBlueprintResult =
  | { ok: true; document: BlueprintDocument }
  | { ok: false; reason: LoadFailureReason; message: string }

/**
 * Why Stage 1 refused to produce a document. The set is intentionally small:
 * most "what's wrong with this Blueprint" questions belong to Stage 2.
 */
export type LoadFailureReason =
  | 'empty' // source is empty string or whitespace only
  | 'not-text' // source contains characters that aren't valid text (binary)

// ─── Public API: loadBlueprint ──────────────────────────────────────────────

/**
 * Load a Blueprint source string into an immutable BlueprintDocument.
 *
 * Pure and deterministic: same source → same document, byte-for-byte.
 *
 * Stage 1 is permissive: it parses whatever structure it can find and extracts
 * metadata if present. It does NOT validate the structure or the metadata —
 * that is Stage 2's job. A successful return only means "bytes → AST", not
 * "valid Blueprint".
 *
 * @param source  The verbatim Blueprint source. The caller is responsible for
 *                reading it from disk/storage; the Loader does no I/O.
 */
export function loadBlueprint(source: string): LoadBlueprintResult {
  if (typeof source !== 'string') {
    return { ok: false, reason: 'not-text', message: 'Blueprint source must be a string.' }
  }
  if (source.trim() === '') {
    return { ok: false, reason: 'empty', message: 'Blueprint source is empty.' }
  }

  // 1. Detect & strip YAML frontmatter if present (future-format support).
  //    Blueprint v3.0 has NO frontmatter; verified against
  //    Blueprint/simulation_exam_blueprint.md. The 16 `---` lines in v3.0 are
  //    horizontal rules, not YAML markers — they appear AFTER the first
  //    content line, which the frontmatter detector rejects.
  const { body, frontmatter, frontmatterSourceLine } = extractFrontmatter(source)

  // 2. Parse the body into a Markdown AST.
  const ast = parseMarkdown(body)

  // 3. Extract metadata: prefer YAML frontmatter (structured), fall back to
  //    the v3.0 blockquote convention.
  const metadata = frontmatter && frontmatterSourceLine !== null
    ? metadataFromFrontmatter(frontmatter, frontmatterSourceLine)
    : metadataFromBlockquote(ast, body)

  const document: BlueprintDocument = {
    source,
    ast,
    metadata,
    byteLength: Buffer.byteLength(source, 'utf8'),
    lineCount: source.split('\n').length,
  }

  return { ok: true, document }
}

// ─── Frontmatter detection ─────────────────────────────────────────────────

interface FrontmatterExtraction {
  body: string
  frontmatter: Record<string, unknown> | null
  frontmatterSourceLine: number | null
}

/**
 * Detect and extract a leading YAML frontmatter block (---\n...\n---).
 *
 * Blueprint v3.0 has none. This exists for forward compatibility with future
 * source formats (Integration Spec §13: JSON/YAML/visual editor sources).
 *
 * Detection rule: the document must START with `---\n` (the very first line,
 * no leading whitespace). A `---` later in the document is a thematic break,
 * not a frontmatter marker — CommonMark/GFM rule.
 *
 * YAML parsing is intentionally MINIMAL: this implementation accepts only
 * flat `key: value` pairs (which is all Blueprint metadata needs). Nested
 * maps, lists, anchors, etc. are NOT supported — if the frontmatter is
 * structurally richer than `key: value`, the parse fails and Stage 1 treats
 * the document as having no frontmatter (Stage 2 will then diagnose the
 * malformed YAML via the blockquote path or fail the version check).
 *
 * This minimal approach avoids depending on a YAML library at the Loader
 * boundary (the project has `gray-matter` but pulling a full YAML parser
 * into the Reader's determinism-critical path is a tech decision outside
 * this session's scope). Stage 2 reports `invalid YAML` for richer inputs.
 */
function extractFrontmatter(source: string): FrontmatterExtraction {
  // Must start with --- on its own first line.
  if (!source.startsWith('---\n') && source !== '---') {
    return { body: source, frontmatter: null, frontmatterSourceLine: null }
  }
  const lines = source.split('\n')
  // Find the closing --- (must be after the opening, on its own line).
  let closeIdx = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      closeIdx = i
      break
    }
  }
  if (closeIdx === -1) {
    // Unclosed frontmatter — not valid YAML; treat as no frontmatter.
    return { body: source, frontmatter: null, frontmatterSourceLine: null }
  }
  const yamlLines = lines.slice(1, closeIdx)
  const parsed = parseFlatYaml(yamlLines)
  if (parsed === null) {
    // Structurally richer than key:value — Surface as no-frontmatter; Stage 2
    // will report malformed metadata via the version check.
    return { body: source, frontmatter: null, frontmatterSourceLine: null }
  }
  const body = lines.slice(closeIdx + 1).join('\n')
  return {
    body,
    frontmatter: parsed,
    frontmatterSourceLine: 1, // YAML opens on line 1
  }
}

/**
 * Parse a minimal flat YAML `key: value` block. Returns null if any line is
 * not a flat key:value pair (lists, nested maps, blank, etc. cause rejection).
 *
 * Values are trimmed strings with surrounding matching quotes stripped.
 */
function parseFlatYaml(lines: string[]): Record<string, unknown> | null {
  const out: Record<string, unknown> = {}
  for (const line of lines) {
    if (line.trim() === '') return null // blank inside frontmatter = not flat
    if (line.trim().startsWith('#')) continue // YAML comment — tolerated
    if (/^\s*-\s+/.test(line)) return null // list item — not flat
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/)
    if (!m) return null
    let value: string = m[2].trim()
    // Strip matching surrounding quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[m[1]] = value
  }
  return out
}

// ─── Metadata extraction: frontmatter form ─────────────────────────────────

function metadataFromFrontmatter(
  fm: Record<string, unknown>,
  sourceLine: number
): BlueprintMetadata {
  const pick = (key: string): string | null => {
    const v = fm[key]
    return typeof v === 'string' && v !== '' ? v : null
  }
  return {
    engineVersion: pick('engine_version') ?? pick('engineVersion'),
    blueprintVersion: pick('blueprint_version') ?? pick('blueprintVersion'),
    positionId: pick('position_id') ?? pick('positionId'),
    title: pick('title'),
    sourceLine,
    form: 'yaml-frontmatter',
  }
}

// ─── Metadata extraction: v3.0 blockquote form ─────────────────────────────

/**
 * Extract metadata from the Blueprint v3.0 blockquote convention.
 *
 * The real v3.0 line is:
 *   > **Engine Version**: 1.0.0 | **Blueprint Version**: 3.0.0 | **Position ID**: `bma-education-specialist`
 *
 * This format is a single blockquote with `**Key**: value` pairs separated by
 * pipes. The extractor finds the FIRST blockquote node containing any of the
 * three keys and reads all keys it can find there. Title comes from the H1.
 *
 * Future-proof: if Engine Version appears in a non-blockquote paragraph, we
 * still extract it (some future format might inline the metadata). The
 * `sourceLine` and `form` reflect where it was actually found.
 */
function metadataFromBlockquote(ast: MarkdownAst, body: string): BlueprintMetadata {
  let engineVersion: string | null = null
  let blueprintVersion: string | null = null
  let positionId: string | null = null
  let sourceLine: number | null = null

  // The v3.0 metadata blockquote: scan blockquote and paragraph nodes for the
  // `**Key**: value` pattern.
  for (const node of ast.nodes) {
    if (node.kind !== 'blockquote' && node.kind !== 'paragraph') continue
    const text = node.kind === 'blockquote' ? node.text : (node as { text: string }).text
    const ev = matchKey(text, 'Engine Version')
    const bv = matchKey(text, 'Blueprint Version')
    const pid = matchKey(text, 'Position ID')
    if (ev || bv || pid) {
      if (engineVersion === null && ev) engineVersion = ev
      if (blueprintVersion === null && bv) blueprintVersion = bv
      if (positionId === null && pid) positionId = pid
      if (sourceLine === null) sourceLine = node.location.startLine
    }
  }

  // Title comes from the H1 (the first heading at level 1).
  const h1 = ast.nodes.find(
    (n): n is import('./markdown-ast').HeadingNode => n.kind === 'heading' && n.level === 1
  )
  const title = h1 ? h1.text : null

  const form: BlueprintMetadata['form'] =
    sourceLine === null ? 'none' : 'blockquote'

  return { engineVersion, blueprintVersion, positionId, title, sourceLine, form }
}

/**
 * Match `**Key**: value` from a metadata text, returning the value (trimmed,
 * backtick-fences stripped). Returns null if the key isn't present.
 *
 * Tolerates: pipe separators, surrounding whitespace, and the v3.0 backtick-
 * quoted Position ID form (`bma-education-specialist`).
 */
function matchKey(text: string, key: string): string | null {
  // Allow optional backtick quoting around the value. The key may be bolded.
  const re = new RegExp(
    `\\*\\*${escapeRegexForRegex(key)}\\*\\*\\s*:\\s*(?:\\\`)?([^|\\\`\\n]+?)(?:\\\`)?(?=\\s*(?:\\||$))`,
    'i'
  )
  const m = text.match(re)
  if (!m) return null
  const value = m[1].trim()
  return value === '' ? null : value
}

function escapeRegexForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ─── Location helper (re-exported for Stage 2) ──────────────────────────────

/**
 * Construct a SourceLocation. Re-exported so Stage 2 doesn't need to import
 * directly from contracts.ts for this one helper (it already imports types
 * from there).
 */
export function loc(startLine: number, endLine?: number): SourceLocation {
  return { startLine, endLine: endLine ?? startLine }
}
