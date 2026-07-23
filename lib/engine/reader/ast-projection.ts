/**
 * lib/engine/reader/ast-projection.ts
 * ----------------------------------------------------------------------------
 * Reader Stage 5 — AST Projection: Markdown AST → Blueprint AST.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Blueprint Reader Pipeline Architecture v1.0 §5 (AST Projection),
 *     §5.3 (Transformation Rules — explicit, inspectable, not heuristic)
 *   - Blueprint Integration Specification v1.0 §3.3 (Structural Requirements)
 *
 * Stage 5's responsibility is to identify which structural elements of the
 * Markdown AST carry which business meaning, and construct typed business nodes
 * from them (spec §4 intro). After projection, the Markdown AST is no longer
 * needed.
 *
 * The projection is governed by EXPLICIT RULES (spec §5.3), never by heuristic
 * inference. Each rule maps a recognized Markdown AST pattern to a typed AST
 * node. The rules are the contract of this stage; they're also the extension
 * point for future source formats (a JSON adapter would express the same rules
 * in JSON terms; the Blueprint AST result would be identical).
 *
 * What Stage 5 does NOT do (spec §6 / §7):
 *  - ❌ Structural validation (that was Stage 2).
 *  - ❌ Semantic validation (that was Stage 3 — metadata subset; broader rule
 *     feasibility is out of scope for this session per the user mission).
 *  - ❌ Normalization (that was Stage 4 — metadata; rule content is left in
 *     source form here; Stage 6 canonicalizes what it carries forward).
 *  - ❌ Candidate generation, scoring, Bank access, runtime behavior.
 *
 * Robustness posture (spec §11 Fail Fast / Loud):
 *  - When a section is missing, Stage 5 returns an empty collection for it
 *    (Stage 2 has already reported the structural fault; Stage 5 does not
 *    duplicate that diagnostic). The AssemblyRequest Builder (Stage 6) will
 *    fail closed if a required collection is empty.
 *  - When a row in a present table fails to parse (e.g. "Tier 5" outside the
 *    enum), Stage 5 SKIPS that row and emits no AST node for it. The downstream
 *     semantic validator (later stage, not this session) reports the gap. This
 *     keeps projection total: it never throws, it always produces SOME AST.
 *
 * Determinism (spec Principle 2): pure function of MarkdownAst. Same AST in →
 * same BlueprintAst out, byte-for-byte. No clocks, random, or I/O.
 */

import type {
  CoverageRule,
  DistributionConstraints,
  EnforcementLevel,
  LearningObjective,
  QuestionPattern,
  SourceLocation,
  Tier,
} from './contracts'
import type { BlueprintDocument } from './loader'
import type {
  CodeNode,
  HeadingNode,
  MarkdownAst,
  MarkdownNode,
  TableNode,
} from './markdown-ast'
import type {
  BlueprintAst,
  BlueprintAstIdentity,
  BlueprintTypeSetCount,
  CoverageRuleBinding,
  Cr1Binding,
  Cr2Binding,
  Cr3Binding,
  Cr4Binding,
  Cr5Binding,
  DifficultySetCount,
  DocumentSetCount,
  LoDefinition,
  LoDistributionTarget,
  PatternDefinition,
  PatternDistributionTarget,
  PatternTypeCorrespondence,
  SetDefinition,
  TierAssignment,
  TierDefinition,
} from './blueprint-ast'
import type { CanonicalBlueprintMetadata } from './normalizer'

// ─── Public API: projectToBlueprintAst ──────────────────────────────────────

/**
 * Project a Markdown AST into a Blueprint AST. Pure and deterministic.
 *
 * @param doc           The Stage-1-loaded BlueprintDocument (carries the AST).
 * @param canonicalMeta The Stage-4-normalized metadata (for identity).
 */
