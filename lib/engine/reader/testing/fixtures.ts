/**
 * lib/engine/reader/testing/fixtures.ts
 * ----------------------------------------------------------------------------
 * Reader Stage 1 / Stage 2 — Blueprint document fixtures.
 *
 * Source of truth: Blueprint v3.0 (`Blueprint/simulation_exam_blueprint.md`).
 * Each fixture is a SYNTHETIC Markdown string hand-built to test a specific
 * Stage 1 (parsing/metadata) or Stage 2 (schema validation) property. They are
 * NOT the real Blueprint — they're minimal strings targeting one assertion
 * each, so a failing test points at one rule.
 *
 * Determinism: every fixture is a string literal. Same fixture → same AST →
 * same diagnostics. No clocks, no random.
 *
 * Backlog: E-1.2 S-1.2.x (Reader unit tests). Reusable by every Reader stage
 * test suite.
 */

// ─── Minimal well-formed Blueprint (passes Stage 2) ─────────────────────────

/**
 * Header block used by every well-formed fixture: H1 + metadata blockquote in
 * the v3.0 convention. Trims the boilerplate from each fixture.
 */
const WELL_FORMED_HEADER = `# Simulation Exam Blueprint — v3.0

> **Engine Version**: 1.0.0 | **Blueprint Version**: 3.0.0 | **Position ID**: \`bma-education-specialist\`
`

/**
 * Minimal set of required H2 sections, each with stub content. Real Blueprint
 * v3.0 has rich tables; we keep stubs because Stage 2 checks STRUCTURE not
 * content (the section presence is what matters; tables inside are validated
 * for shape, not data).
 */
const ALL_REQUIRED_SECTIONS = `
## Distribution Rules — Tier System

| Tier | Name | Min | Max |
| --- | --- | --- | --- |
| 1 | Core | 30 | 100 |
| 2 | Domain | 0 | 100 |

## Coverage Rules

| Rule | Description | Enforcement |
| --- | --- | --- |
| CR-1 | Mandatory topics | Hard |

## Learning Objectives — LO Mapping

| LO | Name | Target |
| --- | --- | --- |
| LO1 | Knowledge Recall | 25 |

## Question Pattern Layer

| Pattern | Target |
| --- | --- |
| Positive | 38 |

## Duplicate Prevention Rules

| Level | Scope | Rule |
| --- | --- | --- |
| L1 | within_set | Hard |

## Distribution Master Table

| Set | Document |
| --- | --- |
| 1 | doc1 |

## Set 1 — กฎหมายหลักการศึกษา

Set 1 content.

## Set 2 — การบริหารจัดการ กทม.

Set 2 content.

## Set 3 — นวัตกรรมและดิจิทัล

Set 3 content.

## Set 4 — หลักสูตรและการประกันคุณภาพ

Set 4 content.

## Set 5 — แผนงานและโครงการ

Set 5 content.
`

/**
 * A minimal Blueprint that passes Stage 2 with zero diagnostics. Use as the
 * baseline for happy-path tests; mutate to test specific failures.
 */
export function buildWellFormedBlueprint(): string {
  return `${WELL_FORMED_HEADER}${ALL_REQUIRED_SECTIONS}`
}

// ─── Negative-case fixtures (one specific fault each) ───────────────────────

/** Empty document — Stage 1 must refuse (`ok: false`, reason 'empty'). */
export function buildEmptyBlueprint(): string {
  return ''
}

/** Whitespace-only document — Stage 1 must refuse (reason 'empty'). */
export function buildWhitespaceOnlyBlueprint(): string {
  return '   \n\t\n   \n'
}

/** Document with no metadata blockquote at all — Stage 2 must report
 *  `structural.missing_section` for metadata. */
export function buildMissingMetadataBlueprint(): string {
  return `# Simulation Exam Blueprint — v3.0

${ALL_REQUIRED_SECTIONS}`
}

/** Document missing the Blueprint Version key (metadata block exists but is
 *  incomplete) — Stage 2 must report malformed metadata. */
export function buildMissingBlueprintVersionBlueprint(): string {
  return `# Simulation Exam Blueprint — v3.0

> **Engine Version**: 1.0.0 | **Position ID**: \`bma-education-specialist\`

${ALL_REQUIRED_SECTIONS}`
}

/** Document declaring an unsupported schema major version (v9.x) — Stage 2
 *  must report `structural.invalid_hierarchy`. */
