# Sobdai Session 6.19.2 — Content Template v2.2 (Delta Amendment)

**Status:** AUTHORITATIVE Content Template delta. Supersedes v2.1 only in the respects recorded below.
**Scope:** Narrowly scoped to IG-2 Amendment v1.0 D-4 and D-5. Adds two Question-level metadata fields. Everything else in v2.1 is unchanged.
**Source of authority:** IG-2 Architecture Amendment v1.0 (approved); Blueprint v3.0 (vocabulary source of truth, frozen).
**Version:** 2.2
**Owner:** Chief Content Architecture Designer, Sobdai

> **What this is.** A delta over Content Template v2.1. Patches only. No regeneration of unchanged sections.
> **What this is not.** Not Content Template v3. Not a redesign. Not a restatement of v2.1.

---

## 1. Version Change Summary

### 1.1 Why v2.2 exists

Content Template v2.1 is **incomplete relative to Blueprint v3.0**. The Blueprint's Question Pattern Layer, CR-5, L2, and Similarity Metric require two Question-level metadata fields that v2.1 does not declare:

- **`QuestionPattern`** — the cognitive frame of the stem (Positive / Negative / Best Answer / Scenario / Sequence / Matching Concept). Distinct from `QuestionType`, which is mechanical format (MCQ4 / MCQ5 / True-False / Matching / Ordering / Essay).
- **`Section`** — the legal-section reference a Question draws from (e.g. `ม.6–8`). Distinct from `KnowledgeCoverage`, which is Summary-only and coarser.

Without these fields, the Importer cannot populate the four IG-2 Bank columns the Assessment Engine needs to honor Blueprint v3.0's distribution, coverage, and duplicate-prevention rules.

### 1.2 Relationship to v2.1

v2.2 = v2.1 + 2 new metadata rows + 2 new markdown labels + their authoring/validation rules. **No v2.1 field is renamed, removed, retyped, or re-scoped.** Any v2.1-authored Question remains a valid v2.1 Question (see §6).

### 1.3 Relationship to IG-2 Amendment

This delta implements IG-2 Amendment v1.0 §8.1 item 2 ("Content Template is bumped v2.1 → v2.2 with two new Question-level fields"). It is the precondition for E-0's importer extension and IG-2 migration. It does not, by itself, change the Bank schema or the Engine.

---

## 2. Metadata Table Patch

Insert two rows into Part 1 — Official Metadata Standard. Place them adjacent to row 14 (`Blueprint`) and row 18 (`LearningObjectives`), grouping the cognitive/legal axes together. Renumber subsequent rows.

### Patch (showing only changed/inserted rows)

| # | Field | Type | Required | Description |
|---|---|---|---|---|
| 14 | `Blueprint` | enum | Question only | Memory / Concept / Procedure / Scenario — Part 9 *(unchanged)* |
| **14a** | **`QuestionPattern`** | **enum** | **Question only** | **Positive / Negative / Best Answer / Scenario / Sequence / Matching Concept — Part 9b (NEW, v2.2)** |
| **14b** | **`Section`** | **text** | **Question only** | **legal-section reference, e.g. `ม.6–8` — Part 9c (NEW, v2.2)** |
| 15 | `QuestionType` | enum | Question only | MCQ4 / MCQ5 / True-False / Matching / Ordering / Essay — Part 6 *(unchanged; NOT aliased to QuestionPattern)* |
| 16 | `ChoiceCount` | int | Question only | 4 หรือ 5 — Part 7 *(unchanged)* |
| ... | ... | ... | ... | *(rows 17–29 unchanged)* |

### Field specifications

**`QuestionPattern`** (enum, Question only)
- Allowed values (exact strings, case-sensitive): `Positive` | `Negative` | `Best Answer` | `Scenario` | `Sequence` | `Matching Concept`
- Vocabulary source: Blueprint v3.0 Question Pattern Layer (frozen). Note: the sixth value is the two-word `Matching Concept`, not `Matching`.
- Semantics: the cognitive frame the stem imposes on the learner. Orthogonal to `QuestionType` (format).
- Required on every Question authored under v2.2. Optional on v2.1-authored Questions (see §6).

**`Section`** (text, Question only)
- Format: Thai legal-section reference, `ม.<n>` or `ม.<n>–<m>` (en-dash or hyphen-minus both accepted; normalized to en-dash `–` U+2013 by the Importer).
- Examples: `ม.6`, `ม.6–8`, `ม.10–14`, `ม.47–51`.
- Semantics: the precise legal provision(s) the Question draws from. NOT the Topic (subject-matter theme) and NOT `KnowledgeCoverage` (Summary-grade tag).
- Required on every Question authored under v2.2 that draws from a sectioned legal document. Optional when the source document has no sections (e.g. a policy plan, a strategy).
- Free text, not enum — there are hundreds of legal sections; enumerating them would couple the schema to the statute book.