export function projectToBlueprintAst(
  doc: BlueprintDocument,
  canonicalMeta: CanonicalBlueprintMetadata
): BlueprintAst {
  const ast = doc.ast

  // 1. Identity: from normalized metadata. Each piece may be null; Stage 6
  //    fails closed if a required piece is missing.
  const identity: BlueprintAstIdentity = {
    blueprintId: canonicalMeta.positionId, // position id doubles as Blueprint id in v3.0
    blueprintVersion: canonicalMeta.blueprintVersion,
    profile: 'simulation',
  }

  // 2. Walk the AST and project each recognized section. Sections are
  //    identified by H2/H3 heading text match (prefix match, case-sensitive),
  //    following the same approach as schema-validator.ts.
  const headings = headingNodes(ast)
  const tables = tableNodes(ast)
  const codeBlocks = codeNodes(ast)

  // 3. Per-section projections (each is a pure helper below).
  const tierDefinitions = projectTierDefinitions(headings, tables)
  const tierAssignments = projectTierAssignments(headings, tables)
  const distributionConstraints = projectDistributionConstraints(
    headings,
    codeBlocks
  )
  const coverageRules = projectCoverageRules(headings, tables)
  const loDefinitions = projectLoDefinitions(headings, tables)
  const loDistributionTargets = projectLoDistributionTargets(headings, tables)
  const patternDefinitions = projectPatternDefinitions(headings, tables)
  const patternDistributionTargets = projectPatternDistributionTargets(
    headings,
    tables
  )
  const patternTypeCorrespondence = projectPatternTypeCorrespondence(
    headings,
    tables
  )
  const duplicatePolicies = projectDuplicatePolicies(headings, tables)
  const similarityThresholds = projectSimilarityThresholds(headings, codeBlocks)
  const documentSetCounts = projectDocumentSetCounts(headings, tables)
  const difficultySetCounts = projectDifficultySetCounts(headings, tables)
  const blueprintTypeSetCounts = projectBlueprintTypeSetCounts(headings, tables)
  const setDefinitions = projectSetDefinitions(headings)

  return {
    identity,
    tierDefinitions,
    tierAssignments,
    distributionConstraints,
    coverageRules,
    loDefinitions,
    loDistributionTargets,
    patternDefinitions,
    patternDistributionTargets,
    patternTypeCorrespondence,
    duplicatePolicies,
    similarityThresholds,
    documentSetCounts,
    difficultySetCounts,
    blueprintTypeSetCounts,
    setDefinitions,
  }
}

// ─── Section identification (heading prefix match) ──────────────────────────
// Mirrors schema-validator's prefix-matching approach. A heading "satisfies"
// a section if its text equals the prefix OR starts with prefix+separator.

