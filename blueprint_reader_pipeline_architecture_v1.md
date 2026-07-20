# Sobdai Blueprint Reader Pipeline Architecture — v1.0

**Status:** Official Architecture Specification (Architecture only — no implementation, no parser code, no SQL, no schema, no runtime code)
**Sources of truth (exhaustive, immutable):**
1. `assessment_assembly_engine_foundation_v1.md` — Assessment Assembly Engine Foundation v1.0
2. `blueprint_integration_specification_v1.md` — Blueprint Integration Specification v1.0
3. `Blueprint/simulation_exam_blueprint.md` — Assessment Blueprint v3.0
**Version:** 1.0
**Owner:** Sobdai Architecture

> **What this document owns.** The Integration Specification v1.0 defined the Reader's *boundary contract* (what it consumes, what it emits, what it may never do). This document owns the Reader's **internal pipeline** — the stages and intermediate representations that turn a Blueprint document into an `AssemblyRequest`. Where the Integration Spec said *"the Reader transforms Blueprint → Canonical → AssemblyRequest,"* this spec says **how**, stage by stage.
>
> **What this document does not own.** The Engine (immutable). The `AssemblyRequest` contract (fixed by Integration Spec v1.0). The Blueprint's business content (owned by Blueprint v3.0). The canonical Blueprint format's *information content* (fixed by Integration Spec §3). Parser implementation, syntax choice, and Markdown-library selection are explicitly out of scope — this is architecture, not implementation.

---

## 0. Executive Summary

The Blueprint Reader is a **pure, stateless, deterministic transformation pipeline** that isolates the Engine from the existence of Markdown. It accepts a human-authored Blueprint document and emits the single `AssemblyRequest` the Engine consumes. In between, it produces **two distinct Abstract Syntax Trees** and **one canonical intermediate**, each with a single responsibility:

```
Blueprint Document (Markdown, today)
        │
        ▼
   Document Reader          ─── parses source format
        │
        ▼
   Markdown AST             ─── document structure only, NO business meaning
        │
        ▼
   Blueprint AST            ─── business meaning, NO document syntax
        │
        ▼
   Structural Validation    ─── shape/hierarchy/reference checks
        │
        ▼
   Semantic Validation      ─── rule consistency / feasibility checks
        │
        ▼
   Normalization            ─── standardize, deduplicate, strip presentation
        │
        ▼
   Canonical Blueprint      ─── stable, format-independent business structure
        │
        ▼
   AssemblyRequest          ─── Engine input contract (Integration Spec v1.0)
```

The defining architectural decision is the **two-AST split**. Markdown AST and Blueprint AST are kept strictly separate because they answer different questions: *“what does the document look like?”* vs. *“what is the business saying?”* Coupling them would mean every Markdown cosmetic change is a business-rule change, and every future source format (JSON, YAML, visual editor) would require re-deriving business meaning from scratch. The split makes both stability and format-independence achievable.

The pipeline is **reductive at every stage** (Token Efficiency, §13): prose is stripped at the AST boundary, examples and rationale are stripped at normalization, and the final `AssemblyRequest` carries only the rule and target data the Engine needs — roughly 5–10% of the source Blueprint's token weight, with 100% of its rule semantics.

The Reader is the **only component in the entire Assessment System** that is permitted to know Markdown exists. Everything downstream sees only structured data.

---

## 1. Reader Overview

### 1.1 Purpose

To be the sole, hermetic boundary between **Business Documents** (human-authored, presentation-bearing, version-evolving) and **Engine Contracts** (machine, deterministic, stable). The Reader exists so the Engine never has to understand Markdown — or any future source format.

### 1.2 Ownership

The Reader owns **one thing**: the transformation *Blueprint document → `AssemblyRequest`*. It does not own the Blueprint's content (authors do), the `AssemblyRequest`'s contract (Integration Spec v1.0 does), or anything the Engine does with the result.

Within that one transformation, the Reader owns:
- The source-format adapter (Markdown today; JSON/YAML/editor tomorrow).
- Both ASTs and the validation/normalization logic between them.
- The Canonical Blueprint intermediate.
- The final reduction to `AssemblyRequest`.

### 1.3 Lifecycle

The Reader is **stateless and synchronous** within a single run:

- **Invocation:** one Blueprint document in.
- **Processing:** deterministic pipeline (§2).
- **Termination:** either an `AssemblyRequest` out, or a structured error (§11). No intermediate state persists between runs.
- **Re-runs:** identical input always yields identical output (Principle 2 — Determinism).

The Reader has **no lifecycle of its own** — it is invoked, it transforms, it returns. It holds no runtime state, no caches that affect output, no background processes. (Caching is permitted only as a performance optimization that is transparent to output — same input, same output, regardless of cache state.)

### 1.4 Responsibilities

| The Reader IS responsible for | The Reader is NOT responsible for |
|---|---|
| Parsing the source document into structural form | Authoring or editing the Blueprint |
| Extracting business meaning into a stable AST | Selecting, ranking, or filtering Questions |
| Validating structure and semantics of the Blueprint | Accessing the Question Bank |
| Normalizing terminology and dropping presentation | Generating, editing, or rewriting Questions |
| Producing the `AssemblyRequest` | Generating Exam Sets or Drafts |
| Failing fast/loud/deterministically on invalid input | Inferring missing rules |
| Carrying version metadata end-to-end | Modifying business meaning |

### 1.5 Boundaries (summary — full matrix in §14)

- **CAN:** parse, validate, normalize, transform, reject.
- **CANNOT:** touch the Bank, the Engine, or the Draft.
- **MUST NEVER:** invoke an LLM, perform SQL, hold runtime state, silently repair, infer missing data, or let business meaning depend on Markdown layout.
- **MUST ALWAYS:** produce deterministic output, preserve business intent, reduce (never expand), and fail loud.

---

## 2. Pipeline Overview

Eight stages, each with exactly one responsibility (Principle 3 — Layer Isolation). Each stage is a **pure function** of its input; given the same input, it always produces the same output.

### 2.1 Stage Map

