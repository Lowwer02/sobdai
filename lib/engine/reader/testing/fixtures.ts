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

// ─── Stage 3 (metadata-validation) fixtures ────────────────────────────────
// Each targets ONE metadata semantic check. Stage 2 may also fire on these
// (the fixtures are structurally well-formed except for the metadata issue
// under test); Stage 3 tests filter to the diagnostic they care about.

/** Metadata block declaring an Engine Version below this Reader's minimum.
 *  Stage 3 must report `semantic.conflicting_rules` for version compat. */
export function buildEngineVersionTooLowBlueprint(): string {
  return `# Simulation Exam Blueprint — v3.0

> **Engine Version**: 0.1.0 | **Blueprint Version**: 3.0.0 | **Position ID**: \`bma-education-specialist\`

${ALL_REQUIRED_SECTIONS}`
}

/** Metadata block with a syntactically invalid Blueprint Version (not semver).
 *  Stage 3 must report `semantic.conflicting_rules` for version syntax. */
export function buildBadBlueprintVersionSyntaxBlueprint(): string {
  return `# Simulation Exam Blueprint — v3.0

> **Engine Version**: 1.0.0 | **Blueprint Version**: three-dot-oh | **Position ID**: \`bma-education-specialist\`

${ALL_REQUIRED_SECTIONS}`
}

/** Metadata block with an unsupported schema major version (v9.x).
 *  Stage 3 must report `semantic.conflicting_rules` (supported-version check). */
export function buildUnsupportedSchemaMajorBlueprint(): string {
  return `# Simulation Exam Blueprint — v9.0

> **Engine Version**: 1.0.0 | **Blueprint Version**: 9.0.0 | **Position ID**: \`bma-education-specialist\`

${ALL_REQUIRED_SECTIONS}`
}

/** Metadata block with a syntactically invalid Position ID (uppercase + underscore).
 *  Stage 3 must report `semantic.smell` (Position ID syntax). */
export function buildBadPositionIdBlueprint(): string {
  return `# Simulation Exam Blueprint — v3.0

> **Engine Version**: 1.0.0 | **Blueprint Version**: 3.0.0 | **Position ID**: \`BMA_Education_Specialist\`

${ALL_REQUIRED_SECTIONS}`
}

/** Metadata block missing Position ID. Stage 3 must report `semantic.smell`
 *  (completeness). */
export function buildMissingPositionIdBlueprint(): string {
  return `# Simulation Exam Blueprint — v3.0

> **Engine Version**: 1.0.0 | **Blueprint Version**: 3.0.0

${ALL_REQUIRED_SECTIONS}`
}

/** Metadata block missing Engine Version. Stage 3 must report `semantic.smell`
 *  (completeness). */
export function buildMissingEngineVersionBlueprint(): string {
  return `# Simulation Exam Blueprint — v3.0

> **Blueprint Version**: 3.0.0 | **Position ID**: \`bma-education-specialist\`

${ALL_REQUIRED_SECTIONS}`
}

/** H1 with whitespace-only title text. Stage 3 must report `semantic.smell`
 *  (empty title). The H1 must be recognized as a heading (so it's distinct
 *  from "missing H1", which is Stage 2's beat); use `#   ` (hash + spaces),
 *  which the parser accepts as a level-1 heading with empty text. A bare `#`
 *  with no trailing whitespace is parsed as a paragraph, not a heading. */
export function buildEmptyTitleBlueprint(): string {
  return `#   ${''}

> **Engine Version**: 1.0.0 | **Blueprint Version**: 3.0.0 | **Position ID**: \`bma-education-specialist\`

${ALL_REQUIRED_SECTIONS}`
}

/** YAML frontmatter with an unknown key (`author`). Stage 3 must report
 *  `semantic.smell` (unknown metadata). Only fires for YAML form. */
export function buildUnknownMetadataKeyBlueprint(): string {
  return `---
engine_version: "1.0.0"
blueprint_version: "3.0.0"
position_id: "bma-education-specialist"
author: "Jane Doe"
---

${ALL_REQUIRED_SECTIONS}`
}

// ─── Stage 4 (normalization) fixtures ──────────────────────────────────────
// Stage 4 normalizes the metadata block. Fixtures target one normalization
// rule each so a failing test points at one rule.

/** Version with leading zeros and surrounding whitespace — exercises
 *  normalizeVersion's leading-zero stripping + trim. */
export function buildLeadingZeroVersionBlueprint(): string {
  return `# Simulation Exam Blueprint — v3.0

> **Engine Version**: 01.00.00 | **Blueprint Version**:  03.00.00  | **Position ID**: \`bma-education-specialist\`

${ALL_REQUIRED_SECTIONS}`
}

/** Position ID in mixed case — exercises normalizePositionId's lowercase rule. */
export function buildUppercasePositionIdBlueprint(): string {
  return `# Simulation Exam Blueprint — v3.0

> **Engine Version**: 1.0.0 | **Blueprint Version**: 3.0.0 | **Position ID**: \`BMA-Education-Specialist\`

${ALL_REQUIRED_SECTIONS}`
}

