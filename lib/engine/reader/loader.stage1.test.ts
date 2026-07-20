/**
 * lib/engine/reader/loader.stage1.test.ts
 * ----------------------------------------------------------------------------
 * Reader Stage 1 tests — Blueprint Loader + Markdown AST parsing.
 *
 * Source of truth:
 *  - Blueprint Reader Pipeline Architecture v1.0 §3 (Markdown AST),
 *    §11 (Fail Fast / Loud / Deterministic)
 *  - Engineering Backlog E-1.2 S-1.2.1 (Document Reader), S-1.2.2 (AST
 *    Projection — line ranges, kind correctness)
 *
 * RUN: npx jiti lib/engine/reader/loader.stage1.test.ts
 *
 * Coverage targets:
 *  - loadBlueprint success path produces immutable BlueprintDocument.
 *  - Empty / whitespace-only input rejected with structured reason.
 *  - Metadata blockquote extraction (v3.0 form) for Engine/Blueprint/Position.
 *  - YAML frontmatter extraction (future-format support) for flat key:value.
 *  - Malformed YAML (nested) rejected cleanly without throwing.
 *  - Markdown AST parses every supported block kind with correct line ranges.
 *  - Determinism: byte-identical input → byte-identical document.
 */

import assert from 'node:assert/strict'
import { loadBlueprint } from './loader'
import { parseMarkdown } from './markdown-ast'
import {
  buildEmptyBlueprint,
  buildEveryBlockKindBlueprint,
  buildMalformedYamlBlueprint,
  buildWellFormedBlueprint,
  buildWhitespaceOnlyBlueprint,
  buildYamlFrontmatterBlueprint,
} from './testing/fixtures'

// ─── loadBlueprint: success path ────────────────────────────────────────────

function verifies_well_formed_loads_to_document(): void {
  const result = loadBlueprint(buildWellFormedBlueprint())
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.ok(result.document.source.length > 0)
  assert.ok(result.document.ast.nodes.length > 0)
  assert.ok(result.document.byteLength > 0)
  assert.ok(result.document.lineCount > 0)
}

function verifies_metadata_extracted_from_blockquote(): void {
  // The v3.0 blockquote convention: Engine Version | Blueprint Version | Position ID.
  const result = loadBlueprint(buildWellFormedBlueprint())
  if (!result.ok) return assert.fail('expected ok')
  const m = result.document.metadata
  assert.equal(m.form, 'blockquote')
  assert.equal(m.engineVersion, '1.0.0')
  assert.equal(m.blueprintVersion, '3.0.0')
  assert.equal(m.positionId, 'bma-education-specialist')
  assert.equal(m.title, 'Simulation Exam Blueprint — v3.0')
  assert.ok(m.sourceLine !== null && m.sourceLine >= 1)
}

function verifies_title_extracted_from_h1(): void {
  const result = loadBlueprint(buildWellFormedBlueprint())
  if (!result.ok) return assert.fail('expected ok')
  assert.equal(result.document.metadata.title, 'Simulation Exam Blueprint — v3.0')
}

// ─── loadBlueprint: failure paths ───────────────────────────────────────────

function verifies_empty_source_rejected(): void {
  const r = loadBlueprint(buildEmptyBlueprint())
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.reason, 'empty')
  assert.ok(r.message.length > 0)
}

function verifies_whitespace_only_source_rejected(): void {
  const r = loadBlueprint(buildWhitespaceOnlyBlueprint())
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.equal(r.reason, 'empty')
}

// ─── Frontmatter handling (future-format support) ───────────────────────────

function verifies_yaml_frontmatter_extracted_when_present(): void {
  const r = loadBlueprint(buildYamlFrontmatterBlueprint())
  if (!r.ok) return assert.fail('expected ok')
  const m = r.document.metadata
  assert.equal(m.form, 'yaml-frontmatter')
  assert.equal(m.engineVersion, '1.0.0')
  assert.equal(m.blueprintVersion, '3.0.0')
  assert.equal(m.positionId, 'bma-education-specialist')
  assert.equal(m.sourceLine, 1)
}