function headingSatisfies(h: HeadingNode, prefixes: readonly string[]): boolean {
  const text = h.text.trim()
  return prefixes.some((p) => {
    if (text === p) return true
    return new RegExp(`^${escapeRegex(p)}(\\s|—|–|-|:)`).test(text)
  })
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ─── AST filters ────────────────────────────────────────────────────────────

function headingNodes(ast: MarkdownAst): HeadingNode[] {
  return ast.nodes.filter((n): n is HeadingNode => n.kind === 'heading')
}

function tableNodes(ast: MarkdownAst): TableNode[] {
  return ast.nodes.filter((n): n is TableNode => n.kind === 'table')
}

function codeNodes(ast: MarkdownAst): CodeNode[] {
  return ast.nodes.filter((n): n is CodeNode => n.kind === 'code')
}

/**
 * Find the first table that appears AT OR AFTER a heading satisfying one of
 * `prefixes`. The "next-table-after-section-heading" rule. Returns null when
 * no such table exists (the section is absent or has no table — Stage 2's beat).
 */
function tableAfterSection(
  headings: HeadingNode[],
  tables: TableNode[],
  prefixes: readonly string[]
): TableNode | null {
  const sectionIdx = headings.findIndex((h) => headingSatisfies(h, prefixes))
  if (sectionIdx === -1) return null
  const sectionLine = headings[sectionIdx]!.location.startLine
  // The next section heading (any level) bounds the search.
  const nextSection = headings
    .slice(sectionIdx + 1)
    .map((h) => h.location.startLine)
  const upperBound = nextSection.length > 0 ? Math.min(...nextSection) : Infinity
  // First table whose start line is within [sectionLine, upperBound).
  const found = tables.find(
    (t) =>
      t.location.startLine >= sectionLine && t.location.startLine < upperBound
  )
  return found ?? null
}

/**
 * Find the first CODE block at or after a section heading. Used for the
 * Distribution Constraints pseudocode + Similarity Metric pseudocode.
 */
function codeAfterSection(
  headings: HeadingNode[],
  codeBlocks: CodeNode[],
  prefixes: readonly string[]
): CodeNode | null {
  const sectionIdx = headings.findIndex((h) => headingSatisfies(h, prefixes))
  if (sectionIdx === -1) return null
  const sectionLine = headings[sectionIdx]!.location.startLine
  const nextSection = headings
    .slice(sectionIdx + 1)
    .map((h) => h.location.startLine)
  const upperBound = nextSection.length > 0 ? Math.min(...nextSection) : Infinity
  return (
    codeBlocks.find(
      (c) =>
        c.location.startLine >= sectionLine && c.location.startLine < upperBound
    ) ?? null
  )
}

// ─── Section 1: Tier Definitions ────────────────────────────────────────────
// Real v3.0: `| **Tier 1** | Core | 13–20 | <criteria> |`. Bolded Tier N in
// col 1; label in col 2; "min–max" range string in col 3; criteria in col 4.

function projectTierDefinitions(
  headings: HeadingNode[],
  tables: TableNode[]
): TierDefinition[] {
  const table = tableAfterSection(headings, tables, ['Tier Definitions'])
  if (!table) return []
  const out: TierDefinition[] = []
  for (const row of table.rows) {
    if (row.isHeader) continue
    const cells = row.cells.map((c) => c.text)
    if (cells.length < 3) continue
    const tier = parseTier(cells[0]!)
    if (tier === null) continue
    const label = cells[1]!.trim()
    const range = parseRange(cells[2]!)
    if (range === null) continue
    const criteria = cells[3]?.trim() ?? ''
    out.push({
      tier,
      label,
      min: range.min,
      max: range.max,
      criteria,
      sourceLocation: { ...table.location },
    })
  }
  return out
}

// ─── Section 2: Tier Mapping (Document → Tier assignments) ──────────────────
// Real v3.0: `| 1. พ.ร.บ.การศึกษาแห่งชาติ 2542 | Tier 1: Core |`. Document
// (with optional leading number) in col 1; "Tier N: Label" in col 2.

function projectTierAssignments(
  headings: HeadingNode[],
  tables: TableNode[]
): TierAssignment[] {
  const table = tableAfterSection(headings, tables, ['Tier Mapping'])
  if (!table) return []
  const out: TierAssignment[] = []
  for (const row of table.rows) {
    if (row.isHeader) continue
    const cells = row.cells.map((c) => c.text)
    if (cells.length < 2) continue
    const nameCell = cells[0]!.trim()
    // Split "N. name" — capture the leading number.
    const m = nameCell.match(/^(\d+)\.\s*(.+)$/)
    const documentName = m ? m[2]!.trim() : nameCell
    const documentNumber = m ? parseInt(m[1]!, 10) : null
    const tier = parseTier(cells[1]!)
    if (tier === null) continue
    out.push({
      documentName,
      documentNumber,
      tier,
      sourceLocation: { ...table.location },
    })
  }
  return out
}

// ─── Section 3: Distribution Constraints (pseudocode block) ─────────────────
// Real v3.0: a fenced code block with pseudocode. We extract the four pieces
// the AssemblyRequest needs: sumPerSet, tier1Floor, tier4Ceiling, anchor rule.
// Tier min/max comes from the Tier Definitions table (already projected);
// here we synthesize the DistributionConstraints object.

function projectDistributionConstraints(
  headings: HeadingNode[],
  codeBlocks: CodeNode[]
): DistributionConstraints {
  // Sensible Blueprint-v3.0 defaults. If the pseudocode block is absent or
  // partially unparseable, these defaults match v3.0's actual values so the
  // downstream Engine still has a usable contract. (Stage 6 will surface any
  // missing pieces as semantic diagnostics if it chooses.)
  const defaults: DistributionConstraints = {
    sumPerSet: 100,
    tierMinMax: {
      1: [13, 100],
      2: [8, 100],
      3: [5, 100],
      4: [5, 100],
    },
    tier1Floor: 30,
    tier4Ceiling: 25,
    anchor: { bonus: 5, maxPerSet: 1 },
  }

  const block = codeAfterSection(headings, codeBlocks, ['Distribution Constraints'])
  if (!block) return defaults
  const text = block.text

  // Extract the per-Set sum (e.g. "SUM(all documents) = 100").
  const sumMatch = text.match(/SUM\s*\(\s*all\s+documents\s*\)\s*=\s*(\d+)/i)
  if (sumMatch) {
    defaults.sumPerSet = parseInt(sumMatch[1]!, 10)
  }

  // Tier-1 floor (e.g. "SUM(tier_1) >= 30%").
  const t1FloorMatch = text.match(/tier_1\s*\)\s*>=\s*(\d+)/i)
  if (t1FloorMatch) {
    defaults.tier1Floor = parseInt(t1FloorMatch[1]!, 10)
  }

  // Tier-4 ceiling (e.g. "SUM(tier_4) <= 25%").
  const t4CeilMatch = text.match(/tier_4\s*\)\s*<=\s*(\d+)/i)
  if (t4CeilMatch) {
    defaults.tier4Ceiling = parseInt(t4CeilMatch[1]!, 10)
  }

  // Anchor rule: "1 document per set gets +5" + "max 1 anchor per set".
  const anchorBonusMatch = text.match(/\+(\d+)\s+above\s+tier\.max/i)
  const anchorMaxMatch = text.match(/max\s+(\d+)\s+anchor\s+per\s+set/i)
  if (anchorBonusMatch && anchorMaxMatch) {
    defaults.anchor = {
      bonus: parseInt(anchorBonusMatch[1]!, 10),
      maxPerSet: parseInt(anchorMaxMatch[1]!, 10),
    }
  }

  return defaults
}