/** H1 title with internal whitespace runs — exercises normalizeText's collapse. */
export function buildWhitespaceHeavyTitleBlueprint(): string {
  return `#    Simulation    Exam    Blueprint   —   v3.0

> **Engine Version**: 1.0.0 | **Blueprint Version**: 3.0.0 | **Position ID**: \`bma-education-specialist\`

${ALL_REQUIRED_SECTIONS}`
}

// NOTE: a previous `buildCRLFInTitleBlueprint` fixture was removed. Its premise
// was wrong: CommonMark headings are single-line, so a CRLF embedded in the H1
// text (`# Line1\r\nLine2`) is parsed as a heading "Line1" + a paragraph
// "Line2", not as a multi-line title. The CRLF-normalization rule still exists
// in normalizeText and is exercised by a direct unit test in
// normalizer.stage4.test.ts (constructing a BlueprintMetadata with a CRLF in
// the title string, bypassing the parser).

// ─── Stage 5/6 fixtures: realistic Blueprint fragments ────────────────────
// A compact but structurally faithful Blueprint covering every business-node
// section Stage 5 must project. Used by the Stage 5 + Stage 6 tests as the
// canonical "everything parses" input.

/**
 * Compact Blueprint that exercises every Stage 5 business-node projector:
 * Tier Definitions, Tier Mapping, Distribution Constraints pseudocode,
 * Coverage Rules (CR-1..CR-5), Mandatory Topics (CR-1 binding),
 * LO Definitions, LO Distribution, Pattern Types, Pattern Distribution Target,
 * Pattern × Blueprint Type, Duplicate Prevention, Similarity Metric,
 * Distribution Master Table, Difficulty Distribution, Blueprint Type
 * Distribution, Set 1..5.
 *
 * Numbers are realistic but compact (2 documents, 2 Sets visible in Master).
 * This is NOT Blueprint v3.0 — it's a minimal projection test fixture.
 */