function verifies_malformed_yaml_falls_back_gracefully(): void {
  // Nested-list YAML is non-flat; loader rejects it as frontmatter and falls
  // back to the blockquote path. With no blockquote present, metadata.form
  // becomes 'none' — Stage 2 will diagnose. The loader itself MUST NOT throw.
  const r = loadBlueprint(buildMalformedYamlBlueprint())
  assert.equal(r.ok, true, 'loader must not throw on malformed YAML')
  if (!r.ok) return
  // Frontmatter rejected → fallback → 'none' (the fixture has no blockquote).
  assert.equal(r.document.metadata.form, 'none')
}

// ─── Markdown AST: block-kind coverage ──────────────────────────────────────

function verifies_every_block_kind_emits_correct_node(): void {
  const ast = parseMarkdown(buildEveryBlockKindBlueprint())
  const kinds = new Set(ast.nodes.map((n) => n.kind))
  // All seven primary block kinds present.
  for (const k of ['heading', 'paragraph', 'blockquote', 'list', 'table', 'code', 'thematic-break']) {
    assert.ok(kinds.has(k as never), `expected AST node kind: ${k}`)
  }
}

function verifies_heading_levels_parsed_correctly(): void {
  const ast = parseMarkdown(buildEveryBlockKindBlueprint())
  const headings = ast.nodes.filter((n) => n.kind === 'heading').map((n) => n as { level: number; text: string })
  assert.equal(headings[0].level, 1)
  assert.equal(headings[0].text, 'Title H1')
  assert.equal(headings[1].level, 2)
  assert.equal(headings[1].text, 'Section H2')
  assert.equal(headings[2].level, 3)
  assert.equal(headings[2].text, 'Subsection H3')
}

function verifies_every_node_carries_source_line_range(): void {
  // Spec §3.6: every Markdown AST node MUST carry its source line range.
  const ast = parseMarkdown(buildEveryBlockKindBlueprint())
  for (const node of ast.nodes) {
    assert.ok(
      node.location.startLine >= 1 && node.location.endLine >= node.location.startLine,
      `node ${node.kind} has invalid location: ${JSON.stringify(node.location)}`
    )
  }
}

function verifies_table_node_carries_rows_with_cells(): void {
  const ast = parseMarkdown(buildEveryBlockKindBlueprint())
  const table = ast.nodes.find((n) => n.kind === 'table')
  if (!table || table.kind !== 'table') return assert.fail('expected table node')
  assert.ok(table.rows.length >= 2, 'table should have header + ≥1 body row')
  const header = table.rows.find((r) => r.isHeader)
  assert.ok(header, 'table should have a header row')
  assert.equal(header!.cells.length, 2)
  assert.equal(header!.cells[0].text, 'col1')
}

function verifies_code_block_carries_lang_and_text(): void {
  const ast = parseMarkdown(buildEveryBlockKindBlueprint())
  const code = ast.nodes.find((n) => n.kind === 'code')
  if (!code || code.kind !== 'code') return assert.fail('expected code node')
  assert.equal(code.lang, 'yaml')
  assert.ok(code.text.includes('key: value'))
}

function verifies_blockquote_text_concatenated(): void {
  const ast = parseMarkdown(buildEveryBlockKindBlueprint())
  const bq = ast.nodes.find((n) => n.kind === 'blockquote')
  if (!bq || bq.kind !== 'blockquote') return assert.fail('expected blockquote node')
  assert.ok(bq.text.includes('A blockquote'))
  assert.ok(bq.text.includes('on two lines'))
}