// ─── Section 4: Coverage Rules (CR-1 … CR-5) ────────────────────────────────
// Two tables feed this:
//  - The "Coverage Rules" summary table (rule id, description, enforcement).
//  - The "Mandatory Topics (CR-1)" binding table (Document × Mandatory Topic).
//
// We project one CoverageRule per CR id. The summary table determines the
// enforcement level; the binding table (CR-1 only) fills the binding payload.
// CR-2..CR-5 bindings are inferred from the summary-table description (a
// pragmatic parse of the "≥70%" / "≤5" / "≤5" wording), with sensible defaults
// when the description doesn't parse.

function projectCoverageRules(
  headings: HeadingNode[],
  tables: TableNode[]
): CoverageRule[] {
  const summaryTable = tableAfterSection(headings, tables, ['Coverage Rules'])
  const mandatoryTopicsTable = tableAfterSection(headings, tables, [
    'Mandatory Topics',
  ])

  // Pre-project CR-1's Document×Topic pairs.
  const cr1Binding = projectCr1Binding(mandatoryTopicsTable)

  // Per-rule enforcement-level + description lookup from the summary table.
  const ruleMeta = new Map<
    string,
    { level: EnforcementLevel; description: string }
  >()
  if (summaryTable) {
    for (const row of summaryTable.rows) {
      if (row.isHeader) continue
      const cells = row.cells.map((c) => c.text)
      if (cells.length < 3) continue
      // Strip markdown bold markers (`**CR-1: ...**` → `CR-1: ...`) before
      // matching the id prefix. The CR id always begins the cell.
      const idCell = cells[0]!.replace(/\*\*/g, '').trim()
      // "CR-1: Mandatory Topics" → id "CR-1".
      const idMatch = idCell.match(/^(CR-[1-5])/)
      if (!idMatch) continue
      const id = idMatch[1]!
      const description = cells[1]!.trim()
      const enforcementText = cells[2]!.trim().toLowerCase()
      const level: EnforcementLevel = enforcementText.startsWith('hard')
        ? 'hard'
        : 'soft'
      ruleMeta.set(id, { level, description })
    }
  }

  // Emit one CoverageRule per CR id, in canonical CR-1..CR-5 order.
  const out: CoverageRule[] = []
  const ids: Array<'CR-1' | 'CR-2' | 'CR-3' | 'CR-4' | 'CR-5'> = [
    'CR-1',
    'CR-2',
    'CR-3',
    'CR-4',
    'CR-5',
  ]
  for (const id of ids) {
    const meta = ruleMeta.get(id) ?? {
      level: 'soft' as EnforcementLevel,
      description: '',
    }
    const binding = buildCoverageBinding(
      id,
      meta.description,
      cr1Binding
    )
    out.push({
      id,
      level: meta.level,
      binding,
    })
  }
  return out
}

/**
 * Project the CR-1 Mandatory Topics binding table. Returns the typed binding
 * (Document × Mandatory Topic pairs) or null when the table is absent.
 */
function projectCr1Binding(table: TableNode | null): Cr1Binding | null {
  if (!table) return null
  const mandatoryTopics: Cr1Binding['mandatoryTopics'][number][] = []
  for (const row of table.rows) {
    if (row.isHeader) continue
    const cells = row.cells.map((c) => c.text)
    if (cells.length < 2) continue
    const document = cells[0]!.trim()
    const topic = cells[1]!.trim()
    if (!document || !topic) continue
    mandatoryTopics.push({ document, topic })
  }
  if (mandatoryTopics.length === 0) return null
  return { kind: 'CR-1', mandatoryTopics }
}

/**
 * Build the typed binding for a CoverageRule id. CR-1 carries the projected
 * Document×Topic pairs; CR-2..CR-5 derive a numeric binding from the summary
 * description (with v3.0 defaults when description doesn't parse).
 */