| # | Stage | Responsibility | Input → Output | LLM? |
|---|---|---|---|---|
| 1 | **Document Reader** | Parse source format into document structure | Blueprint source → Markdown AST | No |
| 2 | *(Markdown AST)* | Intermediate: document structure | — | No |
| 3 | **AST Projection** | Project document structure into business meaning | Markdown AST → Blueprint AST | No |
| 4 | **Structural Validation** | Validate shape, hierarchy, references | Blueprint AST → Blueprint AST (or error) | No |
| 5 | **Semantic Validation** | Validate rule consistency, feasibility | Blueprint AST → Blueprint AST (or error) | No |
| 6 | **Normalization** | Strip presentation, deduplicate, standardize | Blueprint AST → Canonical Blueprint | No |
| 7 | *(Canonical Blueprint)* | Intermediate: stable, format-independent business structure | — | No |
| 8 | **AssemblyRequest Generation** | Reduce Canonical to Engine input contract | Canonical Blueprint → `AssemblyRequest` | No |

**Every stage is LLM-free, SQL-free, and Bank-free.** The Reader is the most deterministic component in the Assessment System — by design, it cannot surprise.

### 2.2 Stage Contracts

| Stage | Input | Output | Responsibility | Owner |
|---|---|---|---|---|
| Document Reader | Raw Blueprint source | Markdown AST | Faithfully represent document structure | Reader |
| AST Projection | Markdown AST | Blueprint AST | Extract business meaning, discard document syntax | Reader |
| Structural Validation | Blueprint AST | Blueprint AST (pass) or Error | Shape/hierarchy/reference integrity | Reader |
| Semantic Validation | Blueprint AST | Blueprint AST (pass) or Error | Rule consistency and feasibility | Reader |
| Normalization | Blueprint AST | Canonical Blueprint | Standardize, deduplicate, strip presentation | Reader |
| AssemblyRequest Generation | Canonical Blueprint | `AssemblyRequest` | Reduce to Engine contract | Reader (contract owned by Integration Spec) |

**Two invariants span the pipeline:**
1. **Information only leaves; it never enters.** Every stage's output carries a subset (semantic or token-wise) of its input. No stage adds rules, infers missing data, or invents structure. (This is the operational form of Principle 1 — Business Intent Preservation.)
2. **Each stage's output is independently inspectable.** Every intermediate (Markdown AST, Blueprint AST, Canonical Blueprint) is a stable, named artifact. This is what makes debugging, versioning (§12), and future source-format support (§13 of Integration Spec) tractable.

---

## 3. Markdown AST

### 3.1 Purpose

The Markdown AST is a **faithful structural representation of the source document**. It answers exactly one question: *"What does this document look like?"* — headings, tables, lists, code blocks, prose — independent of the bytes that produced it.

It is the **first thing** the Reader produces and the **only place** where source-format concepts exist. Everything downstream of it is format-independent.

### 3.2 What Belongs Inside

The Markdown AST carries **document structure only**:

- **Block structure:** headings (with depth), paragraphs, lists (ordered/unordered), blockquotes, code blocks, thematic breaks.
- **Table structure:** rows, cells, header row, caption (if any).
- **Inline structure:** emphasis, links, code spans — *as syntax*, not as meaning.
- **Raw text:** the literal text content of each node, unmodified.
- **Position information:** source location (line/line-range) for each node — **critical for error reporting (§11)**.

### 3.3 What Must NEVER Exist There

The Markdown AST is explicitly **not** a business representation. It must **never** carry:

- ❌ Business meaning. A row that *happens to be* the Tier Definitions table is, in the Markdown AST, just a table with cells. The AST does not know it is "Tier Definitions."
- ❌ Semantic typing. No node is labeled "Distribution Target" or "Coverage Rule" — those are Blueprint AST concepts.
- ❌ Normalized values. Cell text is preserved verbatim; `"13–20"` stays `"13–20"`, not `{min:13, max:20}`.
- ❌ Inferred relationships. If two tables refer to the same Document, the Markdown AST does not connect them — that is a Blueprint AST relationship.
- ❌ Validation state. The Markdown AST is a parse result, not a judgment.
- ❌ Cross-references beyond what the source literally contains (e.g. resolved links).

### 3.4 Why This Discipline Matters

If the Markdown AST carries business meaning, then **every Markdown cosmetic change becomes a business-rule change**. A table reformat, a heading rewrite, or a whitespace reflow in Blueprint v3.x would silently alter Engine behavior — violating Principle 1 (Business Intent Preservation) and Principle 2 (Determinism). Keeping the Markdown AST purely structural ensures that business meaning is **derived** from structure in a separate, owned stage (§4), where the derivation rules are explicit and inspectable.

### 3.5 Position Is Non-Negotiable

Every Markdown AST node carries its source line range. This is the **only way** the Reader can produce useful errors downstream ("Coverage Rules section missing" is far less actionable than "Coverage Rules section expected after line 128, not found"). Without position, Fail Loud (§11) degrades to "something is wrong somewhere."

---

## 4. Blueprint AST

> This is the most important deliverable of this specification.

### 4.1 Purpose

The Blueprint AST is the **business-meaning representation** of the Blueprint. It answers exactly one question: *"What is this Blueprint saying, as rules and targets?"* — independent of the document that expressed it.

It is produced by **projecting** the Markdown AST: identifying which structural elements carry which business meaning, and constructing typed business nodes from them. After projection, the Markdown AST is no longer needed.

### 4.2 The Core Design Property: Format Independence

The Blueprint AST is the **stable substrate** that survives source-format evolution. The contract:

> The same Blueprint, authored as Markdown, JSON, YAML, or via a visual editor, produces the **same Blueprint AST**.

This is achievable because the Blueprint AST's nodes are **business concepts**, not document concepts. A `TierDefinition` node is a `TierDefinition` node regardless of whether the source expressed it as a Markdown table, a JSON object, or a visual-editor form. Each source format has its own projection adapter (Markdown → Blueprint AST, JSON → Blueprint AST, …); the AST itself is invariant.

This is the architectural payoff of the two-AST split: **format change is absorbed at the projection boundary, nowhere else.**

### 4.3 Business Objects (Concepts — Not Implementation Classes)

The Blueprint AST is composed of **business object concepts**. The list below is the conceptual vocabulary the AST must be able to express, derived from Blueprint v3.0's actual content. (Concrete node shapes are an implementation concern, owned by the implementation phase — this spec fixes the *concept inventory* and the *relationships*, not class signatures.)

