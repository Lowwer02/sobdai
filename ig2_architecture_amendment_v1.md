# Sobdai Session 6.19.1 — IG-2 Architecture Amendment v1.0

**Status:** AUTHORITATIVE architectural resolution for Engineering Phase 0 (IG-2 Closure).
**Scope:** Narrowly scoped to Integration Gap IG-2. Does not redesign the Assessment Engine, Blueprint v3.0, or any frozen module.
**Architecture status:** FROZEN across 10 specifications. This amendment records corrections to one of them (Blueprint Integration Specification v1.0 §5.4) and clarifies ownership; it does not redesign any module.
**Version:** 1.0
**Owner:** Chief Software Architect, Sobdai
**Resolves:** Engineering pause on E-0 (IG-2 Closure), raised in Session 6.20 Engineering Execution.

> **What this document is.** An Architecture Amendment. It resolves a verified inconsistency between the frozen Integration Spec, the frozen Blueprint v3.0, and the current Content Template v2.1 / Importer / Bank schema. It names the authoritative source of truth for each IG-2 axis, classifies every change as Normative or Editorial, and authorizes Engineering to resume E-0 under a corrected contract.
>
> **What this document is not.** Not code. Not SQL. Not a migration. Not a redesign. Not a modification of the Engineering Backlog (the Engineering Manager incorporates this amendment's effects separately).

---

## 0. Decision Summary (read this first)

| # | Decision | Effect |
|---|---|---|
| **D-1** | The four IG-2 axes are **two existing + two new**, not "four already-parsed". The Implementation Planning assumption is corrected. | Normative |
| **D-2** | The authoritative source of truth for IG-2 axis *vocabulary* is **Blueprint v3.0**, not the Content Template. The Content Template and Bank schema are *consumers* of that vocabulary. | Normative |
| **D-3** | `QuestionType` (Content Template v2.1) is **Question Format**, not Question Pattern. Pattern is a distinct cognitive axis. The two must not be merged. | Normative |
| **D-4** | `question_pattern` remains a first-class architectural concept. It originates from the **Content Author** (declared per question in the Content Template) because Pattern is a cognitive classification of an authored stem, not derivable from Format. | Normative |
| **D-5** | `section` (มาตรา) remains a first-class metadata field. It originates from the **Content Author**. It is load-bearing in Blueprint v3.0 (CR-5, L2, Similarity Metric weight 0.20) and cannot be deferred or dropped. | Normative |
| **D-6** | The Integration Spec §5.4 Pattern vocabulary is **corrected** to match Blueprint v3.0: the sixth value is `Matching Concept`, not `Matching`. | Editorial (correction) + Normative (vocabulary pin) |
| **D-7** | The Integration Spec §5.4 enum list for the four axes is **corrected** to the authoritative Blueprint v3.0 vocabulary. | Editorial + Normative |
| **D-8** | Engineering **may resume E-0** under this amendment. The IG-2 migration becomes a 4-column additive change with vocabulary pinned to Blueprint v3.0. | Normative |

---

## 1. The Exact Architectural Inconsistency

### 1.1 What the specifications say

| Specification | What it says about IG-2 axes | Status |
|---|---|---|
| **Blueprint v3.0** (`Blueprint/simulation_exam_blueprint.md`, the input document) | Defines and uses all four axes operationally: `Memory/Concept/Procedure/Scenario` (Blueprint Type); `LO1–LO4`; `Positive/Negative/Best Answer/Scenario/Sequence/Matching Concept` (Pattern); มาตรา e.g. `ม.6–8` (Section). Pattern × Type cross-table (lines 206–213) is normative. CR-5, L2, and the Similarity Metric (weight 0.20) all consume `section`. | **Authoritative** — it is the input the Engine must accept |
| **Blueprint Integration Specification v1.0 §5.4** | "Blueprint v3.0 filters and scores on axes that the Question Bank (as of Session 6.16) does not store: `blueprint_type` (Memory/Concept/Procedure/Scenario), `learning_objective` (LO1–LO4), `question_pattern` (Positive/Negative/Best Answer/Scenario/Sequence/**Matching**), `section` (มาตรา e.g. ม.6–8)." | Frozen; nearly correct — but the Pattern enum's sixth value is wrong (see D-6) |
| **Content Template v2.1** (`content_template_v2.md`) | Defines metadata fields per Question. Carries `Blueprint` (Memory/Concept/Procedure/Scenario), `LearningObjectives` (LO1..LO4), `QuestionType` (MCQ4/MCQ5/True-False/Matching/Ordering/Essay), `KnowledgeCoverage` (Summary-only). **No `QuestionPattern` field. No `Section` field.** | Authoritative for Content, but **incomplete w.r.t. Blueprint v3.0** |
| **Importer / Parser** (`app/admin/import/actions.ts`, `lib/markdownParser.ts`) | Parses Content Template v2.1 fields verbatim. Extracts `blueprint`, `learning_objective`, `question_type`, `knowledge_coverage`, etc. Discards those without a Bank column. | Faithful to Content Template v2.1; therefore also missing Pattern and Section |
| **Question Bank schema** (Migrations 002, 019, 026) | Has `subject`, `law`, `topic`, `document`, `difficulty`, `tags`, `category`, `question_code`. **No column for any IG-2 axis.** | What IG-2 must extend |
| **Implementation Planning v1.0 §4.3** | "The importer already parses the required fields and discards them." | **FALSE** for `question_pattern` and `section` — these were never parsed |

### 1.2 The disagreement, precisely

1. **The Integration Spec, the Implementation Planning, and the Implementation Planning's IG-2 Closure Plan all assume the four IG-2 axes already exist in the parser output and only need a column to land in.** This is true for `blueprint_type` and `learning_objective`. It is **false** for `question_pattern` and `section`.
2. **The Content Template v2.1 has no field for either `QuestionPattern` or `Section`.** The closest fields are `QuestionType` (a different axis — see §3) and `KnowledgeCoverage` (Summary-only and a different semantic — see §5).
3. **The Integration Spec silently truncated Blueprint v3.0's `Matching Concept` to `Matching`** (verified: Blueprint v3.0 lines 190, 201, 213 use the two-word form). This is a transcription error in the Integration Spec, not a Blueprint ambiguity.

### 1.3 Why they disagree

The Integration Spec and Implementation Planning were written against the *intended* axis set (driven by what the Engine needs to honor Blueprint v3.0's rules). The Content Template was written against what the Content pipeline currently emits. **Nobody reconciled the two before Architecture freeze.** The Integration Spec correctly identified the gap (it is, after all, the document that *names* IG-2); its error was assuming the gap was "the importer discards parsed fields" when in fact the gap is "the fields don't exist upstream of the importer at all."

This is a **single upstream-origin gap**, not a structural inconsistency in the Engine. The Engine's contracts are correct; the substrate below the Reader needs two additional authored fields.

---

## 2. Authoritative Source of Truth

### 2.1 The principle

> **Vocabulary originates where the concept is authored. Persistence and parsing conform; they do not invent.**

Each IG-2 axis has exactly one authoritative source. Other layers consume, normalize, or store — they never redefine.

### 2.2 Per-axis authoritative source

| Axis | Vocabulary Source | Rationale |
|---|---|---|
| `blueprint_type` | **Blueprint v3.0** (`Memory` / `Concept` / `Procedure` / `Scenario`) | The Blueprint's distribution and LO-mapping rules operate on these values; they are the Engine's input contract. Content Template v2.1 already uses the same values (`Blueprint` field) — alignment is verbatim, no transformation. |
| `learning_objective` | **Blueprint v3.0** (`LO1` / `LO2` / `LO3` / `LO4`) | Same reasoning. Content Template v2.1's `LearningObjectives` field uses identical tokens. Alignment is verbatim. |
| `question_pattern` | **Blueprint v3.0 Question Pattern Layer** (`Positive` / `Negative` / `Best Answer` / `Scenario` / `Sequence` / `Matching Concept`) | The Blueprint's Pattern Distribution Target, Pattern × Type cross-table, and L5 rule all operate on these values. This is the vocabulary the Solver must satisfy. |
| `section` | **Blueprint v3.0 Coverage/Similarity rules** (`ม.<n>[-<m>]` form, e.g. `ม.6–8`) | CR-5, L2, and the Similarity Metric (weight 0.20) all consume `section`. The format is the legal-section reference style the Blueprint already uses throughout its Set tables. |

### 2.3 Why each candidate layer is NOT the source of truth

| Candidate | Why it is not authoritative |
|---|---|
| **Blueprint Specification (Blueprint v3.0 itself)** | *Is* the authoritative source for `blueprint_type`, `learning_objective`, `question_pattern`, and `section` *vocabulary* — see §2.2. |
| **Content Template** | Consumer. It declares the *fields* a Question carries; the *values* those fields accept come from what the Engine (driven by Blueprint) requires. The Content Template must be **extended** to carry Pattern and Section fields with Blueprint-pinned enums — it does not get to invent them. |
| **Import Pipeline** | Mechanism. It parses what the Content Template declares and persists what the Bank schema accepts. It has no vocabulary authority. |
| **Question Bank Schema** | Persistence. It stores columns; the column *type* and any `CHECK` constraint must match the authoritative vocabulary. It does not get to widen or narrow it. |

### 2.4 Consequence

The Content Template v2.1 is **incomplete relative to Blueprint v3.0**. This is the root cause. Two new fields are required in Content Template v2.2 (Editorial at the template level, Normative at the contract level): `QuestionPattern` and `Section`.

---

## 3. Is `QuestionType` the same as `Question Pattern`?

### 3.1 Verdict: **B. Question Format** — a distinct axis.

`QuestionType` (Content Template v2.1) and `Question Pattern` (Blueprint v3.0) are **different concepts occupying different positions in the question model**. They must not be merged, aliased, or mapped one-to-one.

### 3.2 Why — the two axes are orthogonal

| Property | `QuestionType` (Format) | `Question Pattern` (Cognitive) |
|---|---|---|
| **What it classifies** | The *mechanical structure* of the question — how the learner physically answers | The *cognitive frame* of the question — what the stem is asking the learner to do mentally |
| **Values (Blueprint v3.0 / CT v2.1)** | `MCQ4` / `MCQ5` / `True-False` / `Matching` / `Ordering` / `Essay` | `Positive` / `Negative` / `Best Answer` / `Scenario` / `Sequence` / `Matching Concept` |
| **Determined by** | The choice layout authored into the question | The phrasing/intent of the stem |
| **Cardinality example** | A single `MCQ4` question can be `Positive`, `Negative`, `Best Answer`, `Scenario`, `Sequence`, or `Matching Concept` — *any* of the six | A single `Positive` Pattern question can be delivered as `MCQ4`, `MCQ5`, or (awkwardly) `True-False` |
| **Engine uses it for** | Not currently a Blueprint v3.0 axis | Pattern Distribution Target, Pattern × Type cross-table, L5 |

### 3.3 Concrete disambiguation

- A `Positive / MCQ4` question: "ข้อใดกล่าวถูกถูกต้อง" — four choices, asks for the true statement.
- A `Negative / MCQ4` question: "ข้อใด **ไม่ใช่** หลักการ..." — four choices, asks for the false statement.
- A `Scenario / MCQ4` question: "นาย ก. เป็นนักวิชาการศึกษา... ควรดำเนินการอย่างไร" — four choices, framed by a scenario.

Same Format (`MCQ4`). Three different Patterns. **Format does not determine Pattern.** A Bank column aliasing one to the other would make every Pattern-based Blueprint rule (Pattern Distribution Target, Pattern × Type cross-table, L5) unenforceable.

### 3.4 Disposition of `QuestionType`

- `QuestionType` **remains** a Content Template v2.1 field and **remains** parsed by the importer. It is *not* an IG-2 axis.
- It is **out of scope** for the Assessment Engine v1.0. No Engine module consumes it. The Bank may store it (it already does implicitly via `category`/`tags`) or not; the Engine does not care.
- It is **not dropped**, **not renamed**, **not repurposed**. It simply is not Pattern.

---

## 4. Should `Question Pattern` remain an architectural concept?

### 4.1 Verdict: **Yes.** Pattern is load-bearing in Blueprint v3.0 and cannot be removed without redesigning the Blueprint.

### 4.2 Why Pattern must remain

Blueprint v3.0 declares Pattern as a normative axis in three places the Solver must honor:

1. **Pattern Distribution Target (100 ข้อ/ชุด)** — fixed per-set counts per Pattern (Positive 38, Negative 18, Best Answer 12, Scenario 18, Sequence 7, Matching Concept 7). This is a distribution constraint the Solver must satisfy.
2. **Pattern × Blueprint Type cross-table** — a normative primary-correspondence matrix (e.g. `Sequence` is Primary for `Procedure`; `Scenario` is Primary for `Scenario` type). The Ranking's Pattern Fit component and the Solver's joint-allocation both consume this.
3. **L5 (cross-Set, Soft)** — "Scenario ต้องมีบริบทต่างกัน" operates on the `Scenario` Pattern value specifically.

Remove Pattern and these three Blueprint v3.0 sections become unenforceable. That would require redesigning Blueprint v3.0 — explicitly out of scope.

### 4.3 Where Pattern originates

**Authored, not derived.** Pattern is a cognitive classification of an authored stem. It cannot be reliably derived from:

- **Format (`QuestionType`)** — shown orthogonal in §3.
- **Content / keywords** — would require LLM judgment, which the Engine Foundation explicitly gates and excludes from v1.0 determinism (Reader is Markdown-aware only; Scoring/Ranking/Solver are content-blind).
- **Document / Topic / Difficulty** — none of these determine whether a stem is phrased as Positive vs. Negative vs. Best Answer.

**Therefore Pattern is declared by the Content Author at authoring time**, in the Content Template, and parsed by the importer like any other authored field. The Engine trusts the author's declaration (with the Reader's `structural.invalid_enum` check catching typos).

### 4.4 Origin chain

```
Content Author declares Pattern per Question
   ↓ (Content Template v2.2 adds `QuestionPattern` field)
Parser extracts QuestionPattern (additive to existing parser)
   ↓
Importer persists to Bank.questions.question_pattern (IG-2 migration)
   ↓
Generator's Pattern Filter (Candidate Generation §3, fixed order position 6)
   ↓
Ranking's Pattern Fit component (Scoring Model v1.0)
   ↓
Solver's Pattern Distribution Target + Pattern × Type cross-table (Constraint Solver)
```

---

## 5. Should `Section` (มาตรา) remain a first-class metadata field?

### 5.1 Verdict: **Yes.** Section is load-bearing in Blueprint v3.0 and cannot be deferred, dropped, or substituted.

### 5.2 Why Section must remain

Blueprint v3.0 uses Section operationally in three normative places:

1. **CR-5: Section Sweep** (Soft — Warning) — "สำหรับ Tier 1: ทุก Section หลักต้องถูกวัดอย่างน้อย 1 ครั้งใน 5 Set รวมกัน". The Solver cannot evaluate this without a per-Question `section` value.
2. **L2: Section/มาตรา cap** (Hard) — "Section/มาตรา เดียวกัน ≤ 3 ข้อ/Set". A Hard constraint. The Solver must reject allocations that violate this. Impossible without `section`.
3. **Similarity Metric** (weight 0.20) — `section_sim = 1.0 if same_section else 0.0` carries 20% of the duplicate-similarity score. Dropping it silently re-weights the metric and breaks the L1–L5 threshold calibrations.

Drop Section and three Blueprint v3.0 rules become unenforceable or silently mis-calibrated. Out of scope to redesign.

### 5.3 Why `KnowledgeCoverage` is not a substitute

| Field | Scope | Carrier | Semantics |
|---|---|---|---|
| `KnowledgeCoverage` (CT v2.1) | **Summary-only** (declared in CT v2.1 Part 1 row 19: "Summary required, Q optional" — and even there, it is described as "หมวด/มาตรา/ยุทธศาสตร์", i.e. a *mixed* coverage tag, not a precise legal-section reference) | Summary objects, optionally Questions | Coarse coverage tagging for Summary navigation |
| `Section` (Blueprint v3.0) | **Question-required** for Tier-1 documents | Questions | Precise legal-section reference (e.g. `ม.6–8`) consumed by Hard constraint L2 |

These are not the same axis. `KnowledgeCoverage` is broader, looser, and Summary-oriented. `Section` is precise, Question-oriented, and feeds a Hard constraint. Substituting one for the other would (a) leave L2 unenforced on Questions that lack `KnowledgeCoverage` and (b) mis-apply Summary-grade tags to a Hard rule.

### 5.4 Where Section originates

**Authored, not derived.** A legal section reference (e.g. `ม.6–8`) is a factual claim about which provisions of which law the question draws from. It cannot be derived from:

- **Document name** — a single Document contains many sections; the Document does not determine the Section.
- **Topic** — Topic is the *subject-matter theme* (e.g. "หลักการจัดการศึกษา"), not the *legal citation*. One Topic can span many sections.
- **Content** — would require legal-citation NLP; out of scope for v1.0 determinism.

**Therefore Section is declared by the Content Author at authoring time**, in the Content Template, parsed by the importer, and persisted to the Bank. The format is the free-text legal-section reference style Blueprint v3.0 already uses (`ม.<n>[-<m>]`, e.g. `ม.6–8`, `ม.10–14`).

### 5.5 Section is free-text, not enum

Pattern is an enum (six fixed values). Section is **not** — there are hundreds of legal sections across the source documents, they evolve as laws are amended, and constraining them to a fixed list would couple the Bank schema to the statute book. Section is therefore a **free-text column with light normalization** (trim, unicode NFC, optional range-parse for L2 enforcement). The Reader normalizes; the Solver consumes the normalized form.

### 5.6 Origin chain

```
Content Author declares Section per Question (e.g. "ม.6–8")
   ↓ (Content Template v2.2 adds `Section` field)
Parser extracts Section (additive to existing parser)
   ↓
Importer persists to Bank.questions.section (IG-2 migration)
   ↓
Generator (carries Section through Candidate metadata)
   ↓
Solver: CR-5 (Soft), L2 (Hard), Similarity Metric (weight 0.20)
```

---

## 6. Impact Analysis

### 6.1 Specifications affected

| Spec / Document | Change Required | Classification |
|---|---|---|
| **Blueprint v3.0** (`Blueprint/simulation_exam_blueprint.md`) | **None.** Blueprint v3.0 is verified correct and is the authoritative source of vocabulary for all four IG-2 axes. | — |
| **Blueprint Integration Specification v1.0 §5.4** | Correct the Pattern enum's sixth value: `Matching` → `Matching Concept` (matches Blueprint v3.0 lines 190/201/213). Re-affirm all four axes originate from Blueprint v3.0 vocabulary. | **Editorial** (transcription correction) + **Normative** (vocabulary pin) |
| **Blueprint Integration Specification v1.0 §9 (IG-2)** | Update the IG-2 description: it is no longer "the importer discards parsed fields" for Pattern and Section. It is "the Content Template lacks these fields, the parser does not extract them, and the Bank has no column for them." The closure plan changes accordingly. | **Editorial** (description correction) |
| **Implementation Planning v1.0 §4.3 (IG-2 Closure Plan)** | The closure plan's step 2 ("Importer change: stop discarding the v2.1 fields") is correct for `blueprint_type` and `learning_objective`. It is **insufficient** for `question_pattern` and `section` — for those, the parser must be extended (new regex for two new labels) and the Content Template bumped to v2.2 first. | **Editorial** (plan correction; the Engineering Backlog absorbs the implementation detail) |
| **Content Template v2.1** → **v2.2** | Add two Question-level metadata fields: `QuestionPattern` (enum of six Blueprint v3.0 values) and `Section` (free-text legal-section reference). Update Part 1 metadata table; update Part 9 (currently "Blueprint" — keep) with cross-reference to the Pattern Layer; document the new `Section` field with format examples. | **Normative** (new fields) at the contract level |
| **Importer / Parser** (`lib/markdownParser.ts`, `app/admin/import/actions.ts`) | Add two new field extractors (`**QuestionPattern:**`, `**Section:**`) to the parser; extend `ParsedQuestion`; include the two new fields in the insert payload; remove the "intentionally NOT included" comment scope for these two fields. | **Normative** (mechanism, follows from the above) |
| **Question Bank schema** (new migration, applied in E-0) | Add four nullable, indexed columns to `questions`: `blueprint_type`, `learning_objective`, `question_pattern`, `section`. Pin `blueprint_type` and `question_pattern` to `CHECK` constraints matching Blueprint v3.0 vocabulary. Leave `learning_objective` and `section` as text (`learning_objective` may also be `CHECK`-constrained to `LO1..LO4`). All four nullable (existing rows have unknown axes; per Scoring §11 this propagates as reduced Confidence). | **Normative** (this is IG-2 itself) |
| **`get_question_metadata` RPC** (Migration 022) | Extend to surface `blueprint_types`, `learning_objectives`, `question_patterns`, `sections` arrays (DISTINCT non-null, mirroring the existing pattern). The admin Question Picker filter UI consumes this. | **Normative** (mechanism) |
| **`lib/types.ts`** | Add four optional fields to the `Question` interface, mirroring Session 6.16's additive pattern. | **Normative** (mechanism) |
| **Admin Question Picker UI** | Add filter controls for the four axes. | **Normative** (mechanism) |
| **Assessment Assembly Engine Foundation v1.0** | **None.** No Engine module is changed by this amendment. | — |
| **Blueprint Reader Pipeline Architecture v1.0** | **None.** The Reader already emits these four axes as enum/text types in `AssemblyRequest`. It does not validate them against the Bank (the Bank storing them is IG-2's job, not the Reader's). | — |
| **Candidate Generation Architecture v1.0** | **None.** The Generator's Pattern Filter and LO Filter already expect these axes; IG-2 is what makes them available in the Bank. The amendment does not change the Generator's contract. | — |
| **Scoring Model Specification v1.0** | **None.** Scoring already specifies the "missing axis → reduced Confidence" propagation rule (§11) that governs pre-backfill Bank rows. The amendment does not change this. | — |
| **Candidate Ranking / Allocation Model / Constraint Solver / Runtime API / Draft Builder Architectures** | **None.** None of these are IG-2-axis-aware in a way this amendment changes. | — |

### 6.2 Classification summary

- **Normative Changes** (affect contracts / behavior):
  - Integration Spec §5.4 Pattern vocabulary corrected and pinned (D-6, D-7).
  - Content Template v2.2 adds two new Question-level fields (`QuestionPattern`, `Section`).
  - Importer / Parser extended to extract two new fields.
  - Bank schema extended with four columns (the IG-2 migration itself).
  - `get_question_metadata` RPC and admin Picker UI extended.
- **Editorial Changes** (affect descriptions / plans, not contracts):
  - Integration Spec §9 IG-2 description corrected (closure shape).
  - Implementation Planning §4.3 closure plan corrected.
  - This amendment itself records the corrections.
- **No change** to: Blueprint v3.0, Engine Foundation, Reader, Generator, Scoring, Ranking, Allocation, Solver, Runtime API, Draft Builder.

### 6.3 What is explicitly NOT changed

- The Reader's contract types (`AssemblyRequest`, the four axis enums) — already correct.
- The Generator's filter order — already correct.
- The Scoring Model's propagation rule for missing axes — already correct.
- The Solver's CR-5 / L2 / Similarity Metric consumption — already correct.
- Blueprint v3.0 — verified correct, is the source of truth.

---

## 7. Migration Strategy (Architecture only — no SQL, no implementation)

### 7.1 Principle: additive, nullable, never silently backfilled.

The IG-2 migration follows the pattern of Migration 002 (subject/law/topic) and Migration 026 (exam_type/status/subject/document): **additive nullable columns with indexes, no destructive change, fully reversible via `DROP COLUMN`**.

### 7.2 Existing Bank rows

Every existing Question row has NULL for all four IG-2 axes after the migration. This is **acceptable and intentional**, not a defect:

- Per Scoring Model Specification v1.0 §11, missing axes propagate as **reduced Confidence** (never silent distortion). A Candidate with `question_pattern IS NULL` is still a Candidate; its Pattern Fit Component reports "Incomplete Metadata" and its Composite Confidence is lowered accordingly.
- Per the existing IG-2 Closure Plan (Implementation Planning §4.3 step 4), **no blocking backfill is required for v1.0**. Existing rows are tagged "incomplete metadata" by the Engine; new imports carry the full axis set.
- Backfill is a **separate, optional, ongoing operational activity** performed by Content Authors re-tagging existing Questions. It is not on the Engine critical path.

### 7.3 New imports (post-migration)

After E-0 lands:

- `blueprint_type` and `learning_objective`: parsed from existing Content Template v2.1 fields (`**Blueprint:**`, `**LearningObjective:**`) that the importer already extracts and currently discards. The importer stops discarding them and includes them in the insert payload.
- `question_pattern`: parsed from the new Content Template v2.2 `**QuestionPattern:**` field. Requires Content Template v2.2 adoption by Content Authors for new imports.
- `section`: parsed from the new Content Template v2.2 `**Section:**` field. Same requirement.

### 7.4 Sequencing constraint

**Content Template v2.2 must be published before (or with) the importer change.** Otherwise new imports cannot carry Pattern and Section, and the importer's new extractors would silently receive empty strings. Concretely: the E-0 closure plan (Implementation Planning §4.3) is amended to add step 0: publish Content Template v2.2 with the two new fields.

### 7.5 Rollback

Per Implementation Planning §7.3 — IG-2 migration rollback is `DROP COLUMN` (nullable; safe). Engine deployment rollback is "disable Engine invocation; existing system unaffected." This amendment does not change the rollback story.

### 7.6 What the migration does NOT do

- It does **not** alter existing rows.
- It does **not** infer Pattern or Section from `QuestionType`, `KnowledgeCoverage`, `tags`, or content. (Such inference is forbidden per §3 and §5.)
- It does **not** couple `section` to a fixed enum of legal provisions. Section is free text with light normalization.
- It does **not** block Engine execution on rows with NULL axes (Scoring §11 reduced-Confidence path is the designed behavior).

---

## 8. Final Architecture Decision

### 8.1 What changes (effective immediately)

1. **Integration Spec §5.4 Pattern vocabulary is corrected**: the sixth Pattern value is `Matching Concept`, matching Blueprint v3.0. The four-axis list is reaffirmed with vocabulary pinned to Blueprint v3.0.
2. **Content Template is bumped v2.1 → v2.2** with two new Question-level fields: `QuestionPattern` (enum, six values from Blueprint v3.0) and `Section` (free-text legal-section reference).
3. **Importer / Parser** is extended to extract the two new fields (and to stop discarding the two already-parsed fields).
4. **Bank schema** receives four additive nullable columns via the IG-2 migration in E-0, with `CHECK` constraints on the enum axes (`blueprint_type`, `question_pattern`, optionally `learning_objective`) and free-text + index on `section`.
5. **`get_question_metadata` RPC and admin Question Picker** are extended to surface all four axes.
6. **Implementation Planning §4.3 closure plan** is amended to add the Content Template v2.2 publication step and to replace "stop discarding" with "extend parser + stop discarding" for the two new axes.

### 8.2 What remains frozen (unchanged by this amendment)

- The Assessment Assembly Engine's 10 architecture specifications (Foundation, Integration Spec contract shape, Reader, Generator, Scoring, Ranking, Allocation, Solver, Runtime API, Draft Builder).
- Blueprint v3.0 (verified authoritative; not modified).
- All Engine module contracts (`AssemblyRequest`, `CandidateSet`, `RankedCandidateSet`, `AllocatedCandidateSet`, `AssemblyResult`).
- The Reader's existing emission of the four axes (it was already correct).
- The Generator's filter order (already correct).
- Scoring's missing-axis propagation rule (already correct).
- The Solver's CR-5, L2, and Similarity Metric consumption (already correct).
- The Engineering Backlog's Epic/Feature/Story/Task structure (the Engineering Manager incorporates this amendment's effects into the existing E-0 stories; no backlog redesign).

