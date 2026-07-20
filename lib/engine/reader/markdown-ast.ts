/**
 * lib/engine/reader/markdown-ast.ts
 * ----------------------------------------------------------------------------
 * Reader Stage 1 — Document Reader: source → Markdown AST.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Blueprint Reader Pipeline Architecture v1.0 §3 (Markdown AST)
 *   - Engineering Backlog E-1.2 S-1.2.1 / S-1.2.2 (Reader Stage 1)
 *
 * The Markdown AST is a FAITHFUL STRUCTURAL representation of the source
 * document. It answers exactly one question: "what does this document look
 * like?" — headings, tables, lists, code blocks, prose — independent of the
 * bytes that produced it.
 *
 * What the Markdown AST carries (spec §3.2):
 *  - Document structure (heading hierarchy, tables, lists, code, blockquotes)
 *  - Source line range on EVERY node (for Fail Loud diagnostics downstream)
 *  - Raw text content (no semantic interpretation)
 *
 * What the Markdown AST DELIBERATELY DOES NOT CARRY (spec §3.4):
 *  - ❌ Business meaning. A row that happens to be the Tier Definitions table
 *    is, in the Markdown AST, just a table with cells.
 *  - ❌ Semantic typing. No node is labeled "Distribution Target".
 *  - ❌ Inferred relationships between nodes.
 *  - ❌ Validation state. The AST is a parse result, not a judgment.
 *
 * Why pure structure (spec §3.5): if the Markdown AST carried business meaning,
 * every Markdown cosmetic change would become a business-rule change —
 * violating Principle 1 (Business Intent Preservation) and Principle 2
 * (Determinism). Business meaning is derived in Stage 3 (AST Projection).
 *
 * Implementation choice: a small hand-written block parser. The project has
 * no Markdown library that produces line-annotated AST nodes suitable for
 * schema validation; rather than introduce one (a tech-stack decision outside
 * this session's scope), this parser implements the subset Blueprint v3.0
 * actually uses: H1/H2/H3 headings, GFM tables, fenced code blocks,
 * blockquotes, and prose paragraphs. List support included for forward
 * compat. Anything else becomes a GenericBlock with raw text (lossless).
 */

import type { SourceLocation } from './contracts'

// ─── AST node types ─────────────────────────────────────────────────────────

/**
 * Discriminated union tag for AST nodes. The set is the structural vocabulary
 * Blueprint v3.0 actually uses (verified by reading the source). Adding a
 * variant is additive (future Markdown features); never removes one.
 */
export type MarkdownNodeKind =
  | 'heading' // #, ##, ###, etc.
  | 'table' // GFM | a | b | rows
  | 'code' // ``` fenced block ```
  | 'blockquote' // > text
  | 'list' // - / * / 1. items
  | 'paragraph' // plain prose
  | 'thematic-break' // ---  (horizontal rule, NOT YAML marker)
  | 'generic' // anything else, losslessly captured as raw text

/**
 * Base shape every AST node carries. `location` is mandatory per spec §3.6
 * ("Markdown AST nodes MUST carry source line range") — the only way to
 * produce actionable downstream errors.
 */
export interface MarkdownNodeBase {
  /** Discriminator for the union. */
  kind: MarkdownNodeKind
  /** 1-indexed inclusive source line range. */
  location: SourceLocation
}

/** Heading node. `level` is 1..6 for #..######. */
export interface HeadingNode extends MarkdownNodeBase {
  kind: 'heading'
  /** 1..6 (parsed from the leading # marks). */
  level: number
  /** Inline text of the heading, stripped of # marks and surrounding space. */
  text: string
}

/** A single cell in a table row. Raw text; no semantic typing. */
export interface TableCell {
  text: string
}

/** One row of a GFM table. `isHeader` flags the header/separator row pair. */
export interface TableRow {
  cells: TableCell[]
  /** True for the row(s) under the separator (the column-header row). */
  isHeader: boolean
}

/** GFM pipe table. Rows preserved in document order; no business typing. */
export interface TableNode extends MarkdownNodeBase {
  kind: 'table'
  rows: TableRow[]
}

/** Fenced code block. `lang` is the info string after ``` (may be empty). */
export interface CodeNode extends MarkdownNodeBase {
  kind: 'code'
  lang: string
  text: string
}