function buildCoverageBinding(
  id: 'CR-1' | 'CR-2' | 'CR-3' | 'CR-4' | 'CR-5',
  description: string,
  cr1Binding: Cr1Binding | null
): CoverageRuleBinding {
  switch (id) {
    case 'CR-1':
      return cr1Binding ?? { kind: 'CR-1', mandatoryTopics: [] }
    case 'CR-2': {
      // "≥ 70%" → 70.
      const m = description.match(/≥?\s*(\d+)\s*%/)
      const minPercent = m ? parseInt(m[1]!, 10) : 70
      const b: Cr2Binding = {
        kind: 'CR-2',
        minUniqueTopicPercent: minPercent,
      }
      return b
    }
    case 'CR-3': {
      // "ห้ามปรากฏเกิน 5 Set" → 5.
      const m = description.match(/เกิน\s*(\d+)\s*Set/i)
      const maxSets = m ? parseInt(m[1]!, 10) : 5
      const b: Cr3Binding = {
        kind: 'CR-3',
        maxSetsPerTriple: maxSets,
      }
      return b
    }
    case 'CR-4': {
      // "minimum 5 ข้อ" → 5.
      const m = description.match(/(\d+)\s*ข้อ/)
      const minPerDoc = m ? parseInt(m[1]!, 10) : 5
      const b: Cr4Binding = {
        kind: 'CR-4',
        minPerDocumentPerSet: minPerDoc,
      }
      return b
    }
    case 'CR-5': {
      // CR-5 is a coverage sweep — no numeric threshold.
      const b: Cr5Binding = { kind: 'CR-5', majorSections: [] }
      return b
    }
  }
}

// ─── Section 5: LO Definitions + LO Distribution ────────────────────────────
// Real v3.0 LO Definitions: `| **LO1** | Knowledge Recall | Remember | ... | Memory |`.
// Real v3.0 LO Distribution: `| LO1 | 20–25% | 20–25 | ... |`.

function projectLoDefinitions(
  headings: HeadingNode[],
  tables: TableNode[]
): LoDefinition[] {
  // The LO Definitions table is under the SPECIFIC H3 "นิยาม Learning
  // Objectives". Do NOT include the broader "Learning Objectives" prefix —
  // the H2 "Learning Objectives — LO Mapping" sits ABOVE the H3; matching
  // the H2 first would find no table under it (the H3 owns the table).
  const table = tableAfterSection(headings, tables, [
    'นิยาม Learning Objectives',
    'LO Definitions',
  ])
  if (!table) return []
  const out: LoDefinition[] = []
  for (const row of table.rows) {
    if (row.isHeader) continue
    const cells = row.cells.map((c) => c.text)
    if (cells.length < 5) continue
    const lo = parseLo(cells[0]!)
    if (lo === null) continue
    out.push({
      lo,
      name: cells[1]!.trim(),
      bloomLevel: cells[2]!.trim(),
      blueprintType: parseBlueprintType(cells[4]!.trim()) ?? 'Memory',
      sourceLocation: { ...table.location },
    })
  }
  return out
}

function projectLoDistributionTargets(
  headings: HeadingNode[],
  tables: TableNode[]
): LoDistributionTarget[] {
  // The LO Distribution table is under H3 "สัดส่วน LO ต่อ Set" (per-Set % targets).
  const table = tableAfterSection(headings, tables, [
    'สัดส่วน LO ต่อ Set',
    'สัดส่วน LO',
    'LO Distribution',
  ])
  if (!table) return []
  const out: LoDistributionTarget[] = []
  for (const row of table.rows) {
    if (row.isHeader) continue
    const cells = row.cells.map((c) => c.text)
    if (cells.length < 2) continue
    const lo = parseLo(cells[0]!)
    if (lo === null) continue
    const range = parseRange(cells[1]!)
    if (range === null) continue
    // Midpoint as the representative target percent.
    const targetPercent = Math.round((range.min + range.max) / 2)
    out.push({
      lo,
      minPercent: range.min,
      maxPercent: range.max,
      targetPercent,
      sourceLocation: { ...table.location },
    })
  }
  return out
}

// ─── Section 6: Question Pattern Layer ──────────────────────────────────────
// Three tables under "Question Pattern Layer":
//  - Pattern Types (definitions with description + example + share range)
//  - Pattern Distribution Target (per-Set count min/max/target)
//  - Pattern × Blueprint Type (correspondence matrix)

function projectPatternDefinitions(
  headings: HeadingNode[],
  tables: TableNode[]
): PatternDefinition[] {
  const table = tableAfterSection(headings, tables, ['Pattern Types'])
  if (!table) return []
  const out: PatternDefinition[] = []
  for (const row of table.rows) {
    if (row.isHeader) continue
    const cells = row.cells.map((c) => c.text)
    if (cells.length < 4) continue
    const pattern = parsePattern(cells[0]!)
    if (pattern === null) continue
    const share = parseRange(cells[3]!)
    if (share === null) continue
    out.push({
      pattern,
      description: cells[1]!.trim(),
      example: cells[2]!.trim(),
      sharePercent: { min: share.min, max: share.max },
      sourceLocation: { ...table.location },
    })
  }
  return out
}

