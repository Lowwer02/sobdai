# Sobdai Draft Builder Architecture — v1.0

**Status:** Official Architecture Specification (Architecture only — no implementation, no SQL, no database migration, no CRUD implementation, no UI, no code, no pseudocode)
**Sources of truth (exhaustive, immutable):**
1. `assessment_assembly_engine_foundation_v1.md` — Assessment Assembly Engine Foundation v1.0
2. `blueprint_integration_specification_v1.md` — Blueprint Integration Specification v1.0
3. `blueprint_reader_pipeline_architecture_v1.md` — Blueprint Reader Pipeline Architecture v1.0
4. `candidate_generation_architecture_v1.md` — Candidate Generation Architecture v1.0
5. `scoring_model_specification_v1.md` — Scoring Model Specification v1.0
6. `candidate_ranking_architecture_v1.md` — Candidate Ranking Architecture v1.1
7. `allocation_model_specification_v1.md` — Allocation Model Specification v1.0
8. `constraint_solver_architecture_v1.md` — Constraint Solver Architecture v1.0
9. `assessment_engine_runtime_api_specification_v1.md` — Assessment Engine Runtime API Specification v1.0
**Implemented substrate (immutable, real):** the Exam Set system as built in Sessions 6.16–6.17 — `exam_sets` table (migration 001 + 019 + 024 + 026), `exam_set_questions` junction (migration 001), `createExamSetAction` / `updateExamSetAction` / `setExamSetStatusAction` server actions.
**Version:** 1.0
**Owner:** Chief Assessment Architect, Sobdai

> **What this document is.** This is the architecture of the Draft Builder — the module that **materializes** an approved Assembly Result into a Draft Exam Set. The Draft Builder is the **persistence boundary** between the Assessment Engine (a contract-and-runtime world specified across nine prior documents) and the Exam Set system (a concrete persistence layer built in Sessions 6.16–6.17). It is the only module permitted to write Engine output into the Exam Set tables.
>
> The defining architectural property is **materialization, not decision**. Every business decision — which Questions, in what order, satisfying which constraints — has already been made upstream (Solver allocated, Reviewer approved). The Draft Builder's job is to translate that decided outcome into a persisted Draft, faithfully and auditably. It does not decide, optimize, evaluate, or rank. It materializes.
>
> **What this document is not.** Not SQL. Not a CRUD implementation. Not a database migration. Not UI. Not code. Not pseudocode. The Draft Builder's contract — what it accepts, what it produces, how it fails, what it audits — is fixed here. How the contract is materialized (Postgres writes via the existing `createExamSetAction`, direct SQL, an ORM) is an implementation concern, bounded by §5 (Persistence Philosophy) and §10 (Layer Boundaries).
>
> **Grounding in real substrate.** Unlike the prior nine specs (which operate on conceptual contracts), this spec is grounded in the *actual* Exam Set schema: `exam_sets.id/name/description/package_id/duration_minutes/passing_score/sort_order/display_order/released_at/exam_type/status/subject/document/created_at/updated_at` and the `exam_set_questions(exam_set_id, question_id, sort_order)` junction. The Draft Builder's output must conform to that real schema. Where the Engine's vocabulary and the Exam Set's columns don't align one-to-one, this spec specifies the mapping.

---

## 0. Executive Summary

The Assessment Engine produces an `Assembly Result` — a structured, allocated, auditable mapping of Question Codes to Blueprint Slots. That result lives in the Engine's *contract world*: it's data passed between modules, not persisted anywhere. For the Engine's work to reach learners, it must be **materialized** into the system's persistence layer: the `exam_sets` and `exam_set_questions` tables.

The Draft Builder is the module that performs that materialization. It takes an approved Assembly Result (approved by the Human Reviewer) and produces one or more **Draft Exam Sets** — real rows in `exam_sets` with `status = 'draft'`, linked to real Questions via the `exam_set_questions` junction, ready to enter the existing publish lifecycle (`setExamSetStatusAction` → `validate_exam_set_for_publish` RPC → publish).

The defining architectural separation: **the Draft Builder only materializes; it never decides**. By the time the Draft Builder runs:

- The Reader has interpreted the Blueprint.
- The Generator has discovered legal Candidates.
- The Scoring Model has evaluated them (via Ranking).
- The Solver has allocated them subject to all constraints.
- The Reviewer has approved the allocation.

Every business decision is settled. The Draft Builder translates the settled outcome into persisted form. It does not re-evaluate, re-rank, re-allocate, or re-decide anything. It is the most decision-free module in the entire Assessment System — and it is therefore the module where *fidelity* matters most: a materialization that drifts from the approved allocation silently undoes every property the Engine worked to establish.

Three relationships define the module's place:

- **Draft Builder ↔ Runtime API.** The Draft Builder consumes the Assembly Result, which is the Runtime API's output (Runtime API §5.1). The Draft Builder is **not** part of the Runtime API (Runtime API §15.9 — "post-Engine"). It is invoked *after* Review approves the allocation; it consumes the approved form of the Assembly Result.
- **Draft Builder ↔ Review.** Review consumes the Assembly Result, captures Human decisions, and produces an **approved allocation** that the Draft Builder consumes. The Draft Builder does not invoke Review; it is invoked *with* Review's output.
- **Draft Builder ↔ Exam Set system.** The Draft Builder produces Draft Exam Sets by writing to the existing `exam_sets` / `exam_set_questions` tables via the existing CRUD path. It is the **only** module permitted to write Engine output into those tables. It honors the existing publish lifecycle — it never publishes (publishing is `setExamSetStatusAction`, the existing action).

The Draft Builder is **deterministic, idempotent, single-responsibility, persistence-isolated, and LLM-free**. It is the final translation layer between the Engine's contract world and the system's persistence world.

---

## 1. Why the Draft Builder Exists

### 1.1 The Problem It Solves

The Assessment Engine produces structured results — AllocatedCandidateSets, audit trails, scores, conflicts. None of that is in the database. For any of it to reach learners, the placements must become real Exam Set rows. Without a Draft Builder, that translation would happen ad hoc — each Application that wanted to persist a result would write its own SQL, drift would accumulate, and the Engine's auditability guarantee would stop at the persistence boundary.

The Draft Builder exists to **own that translation once, correctly, and auditably**. It is the single seam between the Engine's contract world and the Exam Set persistence world.

### 1.2 What the Draft Builder Provides

- **Fidelity.** The persisted Draft matches the approved allocation exactly — no silent drift, no reordering, no substitution.
- **Persistence isolation.** The Engine's internal contracts don't leak into the persistence layer; the persistence layer's concerns (column shapes, IDs) don't leak into the Engine.
- **Audit continuity.** The audit trail that began in the Reader continues through the Draft into the persisted Exam Set — a stakeholder can trace a published Question back to its Blueprint slot and beyond.
- **Lifecycle integration.** The Draft enters the existing publish lifecycle (`status = 'draft'` → `published` / `archived` via existing actions). No new lifecycle is invented.