function verifies_list_node_carries_items_with_markers(): void {
  const ast = parseMarkdown(buildEveryBlockKindBlueprint())
  const lists = ast.nodes.filter((n) => n.kind === 'list')
  if (lists.length === 0) return assert.fail('expected list nodes')
  // First list is the bullet list (-).
  const bullet = lists[0]
  if (bullet.kind !== 'list') return assert.fail('expected list')
  assert.equal(bullet.items.length, 3)
  assert.equal(bullet.items[0].marker, '-')
  assert.equal(bullet.items[0].text, 'list item one')
  // Second list is the ordered list (1. 2.).
  if (lists.length < 2) return assert.fail('expected two list nodes')
  const ordered = lists[1]
  if (ordered.kind !== 'list') return assert.fail('expected ordered list')
  assert.equal(ordered.items[0].marker, '1.')
}

// ─── Determinism (spec Principle 2) ─────────────────────────────────────────

function verifies_loader_is_deterministic(): void {
  // Same source → same document, byte-for-byte. Includes AST node order,
  // locations, metadata. Verified by JSON-canonical comparison.
  const src = buildWellFormedBlueprint()
  const a = loadBlueprint(src)
  const b = loadBlueprint(src)
  assert.deepEqual(a, b)
}

function verifies_parser_is_deterministic(): void {
  const src = buildEveryBlockKindBlueprint()
  const a = parseMarkdown(src)
  const b = parseMarkdown(src)
  assert.deepEqual(a, b)
}

function verifies_metadata_extraction_does_not_mutate_source(): void {
  // The document.source field must be the verbatim input — extraction must
  // not strip or alter bytes (downstream re-derivation depends on this).
  const src = buildWellFormedBlueprint()
  const r = loadBlueprint(src)
  if (!r.ok) return assert.fail('expected ok')
  assert.equal(r.document.source, src)
}

// ─── runner ─────────────────────────────────────────────────────────────────

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'loadBlueprint: well-formed source loads to BlueprintDocument', fn: verifies_well_formed_loads_to_document },
  { name: 'loadBlueprint: v3.0 blockquote metadata extracted (Engine/Blueprint/Position)', fn: verifies_metadata_extracted_from_blockquote },
  { name: 'loadBlueprint: title extracted from H1', fn: verifies_title_extracted_from_h1 },
  { name: 'loadBlueprint: empty source rejected with reason=empty', fn: verifies_empty_source_rejected },
  { name: 'loadBlueprint: whitespace-only source rejected with reason=empty', fn: verifies_whitespace_only_source_rejected },
  { name: 'loadBlueprint: YAML frontmatter extracted when present (future format)', fn: verifies_yaml_frontmatter_extracted_when_present },
  { name: 'loadBlueprint: malformed YAML falls back gracefully (no throw)', fn: verifies_malformed_yaml_falls_back_gracefully },
  { name: 'parseMarkdown: every block kind emits a node', fn: verifies_every_block_kind_emits_correct_node },
  { name: 'parseMarkdown: heading levels parsed correctly', fn: verifies_heading_levels_parsed_correctly },
  { name: 'parseMarkdown: every node carries source line range', fn: verifies_every_node_carries_source_line_range },
  { name: 'parseMarkdown: table carries rows with cells', fn: verifies_table_node_carries_rows_with_cells },
  { name: 'parseMarkdown: code block carries lang + text', fn: verifies_code_block_carries_lang_and_text },
  { name: 'parseMarkdown: blockquote text concatenated across lines', fn: verifies_blockquote_text_concatenated },
  { name: 'parseMarkdown: list node carries items with markers', fn: verifies_list_node_carries_items_with_markers },
  { name: 'determinism: loadBlueprint byte-identical on identical input', fn: verifies_loader_is_deterministic },
  { name: 'determinism: parseMarkdown byte-identical on identical input', fn: verifies_parser_is_deterministic },
  { name: 'immutability: document.source is verbatim input', fn: verifies_metadata_extraction_does_not_mutate_source },
]

let passed = 0
let failed = 0
for (const t of tests) {
  try {
    t.fn()
    console.log(`  ✓ ${t.name}`)
    passed++
  } catch (e) {
    console.error(`  ✗ ${t.name}`)
    console.error(`    ${(e as Error).message}`)
    failed++
  }
}

console.log(`\n${passed}/${tests.length} passed, ${failed} failed`)
if (failed > 0) {
  process.exit(1)
}