### 8.3 Engineering may resume E-0

**Yes.** Engineering Execution is authorized to resume Phase 0 (IG-2 Closure) under the following corrected contract:

- The four IG-2 axes are `blueprint_type`, `learning_objective`, `question_pattern`, `section` — confirmed.
- The authoritative vocabulary for the enum axes is **Blueprint v3.0** (with `Matching Concept` as the sixth Pattern value).
- `question_pattern` and `section` are **new Content Template v2.2 fields**, not already-parsed fields. The E-0 closure plan must add the Content Template v2.2 publication step and extend the parser accordingly.
- The migration is additive / nullable / reversible, with no blocking backfill.
- Existing rows with NULL axes propagate as reduced Confidence per Scoring §11 — by design, not as a defect.

### 8.4 Open items this amendment does NOT resolve (out of scope)

- **IG-1** (Bank `document` normalization) — unchanged; mitigated in Reader Normalization as before.
- **IG-3** (Bank `keyword_set` for full Jaccard similarity) — unchanged; L1–L5 still run on `tags`/`category` proxy per existing plan.
- **IG-4** (Blueprint v3.0 L1 self-inconsistency) — unchanged; surfaced as a Blocking error by the Reader per existing plan.
- **Content Template v2.2 authoring** — Content team's responsibility; this amendment specifies the contract (two new fields, enum vocabularies) but does not author the template prose.
- **Backfill of existing rows** — operational activity, not architectural; deferred per Implementation Planning §4.3 step 4.