### 1.3 What the Draft Builder Does Not Provide

- **Decisions.** Everything is already decided upstream.
- **Quality judgments.** The Draft Builder doesn't evaluate the allocation it materializes.
- **Publishing.** Producing a Draft is not publishing. Publishing uses the existing lifecycle.
- **Question content.** The Draft Builder writes references (Question Codes/IDs), not content.
- **UI.** The Draft Builder is a persistence module, not a presentation.

---

## 2. Draft Philosophy

### 2.1 Why "Draft" Exists

A **Draft Exam Set** is an Exam Set row with `status = 'draft'` — invisible to learners (the public Exam Set read paths filter on `status = 'published'` or are otherwise gated), visible to admins, and editable via the existing Exam Set admin UI (Sessions 6.16–6.17). The Draft state exists because:

1. **Human authority.** Even after Review approves an allocation, the Human may want to inspect the materialized Draft (in real Exam Set form, with real Question content) before publishing. Draft is that inspection state.
2. **Editability.** A Draft can be edited (add/remove/reorder Questions, change metadata) via the existing Exam Set admin UI without re-running the Engine. The Human may make small adjustments the Engine couldn't have known to make.
3. **Reversibility.** A Draft can be discarded (deleted) without affecting anything published. The Engine's work is recoverable until publish.

### 2.2 Assembly Result vs. Draft vs. Published Exam Set

These three are related but distinct artifacts at different layers:

| | Assembly Result | Draft Exam Set | Published Exam Set |
|---|---|---|---|
| **Layer** | Engine contract (Runtime API output) | Persistence (Exam Set table) | Persistence (Exam Set table) |
| **Producer** | Assessment Engine | Draft Builder | Existing publish lifecycle |
| **State** | In-memory / passed between modules | `status = 'draft'` row in `exam_sets` | `status = 'published'` row in `exam_sets` |
| **Editable?** | No (immutable post-Engine) | Yes (via existing admin UI) | No (without unpublishing) |
| **Visible to learners?** | No | No | Yes |
| **Audit trail** | Carries full Engine audit | Carries Draft audit + references Engine audit | Carries publish audit + Draft audit + Engine audit |
| **Lifecycle stage** | Terminal Engine state | Pre-publish persistence state | Terminal persistence state |

The progression is one-way (Assembly Result → Draft → Published) but not automatic. Each transition is an explicit, auditable, Human-gated action. The Draft Builder performs only the first transition; the existing publish lifecycle performs the second.

### 2.3 Draft ≠ Selection

A Draft is **not** a selection — selection happened in Review. The Draft is the *materialized form* of the selection. Concretely:

- If the approved allocation placed Q-000123 in Slot 1, the Draft places Q-000123 in `exam_set_questions` with `sort_order = 1`.
- The Draft Builder does not choose Q-000123; it records that Q-000123 was chosen.

### 2.4 Draft ≠ Optimization

The Draft Builder does not optimize the allocation — not for balance, not for difficulty distribution, not for any criterion. The allocation it materializes is exactly what Review approved. If the Human wants optimization, that happens upstream (Engine) or via post-Draft editing (existing admin UI) — never in the Draft Builder.

### 2.5 The Fidelity Principle

> **The persisted Draft must be a faithful materialization of the approved allocation.**

Faithful means:

- Every placed Question in the allocation appears in the Draft, in the right order.
- No Question not in the allocation appears in the Draft.
- All Exam Set metadata (subject, document, exam_type, duration, passing_score) reflects the Blueprint's intent, as carried through the Assembly Result.
- No silent corrections — if the allocation has a shortfall (e.g. a Rejected Slot), the Draft carries that shortfall explicitly (e.g. fewer Questions than the Blueprint target), and the shortfall is recorded in the Draft's audit metadata.

Fidelity is the operational form of "Business Intent Preservation" at the persistence layer. A materialization that drifts silently undoes every upstream property.

---

## 3. Draft Lifecycle

The lifecycle of producing a Draft from an Assembly Result.

### 3.1 The Lifecycle Stages

```
Assembly Result (approved)     ── Review has approved the allocation
        │
        ▼
Draft Creation                 ── Draft Builder constructs the Draft contract
        │                         (in-memory representation)
        ▼
Draft Validation               ── Draft Builder validates before persisting
        │
        ▼
Draft Persistence              ── Draft Builder writes to exam_sets / exam_set_questions
        │
        ▼
Draft Review                   ── Human inspects/edits via existing admin UI
        │                         (existing Exam Set admin lifecycle)
        ▼
Published Exam Set             ── via existing setExamSetStatusAction
```

### 3.2 Stage Contracts

| Stage | Input | Output | Responsibility | Failure Mode |
|---|---|---|---|---|
| Assembly Result (approved) | Approved allocation + audit trail | Validated input for the Draft Builder | Review (produces approval) | If approval is missing → reject |
| Draft Creation | Approved allocation | Draft contract (in-memory) | Construct the materialization plan | Fatal on malformed input |
| Draft Validation | Draft contract | Validated Draft or rejection | Check consistency, references, integrity (§6) | Fatal on validation failure |
| Draft Persistence | Validated Draft | Persisted `exam_sets` row(s) + junction rows | Write to the real tables | Fatal on write failure (rollback) |
| Draft Review | Persisted Draft | Human-approved Draft (or edits) | Existing Exam Set admin UI | Human-driven |
| Published Exam Set | Human-approved Draft | Published Exam Set | Existing `setExamSetStatusAction` | Per existing publish lifecycle |

### 3.3 Ownership at Each Stage

| Stage | Owner |
|---|---|
| Assembly Result (approved) | Human Reviewer (approves) |
| Draft Creation | Draft Builder |
| Draft Validation | Draft Builder |
| Draft Persistence | Draft Builder |
| Draft Review | Human Reviewer (via existing admin UI) |
| Published Exam Set | Existing publish lifecycle (`setExamSetStatusAction` + `validate_exam_set_for_publish` RPC) |

The Draft Builder owns **three stages**: Creation, Validation, Persistence. It does not own Review or Publish — those are Human-driven and existing-lifecycle, respectively.

### 3.4 The Materialization Boundary

Stages 1–2 (Creation, Validation) operate in the **Engine contract world**: they consume the Assembly Result and produce an in-memory Draft contract. Stage 3 (Persistence) crosses into the **persistence world**: it writes real rows. This crossing is the most delicate operation in the Draft Builder. §5 (Persistence Philosophy) and §10 (Layer Boundaries) specify how it's bounded.

### 3.5 Multi-Set Materialization

Per Integration Spec §5.1, `run_unit = blueprint` — one Engine run produces N interdependent Sets (Blueprint v3.0: 5 Sets). The Draft Builder therefore produces **N Draft Exam Sets** from one Assembly Result — one Draft per Set. Each Draft:

- Is its own `exam_sets` row.
- Has its own `exam_set_questions` junction rows.
- Carries references to the same Assembly Result (so the audit trail links them).
- Enters the existing publish lifecycle independently (one Set may be published while another remains in Draft).

The Draft Builder treats each Set's materialization as an **atomic unit** (a Set's `exam_sets` row + all its junction rows succeed or fail together) but treats the **Blueprint-level materialization** as a coordinated batch (all N Sets are produced in one Draft Builder invocation). Partial batch materialization (some Sets succeed, some fail) is handled per §9 (Failure Handling).

---

## 4. Draft Contract

The conceptual elements of a Draft. These are *contract elements*, not data structures — the implementation maps them to real `exam_sets` / `exam_set_questions` columns.

### 4.1 Draft Identity

| Element | Content | Maps To |
|---|---|---|
| **Draft id** | A unique id for this Draft | `exam_sets.id` (UUID, generated by the DB or assigned) |
| **Position in batch** | Which Set this Draft is within the multi-Set Blueprint (1 of N) | Derived from Assembly Result |
| **Sibling Drafts** | References to other Drafts from the same Assembly Result | Cross-Draft reference (audit) |

### 4.2 Draft Metadata

The Draft's Exam Set-level metadata, materialized from the Assembly Result's Blueprint intent.

| Element | Content | Maps To |
|---|---|---|
| **Name** | The Set's name (Blueprint-derived) | `exam_sets.name` |
| **Description** | The Set's description | `exam_sets.description` |
| **Package** | The Package this Set belongs to | `exam_sets.package_id` |
| **Duration** | Time limit in minutes | `exam_sets.duration_minutes` |
| **Passing score** | Pass threshold | `exam_sets.passing_score` |
| **Exam type** | `simulation` (per Blueprint v3.0) | `exam_sets.exam_type` |
| **Subject** | Blueprint subject | `exam_sets.subject` |
| **Document** | Blueprint document focus (if any) | `exam_sets.document` |
| **Sort order / Display order** | Position in lists | `exam_sets.sort_order`, `exam_sets.display_order` |
| **Status** | Always `'draft'` on creation | `exam_sets.status` |

### 4.3 Questions

The placed Questions, in order.

| Element | Content | Maps To |
|---|---|---|
| **Question Code** | The immutable business identifier | Resolves to `questions.id` at persistence |
| **Sort order** | Position within the Set | `exam_set_questions.sort_order` |

The Draft Builder writes **references** (Codes → IDs), never content. Content stays in the `questions` table where it already lives.

### 4.4 Ordering

The Draft's Question ordering **matches the approved allocation's slot ordering exactly**. The Draft Builder does not reorder. If the Blueprint's allocation placed Q-000123 at position 1, Q-000456 at position 2, etc., the Draft's `exam_set_questions.sort_order` reflects exactly that sequence.

### 4.5 Sections

Blueprint v3.0 organizes Questions by Document within a Set (e.g. "Document 1: พ.ร.บ.การศึกษาแห่งชาติ 2542"). The `exam_sets` schema does **not** have a "section" column — sections are a Blueprint organizational concept, not a persistence concept. The Draft Builder records section information in the **Draft's audit metadata** (§4.7) but does not persist it as a column. The existing Exam Set admin UI displays Questions ordered by `sort_order`; section grouping (if desired in the UI) is a presentation concern.

This is a fidelity-preserving decision: the Draft Builder does not invent persistence structures for Engine concepts the schema doesn't support. Sections live in audit; ordering lives in `sort_order`.

### 4.6 Shortfall Recording