---

## 3. Question Markdown Patch

Two new labels added to the YAML frontmatter and the markdown body. Patches show only the affected fragment.

### Patch A — YAML frontmatter (Part 19 Question Template)

**Before (v2.1):**
```yaml
# Question metadata
question_type: MCQ4
choice_count: 4
difficulty: Medium
blueprint: Concept
estimated_time: 45

# Learning
learning_objective: LO2
```

**After (v2.2):**
```yaml
# Question metadata
question_type: MCQ4
choice_count: 4
difficulty: Medium
blueprint: Concept
question_pattern: Best Answer      # NEW v2.2 — cognitive frame (Part 9b)
section: ม.5                         # NEW v2.2 — legal-section reference (Part 9c)
estimated_time: 45

# Learning
learning_objective: LO2
```

### Patch B — Markdown body labels

For authors who use the label-style body (parsed by `lib/markdownParser.ts`), the importer gains two extractors:

**Before (v2.1 body labels):**
```
**Blueprint:** Concept
**Difficulty:** Medium
**QuestionType:** MCQ4
```

**After (v2.2 body labels):**
```
**Blueprint:** Concept
**QuestionPattern:** Best Answer
**Section:** ม.5
**Difficulty:** Medium
**QuestionType:** MCQ4
```

Field order is not normative; the parser extracts each label independently with non-greedy lookahead up to the next known label (same mechanism as existing fields).

---

## 4. Authoring Rules

### 4.1 `QuestionPattern` authoring rules

1. **Exactly one value per Question.** A Question has one cognitive frame. If a stem blends frames (e.g. a scenario that asks for the best answer), pick the **dominant** frame and let `**Explanation:**` carry the nuance.
2. **Use the exact enum string.** Case-sensitive. `Best Answer` (two words), `Matching Concept` (two words). Not `best answer`, not `BestAnswer`, not `Matching`.
3. **Pattern must match the stem's phrasing, not its topic.** A `Negative` Pattern means the stem asks "ข้อใด **ไม่ใช่**…" regardless of what the topic is.
4. **Pattern is independent of `Blueprint` (type) and `QuestionType` (format).** The Pattern × Type cross-table (Blueprint v3.0) is a constraint the Engine satisfies, not an authoring rule — authors may use any Pattern with any Type and let the Engine optimize.

**Good examples**

| Stem fragment | Pattern | Why |
|---|---|---|
| "ข้อใดกล่าว **ถูกต้อง**" | `Positive` | asks for the true statement |
| "ข้อใด **ไม่ใช่** หลักการ…" | `Negative` | asks for the false statement |
| "ข้อใด **เหมาะสมที่สุด**" | `Best Answer` | multiple defensible options, pick best |
| "นาย ก. … ควรดำเนินการอย่างไร" | `Scenario` | framed by a scenario |
| "ลำดับขั้นตอนที่ **ถูกต้อง** คือข้อใด" | `Sequence` | asks for ordering |
| "ข้อใดจับคู่ระหวาง มาตรา กับ เนื้อหา **ถูกต้อง**" | `Matching Concept` | asks for concept pairing |

**Bad examples**

| Stem | Bad Pattern | Why bad |
|---|---|---|
| "ข้อใด **ไม่ใช่**…" | `Positive` | stem is negated → must be `Negative` |
| "ข้อใดจับคู่ถูกต้อง" | `Matching` | enum value is `Matching Concept` (two words) |
| "ข้อใดเหมาะสมที่สุด" | `MCQ4` | confused Pattern with QuestionType |
| (no stem cue, generic recall) | `Scenario` | no scenario is framed → use `Positive` or `Best Answer` |

**Edge cases**
- **Stem with embedded negation but asks for truth** ("ข้อใดระบุว่า X ไม่เป็นจริง") → still `Positive` (the *correct* answer asserts a negation; the frame is "which is correct").
- **Range/sequence hybrid** ("ลำดับขั้นตอน…และข้อใดไม่ลำดับถูกต้อง") → pick `Sequence` (the dominant cognitive task is ordering).
- **Unsure** → default to `Positive`; never leave blank under v2.2.

### 4.2 `Section` authoring rules