| Business Object | What It Represents | Source in v3.0 |
|---|---|---|
| **BlueprintIdentity** | id, version, position, profile, set count, questions-per-set | Header block |
| **DocumentEntry** | A source document: id, display name | "Tier Mapping" left column |
| **TierAssignment** | Binds a Document to a Tier (1–4) | "Tier Mapping" right column |
| **TierDefinition** | Per Tier: label, min, max (base-100) | "Tier Definitions" |
| **DistributionConstraint** | Global arithmetic: sum-per-set, tier floor/ceiling, anchor rule | "Distribution Constraints" pseudocode |
| **DistributionTarget** | Per (Set × Axis × Bucket): target count. Axes = Document, Difficulty, BlueprintType, Pattern | Master Table + per-set tables |
| **CoverageRule** | A CR-n rule: id, enforcement level, human description, structured binding | "Coverage Rules" |
| **MandatoryTopicBinding** | A (Document × Topic) pair that must appear in every Set | "Mandatory Topics (CR-1)" |
| **LearningObjective** | An LO node: id, Bloom level, target %, LO↔BlueprintType correspondence | "LO Mapping" |
| **PatternDefinition** | A question pattern: id, target range, validity against BlueprintTypes | "Question Pattern Layer" |
| **DuplicatePreventionRule** | An L-n rule: id, scope, enforcement level, similarity threshold (if any) | "Duplicate Prevention Rules" |
| **SimilarityMetric** | The pairwise similarity formula and thresholds (BLOCK/WARN/PASS) | "Similarity Metric" pseudocode |

### 4.4 Hierarchy

The Blueprint AST is **rooted at the Blueprint** and organized by business section, not by document order:

```
BlueprintAST
├── identity           (BlueprintIdentity)
├── documents          (DocumentEntry + TierAssignment, resolved)
├── tiers              (TierDefinition × 4)
├── distribution
│   ├── constraints    (DistributionConstraint)
│   └── targets[set]   (DistributionTarget, per axis)
├── coverage
│   ├── rules          (CoverageRule × n)
│   └── mandatory      (MandatoryTopicBinding × n)
├── learning_objectives (LearningObjective × 4)
├── patterns           (PatternDefinition × n)
└── duplicate_prevention
    ├── rules          (DuplicatePreventionRule × n)
    └── similarity     (SimilarityMetric)
```

The hierarchy is **business-logical**, not document-structural. If Blueprint v4 reorders the Markdown sections, the Blueprint AST is unchanged.

### 4.5 Relationships

Business objects reference each other by **stable business identity**, never by document position:

- A `DistributionTarget` references a `DocumentEntry` by document id, not by row number.
- A `MandatoryTopicBinding` references a `DocumentEntry` by id.
- A `TierAssignment` binds a `DocumentEntry` to a `TierDefinition`.
- A `LearningObjective` references `BlueprintType` values (an enum).
- A `PatternDefinition` references `BlueprintType` values via a validity matrix.

**Referential integrity is checked at Structural Validation (§6)** — broken references (e.g. a DistributionTarget pointing at a document not in the registry) are structural errors.

### 4.6 What the Blueprint AST Deliberately Does NOT Carry

- ❌ Source positions are **optional metadata**, not primary identity. (Carried for error reporting; not part of business meaning.)
- ❌ Original Markdown — long gone. The AST is born format-independent.
- ❌ Display labels for engine purposes. Thai labels are preserved as human-facing metadata on relevant nodes (e.g. `DocumentEntry.display_name`), but rule identifiers (`tier=1`, `level=hard`) are language-independent enums.
- ❌ Authoring rationale. เหตุผล columns do not become AST nodes (they are dropped at projection — see §8 Normalization for the formal rule).
- ❌ Per-slot example rows. The 500 illustrative topic rows in v3.0 are **not** AST nodes — they are authoring-time demonstrations, not rules (Integration Spec §4.4).

### 4.7 Stability Contract

The Blueprint AST is the **most stable** of the Reader's artifacts. Its business-object vocabulary changes only when:
- A new Blueprint version introduces a genuinely new business concept (e.g. a new rule family, a new distribution axis), or
- This spec versions up (§12).

It does **not** change when:
- The Markdown format changes (absorbed by the projection adapter).
- A new source format is added (new adapter, same AST).
- Display labels are edited (cosmetic).
- Sections are reordered (the AST is business-logical, not document-ordered).

---

## 5. AST Separation

### 5.1 Why Two ASTs

The Markdown AST and the Blueprint AST are kept strictly separate because **they are answers to different questions, owned by different forces, and changed by different events**:

| | Markdown AST | Blueprint AST |
|---|---|---|
| **Question it answers** | What does the document look like? | What is the business saying? |
| **What changes it** | Source-format edits (whitespace, table layout, heading wording) | Business-rule edits (new rule, changed threshold) |
| **Lifecycle** | Born and dies inside the Reader | Survives source-format evolution |
| **Format-independent?** | No — it *is* the format abstraction | Yes — by construction |
| **May carry business meaning?** | Never | Always |

### 5.2 Information Ownership

| Concept | Owned by |
|---|---|
| Headings, tables, lists, prose | Markdown AST |
| Source positions | Markdown AST (propagated to errors only) |
| Business objects (Tier, Distribution, Coverage, LO, Pattern, Duplicate) | Blueprint AST |
| Cross-object relationships | Blueprint AST |
| Normalized enums | Blueprint AST (post-projection) and Canonical Blueprint |
| Engine-input rules | `AssemblyRequest` (Integration Spec) |

**Ownership is exclusive.** No concept lives in two ASTs. If a piece of information could belong to either, the spec assigns it to exactly one — ambiguity here is the root cause of format-coupling bugs.

### 5.3 Transformation Rules

The projection from Markdown AST → Blueprint AST is governed by **explicit, inspectable rules**, never by heuristic inference:

| Rule | Markdown AST pattern | Blueprint AST result |
|---|---|---|
| Identity extraction | Header block (fixed recognizable pattern) | `BlueprintIdentity` |
| Document registry | The "Tier Mapping" table | `[DocumentEntry + TierAssignment]` |
| Tier definitions | The "Tier Definitions" table | `[TierDefinition]` |
| Distribution targets | Master Table + per-set Difficulty/Type/Pattern tables | `[DistributionTarget]` keyed by (set, axis, bucket) |
| Distribution constraints | "Distribution Constraints" pseudocode block | `DistributionConstraint` |
| Coverage rules | "Coverage Rules" table | `[CoverageRule]` |
| Mandatory topics | "Mandatory Topics (CR-1)" table | `[MandatoryTopicBinding]` |
| LO mapping | "Learning Objectives" tables | `[LearningObjective]` + LO↔Type map |
| Patterns | "Question Pattern Layer" tables | `[PatternDefinition]` |
| Duplicate prevention | "Duplicate Prevention Rules" + "Similarity Metric" | `[DuplicatePreventionRule]` + `SimilarityMetric` |