export function buildStage5CompleteBlueprint(): string {
  return `# Simulation Exam Blueprint — v3.0

> **Engine Version**: 1.0.0 | **Blueprint Version**: 3.0.0 | **Position ID**: \`test-position\`

## Distribution Rules — Tier System

### Tier Definitions

| Tier | Label | Range (ข้อ/ชุด, ฐาน 100) | เกณฑ์การจัดระดับ |
|---|---|---|---|
| **Tier 1** | Core | 13–20 | กฎหมายแม่บท |
| **Tier 2** | Domain | 8–15 | กฎหมายที่เกี่ยวข้อง |
| **Tier 3** | Supporting | 5–13 | กลุ่มเป้าหมาย |
| **Tier 4** | Supplementary | 5–10 | ความรู้ทั่วไป |

### Tier Mapping — Test Position

| Document | Tier |
|---|---|
| 1. พ.ร.บ.ทดสอบ 2560 | Tier 1: Core |
| 2. พ.ร.บ.อีกอัน 2562 | Tier 2: Domain |

### Distribution Constraints

\`\`\`
FOR each simulation_set:
  SUM(all documents) = 100

  SUM(tier_1) >= 30% of total
  SUM(tier_4) <= 25% of total

  Anchor Rule:
    1 document per set gets +5 above tier.max
    max 1 anchor per set
\`\`\`

## Coverage Rules

| Rule | คำอธิบาย | Enforcement |
|---|---|---|
| **CR-1: Mandatory Topics** | Topic สำคัญต้องปรากฏในทุก Set | Hard — Fail ถ้าขาด |
| **CR-2: Minimum Unique Topics** | แต่ละ Set ต้องมี Topic ไม่ซ้ำ ≥ 70% | Hard — Fail ถ้าต่ำกว่า |
| **CR-3: Cross-Set Rotation** | Topic + Difficulty + Type เดียวกัน ห้ามปรากฏเกิน 5 Set | Soft — Warning |
| **CR-4: Document Coverage** | ทุก Document ต้องปรากฏในทุก Set (minimum 5 ข้อ) | Hard — Fail ถ้าขาด |
| **CR-5: Section Sweep** | สำหรับ Tier 1: ทุก Section หลักต้องถูกวัดอย่างน้อย 1 ครั้ง | Soft — Warning |

### Mandatory Topics (CR-1)

ต้องปรากฏใน **ทุก Set**:

| Document | Mandatory Topic | เหตุผล |
|---|---|---|
| พ.ร.บ.ทดสอบ 2560 | หลักการ (ม.6–8) | หลักปรัชญา |
| พ.ร.บ.อีกอัน 2562 | Topic บังคับ | ต้องรู้ |

## Learning Objectives — LO Mapping

### นิยาม Learning Objectives

| LO | ชื่อ | Bloom's Level | คำอธิบาย | Blueprint Type |
|---|---|---|---|---|
| **LO1** | Knowledge Recall | Remember | จำ | Memory |
| **LO2** | Conceptual | Understand | เข้าใจ | Concept |
| **LO3** | Procedural | Apply | ประยุกต์ | Procedure |
| **LO4** | Contextual | Evaluate | วิเคราะห์ | Scenario |

### สัดส่วน LO ต่อ Set

| LO | สัดส่วน | จำนวน/ชุด | เหตุผล |
|---|---|---|---|
| LO1 | 20–25% | 20–25 | จำพื้นฐาน |
| LO2 | 30–35% | 30–35 | แกนหลัก |
| LO3 | 20–25% | 20–25 | ปฏิบัติ |
| LO4 | 15–20% | 15–20 | คิดสูง |

## Question Pattern Layer

### Pattern Types

| Pattern | คำอธิบาย | ตัวอย่างโจทย์ | สัดส่วน |
|---|---|---|---|
| **Positive** | ถามถูก | "ข้อใดถูก" | 35–40% |
| **Negative** | ถามผิด | "ข้อใดไม่ใช่" | 15–20% |
| **Best Answer** | เลือกดีสุด | "ข้อใดเหมาะสมที่สุด" | 10–15% |
| **Scenario** | สถานการณ์ | "นาย ก. ..." | 15–20% |
| **Sequence** | ลำดับ | "ลำดับถูกคือข้อใด" | 5–10% |
| **Matching Concept** | จับคู่ | "จับคู่มาตรา" | 5–10% |

### Pattern Distribution Target (100 ข้อ/ชุด)

| Pattern | Min | Max | Target |
|---|---|---|---|
| Positive | 35 | 40 | 38 |
| Negative | 15 | 20 | 18 |
| Best Answer | 10 | 15 | 12 |
| Scenario | 15 | 20 | 18 |
| Sequence | 5 | 10 | 7 |
| Matching Concept | 5 | 10 | 7 |
| **รวม** | — | — | **100** |

### ความสัมพันธ์ Pattern × Blueprint Type

| | Memory | Concept | Procedure | Scenario |
|---|---|---|---|---|
| Positive | ✅ Primary | ✅ Primary | ✅ | ⬜ |
| Negative | ✅ | ✅ Primary | ✅ | ⬜ |
| Best Answer | ⬜ | ✅ | ✅ | ✅ Primary |
| Scenario | ⬜ | ⬜ | ✅ | ✅ Primary |
| Sequence | ⬜ | ⬜ | ✅ Primary | ⬜ |
| Matching Concept | ✅ | ✅ Primary | ⬜ | ⬜ |

## Duplicate Prevention Rules

### ระดับการป้องกัน

| Level | ขอบเขต | กฎ | Enforcement |
|---|---|---|---|
| **L1** | ภายใน Set | Topic + Difficulty + Type เดียวกัน = ห้ามซ้ำ | Hard |
| **L2** | ภายใน Set | Section/มาตรา เดียวกัน ≤ 3 ข้อ/Set | Hard |
| **L3** | ข้าม Set | Topic + Difficulty + Type ห้ามเกิน 5 Set | Soft |
| **L4** | ข้าม Set | Concept ห้ามซ้ำเกิน 50% | Soft |
| **L5** | ข้าม Set | Scenario ต้องมีบริบทต่างกัน | Soft |

### Similarity Metric

\`\`\`
calculate_similarity(question_a, question_b):
  topic_sim    = 1.0 if same_topic    else 0.0   (weight: 0.40)
  section_sim  = 1.0 if same_section  else 0.0   (weight: 0.20)
  type_sim     = 1.0 if same_type     else 0.0   (weight: 0.15)
  diff_sim     = 1.0 if same_diff     else 0.0   (weight: 0.10)
  keyword_sim  = jaccard(keywords_a, keywords_b)  (weight: 0.15)
  total = weighted_sum(above)
  >= 0.85 → BLOCK
  >= 0.70 → WARN
  <  0.70 → PASS
\`\`\`

## Distribution Master Table

### จำนวนข้อต่อ Document ต่อ Set

| Document | S1 | S2 | S3 | S4 | S5 | รวม |
|---|---|---|---|---|---|---|
| 1. พ.ร.บ.ทดสอบ 2560 | **20** | 13 | 12 | 13 | 13 | 71 |
| 2. พ.ร.บ.อีกอัน 2562 | 5 | 5 | 10 | 5 | 8 | 33 |

### Difficulty Distribution ต่อ Set

| Difficulty | S1 | S2 | S3 | S4 | S5 |
|---|---|---|---|---|---|
| Easy | 26 | 26 | 20 | 22 | 23 |
| Medium | 54 | 49 | 51 | 56 | 52 |
| Hard | 20 | 25 | 29 | 22 | 25 |

### Blueprint Type Distribution ต่อ Set

| Type | S1 | S2 | S3 | S4 | S5 |
|---|---|---|---|---|---|
| Memory | 24 | 26 | 19 | 22 | 21 |
| Concept | 39 | 31 | 35 | 31 | 35 |
| Procedure | 23 | 27 | 24 | 30 | 24 |
| Scenario | 14 | 16 | 22 | 17 | 20 |

## Set 1 — กฎหมายหลัก

Set 1 content.

## Set 2 — บริหาร

Set 2 content.

## Set 3 — นวัตกรรม

Set 3 content.

## Set 4 — หลักสูตร

Set 4 content.

## Set 5 — แผนงาน

Set 5 content.
`
}