1. **Use the legal-section reference as it appears in the source document.** `ม.<n>` for a single section; `ม.<n>–<m>` for a range.
2. **Cite the narrowest section that fully covers the Question.** If a Question draws from `ม.6–8`, write `ม.6–8`, not `ม.6` and not "บุตรแห่งการศึกษา".
3. **One Section value per Question.** If a Question spans non-contiguous sections, pick the primary one and use `**References:**` to cite the others. L2 ("Section/มาตรา เดียวกัน ≤ 3 ข้อ/Set") operates on the single primary Section value.
4. **Use Thai numeral prefix `ม.` (ไม่ใช่ `M.` or `Section`).** Matches Blueprint v3.0 style throughout its Set tables.
5. **Leave blank (not "N/A") when the source document has no sections** (e.g. a strategy document, a policy framework). The Engine treats blank `Section` as Incomplete Metadata → reduced Confidence per Scoring §11.

**Good examples**

| Question draws from | `Section` value |
|---|---|
| พ.ร.บ.การศึกษาแห่งชาติ 2542 ม.6–8 | `ม.6–8` |
| พ.ร.บ.การศึกษาแห่งชาติ 2542 ม.22 | `ม.22` |
| หลักสูตรแกนกลาง 2551 (no sections) | *(blank)* |

**Bad examples**

| Value | Why bad |
|---|---|
| `มาตรา 6` | verbose; use `ม.6` |
| `M.6` | wrong script; use Thai `ม.` |
| `ม.6 ถึง ม.8` | verbose; use range form `ม.6–8` |
| `บทที่ 1` | not a section reference; L2 cannot evaluate |
| `N/A` | use blank instead; "N/A" pollutes the Similarity Metric |

**Edge cases**
- **Section amended/repealed** → cite the section as it stood when the Question was authored; track via `version` and `updated_at`.
- **Question spans `ม.6` and `ม.22` equally** → pick the one the stem foregrounds; cite both in `**References:**`.
- **Section number uncertain at authoring** → leave blank and flag `content_status: Draft`; never guess.

---

## 5. Validation Rules

Architecture only. No implementation. The Importer and Reader enforce these; the Engine consumes.

### 5.1 Importer validation (where parsing happens)

**Errors (reject the row, Fail Fast):**
- `question_pattern` present but not one of the six enum values → `structural.invalid_enum` (mapped to importer row-error; row skipped, batch continues).
- `question_pattern` present in YAML but empty/whitespace → `structural.invalid_enum`.

**Warnings (accept the row, flag for review):**
- v2.2 Question missing `question_pattern` → `semantic.smell` warning, row accepted with `question_pattern = NULL` (reduced-Confidence path applies downstream).
- v2.2 Question missing `section` on a sectioned document (heuristic: `document_type ∈ {ACT, ROYAL_DECREE, MINISTERIAL_REG}`) → `semantic.smell` warning, row accepted with `section = NULL`.

**Normalization (silent, idempotent):**
- `section` whitespace trimmed; unicode NFC; hyphen-minus `-` in ranges normalized to en-dash `–` (U+2013). Single canonical form per distinct value (determinism contract).
- `question_pattern` is case-sensitive; no case normalization (the enum is Title Case and authors are told to use it verbatim).

### 5.2 Reader expectations (Engine intake)

The Reader consumes the persisted Bank row, not the markdown directly. By the time the Reader runs, IG-2 axes are already Bank columns. The Reader:

- **Does not re-validate** Pattern/Section against the Bank — that was the Importer's job.
- **Does validate** the `AssemblyRequest` it emits against Blueprint v3.0's enum vocabulary: a Pattern value of `Matching` (the old Integration Spec typo) is now `structural.invalid_enum` because Blueprint v3.0 authoritatively uses `Matching Concept`.
- **Carries** `section` through the CandidateSet as Candidate metadata; it does not parse the range itself (range evaluation for L2 is the Solver's job).

### 5.3 Validation error taxonomy (matches IG-2 Amendment §6.1)

| Failure | Category | Severity | Surface |
|---|---|---|---|
| Pattern enum violation | `structural.invalid_enum` | Fatal (row) | Importer |
| Section malformed (non-`ม.` form) | `semantic.smell` | Warning | Importer |
| Pattern missing (v2.2 Question) | `semantic.smell` | Warning | Importer |
| Section missing on sectioned doc | `semantic.smell` | Warning | Importer |
| Reader detects `Matching` (legacy typo) | `structural.invalid_enum` | Blocking | Reader |

---

## 6. Backward Compatibility

### 6.1 v2.1-authored content (unchanged)

A Question written under v2.1 rules — with `Blueprint`, `LearningObjectives`, `QuestionType` but no `QuestionPattern` or `Section` — **remains valid v2.1 content**. Under v2.2:

- It parses without error (the two new extractors return empty string → NULL).
- It imports without error (NULL is permitted; both columns are nullable).
- The Engine treats it as **Incomplete Metadata**: Candidates from such Questions propagate reduced Confidence per Scoring Model §11. They are not excluded; they are scored lower.
- **No forced re-authoring.** Existing content works as-is; it just produces lower-Confidence placements until backfilled.

### 6.2 v2.2-authored content (new)

A Question written under v2.2 rules carries all four IG-2 axes. The Engine can score it at full Confidence and the Solver can use it to satisfy Pattern Distribution, CR-5, and L2.

### 6.3 Mixed repositories (the realistic case)

The Bank will hold a mix of v2.1-authored and v2.2-authored Questions for the foreseeable future. This is **by design**, not a defect:

- The Importer accepts both (NULL permitted on the new columns).
- The Generator's filters treat NULL Pattern/Section as "does not match Pattern/Section-filtered slots" — those Candidates are eligible only for slots that don't filter on the missing axis.
- The Scoring Model's Confidence propagation handles the mix transparently: full Confidence for tagged Candidates, reduced for untagged.
- **No migration cut-over is required.** Mixed state is the steady state during the multi-month backfill window.

---

## 7. Migration Guidance

Guidance only. No SQL, no code. For Content Authors.

### 7.1 New Questions (effective immediately on v2.2 publication)

All newly authored Questions MUST include `question_pattern` and (for sectioned documents) `section`. Treat them as required fields in the authoring workflow.

### 7.2 Existing Questions (gradual backfill)

Backfill is **optional, ongoing, and prioritized by Tier-1 first**:

1. **Tier-1 documents first.** CR-5 (Section Sweep) and the Tier-1 floor constraints benefit most from tagged Sections. Prioritize Tier-1 Questions for `section` backfill.
2. **High-usage Patterns first.** `Positive` and `Scenario` carry the largest distribution weights (38 and 18 of 100). Tagging these Patterns first maximizes Solver headroom.
3. **Per-document batches.** Backfill one Document at a time (e.g. all Questions on `พ.ร.บ.การศึกษาแห่งชาติ 2542`), so partial-document state is minimized.
4. **Use `content_status: Review` during backfill.** A backfilled Question should pass human review before its tags go live (mirrors the existing review workflow).

### 7.3 What NOT to do

- **Do not infer Pattern from `QuestionType`.** They are orthogonal (IG-2 Amendment §3). Manual author judgment is required.
- **Do not infer Section from `Topic`.** Topic is subject-matter theme; Section is legal citation. They frequently diverge.
- **Do not bulk-set `question_pattern: Positive` as a default.** This silently corrupts the Pattern Distribution Target. Leave blank rather than guess.
- **Do not couple backfill to a release cut-over.** The Engine is designed for the mixed state; use it.

### 7.4 When is backfill "done"?

There is no requirement for 100% tagging. The Engine is production-viable with partial tagging. Backfill is "sufficient" when:

- All Tier-1 Questions have `section`, AND
- A majority of Questions per Blueprint-relevant Document have `question_pattern`.

Beyond that, marginal returns diminish. The Scoring Model's reduced-Confidence path absorbs the long tail gracefully.

---

## Appendix — What this delta does NOT change

- **No change** to v2.1 fields `Blueprint`, `LearningObjectives`, `QuestionType`, `ChoiceCount`, `KnowledgeCoverage`, `Difficulty`, `Subject`, `Topic`, `Document`, `DocumentType`, `References`, `Tags`, or any other existing field.
- **No change** to Part 6 (Question Types), Part 9 (Blueprint), Part 10 (LO), Part 11 (KnowledgeCoverage), Part 17 (Cross References), Part 19 (Question Template — only two lines added per Patch A/B).
- **No change** to the Summary Template (Part 20). The new fields are Question-only.
- **No change** to DocumentCode / QuestionCode / SummaryCode conventions (Parts 3–5).
- **No change** to ContentStatus workflow (Part 14) or provenance fields (Part 15).
- **No redesign** of the Content Template, the Blueprint, or the Engine.

---

*End of Sobdai Session 6.19.2 — Content Template v2.2 (Delta Amendment).*

**Status:** AUTHORITATIVE. Content Template v2.1 → v2.2 via this delta.
**Engineering Effect:** E-0 (IG-2 Closure) importer extension may now be specified against the two new fields (`QuestionPattern`, `Section`) and their exact enum/format contracts.
**Content Effect:** Authors may begin using the two new fields immediately on v2.2 publication; existing v2.1 content remains valid (Incomplete Metadata path).