These rules are the **contract** of the projection stage. They are also the **extension point** for future source formats: a JSON adapter expresses the same rules in JSON terms; the Blueprint AST result is identical.

### 5.4 Worked Example (Conceptual)

Suppose Blueprint v3.0 contains:

> *"FOR each simulation_set: SUM(all documents) = 100 … Anchor Rule: 1 document per set gets +5 above tier.max, max 1 anchor per set"*

- **Markdown AST:** a `code_block` node containing that text, at lines 110–124.
- **Blueprint AST (after projection):** a `DistributionConstraint` node with structured fields `{sum_per_set: 100, anchor: {bonus: 5, max_per_set: 1}}`. The prose is gone; the rule remains.

Suppose the source had instead been a JSON Blueprint:

> `{"distribution": {"sum_per_set": 100, "anchor": {"bonus": 5, "max_per_set": 1}}}`

- **JSON AST:** (different adapter) a structural parse of the JSON.
- **Blueprint AST (after projection):** the **same** `DistributionConstraint` node.

Same business meaning → same Blueprint AST → same downstream behavior. That is the separation contract in action.

---

## 6. Structural Validation

### 6.1 Responsibility

Validate the Blueprint AST's **shape, hierarchy, and reference integrity** — *not* its business sense. Structural validation asks: *"Is this a well-formed Blueprint?"*, not *"Is this a feasible Blueprint?"*

### 6.2 Checks

| Check | What It Catches | Example Failure |
|---|---|---|
| **Required sections present** | Missing business sections | No `tiers` node; no `coverage.rules` |
| **No duplicated sections** | Same section projected twice | Two `DistributionConstraint` nodes |
| **Well-formed tables** | Malformed source tables that produced incomplete AST nodes | A `TierDefinition` missing its `max` |
| **Valid hierarchy** | Nodes in wrong place | A `MandatoryTopicBinding` nested under `patterns` |
| **Referential integrity** | Cross-references that point nowhere | A `DistributionTarget` referencing a document id not in `documents` |
| **Closed enumerations** | Enum-valued fields outside their allowed set | `tier = 5`; `level = "strict"` |
| **Cardinality** | Wrong count of things that have a fixed count | 5 TierDefinitions instead of 4 |

### 6.3 What Structural Validation Does NOT Do

- ❌ Does not check whether rules are *feasible* (e.g. whether 30 Hard questions can be sourced). That is Semantic Validation (§7).
- ❌ Does not check whether rules *conflict* (e.g. tier-1 floor vs. tier-4 ceiling sums > 100). Semantic Validation.
- ❌ Does not access the Question Bank. Ever.
- ❌ Does not interpret business *intent* — only structure.

### 6.4 Failure Posture

Structural failures are **blocking** — they halt the pipeline. A structurally invalid Blueprint cannot be normalized or turned into an `AssemblyRequest`. The error (§11) includes the offending node's source position so the author can fix the Markdown.

---

## 7. Semantic Validation

### 7.1 Responsibility

Validate the Blueprint AST's **business consistency and feasibility** — *after* structure is sound. Semantic validation asks: *"Does this Blueprint's rule set hold together?"*

### 7.2 Checks

| Check | What It Catches | Example |
|---|---|---|
| **Distribution consistency** | Per-set targets that don't sum to the per-set total | Document targets sum to 97, not 100 |
| **Coverage consistency** | Mandatory topics that reference documents absent from distribution | A mandatory topic under a document with 0 distribution slots |
| **Duplicated business rules** | The same rule expressed twice with conflicting parameters | Two CR-4 rules with different minimum counts |
| **Impossible constraints** | Constraints that cannot be jointly satisfied on paper | tier-1 floor (≥30) + tier-4 ceiling (≤25) but Tier-2+3 minimums force >45 → no feasible allocation |
| **Conflicting requirements** | Rules that contradict each other | L1 (no duplicate Topic+Difficulty+Type within a Set) vs. a distribution that requires two Easy/Memory slots on the same Topic |
| **Invalid references (semantic)** | References that are structurally valid but semantically wrong | A MandatoryTopicBinding for a topic that doesn't appear in any distribution target |
| **Range sanity** | min > max within a single definition | A Tier with min=20, max=15 |

### 7.3 Severity Classification

Three severities, with precise meanings — **not** a slider:

| Severity | Meaning | Pipeline Effect |
|---|---|---|
| **Fatal** | The Blueprint cannot be turned into an `AssemblyRequest` at all. The pipeline halts; no output. | Halt. No `AssemblyRequest` produced. |
| **Blocking** | The Blueprint is structurally sound but contains a rule conflict or impossibility that would make the resulting `AssemblyRequest` unsatisfiable. The pipeline halts by default; an explicit override pathway may exist for advanced users. | Halt by default. Override requires explicit, auditable user action. |
| **Warning** | The Blueprint is processable but contains a smell the author should review (e.g. a topic reused across all 5 sets — permitted by CR-3 but worth flagging). The pipeline continues; the warning is attached to the `AssemblyRequest` as metadata. | Continue. Warning carried forward. |