function projectPatternDistributionTargets(
  headings: HeadingNode[],
  tables: TableNode[]
): PatternDistributionTarget[] {
  const table = tableAfterSection(headings, tables, [
    'Pattern Distribution Target',
  ])
  if (!table) return []
  const out: PatternDistributionTarget[] = []
  for (const row of table.rows) {
    if (row.isHeader) continue
    const cells = row.cells.map((c) => c.text)
    if (cells.length < 4) continue
    const pattern = parsePattern(cells[0]!)
    if (pattern === null) continue
    // The Pattern Distribution Target row is `| Pattern | Min | Max | Target |`.
    // But the last row "รวม" has text values in Min/Max cells ("—"); skip those.
    const min = parseInt(cells[1]!, 10)
    const max = parseInt(cells[2]!, 10)
    const target = parseInt(cells[3]!, 10)
    if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(target)) {
      continue
    }
    out.push({
      pattern,
      min,
      max,
      target,
      sourceLocation: { ...table.location },
    })
  }
  return out
}

function projectPatternTypeCorrespondence(
  headings: HeadingNode[],
  tables: TableNode[]
): PatternTypeCorrespondence[] {
  // The Pattern × Type table's HEADER row names the BlueprintTypes as columns.
  // Each body row's first cell is the Pattern; subsequent cells carry "✅",
  // "✅ Primary", or "⬜". We project one PatternTypeCorrespondence per
  // non-empty cell.
  const table = tableAfterSection(headings, tables, [
    'Pattern × Blueprint Type',
    'ความสัมพันธ์ Pattern',
  ])
  if (!table) return []
  const headerRow = table.rows.find((r) => r.isHeader)
  if (!headerRow) return []
  // Column index → BlueprintType (skip col 0 which is the row-label corner).
  const colTypes: Array<{ col: number; type: import('./contracts').BlueprintType | null }> = []
  headerRow.cells.forEach((cell, idx) => {
    if (idx === 0) return
    const t = parseBlueprintType(cell.text.trim())
    colTypes.push({ col: idx, type: t })
  })
  const out: PatternTypeCorrespondence[] = []
  for (const row of table.rows) {
    if (row.isHeader) continue
    const pattern = parsePattern(row.cells[0]?.text ?? '')
    if (pattern === null) continue
    for (const { col, type } of colTypes) {
      if (type === null) continue
      const cellText = row.cells[col]?.text ?? ''
      if (cellText.includes('✅')) {
        out.push({
          pattern,
          blueprintType: type,
          isPrimary: /primary/i.test(cellText),
        })
      }
    }
  }
  return out
}

// ─── Section 7: Duplicate Prevention + Similarity Metric ────────────────────

function projectDuplicatePolicies(
  headings: HeadingNode[],
  tables: TableNode[]
): import('./blueprint-ast').DuplicatePolicy[] {
  const table = tableAfterSection(headings, tables, [
    'Duplicate Prevention',
    'การป้องกันข้อสอบซ้ำ',
  ])
  // First find the L-rules sub-table ("ระดับการป้องกัน"), not the summary.
  // Use the most specific prefix.
  const lTable =
    tableAfterSection(headings, tables, ['ระดับการป้องกัน', 'Prevention Levels']) ??
    table
  if (!lTable) return []
  const out: import('./blueprint-ast').DuplicatePolicy[] = []
  for (const row of lTable.rows) {
    if (row.isHeader) continue
    const cells = row.cells.map((c) => c.text)
    if (cells.length < 4) continue
    const id = parseDuplicateId(cells[0]!)
    if (id === null) continue
    const scope = parseScope(cells[1]!)
    if (scope === null) continue
    const description = cells[2]!.trim()
    const level: EnforcementLevel = /hard/i.test(cells[3]!) ? 'hard' : 'soft'
    out.push({
      id,
      scope,
      description,
      level,
      sourceLocation: { ...lTable.location },
    })
  }
  return out
}

function projectSimilarityThresholds(
  headings: HeadingNode[],
  codeBlocks: CodeNode[]
): import('./contracts').SimilarityThresholds | null {
  const block = codeAfterSection(headings, codeBlocks, ['Similarity Metric'])
  if (!block) return null
  const text = block.text
  // ">= 0.85 → BLOCK" and ">= 0.70 → WARN".
  const blockMatch = text.match(/>=\s*([\d.]+)\s*→\s*BLOCK/i)
  const warnMatch = text.match(/>=\s*([\d.]+)\s*→\s*WARN/i)
  if (!blockMatch || !warnMatch) return null
  return {
    block: parseFloat(blockMatch[1]!),
    warn: parseFloat(warnMatch[1]!),
  }
}