/** Blockquote. Raw text concatenated; line range spans the full block. */
export interface BlockquoteNode extends MarkdownNodeBase {
  kind: 'blockquote'
  text: string
}

/** List item (one entry of a list). */
export interface ListItem {
  text: string
  /** Marker as authored: '-', '*', '+', or 'N.' / 'N)' for ordered. */
  marker: string
}

/** List (bullet or ordered). Items in document order. */
export interface ListNode extends MarkdownNodeBase {
  kind: 'list'
  items: ListItem[]
}

/** Plain prose paragraph. */
export interface ParagraphNode extends MarkdownNodeBase {
  kind: 'paragraph'
  text: string
}

/** Horizontal rule (---, ***, ___). NOT a YAML marker — those are handled
 *  separately by the loader's frontmatter detection. */
export interface ThematicBreakNode extends MarkdownNodeBase {
  kind: 'thematic-break'
}

/** Catch-all for blocks the parser doesn't model explicitly. Lossless: the
 *  raw source text is preserved so a future parser extension can promote it. */
export interface GenericNode extends MarkdownNodeBase {
  kind: 'generic'
  text: string
}

/** Any Markdown AST node. Narrow on `kind`. */
export type MarkdownNode =
  | HeadingNode
  | TableNode
  | CodeNode
  | BlockquoteNode
  | ListNode
  | ParagraphNode
  | ThematicBreakNode
  | GenericNode

// ─── Markdown AST root ──────────────────────────────────────────────────────

/**
 * The Markdown AST root (spec §3). Carries:
 *  - The document's source (verbatim) — for re-derivation / debugging.
 *  - The block-level nodes in document order.
 *
 * No business meaning. No validation state. Pure structure.
 */
export interface MarkdownAst {
  /** The verbatim source string the AST was parsed from. */
  source: string
  /** Block-level nodes in document order. */
  nodes: MarkdownNode[]
}

// ─── Parser ─────────────────────────────────────────────────────────────────

/**
 * Parse a Markdown source string into a MarkdownAst.
 *
 * Pure, deterministic (spec Principle 2): byte-identical input → byte-identical
 * AST. No side effects, no I/O, no clocks/random.
 *
 * Implements the Blueprint v3.0 structural subset:
 *  - ATX headings (# .. ######)
 *  - GFM pipe tables (| a | b |\n| --- | --- |)
 *  - Fenced code blocks (``` or ~~~)
 *  - Blockquotes (> ...)
 *  - Lists (-, *, +, N., N))
 *  - Thematic breaks (---, ***, ___)
 *  - Paragraphs (default)
 *
 * Anything else becomes a GenericNode with raw text — lossless, promotable.
 */