export function buildUnsupportedVersionBlueprint(): string {
  return `# Simulation Exam Blueprint — v9.0

> **Engine Version**: 1.0.0 | **Blueprint Version**: 9.0.0 | **Position ID**: \`bma-education-specialist\`

${ALL_REQUIRED_SECTIONS}`
}

/** Document with no H1 title — Stage 2 must report missing title. */
export function buildMissingH1Blueprint(): string {
  return `> **Engine Version**: 1.0.0 | **Blueprint Version**: 3.0.0 | **Position ID**: \`x\`

${ALL_REQUIRED_SECTIONS}`
}

/** Document missing one required section (Coverage Rules). */
export function buildMissingCoverageRulesBlueprint(): string {
  const all = buildWellFormedBlueprint()
  // Strip the Coverage Rules section block (heading through the next ## heading).
  return all.replace(/## Coverage Rules[\s\S]*?(?=## Learning Objectives)/, '')
}

/** Document with a duplicated Coverage Rules section. */
export function buildDuplicateSectionBlueprint(): string {
  const dup = `\n## Coverage Rules\n\nDuplicate injected section.\n`
  // Insert the duplicate just before Set 1.
  return buildWellFormedBlueprint().replace(
    '## Set 1',
    `${dup}\n## Set 1`
  )
}

/** Document with a malformed GFM table (row with wrong cell count). */
export function buildMalformedTableBlueprint(): string {
  const bad = `## Distribution Rules — Tier System

| Tier | Name | Min | Max |
| --- | --- | --- | --- |
| 1 | Core | 30 |
`
  // Replace the Distribution Rules section in the well-formed doc with the bad one.
  const base = buildWellFormedBlueprint()
  return base.replace(
    /## Distribution Rules — Tier System[\s\S]*?(?=## Coverage Rules)/,
    `${bad}\n`
  )
}

/** Document with a heading hierarchy skip (H1 → H3, no H2 between). */
export function buildHeadingSkipBlueprint(): string {
  return `${WELL_FORMED_HEADER}

### Skipped H3

${ALL_REQUIRED_SECTIONS}`
}

/** Document with multiple missing Set sections (triggers the aggregated
 *  diagnostic in addition to per-section ones). */
export function buildMissingMultipleSetsBlueprint(): string {
  const all = buildWellFormedBlueprint()
  return all
    .replace(/## Set 2[\s\S]*?(?=## Set 3)/, '')
    .replace(/## Set 4[\s\S]*?(?=## Set 5)/, '')
    .replace(/## Set 5[\s\S]*$/m, '')
}

/** Document with YAML frontmatter (future-format support — Stage 1 must
 *  detect and parse flat key:value frontmatter). */
export function buildYamlFrontmatterBlueprint(): string {
  return `---
engine_version: "1.0.0"
blueprint_version: "3.0.0"
position_id: "bma-education-specialist"
---

${ALL_REQUIRED_SECTIONS}`
}

/** Document with malformed YAML frontmatter (a list inside the YAML block —
 *  Stage 1 must reject the frontmatter as non-flat; Stage 2 then reports
 *  missing metadata via the blockquote fallback). */
export function buildMalformedYamlBlueprint(): string {
  return `---
engine_version: "1.0.0"
blueprints:
  - first
  - second
---

${ALL_REQUIRED_SECTIONS}`
}

// ─── AST-targeted fixtures (for Stage 1 unit tests) ─────────────────────────

/** A document with every kind of Markdown block the parser supports.
 *  Used to verify each AST node kind is produced with correct line ranges. */
export function buildEveryBlockKindBlueprint(): string {
  return `# Title H1

## Section H2

A paragraph spanning
two lines.

> A blockquote
> on two lines.

- list item one
- list item two
- list item three

| col1 | col2 |
| --- | --- |
| a | b |
| c | d |

\`\`\`yaml
key: value
\`\`\`

---

1. ordered item
2. ordered item

### Subsection H3

Final paragraph.`
}

/** A document with a heading at level 7 — invalid Markdown (parser caps at 6).
 *  Stage 1 parses leniently; Stage 2 reports the structural fault. */
export function buildInvalidHeadingLevelBlueprint(): string {
  return `${WELL_FORMED_HEADER}
${ALL_REQUIRED_SECTIONS}

####### Heading at level 7`
}
