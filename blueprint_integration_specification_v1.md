# Sobdai Blueprint Integration Specification — v1.0

**Status:** Official Specification (Architecture only — no implementation, no SQL, no code)
**Sources of truth (exhaustive):**
1. `assessment_assembly_engine_foundation_v1.md` — Assessment Assembly Engine Foundation v1.0
2. `Blueprint/simulation_exam_blueprint.md` — Assessment Blueprint v3.0
**Version:** 1.0
**Owner:** Sobdai Architecture

> **Status note.** This specification is the document that the Assessment Assembly Engine Foundation v1.0 deferred (it stated, regarding the Blueprint's internal format: *"an externally-defined artifact; its internal format is out of scope for v1.0"*). It exists to close that deferral. Once approved, it becomes the binding contract that:
> - the human-authored Blueprint (Markdown) is **transformed into**, and
> - the Engine consumes as input.
>
> The Blueprint Reader Architecture v1.0 (next session) is designed exclusively against this document + the Engine Foundation.

---

## 0. Executive Summary

The Assessment Assembly Engine does not read human-authored Markdown. It reads an **`AssemblyRequest`** — a normalized, versioned, deterministic contract. Between the human Blueprint and the Engine sits this specification, which defines three things and nothing else:

1. **The Canonical Blueprint Format** — the machine-readable representation of a Blueprint, independent of Markdown.
2. **The `AssemblyRequest` Contract** — the exact payload the Engine consumes.
3. **The Transformation Rules** — how Canonical Blueprint semantics map to `AssemblyRequest` fields, *and the explicit list of Blueprint content that is dropped* because it is out of Engine scope.

The defining principle is **Business Intent Preservation with Strict Reduction**. The Blueprint v3.0 carries rich business context (เหตุผล, design philosophy, quality review, bias analysis, cross-references for human readers). The Engine needs only the **machine-actionable rules**: distribution targets, coverage constraints, difficulty/type/pattern mixes, duplicate-prevention thresholds. This spec specifies exactly what crosses the boundary — and what does not.

The separation of layers is fixed:

```
┌──────────────────────────────────────────────────────────────────────┐
│ BUSINESS LAYER                                                       │
│   Blueprint v3.0 (Markdown — human-authored, human-readable)         │
│   • Design rationale, เหตุผล, quality review, bias analysis         │
│   • Topic tables, mandatory-topic lists, cross-references            │
└──────────────────────────────────────────────────────────────────┬───┘
                                                                   │
                                              (Blueprint Reader —  │
                                               next session,       │
                                               NOT specified here) │
                                                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│ INTEGRATION LAYER  (THIS SPECIFICATION)                              │
│   Canonical Blueprint Format  →→→  AssemblyRequest                   │
│   • Versioned, deterministic                                         │
│   • Markdown-independent                                             │
│   • Strict reduction: business context is dropped                    │
└──────────────────────────────────────────────────────────────────┬───┘
                                                                   │
                                                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│ ENGINE LAYER (immutable — Engine Foundation v1.0)                    │
│   Blueprint Reader → Candidate Generator → Ranking →                 │
│   Review → Draft Builder                                             │
└──────────────────────────────────────────────────────────────────────┘
```

This document defines the Integration Layer only.

---

## 1. Purpose & Scope

### 1.1 What this specification IS

The **binding interface contract** between:
- any human-authored Blueprint (today: Markdown v3.0; future: JSON, YAML, visual editor), and
- the Assessment Assembly Engine (immutable per Engine Foundation v1.0).

It is the document the Blueprint Reader (next session) will be specified against.

### 1.2 What this specification is NOT

- ❌ Not a parser design. (Reader Architecture v1.0 owns that.)
- ❌ Not an Engine design. (Engine Foundation v1.0 owns that; it is immutable here.)
- ❌ Not a Blueprint authoring guide. (Blueprint v3.0 owns its own content.)
- ❌ Not a database schema. (No SQL, no storage decisions.)
- ❌ Not UI.

### 1.3 Sources, and how conflicts are resolved

Two sources only. When they appear to conflict, this order governs:

| # | Source | Authority |
|---|---|---|
| 1 | **Engine Foundation v1.0** | Defines the *consumer* contract — what the Engine will and will not accept. **Wins** on Engine-input questions. |
| 2 | **Blueprint v3.0** | Defines the *producer* reality — what a real Blueprint actually contains. **Wins** on business-meaning questions. |

Conflicts between them are not "resolved by choosing a winner" — they are **recorded as Integration Gaps** (§9) and resolved by this specification, since bridging the two is precisely this document's purpose.

---

## 2. The Boundary Problem This Spec Solves

Engine Foundation v1.0 makes a promise it could not keep without this document:

> *"The Engine consumes an Assessment Blueprint as an `AssemblyRequest`."*

But it also said:

> *"the Blueprint's internal format is out of scope for v1.0 — the Engine only requires that it conform to the `AssemblyRequest` contract."*

This left two gaps:

- **Gap A (format):** Blueprint v3.0 is a 956-line Markdown document. The Engine cannot consume Markdown. Something must define the **canonical machine-readable form** that sits between Markdown and the Engine.
- **Gap B (contract):** The `AssemblyRequest` was sketched (`target_count`, `profile`, `coverage_rules`, `difficulty_rules`, `exclusion_rules`, `constraints`) but never pinned to the real Blueprint's actual axes (Tier, LO, Pattern, Section, Anchor, CR-1…CR-5, L1…L5). The sketch does not match reality.

This specification closes both gaps. The Blueprint Reader (next session) implements the transformation defined here; it does not define it.

---

## 3. Canonical Blueprint Format

### 3.1 Definition

The **Canonical Blueprint Format** is the single machine-readable representation of a Blueprint that the Engine's upstream (the Reader) produces and the Engine's downstream (Candidate Generator, etc.) indirectly depends on via the `AssemblyRequest`.

It is **not Markdown**. It is **not the `AssemblyRequest`**. It sits between them:

```
Blueprint v3.0 (Markdown)
        │
        ▼  (Blueprint Reader — next session)
Canonical Blueprint  ◄── structured, versioned, Markdown-independent
        │
        ▼  (Normalization — defined in this spec, §6–§8)
AssemblyRequest      ◄── Engine input contract
```

### 3.2 Why a Canonical Format Exists (and Why the Engine Never Touches Markdown)

Three independent reasons, any one of which would be sufficient:

1. **Markdown is presentation, not semantics.** A heading reorder, a table reformat, or a whitespace change in v3.0 must not change Engine behavior. The Canonical Format captures *structure and rules*; Markdown carries layout. Coupling the Engine to Markdown (an explicit anti-pattern in the Engine Foundation) would make every cosmetic edit a behavioral change.

2. **Determinism (Engine Foundation Principle 2).** *"The same Blueprint must always produce the same AssemblyRequest."* Achievable only against a normalized structure, never against free-form Markdown whose whitespace and emphasis are ambiguous.

3. **Version independence (Engine Foundation Principle 5).** Blueprint v4 will exist. The Engine must not be redesigned when it does. The Canonical Format is **versioned** (§10); the Reader normalizes across versions, isolating the Engine from Blueprint evolution.

### 3.3 Structural Requirements (Not Schema)

This section specifies **what the Canonical Format must represent**, not the concrete syntax (JSON/YAML) — that is an implementation choice owned by the Reader Architecture v1.0. The Canonical Format is a **conceptual structure**; this spec fixes its information content.

The Canonical Blueprint **must** represent, as structured data (not prose):

| Block | Content | Source in v3.0 |
|---|---|---|
| **Identity** | Blueprint id, version, position id, set count, questions-per-set | Header block (§"นักวิชาการศึกษา — กรุงเทพมหานคร") |
| **Document Registry** | The finite set of source documents, each with: id, display name, Tier (1–4) | "Tier Mapping" table |
| **Tier Definitions** | Per Tier: label, min, max (per 100-question base) | "Tier Definitions" table |
| **Distribution Targets** | Per Set × Document: target count; per Set × Difficulty: target; per Set × BlueprintType: target; per Set × Pattern: target | "Distribution Master Table" + per-set difficulty/type/pattern tables |
| **Distribution Constraints** | Global arithmetic: SUM=100 per set; tier min/max; Tier-1 floor (≥30); Tier-4 ceiling (≤25); Anchor rule (+5, ≤1 anchor/set) | "Distribution Constraints" pseudocode |
| **Coverage Rules** | The CR-1…CR-5 rules with enforcement level (Hard/Soft) and the Mandatory-Topic bindings | "Coverage Rules" + "Mandatory Topics (CR-1)" |
| **LO Mapping** | LO1–LO4 with Bloom level, target %, and LO↔BlueprintType correspondence | "Learning Objectives — LO Mapping" |
| **Pattern Layer** | Pattern types, target distribution per set, Pattern×BlueprintType validity matrix | "Question Pattern Layer" |
| **Duplicate Prevention** | L1–L5 rules with scope (within/across set), enforcement level, and the Similarity Metric definition | "Duplicate Prevention Rules" + "Similarity Metric" |
| **Mandatory Topics** | The (Document × Topic) pairs that must appear in every Set | "Mandatory Topics (CR-1)" |

The Canonical Format **must not** represent (out of Engine scope — see §7.2):

- Design rationale (เหตุผล per document)
- Quality Review scores, Realism Assessment, Bias Analysis
- Cross-reference *commentary* (the "เชื่อมโยง" annotations are human aids, not rules)
- The full prose Topic tables (500 rows of `1 | Easy | Memory`) — these are **slot examples / human guidance**, not engine rules. See §7.2.

### 3.4 Layer Independence Guarantees

The Canonical Format is isolated from:

| Concern | Isolation guarantee |
|---|---|
| **Markdown syntax** | The Canonical Format carries no Markdown tokens (no `#`, no `\|`, no `**`). |
| **Markdown layout** | Heading depth, table column order, list bullet style are absent. |
| **Whitespace/formatting** | A reflowed Blueprint v3.0 produces the identical Canonical Format. |
| **Human language of labels** | Display labels (Thai) are preserved for human review only; rule identifiers (Tier-1, LO2, CR-4, Pattern `scenario`) are language-independent enums. |

This is what allows future Blueprints to arrive as JSON or via a visual editor without the Engine noticing.

---

## 4. The `AssemblyRequest` Contract

### 4.1 Role

The `AssemblyRequest` is the **sole input** the Engine accepts. It is produced by normalizing a Canonical Blueprint (§6–§8). The Engine Foundation v1.0 sketches it as carrying: `target_count`, `profile`, `coverage_rules`, `difficulty_rules`, `exclusion_rules`, `constraints`. This section pins those fields to the real Blueprint's axes and removes ambiguity.

### 4.2 Conceptual Shape

The `AssemblyRequest` is a **structured payload of rules and targets** — no prose, no Markdown, no rationale, no per-slot examples. Conceptually:

```
AssemblyRequest
├── identity            (blueprint_id, blueprint_version, profile)
├── run_unit            (BLUEPRINT — see §5.1: the unit is the whole multi-set Blueprint)
├── target              (sets: count; per_set: question_count)
├── document_registry   (the closed set of documents the Engine may draw from,
│                        each tagged with its Tier — Tier is a document property)
├── distribution        (per-set targets: Document × Difficulty × BlueprintType × Pattern)
├── distribution_constraints
│                       (sum, tier min/max, tier floors/ceilings, anchor rule)
├── coverage_rules      (CR-1…CR-5 with enforcement level + mandatory-topic bindings)
├── lo_distribution     (LO1–LO4 targets; LO↔BlueprintType correspondence)
├── duplicate_prevention (L1–L5 with scope, enforcement level, similarity thresholds)
├── exclusions          (already-used Codes, recent Codes, etc. — populated at runtime)
└── meta                (spec_version = "1.0")
```

### 4.3 Field Contracts

Each field is specified by **intent + constraint + source**, so the Reader has no freedom to interpret:

| Field | Intent | Constraint | Source in v3.0 |
|---|---|---|---|
| `identity.blueprint_id` | Stable id of the source Blueprint | Immutable string | Header |
| `identity.blueprint_version` | Blueprint revision | Semantic-ish version (e.g. "3.0") | Header (`Blueprint Version: 3.0.0`) |
| `identity.profile` | Assessment Profile | Enum; v1.0 = `simulation` only | Header (implied by title) |
| `run_unit` | What one Engine run produces | Enum: `blueprint` (multi-set) — **NOT** `exam_set` (single set) | §"Distribution Master Table" (5 interdependent sets) |
| `target.sets` | Number of interdependent Sets in this run | Integer (v3.0: 5) | Header (`5 ชุด`) |
| `target.per_set` | Questions per Set | Integer (v3.0: 100) | Header (`100 ข้อ/ชุด`) |
| `document_registry` | Closed set of documents | List; each entry = `{id, name, tier}` where `tier ∈ {1,2,3,4}` | "Tier Mapping" |
| `distribution[set]` | Per-Set targets | 4 sub-targets: by Document, by Difficulty, by BlueprintType, by Pattern | Master Table + per-set tables |
| `distribution_constraints` | Arithmetic invariants | `{sum_per_set, tier_min_max, tier1_floor, tier4_ceiling, anchor}` | "Distribution Constraints" pseudocode |
| `coverage_rules` | CR-1…CR-5 | Each = `{id, level ∈ {hard, soft}, binding}` | "Coverage Rules" + "Mandatory Topics" |
| `lo_distribution` | LO1–LO4 mix | Per-set % targets + LO↔BlueprintType map | "LO Mapping" |
| `duplicate_prevention` | L1–L5 | Each = `{id, scope ∈ {within_set, across_set}, level, similarity_threshold?}` | "Duplicate Prevention" + "Similarity Metric" |
| `exclusions` | Runtime-only Codes to skip | Populated at runtime (not from Blueprint) | n/a (Engine Foundation) |
| `meta.spec_version` | This spec's version | Constant `"1.0"` | This document |

### 4.4 What the `AssemblyRequest` Deliberately Omits

The following are present in the Blueprint but **must not** appear in the `AssemblyRequest`, because they are either non-actionable or out of Engine scope:

- **Per-slot Topic tables** (the 500 rows of `1 | Easy | Memory`). These are *illustrative* distributions the Blueprint's author produced to demonstrate feasibility — they are not rules. The Engine re-derives its own selection per the distribution targets and coverage rules. Including them would make the Engine a *replicator*, not an *assembler*.
- **Rationale prose** (เหตุผล columns). Human context only.
- **Quality / Bias / Realism assessments.** Authoring-time QA, not runtime rules.
- **Cross-reference commentary** ("เชื่อมโยง ม.41 กับ พ.ร.บ.ระเบียบ กทม."). Human reading aids. (Whether cross-document linking becomes an Engine axis is a v2 question — see §11.)

---

## 5. Critical Reconciliation: Blueprint Reality vs. Engine Foundation

This section is the heart of the document. Engine Foundation v1.0 was written without seeing Blueprint v3.0; the Blueprint contains things the Engine sketch did not anticipate. This specification reconciles them — it does not paper over them.

### 5.1 The Run Unit: `blueprint`, not `exam_set` (Critical)

**Engine Foundation v1.0 says:** *"One Blueprint in → one Draft Exam Set out."* (§10, Phase A.)

**Blueprint v3.0 says:** A single Blueprint produces **5 interdependent Sets** governed by cross-Set rules: CR-3 ("Topic + Difficulty + Type เดียวกัน ห้ามปรากฏเกิน 5 Set"), L3, L4, L5.

**Reconciliation:** The `AssemblyRequest.run_unit = blueprint`. One Engine run produces `target.sets` (5) Draft Exam Sets that must be **co-allocated** to satisfy cross-Set rules. The Engine's internal module structure (per Engine Foundation) is unchanged; the Candidate Generator and Ranking operate over a **multi-Set allocation state**, not per-Set in isolation.

**Impact on Engine Foundation:** None to its module contracts; the change is internal to how the Generator and Ranker hold state. The `AssemblyRequest` simply declares the run unit, and the Engine honors it. This is recorded, not designed here (Engine internals are out of scope for this spec).

### 5.2 Tier Is a Document Property, Not a Question Property (Critical)

**Engine Foundation v1.0** treats all filtering as question-metadata filtering.

**Blueprint v3.0** assigns Tier (1–4) to **Documents**, not to Questions. The Tier constraints (`tier.min/max`, `tier1_floor ≥ 30`, `tier4_ceiling ≤ 25`) therefore aggregate over the *Document* a Question belongs to.

**Reconciliation:** The `AssemblyRequest.document_registry` carries each document's Tier as an intrinsic property. The Engine resolves a candidate's Tier by looking up its `document` in the registry. This is a **derivation rule**, not new Bank schema — but it requires the candidate's `document` to be reliably set on every Question in the Bank (see §9, Integration Gap IG-1).

### 5.3 Distribution Constraints Are a Constraint-Satisfaction Problem (Critical)

**Engine Foundation v1.0** describes Candidate Generation as "pure SQL/metadata queries."

**Blueprint v3.0** specifies a system of arithmetic invariants that cannot be expressed as a `WHERE` clause:
```
SUM(documents) = 100  AND  ∀ document: tier.min ≤ count ≤ tier.max
                  AND  SUM(tier_1) ≥ 30  AND  SUM(tier_4) ≤ 25
                  AND  exactly one anchor: +5 above tier.max, ≤1/set
```

**Reconciliation:** This is **out of scope for the Integration Specification** — it is an Engine-internal concern (how the Generator/Ranker satisfy constraints). But the `AssemblyRequest` must **carry** these constraints verbatim (in `distribution_constraints`), so the Engine has what it needs. How the Engine solves them is the Engine's business (Engine Foundation v1.1, future).

### 5.4 Blueprint Axes the Bank Does Not Persist (Critical — Recorded, Not Solved Here)

Blueprint v3.0 filters and scores on axes that the Question Bank (as of Session 6.16) does **not** store: `blueprint_type` (Memory/Concept/Procedure/Scenario), `learning_objective` (LO1–LO4), `question_pattern` (Positive/Negative/Best Answer/Scenario/Sequence/Matching), `section` (มาตรา, e.g. ม.6–8).

**Reconciliation:** The `AssemblyRequest` **declares** these axes (they appear in `distribution`, `lo_distribution`, `pattern`, `duplicate_prevention`). Whether the Bank can actually satisfy them is a **Bank readiness** question, not an Integration question. This is recorded as Integration Gap IG-2 (§9) and escalated; it is **not** silently weakened.

**This spec's contract:** The `AssemblyRequest` is honest about what the Blueprint demands. If the Bank cannot satisfy it, the Engine fails safe and loud (per Engine Foundation §7) — it does not silently drop axes.

### 5.5 The Similarity Metric Needs a Keyword Axis (Recorded)

Blueprint v3.0's Similarity Metric uses `keyword_sim = jaccard(keywords_a, keywords_b)`. The Bank has no dedicated keyword axis (only `tags`/`category`).

**Reconciliation:** The `AssemblyRequest.duplicate_prevention` carries the similarity definition and thresholds **as specified by the Blueprint**. Whether the Bank can compute it is Bank readiness (IG-2). The Integration Spec does not rewrite the metric.

### 5.6 Self-Inconsistency in the Source Blueprint (Recorded)

Blueprint v3.0's L1 rule ("Topic + Difficulty + Type เดียวกัน = ห้ามซ้ำ" within a Set, Hard) appears violated by the Blueprint's own Set-1 table, where "ความมุ่งหมายและหลักการจัดการศึกษา (ม.6–8)" appears twice as Easy/Memory.

**Reconciliation:** This is a **Blueprint authoring inconsistency**, not an Integration ambiguity. The `AssemblyRequest` encodes L1 as stated. The Engine (per Engine Foundation §7) fails safe and loud when the rule cannot be satisfied, surfacing the conflict to Human Review. The Integration Spec does **not** silently relax L1 to accommodate the Blueprint's inconsistency — that would violate Business Intent Preservation.

---

## 6. Transformation: Canonical Blueprint → AssemblyRequest

This section defines the **transformation contract** between the two representations. The Reader (next session) implements it; this spec fixes its semantics.

### 6.1 Transformation Principles

| # | Principle | Meaning |
|---|---|---|
| T1 | **Meaning-preserving** | A rule's semantics in the Canonical Format equals its semantics in the `AssemblyRequest`. Only representation changes. |
| T2 | **Strictly reductive** | The output never carries more information than the input. Rationale, examples, and commentary are dropped, never added. |
| T3 | **Terminology-standardizing** | Free-text labels normalize to enums (`Tier 1: Core` → `tier=1`; `Hard — Fail` → `level=hard`). |
| T4 | **Presentation-stripping** | All Markdown/layout artifacts vanish. |
| T5 | **No inference** | Missing required information → fail (Engine Foundation Principle 4). Never guessed. |

### 6.2 What Is Transformed (Mapped)

| Canonical Block | → | `AssemblyRequest` Field | Transformation |
|---|---|---|---|
| Identity | → | `identity`, `target` | Direct copy of scalars |
| Document Registry | → | `document_registry` | Each document keeps `{id, name, tier}`; rationale dropped |
| Distribution Targets | → | `distribution[set]` | Tables → keyed targets per axis |
| Distribution Constraints | → | `distribution_constraints` | Pseudocode → structured invariants |
| Coverage Rules | → | `coverage_rules` | Prose + level → `{id, level, binding}` |
| LO Mapping | → | `lo_distribution` | Table → targets + LO↔Type map |
| Pattern Layer | → | `distribution[set].pattern` + validity matrix | Tables → keyed targets |
| Duplicate Prevention | → | `duplicate_prevention` | Rules + metric → `{id, scope, level, threshold}` |
| Mandatory Topics | → | `coverage_rules[CR-1].binding` | Topic list → binding data |

### 6.3 What Is Dropped (and Why)

| Dropped Content | Reason |
|---|---|
| เหตุผล (rationale) columns | Human context; not a rule |
| Quality Review / Bias / Realism sections | Authoring-time QA |
| Per-slot Topic example tables (500 rows) | Illustrative demonstration, not rules (§4.4) |
| Cross-reference prose commentary | Human reading aid |
| Version-change notes (หมายเหตุการปรับปรุง) | Authoring provenance |
| Section headings, table captions, footnotes | Presentation |

**The reduction is large by design.** A 956-line Blueprint becomes an `AssemblyRequest` whose size is proportional to *(sets × axes × documents)* — for v3.0, roughly 5 × 4 × 12 = a few hundred structured fields, with zero prose. This is the token-efficiency payoff (§8).

---

## 7. Reader Boundaries (Pre-specification for the Next Session)

The Reader Architecture v1.0 (next session) will be designed against this section. It defines the Reader's contract *shape*, not its implementation.

### 7.1 The Reader CAN

- Parse a Blueprint document into a Canonical Blueprint (Markdown today; JSON/YAML/editor tomorrow — format-specific adapters).
- Validate structure and semantics.
- Normalize the Canonical Blueprint into an `AssemblyRequest` per §6.
- Reject invalid Blueprints with structured errors.
- Carry version metadata so future Blueprint versions can be supported without Engine redesign.

### 7.2 The Reader CANNOT

- Select, rank, or filter Questions. (Engine's job.)
- Access the Question Bank. (Engine's job.)
- Generate, edit, or rewrite Questions. (Forbidden to the entire Assessment System — Engine Foundation §1.)
- Generate Exam Sets or Drafts. (Engine's job.)
- Modify the Blueprint's business meaning. (T1: meaning-preserving only.)

### 7.3 The Reader MUST NEVER

- Read Markdown directly inside the Engine. (Engine Foundation anti-pattern.)
- Embed business rules in the parser. (Single Responsibility.)
- Perform SQL. (No DB access.)
- Invoke an LLM. (Reader is fully deterministic — Engine Foundation §9.)
- Hold runtime state. (Stateless transformation.)
- Silently repair an invalid Blueprint. (Fail Fast — Engine Foundation Principle 4.)
- Infer missing required information. (T5.)
- Couple to Markdown formatting specifics. (Version Independence — Engine Foundation Principle 5.)

### 7.4 The Reader MUST ALWAYS

- Produce a deterministic `AssemblyRequest` for a given Canonical Blueprint. (Engine Foundation Principle 2.)
- Preserve business intent. (T1.)
- Reduce, never expand. (T2.)
- Fail fast, fail loud, fail deterministically. (Engine Foundation §7.)
- Tag output with `meta.spec_version`. (§10.)

The Reader is a **pure transformation layer**. It is the only component permitted to know that Markdown exists.

---

## 8. Token Flow Analysis

Per Engine Foundation Principle (Token Efficiency), each transformation must reduce token cost while preserving meaning.

| Stage | Representation | Relative Size | Reduction Mechanism |
|---|---|---|---|
| **Blueprint v3.0 (Markdown)** | Prose + tables + rationale + examples | **Baseline (large)** | — |
| → *Document Reader + AST* | Structural tree (no prose) | ~30–40% of source | Strip prose, headings, captions; keep only rule-bearing structures |
| → *Canonical Blueprint* | Structured rules (no Markdown) | ~10–15% of source | Standardize terminology; drop rationale, QA, examples |
| → *AssemblyRequest* | Engine-input contract | ~5–10% of source | Drop cross-reference commentary; carry only rule + target data |

**Expected end-to-end reduction:** the `AssemblyRequest` is roughly **5–10% the token size of the source Blueprint**, with **100% of the rule semantics preserved** and **0% of the prose carried**.

**Why each cut is safe:**
- AST stage cuts prose because prose carries no rules.
- Canonical stage cuts rationale/examples because the Engine re-derives selection from rules, not from the author's worked example.
- `AssemblyRequest` stage cuts cross-reference commentary because cross-document linking is not yet an Engine axis (§11).

**Scaling posture (consistent with Engine Foundation §9.4):** `AssemblyRequest` size scales with *(sets × axes × documents)*, **not** with Blueprint prose length. A v4 Blueprint with twice the rationale but the same rule structure produces the same-size `AssemblyRequest`.

---

## 9. Integration Gaps (Escalation Register)

These are **honest records** of things this specification cannot resolve because they live in adjacent layers (Bank, Engine internals, or Blueprint authoring). Per the prompt's rule — *"If inconsistencies exist, DO NOT invent behavior"* — they are surfaced, not hidden.

| ID | Gap | Layer | Impact | Recommended Resolution |
|---|---|---|---|---|
| **IG-1** | Tier is a Document property; the Bank's `questions.document` is free-text and may not match the Blueprint's Document Registry names exactly. | Bank | Candidate Generator cannot reliably resolve a Question's Tier. | Either (a) normalize `document` values via the deferred documents table (migration 019 flagged this), or (b) embed an explicit Document-name alias map in the Canonical Blueprint. **Decision deferred to Bank schema work.** |
| **IG-2** | Blueprint axes `blueprint_type`, `learning_objective`, `question_pattern`, `section` (มาตรา) are not persisted on Bank Questions. The importer already parses `blueprint`, `question_type`, `learning_objective` from Content Template v2.1 and discards them. | Bank | Candidate Generator cannot filter/score on the Blueprint's primary distribution axes. | Extend Bank schema to persist these axes; stop the importer's discard. **Prerequisite P0 for any Engine run against v3.0.** |
| **IG-3** | Blueprint axes `keyword_set` (for Jaccard similarity) is not in the Bank. | Bank | Duplicate Prevention's similarity metric cannot be computed as specified. | Either persist `keyword_set` or define a derivation rule (e.g. from `tags`/`category`). **Decision deferred.** |
| **IG-4** | Blueprint v3.0's L1 rule appears self-violated by its own Set-1 table. | Blueprint authoring | Engine may be unable to satisfy L1 as stated. | Blueprint author reconciles, **or** the Engine fails safe and surfaces the conflict to Human Review (Engine Foundation §7). This spec does **not** relax L1. |
| **IG-5** | The distribution constraints (sum=100, tier floors/ceilings, anchor rule) form a constraint-satisfaction problem the Engine must solve. Engine Foundation v1.0 described Candidate Generation as "pure SQL." | Engine internals | Engine may need a constraint solver stage (greedy + backtracking, or ILP). | Engine Foundation v1.1. **Out of scope here** — this spec carries the constraints; the Engine solves them. |

**None of these gaps block this specification.** They block *Engine execution* against v3.0 until IG-1/IG-2 are resolved. The specification's job is to declare the contract honestly; the Bank/Engine gaps are now visible and ownable.

---

## 10. Versioning Strategy

### 10.1 The Four Versions

```
Blueprint Version  (e.g. 3.0)        — what the human authored
        ↓
Reader Version     (e.g. 1.x)        — the adapter that knows the source format
        ↓
Canonical / AssemblyRequest Version  — this spec's contract (currently 1.0)
        ↓
Engine             (Foundation v1.0) — immutable consumer
```

### 10.2 Independence Contract

- **Blueprint Version** may change freely (v3.0 → v4.0). Changes to *format* (Markdown → JSON) or *structure* (new sections) are absorbed by the **Reader Version**, never by the Engine.
- **Reader Version** may change freely. It is the only component that knows Markdown exists. A new Reader for v4 may ship without touching this spec or the Engine.
- **This spec's version (`meta.spec_version`)** changes only when the `AssemblyRequest` *contract* changes (new fields, new axes, new rules). v1.0 → v2.0 means the Engine must learn new fields.
- **Engine Foundation** is immutable per its own spec; it consumes whatever `AssemblyRequest` version the Reader produces, ignoring fields it doesn't understand (forward compatibility) and failing loud on fields it requires but doesn't receive (fail-fast).

### 10.3 How Blueprint v4 Ships Without Engine Redesign

1. Author Blueprint v4 (any format).
2. Write (or extend) a Reader v1.x that emits the existing `AssemblyRequest` v1.0 contract. → Engine unchanged.
3. *If* v4 introduces a genuinely new axis (e.g. "time-pressure tier"), bump this spec to v2.0, add the field to `AssemblyRequest`, and the Engine extends — it does not rewrite.

The isolation boundary is the `AssemblyRequest`. Everything upstream of it is swappable.

---

## 11. Future Extensibility

### 11.1 Source Formats (next session and beyond)

The Canonical Format + `AssemblyRequest` are source-format-agnostic. The Reader (next session) defines **format adapters**:

| Source | Adapter | Engine impact |
|---|---|---|
| Markdown (v3.0, today) | Markdown → Canonical | None |
| JSON | JSON → Canonical | None |
| YAML | YAML → Canonical | None |
| Visual editor | Editor model → Canonical | None |

Because the `AssemblyRequest` is fixed by this spec, no source-format change reaches the Engine.

### 11.2 Future Axes (v2 of this spec)

Axes recorded as candidates for v2 (deliberately **not** in v1.0):
- **Cross-document linking** as a first-class Engine axis (today: dropped commentary; tomorrow: a real rule).
- **Time-pressure / adaptive difficulty** (future Profiles).
- **Coverage analytics** as an output (today: out of scope per Engine Foundation).

Each would bump `meta.spec_version` to v2.x and add a field to `AssemblyRequest`. The Engine extends; it does not rewrite.

### 11.3 Future Profiles

Per Engine Foundation §8.1, Profiles extend, not fork. `identity.profile` carries the Profile; v1.0 = `simulation` only. New Profiles (Diagnostic, Weekly Challenge, etc.) are new values of this field plus Profile-specific rule sets inside the `AssemblyRequest` — not new specifications.

---

## 12. Boundary Assertions

The non-negotiable contracts of this specification. Any future change must be evaluated against them.

1. The Engine **never** reads Markdown. The Canonical Blueprint and `AssemblyRequest` exist to guarantee this.
2. The `AssemblyRequest` is the **sole** Engine input contract. It is versioned (`meta.spec_version = "1.0"`).
3. The transformation Canonical → `AssemblyRequest` is **meaning-preserving and strictly reductive** (T1, T2). Information only leaves; it never enters.
4. The Reader is the **only** component permitted to know that Markdown exists.
5. The run unit is the **Blueprint** (multi-set), not the Exam Set. One run = `target.sets` co-allocated Drafts.
6. **Tier is a Document property.** Candidates derive Tier via the Document Registry.
7. The `AssemblyRequest` **honestly declares** all Blueprint axes (including those the Bank cannot yet satisfy, IG-2). It never silently drops an axis to accommodate Bank gaps.
8. **Blueprint authoring inconsistencies** (e.g. IG-4) are surfaced to Human Review, not silently relaxed.
9. **Version isolation** is absolute at the `AssemblyRequest` boundary: Blueprint vN and Reader vN.x may change freely; the Engine changes only when this spec versions up.

---

## Appendix A — Glossary

| Term | Definition |
|---|---|
| **Blueprint** | The human-authored assessment specification. Today: Markdown v3.0. |
| **Canonical Blueprint Format** | The machine-readable, Markdown-independent, structured representation of a Blueprint. Defined conceptually in §3; syntax owned by Reader Architecture v1.0. |
| **`AssemblyRequest`** | The sole Engine input contract. Versioned. Defined in §4. |
| **Reader** | The component that transforms Blueprint → Canonical → `AssemblyRequest`. Architecture specified next session against this document. |
| **Tier** | A property of a **Document** (1=Core, 2=Domain, 3=Supporting, 4=Supplementary), used for distribution constraints. Not a property of Questions. |
| **Run Unit** | What one Engine run produces. v1.0: `blueprint` (multi-set). |
| **Integration Gap (IG)** | An honest record of something this spec cannot resolve because it lives in an adjacent layer (Bank, Engine internals, or Blueprint authoring). §9. |
| **LO** | Learning Objective (LO1–LO4), mapped to Bloom levels and Blueprint Types. |
| **Pattern** | Question Pattern (Positive/Negative/Best Answer/Scenario/Sequence/Matching Concept). |

---

## Appendix B — Provenance

- **Engine alignment:** Every contract here defers to Engine Foundation v1.0 on Engine-input questions. No Engine module contract is altered.
- **Blueprint fidelity:** Every business rule in Blueprint v3.0 is either (a) carried into the `AssemblyRequest` verbatim, or (b) explicitly listed as dropped (§6.3) with reason. No rule is silently reinterpreted.
- **Honesty:** Five Integration Gaps (§9) are recorded rather than hidden. IG-2 is the P0 prerequisite for any Engine run against v3.0.

---

*End of Sobdai Blueprint Integration Specification — v1.0.*

**Next session:** Blueprint Reader Architecture v1.0, designed exclusively against this specification + Engine Foundation v1.0.