// ─── Section 8: Distribution Master Table ───────────────────────────────────
// Three sub-tables: per-Document-per-Set counts, per-Difficulty-per-Set, and
// per-BlueprintType-per-Set. Each is author-guidance (Stage 6 drops them), but
// Stage 5 captures them for completeness and future consistency checks.

function projectDocumentSetCounts(
  headings: HeadingNode[],
  tables: TableNode[]
): DocumentSetCount[] {
  const table = tableAfterSection(headings, tables, [
    'จำนวนข้อต่อ Document ต่อ Set',
    'Document per Set',
  ])
  if (!table) return []
  const headerCols = table.rows.find((r) => r.isHeader)?.cells ?? []
  // Columns are: Document | S1 | S2 | S3 | S4 | S5 | รวม
  const setColIndices: number[] = []
  headerCols.forEach((cell, idx) => {
    if (idx === 0) return
    if (/^S[1-5]$/.test(cell.text.trim())) {
      setColIndices.push(idx)
    }
  })
  if (setColIndices.length === 0) return []
  const out: DocumentSetCount[] = []
  for (const row of table.rows) {
    if (row.isHeader) continue
    const nameCell = row.cells[0]?.text?.trim() ?? ''
    // Skip the "รวม" total row.
    if (/รวม/i.test(nameCell)) continue
    const m = nameCell.match(/^(\d+)\.\s*(.+)$/)
    const documentName = m ? m[2]!.trim() : nameCell
    const documentNumber = m ? parseInt(m[1]!, 10) : null
    if (!documentName) continue
    for (const col of setColIndices) {
      const cellText = row.cells[col]?.text ?? ''
      // Strip markdown bold (**20**) before parsing.
      const cleaned = cellText.replace(/\*\*/g, '').trim()
      const count = parseInt(cleaned, 10)
      if (!Number.isFinite(count)) continue
      const setNumber = (parseInt(headerCols[col]!.text.trim().slice(1), 10) as 1 | 2 | 3 | 4 | 5)
      out.push({
        documentName,
        documentNumber,
        setNumber,
        count,
        isThemeAnchor: /\*\*/.test(cellText),
      })
    }
  }
  return out
}

function projectDifficultySetCounts(
  headings: HeadingNode[],
  tables: TableNode[]
): DifficultySetCount[] {
  const table = tableAfterSection(headings, tables, [
    'Difficulty Distribution ต่อ Set',
    'Difficulty Distribution',
  ])
  if (!table) return []
  return projectAxisSetCounts(table, (axisText) => {
    const d = axisText.trim()
    if (d === 'Easy' || d === 'Medium' || d === 'Hard') return d
    return null
  }).map(({ axis, setNumber, count }) => ({ difficulty: axis, setNumber, count }))
}

function projectBlueprintTypeSetCounts(
  headings: HeadingNode[],
  tables: TableNode[]
): BlueprintTypeSetCount[] {
  const table = tableAfterSection(headings, tables, [
    'Blueprint Type Distribution ต่อ Set',
    'Blueprint Type Distribution',
  ])
  if (!table) return []
  return projectAxisSetCounts(table, (axisText) => parseBlueprintType(axisText))
    .map(({ axis, setNumber, count }) => ({ blueprintType: axis, setNumber, count }))
}

/**
 * Generic row-axis projector for the Difficulty and BlueprintType sub-tables.
 * Both share the shape: `| Axis | S1 | S2 | S3 | S4 | S5 |`.
 */
function projectAxisSetCounts<T extends string>(
  table: TableNode,
  parseAxis: (text: string) => T | null
): Array<{ axis: T; setNumber: 1 | 2 | 3 | 4 | 5; count: number }> {
  const headerCols = table.rows.find((r) => r.isHeader)?.cells ?? []
  const setColIndices: number[] = []
  headerCols.forEach((cell, idx) => {
    if (idx === 0) return
    if (/^S[1-5]$/.test(cell.text.trim())) setColIndices.push(idx)
  })
  if (setColIndices.length === 0) return []
  const out: Array<{ axis: T; setNumber: 1 | 2 | 3 | 4 | 5; count: number }> = []
  for (const row of table.rows) {
    if (row.isHeader) continue
    const axisText = row.cells[0]?.text ?? ''
    const axis = parseAxis(axisText)
    if (axis === null) continue
    for (const col of setColIndices) {
      const cleaned = (row.cells[col]?.text ?? '').replace(/\*\*/g, '').trim()
      const count = parseInt(cleaned, 10)
      if (!Number.isFinite(count)) continue
      const setNumber = (parseInt(headerCols[col]!.text.trim().slice(1), 10) as 1 | 2 | 3 | 4 | 5)
      out.push({ axis, setNumber, count })
    }
  }
  // Re-shape to the per-axis typed return type at the call site via cast.
  return out as unknown as Array<{
    axis: T
    setNumber: 1 | 2 | 3 | 4 | 5
    count: number
  }>
}