export function parseMarkdown(source: string): MarkdownAst {
  const lines = source.split('\n')
  const nodes: MarkdownNode[] = []

  let i = 0
  while (i < lines.length) {
    const startLine = i + 1 // 1-indexed
    const line = lines[i]

    // Skip blank lines between blocks (they don't form nodes).
    if (line.trim() === '') {
      i++
      continue
    }

    // 1. ATX heading: ^#{1,6}\s+...
    const headingMatch = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/)
    if (headingMatch) {
      nodes.push({
        kind: 'heading',
        location: { startLine, endLine: startLine },
        level: headingMatch[1].length,
        text: headingMatch[2],
      })
      i++
      continue
    }

    // 2. Fenced code block: ^``` or ^~~~. Gobble until matching fence.
    const fenceMatch = line.match(/^(`{3,}|~{3,})\s*([^\s]*)\s*$/)
    if (fenceMatch) {
      const fence = fenceMatch[1][0] // backtick or tilde
      const minLen = fenceMatch[1].length
      const lang = fenceMatch[2] ?? ''
      const body: string[] = [line]
      i++
      let closed = false
      while (i < lines.length) {
        body.push(lines[i])
        const closing = new RegExp(`^${escapeRegex(fence)}{${minLen},}\\s*$`)
        if (closing.test(lines[i])) {
          closed = true
          i++
          break
        }
        i++
      }
      // If unclosed, consume to EOF (lenient — Stage 2 will diagnose).
      nodes.push({
        kind: 'code',
        location: { startLine, endLine: i || lines.length },
        lang,
        // Body excludes the opening and (if present) closing fence lines.
        text: body.slice(1, closed ? -1 : undefined).join('\n'),
      })
      continue
    }

    // 3. Thematic break: ---, ***, ___ (3+ same char, spaces allowed).
    if (/^(\s*[-*+]\s*){3,}$/.test(line) && !line.includes('|')) {
      // Note: --- is also a YAML frontmatter marker, but the loader handles
      // frontmatter BEFORE invoking parseMarkdown. By the time we get here,
      // any leading ---...--- block has been stripped. Internal --- lines
      // are thematic breaks.
      nodes.push({
        kind: 'thematic-break',
        location: { startLine, endLine: startLine },
      })
      i++
      continue
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      nodes.push({
        kind: 'thematic-break',
        location: { startLine, endLine: startLine },
      })
      i++
      continue
    }

    // 4. Blockquote: ^>\s?...  Gobble consecutive > lines.
    if (/^>\s?/.test(line)) {
      const body: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      nodes.push({
        kind: 'blockquote',
        location: { startLine, endLine: i },
        text: body.join('\n'),
      })
      continue
    }

    // 5. GFM pipe table: row of | cells, followed by a | --- | separator.
    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const rows: TableRow[] = []
      // Header row.
      rows.push({ cells: splitRow(line), isHeader: true })
      i++
      // Separator row (consumed, not stored as a data row).
      i++
      // Body rows: consecutive pipe rows until blank or non-table.
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push({ cells: splitRow(lines[i]), isHeader: false })
        i++
      }
      nodes.push({
        kind: 'table',
        location: { startLine, endLine: i },
        rows,
      })
      continue
    }

    // 6. List: ^\s*([-*+]|\d+[.)])\s+...
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const items: ListItem[] = []
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        const m = lines[i].match(/^\s*([-*+]|\d+[.)])\s+(.*)$/)
        items.push({ marker: m![1], text: m![2] })
        i++
      }
      nodes.push({
        kind: 'list',
        location: { startLine, endLine: i },
        items,
      })
      continue
    }

    // 7. Paragraph: default. Gobble consecutive non-blank, non-block-starter
    //    lines. (A paragraph ends at a blank line or the start of another
    //    block construct above.)
    const body: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !isBlockStart(lines[i], i + 1 < lines.length ? lines[i + 1] : '')
    ) {
      body.push(lines[i])
      i++
    }
    if (body.length === 0) {
      // Defensive: line matched no rule and isn't blank; capture losslessly.
      nodes.push({
        kind: 'generic',
        location: { startLine, endLine: startLine },
        text: line,
      })
      i++
      continue
    }
    nodes.push({
      kind: 'paragraph',
      location: { startLine, endLine: startLine + body.length - 1 },
      text: body.join('\n'),
    })
  }

  return { source, nodes }
}

// ─── Parser helpers ─────────────────────────────────────────────────────────

function isTableRow(line: string): boolean {
  // A GFM table row has at least one pipe and at least one cell with content
  // on each side (or trailing/leading pipe). Conservative: requires a pipe.
  return /^\s*\|.*\|\s*$/.test(line) || /^[^|]+\|[^|]+/.test(line)
}

function isTableSeparator(line: string): boolean {
  // |---|:--| :| -|  etc. Cells are only dashes, colons, spaces.
  return /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(line)
}

function splitRow(line: string): TableCell[] {
  // Strip leading/trailing pipe, split on |, trim each cell.
  const stripped = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return stripped.split('|').map((c) => ({ text: c.trim() }))
}

function isBlockStart(line: string, nextLine: string): boolean {
  // True if `line` begins a non-paragraph block (heading, fence, table, list,
  // blockquote, thematic break). Used to terminate paragraph gobbling.
  if (/^#{1,6}\s+/.test(line)) return true
  if (/^(`{3,}|~{3,})/.test(line)) return true
  if (/^>\s?/.test(line)) return true
  if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) return true
  if (/^(\s*[-*+]\s*){3,}$/.test(line) && !line.includes('|')) return true
  if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) return true
  // Table: pipe row followed by separator.
  if (isTableRow(line) && isTableSeparator(nextLine)) return true
  return false
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