If the approved allocation has shortfalls (e.g. a Rejected Slot — the Solver couldn't place a Question), the Draft carries **fewer Questions than the Blueprint target**. The shortfall is:

- **Visible in the Draft's Question count** (the Draft has fewer Questions than the Blueprint specified).
- **Recorded in the Draft's audit metadata** (which Slots were Rejected, why).

The Draft Builder **does not** silently fill shortfalls with substitute Questions — that would violate Fidelity (§2.5). If the Human wants to fill a shortfall, they do so via the existing Exam Set admin UI (post-Draft editing).

### 4.7 Blueprint Reference

| Element | Content |
|---|---|
| **Blueprint id** | Which Blueprint produced this Draft |
| **Blueprint version** | Which version of the Blueprint |
| **Profile** | Which Assessment Profile (e.g. `simulation`) |

The Blueprint reference is recorded in the Draft's audit metadata, not as an `exam_sets` column (the schema has no Blueprint column). This is another fidelity-preserving decision: the Draft Builder doesn't invent schema; it records Engine provenance in audit.

### 4.8 Assembly Reference

| Element | Content |
|---|---|
| **Assembly Result id** | The specific Engine run that produced this Draft |
| **Run timestamp** | When the Engine ran |
| **Engine versions** | The version stack at run time |

The Assembly reference links the Draft back to its Engine run, enabling full audit traceability.

### 4.9 Audit Reference

| Element | Content |
|---|---|
| **Engine audit trail** | The full audit from the Assembly Result (carried forward) |
| **Draft Builder audit** | What the Draft Builder did (Creation, Validation, Persistence) |
| **Reviewer approval** | Who approved the allocation, when, with what overrides |

### 4.10 Version Information

| Element | Content |
|---|---|
| **Draft Builder version** | This spec's version |
| **Runtime API version** | The Runtime API that produced the Assembly Result |
| **Engine version** | The encapsulated Engine |
| **Internal module versions** | Reader, Generator, Scoring, Ranking, Allocation, Solver |
| **Blueprint version** | The source Blueprint |
| **Exam Set schema version** | The schema version this Draft conforms to |

All version information is recorded in the audit metadata for full traceability.

---

## 5. Persistence Philosophy

What belongs in the persisted Draft, what remains Runtime-only, and what must never be persisted.

### 5.1 What Belongs to the Draft (Persisted)

- **Exam Set metadata** (§4.2): name, description, package, duration, passing_score, exam_type, subject, document, sort_order, display_order, status.
- **Question placements** (§4.3): the placed Question Codes (resolved to IDs) in their sort order.
- **The Draft's own identity** (§4.1): the `exam_sets.id`.

These are the **real Exam Set schema fields**. They are persisted as-is via the existing CRUD path.

### 5.2 What Remains Runtime-Only (Not Persisted as Columns)

These Engine artifacts are essential to the Engine's operation but have **no corresponding `exam_sets` column**. They are recorded in the Draft's **audit metadata** (which may itself be persisted — see §5.4), not as Exam Set columns:

- **Scores, Confidences, Penalties** (Scoring Model outputs).
- **Conflicts** (Allocation Model / Constraint Solver outputs).
- **Reservations, Replacements** (Allocation Model internal state).
- **Candidate evaluations** (Candidate Ranking outputs).
- **Sections** (Blueprint organizational concept — see §4.5).
- **Blueprint id, Assembly Result id, Engine versions** (provenance — recorded in audit, not as columns).

The Draft Builder does not invent schema for these. The Exam Set schema is what Sessions 6.16–6.17 built; that schema is the persistence contract.

### 5.3 What Must Never Be Persisted

- **Question content** (choices, explanations). Content lives in the `questions` table; the Draft references it, never copies it.
- **Internal Engine state** (Solver search trees, Allocation State snapshots). These are internal to a run; they do not escape the Engine.
- **Intermediate Engine contracts** (CandidateSet, RankedCandidateSet). Only the *approved allocation* is materialized; intermediate work is not persisted as data.
- **Application-layer metadata** (requestor identity, correlation ids). These belong to the Runtime Context (Runtime API §4.2); they may appear in audit but not as Exam Set columns.
- **Rejected Candidates** (Questions the Solver considered but didn't place). The Draft carries only the approved placements; rejected Candidates appear in audit (for transparency) but not as Draft rows.

### 5.4 Where Audit Metadata Lives

The Draft's audit metadata (Blueprint reference, Assembly reference, Engine audit trail, Reviewer approval) is essential for traceability but does not fit the `exam_sets` schema. Options for where it lives:

1. **A dedicated audit table** (e.g. `draft_audit_trail`), keyed by `exam_sets.id`. This is the cleanest separation; audit grows independently of the Exam Set schema.
2. **A JSON column on `exam_sets`** (if the schema supports it — currently it does not have one). This co-locates audit with the Draft but couples audit growth to Exam Set schema migrations.
3. **An external audit log** (e.g. the existing `logAuditEvent` infrastructure noted in `lib/audit/logger.ts`). This integrates with broader system audit but separates audit from the Draft row.

**This spec does not choose among these options.** The choice is an implementation concern. The spec fixes only that:

- Audit metadata **must be persisted** (not just in-memory — it must survive the Draft Builder's termination).
- Audit metadata **must be traceable** from the Draft (given a Draft id, the audit must be retrievable).
- Audit metadata **must be immutable** once written (no rewriting history).

### 5.5 Persistence Isolation

The Draft Builder is **persistence-isolated**:

- It writes **only** to `exam_sets` and `exam_set_questions` (and the chosen audit location per §5.4).
- It writes **nothing** to `questions`, `packages`, or any other table.
- It reads **only** what it needs to resolve Question Codes to IDs (the `questions` table, read-only).
- It does **not** mutate the Bank, the Blueprint, or any Engine contract.

This isolation is what makes the Draft Builder's blast radius small — a Draft Builder bug can affect only Draft materialization, not the Bank or the Engine.

---

## 6. Validation

The Draft Builder validates the Draft contract **before** persisting. Validation catches materialization errors before they reach the database, where they'd be expensive to undo.

### 6.1 Validation Categories

| Category | What It Checks | Failure Behavior |
|---|---|---|
| **Consistency Validation** | The Draft contract is internally consistent (e.g. no duplicate Question Codes within a Set; sort_order values are unique). | Fatal — halt before persist. |
| **Reference Validation** | Every Question Code in the allocation resolves to a real `questions.id` in the Bank; the Package id is real; the Blueprint reference is real. | Fatal — halt with the unresolved reference. |
| **Version Validation** | The Assembly Result's version stack is supported by this Draft Builder; the Exam Set schema version is compatible. | Fatal — halt with version mismatch. |
| **Integrity Validation** | The Draft's metadata matches the approved allocation's metadata (e.g. `exam_type` matches the Blueprint's profile; `subject` matches the Blueprint's subject). | Fatal — halt with the mismatch. |
| **Completeness Validation** | The Draft's Question count matches the approved allocation's placement count (no silent drops or additions); shortfalls are explicitly recorded. | Fatal — halt with the count mismatch. |

### 6.2 What Validation Does NOT Do

- ❌ Does **not** re-evaluate the allocation (no scoring, no ranking, no constraint checking). The allocation is already approved; the Draft Builder trusts it.
- ❌ Does **not** check whether the Draft will pass the eventual publish validation (`validate_exam_set_for_publish`). That's the publish lifecycle's job, later.
- ❌ Does **not** modify the Draft to make it valid. Validation either passes or fails; it never repairs.

### 6.3 The "Trust but Verify" Posture

The Draft Builder **trusts** the approved allocation (it doesn't re-evaluate) but **verifies** its own materialization (it checks that what it constructed matches what it received). This is the right split: re-evaluating upstream decisions would violate Single Responsibility; failing to verify materialization would violate Fidelity.

### 6.4 Validation Failure Posture

Validation failures are **Fatal** — the Draft Builder halts before persisting. No partial Draft is written. The failure is recorded with:

- Which validation category failed.
- Which element (Question Code, metadata field, version) caused the failure.
- A recommendation (e.g. "Question Q-000123 not found in Bank — was it deleted between approval and materialization?").

---

## 7. Audit Model

The Draft Builder's audit model composes with the Engine's audit trail to provide end-to-end traceability from Blueprint to published Exam Set.

### 7.1 Audit Components

| Component | Content | Source |
|---|---|---|
| **Draft Trace** | What the Draft Builder did: Creation decisions, Validation results, Persistence writes | Draft Builder |
| **Assembly Trace** | The full Engine audit (Execution, Module, Decision, Allocation, Version, Reviewer traces) | Carried forward from Assembly Result (Runtime API §9.1) |
| **Allocation Trace** | The specific Slot → Candidate placements that became this Draft's Questions | Carried forward from Constraint Solver (Constraint Solver §10) |
| **Version Trace** | Every version involved: Draft Builder, Runtime, Engine, modules, Blueprint, schema | Draft Builder assembles |
| **Approval Trace** | Who approved the allocation, when, with what overrides | Carried forward from Review |
| **Publication Trace** | When the Draft was published, by whom, via the existing lifecycle | Existing publish lifecycle (post-Draft) |

### 7.2 Audit Continuity

The audit trail is **continuous** from Blueprint to publication:

```
Blueprint (authored) → Reader → Generator → Ranking → Solver → Assembly Result
        → Review (approved) → Draft Builder (materialized) → Draft (persisted)
        → Publish lifecycle (published) → Published Exam Set
```

Every transition is auditable. A stakeholder asking "why is Q-000123 in published Set 3?" can trace:

- The publish action (who published, when).
- The Draft row it came from.
- The materialization decision (Draft Builder placed it at sort_order N).
- The Review approval (who approved).
- The Solver allocation (it was placed in Slot X).
- The Ranking (it was the top-ranked Candidate for Slot X).
- The Generator (it was a legal Candidate).
- The Reader (the Blueprint specified Slot X).
- The Blueprint authoring (the Blueprint's distribution target created Slot X).

This is the operational form of "Maximum Traceability" (Architecture Principle).

### 7.3 What the Draft Trace Records

| Element | Content |
|---|---|
| **Materialization timestamp** | When the Draft Builder ran |
| **Input** | The Assembly Result id (and version) it consumed |
| **Validation results** | Each validation category's outcome (§6.1) |
| **Persistence writes** | The `exam_sets` row id, the `exam_set_questions` row count |
| **Shortfalls carried** | Any shortfalls in the approved allocation (e.g. N Rejected Slots) |
| **Materialization decision** | "Materialized allocation X as Draft Y" |
| **Operator** | Who/what invoked the Draft Builder |

### 7.4 Layered Audit

Inheriting the layered transparency pattern (Scoring Model §8.4, Runtime API §9.3):

- **Always-present:** Draft identity, materialization timestamp, input Assembly Result, validation pass/fail, persistence outcome, shortfall summary.
- **On-demand:** Full Assembly Trace, full Allocation Trace, per-Question placement reasoning.

This keeps the Draft's audit tractable while preserving full detail for inspection.

### 7.5 Audit Integrity

The audit trail is **immutable** once written. The Draft Builder does not revise materialization history. If a Draft is edited post-materialization (via the existing admin UI), those edits produce their own audit entries (in the existing Exam Set audit, not in the Draft Builder's audit) — the Draft Builder's record of what it materialized stands.

---

## 8. Versioning

The Draft Builder participates in the version stack established by the Runtime API (Runtime API §10).

### 8.1 The Version Stack (Draft Builder's Position)

```
Blueprint Version        ── what was authored
        ↓
Runtime API Version      ── the public contract
        ↓
Engine Version           ── encapsulated engine
        ↓
Internal Module Versions ── Reader, Generator, Scoring, Ranking, Allocation, Solver
        ↓
Assembly Result          ── carries the above versions
        ↓
Draft Builder Version    ── this spec (NEW: Draft Builder's own version)
        ↓
Exam Set Schema Version  ── the persistence layer it writes to
```

### 8.2 Version Ownership

| Version | Owner | Role in Draft Builder |
|---|---|---|
| **Draft Version** | This spec | The Draft Builder tracks its own version; recorded in audit |
| **Blueprint Version** | Blueprint authors | Carried in Assembly Result; recorded in Draft audit |
| **Assembly Version** | The Engine run | Carried in Assembly Result; recorded in Draft audit |
| **Runtime Version** | Runtime API spec | Carried in Assembly Result; recorded in Draft audit |
| **Publication Version** | Existing Exam Set publish lifecycle | Not the Draft Builder's concern; recorded post-Draft |

### 8.3 Compatibility Rules

The Draft Builder enforces compatibility at Validation (§6.1, Version Validation):

| Situation | Draft Builder Behavior |
|---|---|
| Assembly Result's version stack is supported | Proceed. |
| Assembly Result's version stack is unsupported (too new) | Fatal — reject with version mismatch. |
| Draft Builder version is deprecated but functional | Proceed with deprecation warning in audit. |
| Exam Set schema is incompatible (e.g. missing a column the Draft needs) | Fatal — reject. The schema must be migrated first. |
| Question Codes referenced by the allocation no longer exist in the Bank | Fatal — reject (Reference Validation, §6.1). |

### 8.4 Version Independence

The Draft Builder versions independently of:

- The Engine (the Engine may evolve; the Draft Builder consumes any Assembly Result that conforms to a supported Runtime version).
- The Exam Set schema (the schema may evolve; the Draft Builder tracks the schema version it targets).

A Draft Builder version bump happens when:

- The Draft contract (§4) changes (new metadata field, new audit element).
- The persistence mapping changes (e.g. a new `exam_sets` column is introduced that the Draft Builder should populate).
- The validation rules change.

The Draft Builder does **not** version-bump when:

- The Engine evolves internally (encapsulated).
- The Blueprint evolves (the Draft Builder consumes whatever the Engine produces).
- The publish lifecycle evolves (the Draft Builder hands off to it; doesn't own it).

---

## 9. Failure Handling

The Draft Builder's failure posture inherits the Engine-wide discipline: Fail Fast, Fail Loud, Remain Deterministic.

### 9.1 Failure Modes

| Failure | What It Means | Draft Builder Behavior |
|---|---|---|
| **Duplicate Draft** | A Draft for this Assembly Result (and this Set) already exists | Fatal — reject. The Draft Builder is idempotent (§9.2) but rejects duplicate *requests*, returning the existing Draft's reference. |
| **Missing Assembly Result** | The Assembly Result referenced by the request doesn't exist or is incomplete | Fatal — reject. |
| **Invalid Reference** | A Question Code, Package id, or Blueprint reference doesn't resolve | Fatal — reject with the unresolved reference (Reference Validation, §6.1). |
| **Version Conflict** | The Assembly Result's version stack is unsupported, or the Exam Set schema is incompatible | Fatal — reject with the conflict. |
| **Corrupted Draft** | The Draft contract is internally inconsistent (e.g. duplicate Codes, broken sort_order) | Fatal — reject (Consistency Validation, §6.1). |
| **Incomplete Draft** | The Draft's Question count doesn't match the allocation's placement count | Fatal — reject (Completeness Validation, §6.1). |
| **Persistence Failure** | A write to `exam_sets` or `exam_set_questions` failed mid-batch | Fatal — **rollback the entire batch**. No partial Drafts. |
| **Multi-Set Partial Failure** | In a multi-Set materialization, some Sets succeeded and some failed | Fatal — **rollback all Sets**. The Draft Builder produces a complete batch or nothing. |
| **Audit Write Failure** | The audit metadata couldn't be persisted | Fatal — rollback the Draft write. A Draft without audit is non-conformant. |

### 9.2 Idempotency

The Draft Builder is **idempotent**: materializing the same approved allocation produces the same Draft (or, if invoked twice, the second invocation returns the existing Draft's reference rather than creating a duplicate). Idempotency is essential because:

- Network retries (in a remote-materialization deployment) must not create duplicate Drafts.
- Re-running after a transient failure must not corrupt state.

Idempotency is achieved by:

- Keying Drafts on the (Assembly Result id, Set index) pair — a unique identifier for "this Set from this Engine run."
- Checking for an existing Draft with that key before materializing.
- Returning the existing Draft's reference if found.

### 9.3 Atomicity

Each Set's materialization is **atomic**: the `exam_sets` row + all its `exam_set_questions` rows succeed or fail together. A multi-Set batch is **coordinated-atomic**: all N Sets succeed or all are rolled back. The Draft Builder never leaves partial state in the database.

This is the operational form of "No Hidden State" (Architecture Principle): either the materialization completed (and is fully auditable) or it didn't (and the database is unchanged).

### 9.4 Rollback Semantics

On any failure after persistence has begun:

- All `exam_set_questions` rows written for this batch are deleted.
- All `exam_sets` rows written for this batch are deleted.
- Any audit entries written for this batch are marked as rolled-back (or deleted, per the audit storage choice — §5.4).
- The failure is recorded as a Draft Builder audit entry (the *attempt* is auditable even if the Draft isn't persisted).

### 9.5 Every Failure Must

- **Fail Fast:** halt at the first unrecoverable problem.
- **Fail Loud:** structured error with category, location, severity, explanation, recommendation.
- **Remain Deterministic:** same input → same failure.
- **Rollback cleanly:** no partial state in the database.

---

## 10. Layer Boundaries

### 10.1 Draft Builder

- **CAN:**
  - Consume an approved Assembly Result.
  - Construct a Draft contract (in-memory).
  - Validate the Draft contract.
  - Resolve Question Codes to Bank IDs (read-only on `questions`).
  - Write Draft rows to `exam_sets` and `exam_set_questions`.
  - Write audit metadata (per §5.4).
  - Return Draft references to the caller.
- **CANNOT:**
  - Re-evaluate, re-rank, re-score, or re-allocate anything.
  - Modify the Assembly Result, the Blueprint, or any Engine contract.
  - Modify the Bank (write to `questions`, `packages`, etc.).
  - Publish a Draft (publishing uses the existing lifecycle).
  - Invoke the Engine, Review, or the publish lifecycle.
  - Read Question content (forwards references only).
- **MUST NEVER:**
  - Silently drift from the approved allocation (Fidelity, §2.5).
  - Silently fill shortfalls with substitute Questions.
  - Reorder Questions differently from the allocation.
  - Persist Question content (only references).
  - Persist intermediate Engine contracts (CandidateSet, etc.).
  - Persist internal Engine state (Solver trees, Allocation State).
  - Publish automatically (Draft is `status = 'draft'`; publish is a separate Human action).
  - Hide materialization decisions from audit.
  - Couple to SQL specifics (the contract is abstract; SQL is implementation).
- **MUST ALWAYS:**
  - Materialize the approved allocation faithfully.
  - Validate before persisting.
  - Persist audit metadata.
  - Be idempotent.
  - Rollback cleanly on failure.
  - Be deterministic given input.

### 10.2 Relationship with Adjacent Modules

| Boundary | Draft Builder's Side | Other Side |
|---|---|---|
| **Draft Builder ↔ Runtime API** | Consumes Assembly Result (the Runtime API's output) | Runtime API produces it; Draft Builder is post-Engine (Runtime API §15.9) |
| **Draft Builder ↔ Review** | Consumes Review's approved allocation | Review produces approval; Draft Builder does not invoke Review |
| **Draft Builder ↔ Constraint Solver** | Consumes the Solver's placements (via Assembly Result) | Solver is upstream; Draft Builder never re-solves |
| **Draft Builder ↔ Published Exam Set** | Produces Drafts (status='draft'); does not publish | Existing publish lifecycle (`setExamSetStatusAction`) handles Draft→Published |
| **Draft Builder ↔ Database** | Writes only to `exam_sets` and `exam_set_questions` (+ audit location); reads only `questions` (for Code→ID resolution) | Database is substrate; Draft Builder is persistence-isolated (§5.5) |

---

## 11. Anti-Patterns

Explicitly prohibited. Any future change must be evaluated against this list.

| # | Anti-Pattern | Why Prohibited |
|---|---|---|
| AP-1 | **Rebuilding Assembly** | The Assembly Result is immutable upstream; the Draft Builder materializes, never rebuilds. |
| AP-2 | **Re-ranking** | Ranking is immutable upstream. |
| AP-3 | **Re-scoring** | Scoring is immutable upstream. |
| AP-4 | **Changing Blueprint** | Blueprint is immutable. |
| AP-5 | **Editing Allocation** | The allocation is approved upstream; the Draft Builder records, never edits. |
| AP-6 | **Generating Questions** | Forbidden system-wide (Engine Foundation §1). |
| AP-7 | **Publishing automatically** | Draft is `status='draft'`; publishing is a separate Human action via the existing lifecycle. |
| AP-8 | **Hidden State** | All materialization decisions must be auditable. |
| AP-9 | **Duplicated Metadata** | Engine metadata (Scores, Conflicts) is not copied into Exam Set columns; it lives in audit only. |
| AP-10 | **Persisting Question content** | References only; content stays in `questions`. |
| AP-11 | **Persisting intermediate Engine contracts** | Only the approved allocation is materialized. |
| AP-12 | **Inventing schema** | The Draft Builder writes to the existing `exam_sets` schema; it does not add columns without a schema migration. |
| AP-13 | **Partial batch materialization** | All Sets in a multi-Set Blueprint succeed or all roll back. |
| AP-14 | **Silent drift** | The persisted Draft must match the allocation exactly. |
| AP-15 | **Silent shortfall filling** | Shortfalls are recorded, not filled. |
| AP-16 | **Coupling to SQL** | The contract is abstract; SQL is implementation. |
| AP-17 | **Anything outside Draft Builder ownership** | Single responsibility (§1.3). |

---

## 12. Future Extensibility

Future capabilities enter as additive extensions, never as redesigns.

### 12.1 Versioned Drafts

If Drafts need versioning (e.g. "Draft v1, v2, v3" as the Human edits), the existing Exam Set admin UI's edit history (or a new Draft-version table) absorbs it. The Draft Builder's contract is unchanged; it produces the initial Draft; subsequent versions are post-materialization edits.

### 12.2 Collaborative Drafts

If multiple Reviewers edit a Draft concurrently, a concurrency model (locking, conflict detection) is added at the admin UI / Draft-storage layer — not in the Draft Builder. The Draft Builder produces the initial Draft; collaboration is post-materialization.

### 12.3 Snapshot Drafts

A Snapshot Draft captures the Engine's output at a point in time (e.g. "this is what the Engine produced on 2026-07-20"). The Draft Builder already records the Assembly Result id and timestamp in audit; snapshots are a query/rendering concern over existing audit data, not a new Draft Builder capability.

### 12.4 Export Formats

If Drafts need to be exported (e.g. PDF, JSON for external systems), an export layer is added on top of the persisted Draft — not in the Draft Builder. The Draft Builder produces the persisted Draft; export reads it.

### 12.5 Offline Drafts

If Drafts need offline access (e.g. for review without network), an offline cache/sync layer is added — not in the Draft Builder. The Draft Builder produces the persisted Draft; offline is a distribution concern.

### 12.6 Cloud Drafts

If Drafts are stored in a cloud-specific way (e.g. a managed database, a cloud audit service), the persistence substrate changes — not the Draft Builder contract. The Draft Builder's contract is substrate-independent at the spec level.

### 12.7 What Does NOT Change

- **The Draft Builder only materializes** (§2) — the architectural invariant.
- **Fidelity** (§2.5) — the persisted Draft matches the approved allocation.
- **Persistence isolation** (§5.5) — the Draft Builder writes only to `exam_sets` / `exam_set_questions` (+ audit).
- **Atomicity** (§9.3) — complete batches or nothing.
- **Idempotency** (§9.2) — same input → same Draft.
- **Audit continuity** (§7.2) — Blueprint → Published is fully traceable.
- **Human authority** — the Draft Builder never publishes; that's a Human action.

---

## 13. Cross-Spec Reconciliation (Mandatory)

Per the session's mandatory requirement: explicit reconciliation with prior specs, focusing on **where ownership changes**, **where Runtime ends**, and **where Persistence begins**.

### 13.1 Runtime API ↔ Draft Builder

**Tension:** The Runtime API (Runtime API Specification v1.0 §15.9) explicitly states: "The Runtime API's responsibility ends at Assembly Result delivery." The Draft Builder consumes the Assembly Result. Where exactly does ownership transfer?

**Reconciliation:** Ownership transfers **at Assembly Result delivery**. Concretely:

- The Runtime API produces the Assembly Result and makes it available (to Review, then to the Draft Builder).
- The Runtime API's audit responsibility ends with the Assembly Result's audit trail.
- The Draft Builder picks up ownership at materialization: it consumes the Assembly Result, produces the Draft, and owns the Draft's audit.

**Operational rule:** The Runtime API and the Draft Builder do **not** overlap. The Runtime API never calls the Draft Builder (Runtime API §15.9 — "post-Engine"). The Draft Builder never calls the Runtime API. They communicate only through the Assembly Result artifact, which is the handoff contract.

**Where Review fits:** Review sits between them. Review consumes the Assembly Result, captures Human approval, and produces an *approved* Assembly Result (or an approval marker on the original). The Draft Builder consumes the *approved* form. The Draft Builder does not consume a raw (un-approved) Assembly Result — approval is a precondition (§9.1, "Missing approval → reject").

### 13.2 Constraint Solver ↔ Draft Builder

**Tension:** The Constraint Solver produces the AllocatedCandidateSet (the placements). The Draft Builder materializes placements into `exam_set_questions`. Does the Draft Builder re-derive placements, or consume them verbatim?

**Reconciliation:** **Consume verbatim.** The Draft Builder does not re-derive anything from the Solver's outputs. Concretely:

- The Solver's AllocatedCandidateSet carries Slot → Candidate placements.
- The Draft Builder reads those placements and writes them as `exam_set_questions` rows (Candidate → `question_id`, Slot's sort_position → `sort_order`).
- The mapping is direct: one placement becomes one junction row.

**Operational rule:** The Draft Builder is a **translator**, not a re-solver. If the Solver placed Q-000123 in Slot 1, the Draft Builder writes Q-000123 at `sort_order = 1`. No re-derivation, no reordering, no filtering.

**Shortfall handling:** If the Solver's allocation has shortfalls (Rejected Slots), the Draft Builder records them in audit and produces a Draft with fewer Questions than the Blueprint target. The shortfall is preserved, not papered over.

### 13.3 Allocation Model ↔ Draft Builder

**Tension:** The Allocation Model (vocabulary) and the Constraint Solver (behavior) produce a rich allocation structure — Slot states, Conflicts, Replacements, Reservation history. How much of that does the Draft Builder persist?

**Reconciliation:** **Only final placements.** Per §5.2–§5.3:

- The Draft Builder persists **Assignments** (confirmed placements) only.
- Reservations, Replacements, Conflicts, internal Allocation State — all are **audit-only** (recorded in the Draft's audit metadata, not as Exam Set columns or junction rows).
- The Draft Builder does not persist the allocation *process*; it persists the allocation *outcome*.

**Operational rule:** The Allocation Model's vocabulary is rich; the Exam Set schema is narrow. The Draft Builder bridges them by persisting only what the schema can express (placements) and recording the rest (process) in audit. This is the fidelity-preserving decision: don't invent schema; record provenance in audit.

### 13.4 Assembly Result ↔ Draft

**Tension:** The Assembly Result carries summary views of internal contracts (Runtime API §5). The Draft persists concrete rows. The shapes don't match one-to-one.

**Reconciliation:** The Draft Builder performs a **deliberate, audited shape translation**:

| Assembly Result element | Draft element |
|---|---|
| AllocatedCandidateSet.placements | `exam_set_questions` rows |
| Blueprint intent (subject, document, exam_type, duration, passing_score) | `exam_sets` columns |
| Run unit declaration (multi-Set) | N `exam_sets` rows (one per Set) |
| Shortfall report | Audit metadata (no schema column) |
| Audit trail | Draft audit (carried forward) |
| Version stack | Draft audit (carried forward) |

Every translation is recorded in the Draft's audit. The shape mismatch is explicit, not hidden.

### 13.5 Draft ↔ Published Exam Set

**Tension:** The Draft Builder produces Drafts (`status='draft'`). The existing publish lifecycle (`setExamSetStatusAction` + `validate_exam_set_for_publish` RPC, from Session 6.16) publishes them. Where does the Draft Builder's ownership end and the publish lifecycle's begin?

**Reconciliation:** **At persistence.** The Draft Builder's ownership ends when the Draft row exists in `exam_sets` with `status='draft'`. From there:

- The existing admin UI (Session 6.17) takes over: the Human can edit the Draft, add/remove Questions, change metadata.
- The existing publish lifecycle takes over for publishing: `setExamSetStatusAction` flips status to `published`, after the `validate_exam_set_for_publish` RPC enforces publish rules (≥1 Question, no duplicates, unique sort_order).

**Operational rule:** The Draft Builder **does not** invoke the publish lifecycle. It produces a Draft and stops. The Human decides when (and whether) to publish, via the existing UI.

**Publish validation note:** The Draft Builder does **not** pre-validate against publish rules (§6.2). It's possible to produce a Draft that fails publish validation (e.g. if the allocation has a shortfall leaving 0 Questions, the eventual publish will fail `validate_exam_set_for_publish`'s `no_questions` check). That's correct behavior — the Draft Builder materializes what was approved; publish-time validation is a separate, Human-gated step. If the Reviewer approved a 0-Question Set (unusual), the Draft Builder materializes it; publish will fail loudly when attempted.

### 13.6 Database ↔ Draft Builder

**Tension:** The Draft Builder is the only module permitted to write Engine output into `exam_sets` / `exam_set_questions`. But the existing admin UI's CRUD actions (`createExamSetAction`, `updateExamSetAction`) also write to those tables. Are these competing write paths?

**Reconciliation:** **Complementary, not competing.** The two write paths serve different purposes:

| Path | Purpose | Source |
|---|---|---|
| **Draft Builder** | Materialize Engine output (approved allocations) into Drafts | This spec |
| **Existing CRUD actions** | Human-driven Exam Set authoring/editing (manual creation, post-Draft edits) | Sessions 6.16–6.17 |

Both paths write to the same tables, but they have different *provenance*:

- Draft Builder writes carry **Engine audit** (Blueprint → ... → materialization).
- Manual CRUD writes carry **Human audit** (who edited, when).

The Draft Builder **may route its writes through the existing CRUD actions** (e.g. call `createExamSetAction` with materialized fields) — this reuses tested code and ensures RLS, validation, and audit hooks fire uniformly. Alternatively, the Draft Builder may write directly via a service-role client (per the existing `createAdminClient` pattern, used by `app/api/payment/webhook/route.ts` for system-initiated writes). **The choice is implementation; the contract is the same.**

**Operational rule:** A Draft produced by the Draft Builder is indistinguishable at the row level from a Draft produced manually — same schema, same `status='draft'`, same editability via the admin UI. The difference is *provenance* (Engine vs. Human), recorded in audit. This is what lets the existing admin UI work uniformly on both kinds of Draft.

### 13.7 Documentation of Reconciliation Decisions

Every reconciliation above is recorded here so that:

- Future implementers don't re-derive the resolutions.
- Future spec versions evaluate changes against the reconciled seams.
- The architecture remains coherent across the ten documents.
- The Draft Builder's role as **the single persistence seam between Engine and Exam Set system** is unambiguously established.

---

## Appendix A — Glossary

| Term | Definition |
|---|---|
| **Draft Builder** | The module that materializes an approved Assembly Result into a Draft Exam Set. |
| **Assembly Result** | The Runtime API's output (Engine contract world). |
| **Approved Allocation** | The Assembly Result after Review approval (the Draft Builder's input). |
| **Draft Exam Set** | An `exam_sets` row with `status='draft'`, produced by the Draft Builder. |
| **Published Exam Set** | An `exam_sets` row with `status='published'`, produced by the existing publish lifecycle. |
| **Materialization** | The act of translating an approved allocation into persisted Exam Set rows. |
| **Fidelity** | The principle that the persisted Draft matches the approved allocation exactly. |
| **Persistence Isolation** | The Draft Builder writes only to `exam_sets` / `exam_set_questions` (+ audit); nothing else. |
| **Idempotency** | Same approved allocation → same Draft (no duplicates on retry). |
| **Atomicity** | Each Set's materialization succeeds or fails as a unit; multi-Set batches are coordinated-atomic. |
| **Shortfall** | An unmet Blueprint target (e.g. a Rejected Slot); recorded in audit, not filled. |

---

## Appendix B — Boundary Assertions

The non-negotiable contracts of this specification.

1. **The Draft Builder only materializes; it never decides.** Every decision is upstream.
2. **The Draft Builder consumes the approved Assembly Result.** Approval is a precondition.
3. **The Draft Builder writes only to `exam_sets` and `exam_set_questions` (+ audit location).** Persistence isolation.
4. **The Draft Builder never publishes.** Publishing is the existing Human-gated lifecycle.
5. **The Draft Builder persists references, never content.** Question content stays in `questions`.
6. **The Draft Builder persists placements, never process.** Reservations/Replacements/Conflicts are audit-only.
7. **The persisted Draft is faithful to the approved allocation.** No drift, no reordering, no silent substitution.
8. **Shortfalls are recorded, not filled.** A Draft may have fewer Questions than the Blueprint target.
9. **Materialization is atomic.** Complete batches or nothing; no partial state.
10. **The Draft Builder is idempotent.** Same input → same Draft.
11. **Audit continuity runs from Blueprint to publication.** Every transition is traceable.
12. **The Draft Builder is deterministic, transparent, persistence-isolated, and LLM-free.**

---

## Appendix C — Provenance & Cross-References

- **Engine alignment:** The Draft Builder is Engine Foundation v1.0 §5.5's "Draft Builder" module, realized against the real Exam Set substrate built in Sessions 6.16–6.17.
- **Integration Spec alignment:** The Draft Builder honors `run_unit = blueprint` (Integration Spec §5.1) by producing N Drafts per Assembly Result. It carries the Blueprint's intent (subject, document, exam_type) into `exam_sets` columns.
- **Reader alignment:** No direct interaction. The Draft Builder is five modules downstream.
- **Candidate Generation alignment:** No direct interaction. The Draft Builder consumes placements, not the CandidateSet.
- **Scoring Model alignment:** No direct interaction. Scores are audit-only in the Draft (not persisted as columns).
- **Candidate Ranking alignment:** No direct interaction. Rankings are audit-only.
- **Allocation Model alignment:** Reconciled in §13.3. The Draft Builder persists only final Assignments; Allocation process (Reservations, Conflicts, Replacements) is audit-only.
- **Constraint Solver alignment:** Reconciled in §13.2. The Draft Builder consumes placements verbatim; no re-derivation.
- **Runtime API alignment:** Reconciled in §13.1. Ownership transfers at Assembly Result delivery; Review sits between.
- **Exam Set system alignment (Sessions 6.16–6.17):** Reconciled in §13.5 and §13.6. The Draft Builder produces `status='draft'` rows conforming to the real schema; publish is the existing lifecycle; the Draft Builder may route through existing CRUD or write directly (implementation choice).
- **Blueprint fidelity:** Every Blueprint intent carried through the Assembly Result is materialized into the corresponding `exam_sets` column. Shortfalls are preserved honestly.

---

*End of Sobdai Draft Builder Architecture — v1.0.*

**Upstream sources (immutable):**
- Assessment Assembly Engine Foundation v1.0
- Blueprint Integration Specification v1.0
- Blueprint Reader Pipeline Architecture v1.0
- Candidate Generation Architecture v1.0
- Scoring Model Specification v1.0
- Candidate Ranking Architecture v1.0
- Allocation Model Specification v1.0
- Constraint Solver Architecture v1.0
- Assessment Engine Runtime API Specification v1.0

**Implemented substrate (immutable, real):**
- `exam_sets` / `exam_set_questions` schema (migrations 001, 019, 024, 026)
- Exam Set admin CRUD + publish lifecycle (Sessions 6.16–6.17)

**Persistence boundary status:** The Assessment Engine now has a single, specified persistence seam with the Exam Set system. Engine output (Assembly Result) is materialized into Draft Exam Sets by the Draft Builder; from there, the existing Human-gated publish lifecycle takes over. The full path — Blueprint → Engine → Draft → Published Exam Set — is architecturally complete.

**Remaining module to specify (later session):**
- Review Workbench Architecture (consumes Assembly Result; produces approved allocation; the Human-driven step between Engine and Draft Builder)

**Integration Gap IG-2 status:** Still the P0 prerequisite for any actual Engine run against Blueprint v3.0. The Draft Builder can be implemented against the existing schema today, but it cannot produce meaningful Drafts until the Bank persists `pattern`, `learning_objective`, and the other axes Blueprint v3.0 filters on.