---

## Appendix A — Verified Vocabulary (authoritative, from Blueprint v3.0)

| Axis | Type | Values |
|---|---|---|
| `blueprint_type` | enum | `Memory` \| `Concept` \| `Procedure` \| `Scenario` |
| `learning_objective` | enum | `LO1` \| `LO2` \| `LO3` \| `LO4` |
| `question_pattern` | enum | `Positive` \| `Negative` \| `Best Answer` \| `Scenario` \| `Sequence` \| `Matching Concept` |
| `section` | free-text | legal-section reference, e.g. `ม.6–8`, `ม.10–14` (normalized: trim, unicode NFC) |

## Appendix B — Verified Load-Bearing Consumers (why each axis must exist)

| Axis | Blueprint v3.0 consumer | Rule |
|---|---|---|
| `blueprint_type` | Distribution Master Table, LO Mapping (LO↔Type) | Distribution target; Pattern × Type cross-table |
| `learning_objective` | LO Mapping (targets + LO↔Type) | Distribution target; LO Fit (Scoring) |
| `question_pattern` | Pattern Distribution Target, Pattern × Type cross-table, L5 | Distribution target; Pattern Fit (Scoring); Scenario diversity |
| `section` | CR-5, L2, Similarity Metric | Soft coverage sweep; Hard per-set cap; 20% similarity weight |

---

*End of Sobdai Session 6.19.1 — IG-2 Architecture Amendment v1.0.*

**Status:** AUTHORITATIVE. Supersedes the IG-2 assumptions in Implementation Planning v1.0 §4.3 and the IG-2 description in Blueprint Integration Specification v1.0 §9, in the narrow respect recorded above.
**Engineering Effect:** E-0 (IG-2 Closure) authorized to resume under the corrected contract in §8.3.
**Architecture Status:** All 10 Engine specifications remain FROZEN. This amendment records a vocabulary correction (Integration Spec §5.4) and an ownership clarification; it redesigns nothing.