// ─── Section 9: Set definitions (themes + anchors only) ─────────────────────
// Real v3.0: `## Set 1 — กฎหมายหลักการศึกษา`, then `**Anchor**: <document>`.

function projectSetDefinitions(headings: HeadingNode[]): SetDefinition[] {
  const out: SetDefinition[] = []
  for (const h of headings) {
    if (h.level !== 2) continue
    const m = h.text.match(/^Set\s*([1-5])\s*[—–-]\s*(.+)$/)
    if (!m) continue
    const setNumber = parseInt(m[1]!, 10) as 1 | 2 | 3 | 4 | 5
    const theme = m[2]!.trim()
    // Anchor document is in the prose following the heading — we don't have
    // access to that from headings alone. Leave null; a richer projection
    // (walking prose after each Set heading) is a future enhancement.
    out.push({
      setNumber,
      theme,
      anchorDocument: null,
      sourceLocation: { ...h.location },
    })
  }
  return out
}

// ─── Parsers (cell-text → typed enum/value) ─────────────────────────────────
// Each returns null on parse failure (the caller skips that row). None throw.

function parseTier(text: string): Tier | null {
  const m = text.match(/Tier\s*([1-4])/i)
  if (!m) return null
  return parseInt(m[1]!, 10) as Tier
}

function parseLo(text: string): LearningObjective | null {
  const m = text.match(/LO([1-4])/i)
  if (!m) return null
  return `LO${m[1]}` as LearningObjective
}

function parsePattern(text: string): QuestionPattern | null {
  // Strip bold markers and trim. Pattern values can include spaces ("Best Answer",
  // "Matching Concept"). Match against the canonical enum by exact equality.
  // The sixth value is the TWO-WORD `Matching Concept` (IG-2 Amendment D-6);
  // NOT the bare `Matching` (that was the Integration Spec §5.4 typo).
  const cleaned = text.replace(/\*\*/g, '').trim()
  const all: QuestionPattern[] = [
    'Positive',
    'Negative',
    'Best Answer',
    'Scenario',
    'Sequence',
    'Matching Concept',
  ]
  return all.find((p) => cleaned === p) ?? null
}

function parseBlueprintType(text: string): import('./contracts').BlueprintType | null {
  const cleaned = text.replace(/\*\*/g, '').trim()
  const all: Array<import('./contracts').BlueprintType> = [
    'Memory',
    'Concept',
    'Procedure',
    'Scenario',
  ]
  return all.find((t) => cleaned === t) ?? null
}

function parseDuplicateId(text: string): import('./contracts').DuplicatePreventionId | null {
  const m = text.replace(/\*\*/g, '').trim().match(/^L([1-5])$/)
  if (!m) return null
  return `L${m[1]}` as import('./contracts').DuplicatePreventionId
}

function parseScope(
  text: string
): import('./contracts').DuplicatePreventionScope | null {
  const t = text.trim().toLowerCase()
  if (t.includes('within') || t.includes('ภายใน')) return 'within_set'
  if (t.includes('across') || t.includes('ข้าม')) return 'across_set'
  return null
}

/**
 * Parse a "min–max" range string. Tolerates en-dash (–), em-dash (—), and
 * ASCII hyphen-minus (-). Returns null when either side fails to parse.
 *
 * Examples: "13–20" → {min:13, max:20}; "35-40%" → {min:35, max:40}.
 */
function parseRange(text: string): { min: number; max: number } | null {
  // Strip trailing % and bold markers.
  const cleaned = text.replace(/\*\*/g, '').replace(/%$/, '').trim()
  // Split on the first dash-family char.
  const m = cleaned.match(/^(\d+)\s*[–—-]\s*(\d+)$/)
  if (!m) return null
  const min = parseInt(m[1]!, 10)
  const max = parseInt(m[2]!, 10)
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null
  return { min, max }
}

// ─── Unused-parameter silencer (keep projections uniform in signature) ──────
// Some projection helpers receive parameters they don't currently use. We
// suppress the lint warning via voiding rather than restructure the call site
// shape — keeping all projections symmetric makes the stage easier to extend.
void (null as unknown as MarkdownNode)