**Classification rules of thumb:**
- *Structural* failures (§6) are almost always Fatal.
- *Impossibility* (e.g. unsatisfiable constraints on paper) is Blocking — the Reader can produce an `AssemblyRequest`, but the Engine would certainly fail; better to halt here with a precise message.
- *Self-inconsistency in the source* (Integration Spec IG-4: Blueprint v3.0's L1 vs. its own Set-1 table) is **Blocking, not silently relaxed**. The Reader surfaces it; it does not paper over it.
- *Smells* (a topic used in all 5 sets, etc.) are Warnings.

### 7.4 What Semantic Validation Does NOT Do

- ❌ Does not check whether the **Bank** can satisfy the rules. (That is the Engine's job, at runtime, against live Bank state. The Reader has no Bank access.)
- ❌ Does not access the Bank.
- ❌ Does not perform SQL or call any external system.
- ❌ Does not edit the Blueprint to resolve conflicts.

The distinction is critical: semantic validation checks **internal Blueprint consistency** (can the rules hold together in principle?), **not** external satisfiability (can the Bank fulfill them?). The latter depends on runtime Bank state and is the Engine's responsibility per Engine Foundation §7.

---

## 8. Normalization

### 8.1 Responsibility

Transform a validated Blueprint AST into a **Canonical Blueprint** — a stable, format-independent, deduplicated, standardized representation ready for `AssemblyRequest` generation.

### 8.2 What Normalization Does

| Operation | What It Means | Example |
|---|---|---|
| **Remove presentation** | Strip any residual document-format traces (none should remain after projection, but normalization is the guarantee) | — |
| **Remove duplication** | Collapse rules expressed twice; merge redundant targets | Two identical `DistributionTarget` nodes become one |
| **Standardize terminology** | Map free-text labels to canonical enums | `"Hard — Fail"` → `level=hard`; `"Tier 1: Core"` → `tier=1` |
| **Resolve derived values** | Compute values that are derived, not authored | Per-document tier-class membership is resolved and attached |
| **Drop non-rule content** | Remove authoring-time artifacts that survived projection | Rationale prose, QA sections, example tables (per Integration Spec §6.3) |
| **Canonical ordering** | Order collections by stable business keys, not document position | `documents` ordered by document id; rules ordered by rule id |

### 8.3 What Normalization Does NOT Do

- ❌ Does not **change meaning**. A rule's semantics after normalization equals its semantics before. (Principle 1.)
- ❌ Does not **infer** missing data. If a required value is absent, normalization does not invent one — the Blueprint was structurally/semantically invalid and should have failed earlier.
- ❌ Does not **repair** conflicts. If Semantic Validation passed, there are no conflicts to repair; if it failed, normalization never runs.
- ❌ Does not **reduce** rule content below what the Engine needs. The canonical Blueprint retains all rule and target data; reduction to Engine-input size happens at the next stage.

### 8.4 Determinism Guarantee

Normalization is a **pure function**: same Blueprint AST in → same Canonical Blueprint out. There is no nondeterministic ordering, no reliance on current time, no external state. This is the operational form of Principle 2.

---

## 9. Canonical Blueprint

### 9.1 Purpose

The Canonical Blueprint is the **stable, format-independent intermediate** between the messy source world and the strict Engine world. It is what the Integration Specification v1.0 §3 refers to as the Canonical Blueprint Format — the conceptual structure whose *information content* is fixed there, and whose *production* is fixed here.

### 9.2 Responsibility

To carry the Blueprint's full business rule set in a normalized, deduplicated, enum-standardized, format-independent form — ready to be reduced to an `AssemblyRequest`.

### 9.3 Ownership

- **Information content:** owned by Integration Spec v1.0 §3 (what the Canonical must represent).
- **Production rules:** owned by this spec §8 (how the Blueprint AST is normalized into it).
- **Syntax:** owned by the implementation phase (this is architecture, not implementation).

### 9.4 Lifecycle

The Canonical Blueprint is produced by Normalization and consumed by AssemblyRequest Generation. It is an **intermediate**, not a persistence target. (Whether Canonical Blueprints are cached on disk for performance is an implementation optimization; it does not affect correctness, since the cache is input-deterministic.)

### 9.5 Why the Canonical Blueprint Is NOT the Blueprint AST

| | Blueprint AST | Canonical Blueprint |
|---|---|---|
| **When it exists** | Immediately after projection, before validation | After validation + normalization |
| **Validation state** | Unvalidated | Fully validated |
| **Terminology** | May contain free-text labels from the source | Enum-standardized |
| **Duplication** | May contain duplicates | Deduplicated |
| **Derived values** | Author-authored only | Derived values resolved |
| **Stability** | Stable across source formats | Stable across source formats **and** a normalized canonical form |

The Blueprint AST is **what the source said**. The Canonical Blueprint is **what the source said, cleaned and standardized**. Conflating them would mean either (a) polluting the AST with normalization concerns, breaking separation, or (b) skipping normalization and feeding raw AST to the Engine — which would couple the Engine to source terminology.

### 9.6 Why the Canonical Blueprint Is NOT the AssemblyRequest

| | Canonical Blueprint | AssemblyRequest |
|---|---|---|
| **Audience** | The Reader (internal intermediate) | The Engine (external contract) |
| **Completeness** | Carries *all* business rules, including ones the Engine may not yet use | Carries *only* the rules the Engine consumes |
| **Reduction** | None — full rule set | Strictly reductive — see §10 |
| **Stability owner** | This spec | Integration Spec v1.0 |
| **Versioning** | Follows Blueprint AST version | Independent (`meta.spec_version`) |

The Canonical Blueprint is the **cleaned truth** of what the Blueprint says. The `AssemblyRequest` is the **subset** the Engine is contracted to consume. Keeping them separate means the Engine's contract can evolve (Integration Spec v2.0 may expose more fields) without the Canonical having to change.

---

## 10. AssemblyRequest Generation

### 10.1 Responsibility

Reduce the Canonical Blueprint to the **`AssemblyRequest` contract** defined in Integration Spec v1.0 §4. This is the final stage; its output is what the Engine consumes.

### 10.2 What This Stage Does

- **Selects** from the Canonical Blueprint exactly the fields the `AssemblyRequest` contract specifies (Integration Spec §4.3).
- **Drops** everything the contract omits: rationale, QA, cross-reference commentary, per-slot examples (Integration Spec §4.4).
- **Tags** the output with `meta.spec_version = "1.0"`.
- **Carries forward** Warnings from Semantic Validation as `AssemblyRequest` metadata (so the Engine and Human Review can see them).

### 10.3 What This Stage Does NOT Do (The Reader's Forbidden List)

This stage — and therefore the Reader — **must never**:

- ❌ **Search the Question Bank.** The Reader has no Bank access. Bank interaction is the Engine's job (Engine Foundation §3).
- ❌ **Rank Questions.** Engine's job.
- ❌ **Generate Questions.** Forbidden to the entire Assessment System (Engine Foundation §1).
- ❌ **Edit or rewrite Questions.** Forbidden.
- ❌ **Infer missing rules.** If the Canonical Blueprint lacks a rule the Engine needs, the Reader fails (Fail Fast) rather than inventing one.
- ❌ **Perform SQL.** No DB access.
- ❌ **Invoke an LLM.** The Reader is fully deterministic.
- ❌ **Reduce below the contract.** If a contract field is required and the Canonical lacks it, fail loud — do not silently emit an incomplete `AssemblyRequest`.

### 10.4 The Reduction Guarantee

The transformation Canonical → `AssemblyRequest` is **strictly reductive and meaning-preserving within the contract scope**:

- Every rule that survives into the `AssemblyRequest` has the same meaning it had in the Canonical. (Principle 1.)
- The output is a strict subset (semantic and token-wise) of the input. (Principle 6.)
- No field in the `AssemblyRequest` is synthesized from nothing; each traces to a Canonical field. (Auditability.)

---

## 11. Reader Errors

### 11.1 Failure Posture

The Reader obeys three failure modes (Integration Spec §7.4, Engine Foundation §7):

- **Fail Fast:** the moment an unrecoverable problem is detected, halt. Do not continue processing in hopes of a better outcome.
- **Fail Loud:** every failure produces a structured, human-readable error. Silent failures are forbidden.
- **Fail Deterministically:** the same invalid input always produces the same error. No flaky validation.

### 11.2 Error Anatomy

Every Reader error carries five fields:

| Field | Content |
|---|---|
| **Category** | Which stage and which check produced it (e.g. `structural.missing_section`, `semantic.impossible_constraint`) |
| **Location** | Source position (line/line-range) of the offending content, carried from the Markdown AST. If the error is structural and has no single source location, the *expected* location is given. |
| **Severity** | `fatal` / `blocking` / `warning` (per §7.3) |
| **Explanation** | Plain-language description of what is wrong |
| **Recommendation** | Concrete suggested fix the author can act on |

### 11.3 Error Categories

| Category | Stage | Typical Severity | Example |
|---|---|---|---|
| `structural.missing_section` | Structural | Fatal | "Coverage Rules section not found" |
| `structural.duplicate_section` | Structural | Fatal | "Two Tier Definitions sections" |
| `structural.malformed_table` | Structural | Fatal | "Tier Mapping table is missing its Tier column" |
| `structural.invalid_hierarchy` | Structural | Fatal | "MandatoryTopicBinding nested under Patterns" |
| `structural.broken_reference` | Structural | Fatal | "DistributionTarget references unknown document id" |
| `structural.invalid_enum` | Structural | Fatal | "tier = 5 (must be 1–4)" |
| `semantic.distribution_inconsistency` | Semantic | Blocking | "Set 2 document targets sum to 97, expected 100" |
| `semantic.impossible_constraint` | Semantic | Blocking | "Tier floors + Tier-4 minimum exceed 100; no feasible allocation" |
| `semantic.conflicting_rules` | Semantic | Blocking | "L1 forbids duplicate Topic+Difficulty+Type, but Set 1 distribution requires two Easy/Memory slots on the same Topic" |
| `semantic.duplicated_rule` | Semantic | Blocking | "Two CR-4 rules with different minimum counts" |
| `semantic.smell` | Semantic | Warning | "Topic X appears in all 5 sets (CR-3 permits but review)" |
| `generation.missing_contract_field` | Generation | Fatal | "Canonical lacks `target.sets` required by AssemblyRequest v1.0" |

### 11.4 Recovery Model

- **Fatal:** no recovery within the pipeline. Author must fix the source Blueprint.
- **Blocking:** no recovery by default. An override pathway (explicit, auditable user action that says "I know, proceed anyway") may exist for advanced users; the override is recorded in the `AssemblyRequest` metadata so downstream stages know the Blueprint was self-inconsistent at read time.
- **Warning:** automatic continuation. Warning is attached to the `AssemblyRequest`.

### 11.5 No Silent Repair

The Reader **never** silently repairs an invalid Blueprint. If a table is malformed, the Reader does not guess its contents. If a rule conflicts with another, the Reader does not choose a winner. If a required section is missing, the Reader does not synthesize a default. Every one of these is a loud, located, categorized error.

---

## 12. Version Strategy

### 12.1 The Version Chain

```
Blueprint Version        ── what the human authored (e.g. 3.0)
        ↓
Reader Version           ── the adapter that knows the source format (e.g. 1.x)
        ↓
Markdown AST Version     ── the source-format abstraction (today: Markdown; future formats have their own ASTs)
        ↓
Blueprint AST Version    ── the business-meaning abstraction (this spec)
        ↓
Canonical Blueprint Ver. ── the normalized intermediate (this spec)
        ↓
AssemblyRequest Version  ── the Engine input contract (Integration Spec v1.0; `meta.spec_version`)
        ↓
Engine                   ── immutable consumer (Engine Foundation v1.0)
```

### 12.2 Independence Contract

Each version is **independently bumpable**, and each bump is **absorbed at the next layer down**, never propagated upward without intent:

| When this versions… | …the change is absorbed by | …and does NOT touch |
|---|---|---|
| Blueprint (3.0 → 4.0) | Reader (new adapter or extended adapter) | Engine, `AssemblyRequest` (unless the AST itself must change) |
| Reader (1.x → 1.y) | Nothing downstream — it's an internal component | Everything downstream |
| Markdown AST | The projection adapter (Markdown → Blueprint AST) | Blueprint AST, Canonical, `AssemblyRequest`, Engine |
| Blueprint AST | Normalization (AST → Canonical) | `AssemblyRequest`, Engine (unless the Canonical's information content changes) |
| Canonical Blueprint | AssemblyRequest Generation | `AssemblyRequest`, Engine (unless a required field disappears) |
| **`AssemblyRequest` (`meta.spec_version`)** | **The Engine** (it must learn new fields) | — |
| Engine | (immutable per Engine Foundation) | — |

**Only an `AssemblyRequest` version bump reaches the Engine.** Everything else is absorbed above. This is the formal expression of Principle 5 (Version Independence).

### 12.3 How Blueprint v4 Ships Without Engine Redesign

1. Author Blueprint v4 (any format, any structural changes).
2. If v4 introduces no new business concepts: extend the existing Markdown → Blueprint AST projection adapter; the AST, Canonical, and `AssemblyRequest` are unchanged. **Engine untouched.**
3. If v4 introduces a new business concept (e.g. a new rule family): bump the Blueprint AST version, extend the AST, extend normalization, and decide whether the concept belongs in the `AssemblyRequest`.
   - If yes: bump Integration Spec to v2.0, add the field, extend the Engine to consume it (forward-compatible — old Blueprints still work).
   - If no: the concept lives in the Canonical Blueprint but is dropped at `AssemblyRequest` generation. Engine untouched.

The Reader is the **shock absorber**. Blueprint authors are free to evolve the document; the Engine is insulated.

---

## 13. Token Flow

Per Principle 6 (Token Efficiency) and Engine Foundation §9, every transformation must reduce complexity/tokens/duplication without losing meaning.

| Transformation | Input Size | Output Size | Expected Token Reduction | Reason |
|---|---|---|---|---|
| **Blueprint source → Markdown AST** | Baseline (full document, all bytes) | ~95–100% of source | ~0–5% | This stage *parses*, it does not reduce — it makes structure explicit. Position information is added. Marginal reduction from raw-byte normalization (whitespace, encoding). |
| **Markdown AST → Blueprint AST** | ~100% of source | ~25–35% of source | ~65–75% | Drops all non-rule prose: design rationale, QA sections, bias analysis, cross-reference commentary. Keeps only rule-bearing structures, extracted as typed business nodes. |
| **Blueprint AST → Canonical Blueprint** (via validation + normalization) | ~25–35% of source | ~15–20% of source | ~30–40% of the AST | Deduplicates rules, standardizes enums (free-text → short codes), drops residual non-rule content that survived projection (e.g. example tables). |
| **Canonical Blueprint → `AssemblyRequest`** | ~15–20% of source | ~5–10% of source | ~40–50% of the Canonical | Drops everything the Engine contract omits: rationale carried for human review, optional metadata, anything not in Integration Spec §4.3. |

**End-to-end:** the `AssemblyRequest` is roughly **5–10% of the source Blueprint's token weight**, carrying **100% of the rule semantics** the Engine consumes and **0% of the prose**.

### 13.1 Why Each Cut Is Safe

- **AST projection cut (largest):** the largest single reduction. Safe because Markdown prose (เหตุผล columns, QA sections, bias analysis, narrative) carries **no rules** — the Engine cannot act on it, so carrying it forward is pure cost.
- **Normalization cut:** safe because duplicates and free-text variants are presentation noise, not meaning.
- **Generation cut:** safe because the `AssemblyRequest` contract (Integration Spec §4) is the authoritative statement of what the Engine consumes. Anything outside it is, by definition, not needed.

### 13.2 Scaling Posture

`AssemblyRequest` size scales with **(sets × axes × documents)** — for Blueprint v3.0, roughly 5 × 4 × 12 — **not** with Blueprint prose length. A future Blueprint v4 with twice the rationale sections but the same rule structure produces the **same-size `AssemblyRequest`**. This is consistent with Engine Foundation §9.4: token cost scales with target_count, not with source verbosity.

### 13.3 What Token Efficiency Does NOT Mean

- ❌ Does not mean **losing rules**. Every rule the Engine needs survives.
- ❌ Does not mean **aggressive compression** that risks misinterpretation. Reductions are structural (drop prose, dedupe rules), not lossy encodings.
- ❌ Does not mean **skipping validation** to save tokens. Validation runs in full; its cost is in CPU, not in tokens carried forward.

---

## 14. Layer Boundaries

The full CAN/CANNOT/MUST NEVER/MUST ALWAYS matrix, per layer.

### 14.1 Document Reader

- **CAN:** parse source format; emit Markdown AST with positions.
- **CANNOT:** interpret business meaning; validate rules.
- **MUST NEVER:** couple to a specific Markdown library at the architecture level (implementation choice, not architectural); drop source position information.
- **MUST ALWAYS:** preserve raw text faithfully; carry position.

### 14.2 AST Projection (Markdown AST → Blueprint AST)

- **CAN:** identify rule-bearing structures; construct typed business nodes; discard non-rule content.
- **CANNOT:** validate semantics; access the Bank; infer missing rules.
- **MUST NEVER:** carry Markdown syntax into the Blueprint AST; let business node identity depend on document position.
- **MUST ALWAYS:** express projection as explicit, inspectable rules; produce the same Blueprint AST for the same business meaning regardless of source format.

### 14.3 Structural Validation

- **CAN:** check shape, hierarchy, references, enums, cardinality.
- **CANNOT:** check feasibility or business conflicts.
- **MUST NEVER:** access the Bank; perform SQL; invoke an LLM.
- **MUST ALWAYS:** emit located errors (with source position); fail fast on Fatal errors.

### 14.4 Semantic Validation

- **CAN:** check internal Blueprint consistency; classify severity.
- **CANNOT:** check Bank satisfiability; access the Bank.
- **MUST NEVER:** silently relax a rule to make the Blueprint pass; perform SQL; invoke an LLM.
- **MUST ALWAYS:** classify every failure as fatal/blocking/warning; never auto-repair.

### 14.5 Normalization

- **CAN:** deduplicate; standardize enums; resolve derived values; drop non-rule residue.
- **CANNOT:** change meaning; infer missing data; repair conflicts.
- **MUST NEVER:** invent fields; reorder meaning.
- **MUST ALWAYS:** be a pure function; preserve business intent.

### 14.6 AssemblyRequest Generation

- **CAN:** select contract fields; tag with `meta.spec_version`; carry warnings forward.
- **CANNOT:** search the Bank; rank Questions; generate Questions; infer rules.
- **MUST NEVER:** perform SQL; invoke an LLM; emit a partial `AssemblyRequest` silently.
- **MUST ALWAYS:** emit a contract-conforming `AssemblyRequest` or fail loud.

### 14.7 The Reader as a Whole

- **CAN:** transform a Blueprint document into an `AssemblyRequest`; reject invalid Blueprints; carry version metadata.
- **CANNOT:** touch Bank, Engine, or Draft.
- **MUST NEVER:** invoke an LLM; perform SQL; hold runtime state; silently repair; infer missing information; couple business meaning to Markdown layout; read Markdown anywhere outside the Document Reader.
- **MUST ALWAYS:** be deterministic; preserve business intent; reduce (never expand); fail fast/loud/deterministically.

---

## 15. Anti-Patterns

Explicitly prohibited. Any future change to the Reader must be evaluated against this list.

| # | Anti-Pattern | Why Prohibited |
|---|---|---|
| AP-1 | **Engine parsing Markdown** | Violates the foundational isolation. The Engine sees only `AssemblyRequest`. |
| AP-2 | **Business rules inside the Markdown AST** | Couples business meaning to document syntax; breaks format independence. |
| AP-3 | **SQL inside the Reader** | Reader has no DB role; Bank access belongs to the Engine. |
| AP-4 | **Question Bank access** | Reader is pure transformation; Bank is Engine territory. |
| AP-5 | **Runtime state inside the Reader** | Violates determinism (Principle 2) and statelessness. |
| AP-6 | **LLM inside the Reader** | Reader must be fully deterministic; LLMs are not. (The Engine's LLM use, if any, is gated and downstream — Engine Foundation §9.) |
| AP-7 | **Hidden assumptions** | Every transformation rule must be explicit and inspectable. |
| AP-8 | **Silent repair of invalid Blueprint** | Violates Fail Fast and Business Intent Preservation. |
| AP-9 | **Business meaning coupled to Markdown layout** | A reformat would change Engine behavior; violates Principle 1. |
| AP-10 | **Collapsing the two ASTs into one** | Destroys the format-independence boundary; the Markdown AST and Blueprint AST exist separately for a reason (§5). |
| AP-11 | **Skipping the Canonical Blueprint intermediate** | Couples `AssemblyRequest` generation to AST shape; loses the cleaned-truth artifact. |
| AP-12 | **Inferring missing rules to "be helpful"** | Violates Fail Fast; the Reader's job is to transform, not to author. |

---

## 16. Future Extensibility

### 16.1 New Source Formats

The two-AST split makes new source formats additive, not disruptive:

| New Source | What Ships | Engine Impact |
|---|---|---|
| **JSON Blueprint** | A new projection adapter: JSON → Blueprint AST | None. Same AST, same Canonical, same `AssemblyRequest`. |
| **YAML Blueprint** | A new projection adapter: YAML → Blueprint AST | None. |
| **Visual editor** | The editor's data model → Blueprint AST (the editor *is* the source; no Markdown involved) | None. |

The Blueprint AST is the **pivot point**. Every source format has its own adapter into the AST; everything from the AST onward is shared. This is why §4 calls the Blueprint AST the most stable artifact.

### 16.2 New Business Concepts (Blueprint v4)

If v4 introduces a new rule family or distribution axis:

1. Extend the Blueprint AST's business-object vocabulary (§4.3).
2. Extend projection, validation, and normalization to handle the new concept.
3. Decide whether the concept belongs in the `AssemblyRequest`:
   - **Yes** → Integration Spec versions to v2.0, Engine extends (forward-compatibly).
   - **No** → concept lives in the Canonical, dropped at generation. Engine untouched.

### 16.3 Reader Versioning Without Engine Impact

A new Reader (e.g. faster parser, better error messages, support for a new Markdown dialect) can ship at any Reader version without bumping anything else, because the Reader's output contract (`AssemblyRequest` v1.0) is fixed by the Integration Spec, not by the Reader.

### 16.4 What Does NOT Change

- The Engine (immutable per Engine Foundation).
- The `AssemblyRequest` contract (changes only by Integration Spec version bump).
- The principle of two-AST separation (architectural invariant).
- The principle that the Reader is the only Markdown-aware component (architectural invariant).

---

## Appendix A — Glossary

| Term | Definition |
|---|---|
| **Document Reader** | Stage 1: parses source format into a Markdown AST. |
| **Markdown AST** | Document-structure representation. Carries no business meaning. |
| **Blueprint AST** | Business-meaning representation. Format-independent. The most stable Reader artifact. |
| **Projection** | The transformation Markdown AST → Blueprint AST, governed by explicit rules. |
| **Structural Validation** | Shape/hierarchy/reference checks on the Blueprint AST. |
| **Semantic Validation** | Rule-consistency and feasibility checks on the Blueprint AST. |
| **Normalization** | Standardization, deduplication, presentation-stripping: Blueprint AST → Canonical Blueprint. |
| **Canonical Blueprint** | Stable, format-independent, normalized intermediate. |
| **`AssemblyRequest`** | Engine input contract (Integration Spec v1.0). The Reader's final output. |
| **Run unit** | What one Engine run produces. v1.0: `blueprint` (multi-set). |
| **Severity** | `fatal` / `blocking` / `warning` (§7.3). |

---

## Appendix B — Boundary Assertions

The non-negotiable contracts of this specification. Any future change must be evaluated against them.

1. The Engine **never** reads Markdown. The Document Reader is the only Markdown-aware component.
2. The Reader is the **only component** permitted to know any source format exists.
3. The Markdown AST and the Blueprint AST are **strictly separate**. Business meaning lives only in the Blueprint AST.
4. The Blueprint AST is **format-independent**: same business meaning → same AST, regardless of source format.
5. Every stage is a **pure function** of its input (Principle 2 — Determinism).
6. Information **only leaves** the pipeline; it never enters (Principle 1 — Business Intent Preservation, operational form).
7. The Reader **never** accesses the Question Bank, performs SQL, or invokes an LLM.
8. The Reader **never** silently repairs, infers, or guesses. Fail Fast, Fail Loud, Fail Deterministically.
9. **Severity classification** (fatal/blocking/warning) is precise and non-negotiable; warnings may pass, blocking halts by default, fatal always halts.
10. Only an **`AssemblyRequest` version bump** reaches the Engine. All other version changes are absorbed within the Reader or at the Integration boundary.

---

## Appendix C — Provenance & Cross-References

- **Engine alignment:** No Engine module contract is altered; the Reader emits the `AssemblyRequest` the Engine Foundation consumes.
- **Integration Spec alignment:** The Reader implements the boundary contract defined in Integration Spec v1.0 §6–§7. The Canonical Blueprint's information content matches Integration Spec §3. The `AssemblyRequest` generation honors Integration Spec §4.
- **Blueprint fidelity:** Every business rule in Blueprint v3.0 is either carried through to the `AssemblyRequest`, explicitly dropped (per Integration Spec §6.3) with reason, or surfaced as a Blocking error (Integration Spec IG-4 self-inconsistency). No rule is silently reinterpreted.
- **Honesty:** The Reader surfaces Blueprint authoring inconsistencies (e.g. L1 vs. Set-1 table) as Blocking errors; it does not relax them.

---

*End of Sobdai Blueprint Reader Pipeline Architecture — v1.0.*

**Upstream sources (immutable):**
- Assessment Assembly Engine Foundation v1.0
- Blueprint Integration Specification v1.0
- Assessment Blueprint v3.0
