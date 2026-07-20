# Sobdai Assessment Assembly Engine — Foundation v1.0

**Status:** Official Architecture Specification
**Scope:** Architecture & Product Design only. No code, no SQL, no schema, no migrations.
**Owner:** Sobdai Architecture
**Version:** 1.0 (Foundation)

---

## 0. Executive Summary

The **Assessment Assembly Engine** is the production system that turns an **Assessment Blueprint** into a **Draft Exam Set** of *existing* Question Codes, ready for Human Review and Publish.

It is **not** a question generator. It assembles.

The Engine belongs to the **Assessment System** — the pipeline that measures readiness. It must never touch the **Learning System** (Reference → Question Bank → Document Exam Sets → Packages). The two systems share the Question Bank as a read-only substrate but have independent lifecycles.

The defining architectural constraint is **Token Efficiency**. Every module is designed to minimize input tokens, output tokens, context-window usage, LLM calls, duplicate context, and processing cost. The Engine must scale to **hundreds of thousands of questions** without proportional token growth. This is achieved by a single non-negotiable rule: **filter before reason** — SQL and application logic do all filtering, sorting, grouping, counting, and candidate generation; the LLM is reserved exclusively for reasoning and decision support.

The Human is always the final decision maker. The Engine proposes; the Human disposes.

---

## 1. Product Vision

### 1.1 The Separation

Sobdai separates **Learning** from **Assessment**. They share data, not purpose.

**Learning System** (unchanged by this spec)

```
Reference Document
        │
        ▼
LM Question Generation
        │
        ▼
Question Bank
        │
        ▼
Document Exam Sets
        │
        ▼
Packages
        │
        ▼
Learners
```

**Assessment System** (this spec)

```
Assessment Blueprint
        │
        ▼
Assembly Engine  ◄──── reads Question Bank (read-only)
        │
        ▼
Candidate Question Codes
        │
        ▼
Human Review
        │
        ▼
Draft Exam Set
        │
        ▼
Simulation Assessment  ────► Learners
```

### 1.2 What the Engine Is

A deterministic-first, LLM-assisted assembler that reads a Blueprint, queries the Question Bank for candidates using nothing but metadata, ranks candidates with minimal LLM involvement, and produces a reviewable Draft.

### 1.3 What the Engine Is Not

- ❌ Not a question generator
- ❌ Not a question editor
- ❌ Not an explanation generator
- ❌ Not a publisher
- ❌ Not a part of the Learning System
- ❌ Not a substitute for Human Review

Question generation, editing, rewriting, and explanation authoring belong to a separate pipeline (the Learning System). The Engine consumes that pipeline's outputs (Question Codes) and never produces them.

---

## 2. Engine Lifecycle

The lifecycle has **six stages**. Only stages 4 and 5 may use the LLM; stages 1–3 and 6 are deterministic.

```
┌─────────────────────────────────────────────────────────────────┐
│  1. BLUEPRINT INTAKE     · deterministic · reads Blueprint       │
│         │                                                       │
│         ▼                                                       │
│  2. CANDIDATE GENERATION · deterministic · SQL + app logic      │
│         │                 filters Bank by Blueprint metadata    │
│         ▼                                                       │
│  3. CANDIDATE SCORING    · deterministic · rule-based ranking   │
│         │                 (no LLM)                              │
│         ▼                                                       │
│  4. REASONING (optional) · LLM          · only if Stage 3 ties  │
│         │                                or ambiguous            │
│         ▼                                                       │
│  5. DRAFT ASSEMBLY       · deterministic · selects final set    │
│         │                                                       │
│         ▼                                                       │
│  6. HUMAN REVIEW         · human       · approve / edit / reject│
│         │                                                       │
│         ▼                                                       │
│     PUBLISH  (out of Engine scope — uses Exam Set lifecycle)    │
└─────────────────────────────────────────────────────────────────┘
```

### 2.1 Stage Characteristics

| Stage | Type | Reads | Writes | LLM? |
|---|---|---|---|---|
| 1. Blueprint Intake | Deterministic | Blueprint | Run state | No |
| 2. Candidate Generation | Deterministic | Question Bank metadata | Candidate set (Codes only) | No |
| 3. Candidate Scoring | Deterministic | Candidate metadata | Scored candidates | No |
| 4. Reasoning | LLM (optional) | Candidate metadata subset | Reasoning notes | **Yes** (gated) |
| 5. Draft Assembly | Deterministic | Scored candidates | Draft Exam Set | No |
| 6. Human Review | Human | Draft + context | Approved/edited Draft | No |

The LLM is the **most expensive and least deterministic** stage, so it appears latest and is gated behind a condition. In the common case, Stages 1–3 + 5 are sufficient and Stage 4 is skipped entirely.

---

## 3. System Modules

The Engine is modular. Each module has a single responsibility and a defined contract. Modules communicate via **plain data structures keyed by Question Code** — never via full Question objects.

### 3.1 Module Map

```
                     ┌──────────────────────┐
                     │   Assessment         │
   Blueprint ───────►│   Blueprint          │
                     │   (input contract)   │
                     └──────────┬───────────┘
                                │
                     ┌──────────▼───────────┐
                     │   1. Blueprint       │  reads Blueprint
                     │      Reader          │  validates + normalizes
                     └──────────┬───────────┘
                                │ AssemblyRequest
                     ┌──────────▼───────────┐
   Question Bank ───►│   2. Candidate       │  SQL filtering only
   (read-only)       │      Generator       │  emits Question Codes
                     └──────────┬───────────┘
                                │ CandidateSet (Codes + metadata)
                     ┌──────────▼───────────┐
                     │   3. Candidate       │  rule-based ranking
                     │      Ranking         │  no LLM
                     └──────────┬───────────┘
                                │ ScoredCandidates
                     ┌──────────▼───────────┐
                     │   4. Review          │  Admin UI surface
   Human ───────────►│      Workbench       │  Human edits selection
                     └──────────┬───────────┘
                                │ ApprovedSelection
                     ┌──────────▼───────────┐
                     │   5. Draft Builder   │  writes Draft Exam Set
                     │                      │  via existing CRUD
                     └──────────┬───────────┘
                                │
                                ▼
                          Draft Exam Set ──► Publish (existing lifecycle)
```

### 3.2 Module Summary

| # | Module | Responsibility | LLM? |
|---|---|---|---|
| 1 | **Blueprint Reader** | Read & validate the Blueprint; emit a normalized `AssemblyRequest` | No |
| 2 | **Candidate Generator** | Query the Bank by metadata; emit a `CandidateSet` of Codes | No |
| 3 | **Candidate Ranking** | Score candidates by rules; emit `ScoredCandidates` | No (gated optional LLM) |
| 4 | **Review Workbench** | Present candidates to the Human; capture decisions | No |
| 5 | **Draft Builder** | Convert approved selection into a Draft Exam Set | No |

---

## 4. Data Flow

### 4.1 Core Contract: "Codes, not Content"

The single most important data-flow rule:

> **Between modules, data flows as Question Codes and metadata — never as full Question bodies.**

A Question Code (e.g. `Q-000001`) plus lightweight metadata (subject, document, difficulty, topic, law, usage count) is the unit of exchange. The full Question — content, choices, explanations — is fetched **only** when a Human opens the Review Workbench, and **only** for the candidates on screen.

This is what makes the Engine token-efficient and scalable: the size of the data in flight is proportional to the *Blueprint's target question count* (e.g. 100), never to the *Bank size* (e.g. 250,000).

### 4.2 The Pipeline Payload

At each boundary, a typed payload flows forward. (Names are conceptual; this is architecture, not implementation.)

```
Blueprint
   │
   ▼  Blueprint Reader
AssemblyRequest
   ├─ target_count        (e.g. 100)
   ├─ profile             (e.g. "simulation")
   ├─ coverage_rules      (subject/document/topic distribution)
   ├─ difficulty_rules    (Easy/Medium/Hard distribution)
   ├─ exclusion_rules     (Codes already used, recent Codes, etc.)
   └─ constraints         (time limit, etc.)
   │
   ▼  Candidate Generator (queries Bank)
CandidateSet
   ├─ codes[]             (just Question Codes)
   ├─ metadata{}          (subject/doc/difficulty/topic/law/usage per Code)
   └─ provenance          (which filters produced this set)
   │
   ▼  Candidate Ranking
ScoredCandidates
   ├─ ranked_codes[]      (Codes ordered by score)
   ├─ score_breakdown{}   (why each Code ranked where it did)
   └─ coverage_fit        (how well the top-N satisfies coverage rules)
   │
   ▼  Review Workbench (Human)
ApprovedSelection
   ├─ selected_codes[]
   ├─ ordering[]          (display_order intent)
   ├─ human_notes
   └─ reviewer_id
   │
   ▼  Draft Builder
Draft Exam Set   (status = 'draft', via existing Exam Set CRUD)
```

### 4.3 Where Content Lives

| Consumer | Sees full content? | When? |
|---|---|---|
| Blueprint Reader | No | Never |
| Candidate Generator | No | Never |
| Candidate Ranking | No (metadata only) | Never |
| Reasoning LLM (optional) | **No** (metadata subset) | Only on gated invocation |
| Review Workbench | **Yes — paginated, on demand** | When Human opens a candidate |
| Draft Builder | No | Never (writes Codes via existing junction) |

Full content crosses a module boundary **exactly once** per candidate, and only when a Human chooses to inspect it. Every other stage operates on Codes + metadata.

---

## 5. Module Responsibilities

### 5.1 Blueprint Reader

**Input:** An Assessment Blueprint (an externally-defined artifact; its internal format is out of scope for v1.0 — the Engine only requires that it conform to the `AssemblyRequest` contract).

**Responsibilities:**
- Parse and validate the Blueprint.
- Normalize all rules into the `AssemblyRequest` contract.
- Fail fast on invalid or contradictory rules (e.g. target_count > available pool).
- Emit a single, immutable `AssemblyRequest`.

**Hard rules:**
- No LLM.
- No Bank access.
- Pure transformation + validation.

**Failure modes:**
- Malformed Blueprint → reject with structured error.
- Unsatisfiable rules (e.g. demand 50 Hard questions when only 10 exist) → reject **before** any candidate work, with a precise shortfall report.

### 5.2 Candidate Generator

**Input:** `AssemblyRequest`.

**Responsibilities:**
- Translate coverage, difficulty, and exclusion rules into **pure SQL/metadata queries** against the Question Bank.
- Produce the smallest possible `CandidateSet` that can satisfy the Blueprint — over-fetch only enough to give Ranking room to optimize.
- Emit **Question Codes + metadata only**.

**Hard rules:**
- No LLM. Ever.
- No full Question content leaves this module.
- Filtering, sorting, grouping, counting are all done in SQL/Postgres — the application layer only composes queries, it does not post-process large row sets.
- Reuses the existing metadata substrate (the same `subject`/`document`/`topic`/`law`/`difficulty` columns and the existing read-only metadata RPCs that already power the Admin Question Picker).

**Token rationale:** If the Bank has 250,000 Questions but the Blueprint targets 100 Questions across 3 subjects and 2 difficulties, the CandidateSet is bounded by the *intersection* of those filters — typically a few hundred Codes — not 250,000. The LLM never sees the Bank's size.

**Failure modes:**
- Empty candidate pool for a required slice → return shortfall (which Rules Engine or Human must resolve).
- Bank query timeout → retry with bounded backoff; surface to Admin.

### 5.3 Candidate Ranking

**Input:** `CandidateSet`.

**Responsibilities:**
- Apply deterministic scoring rules (coverage fit, difficulty match, usage balance, freshness, exclusion compliance).
- Rank candidates per slot in the Blueprint.
- Emit `ScoredCandidates` with a transparent `score_breakdown` so the Human can see *why* a Code ranked where it did.

**Hard rules:**
- Default path: **no LLM**. Pure rule-based scoring.
- LLM is permitted **only** as an optional, gated tie-breaker when rules produce indistinguishable candidates *and* the Blueprint explicitly enables reasoning. Even then, the LLM receives a **metadata subset** (Codes + the tied axis), never content.

**Token rationale:** Ranking is the stage where naive designs burn tokens by asking the LLM to "pick the best 100 from these 500." The Engine forbids that. Rules rank first; the LLM is invoked only on the narrow residual.

**Failure modes:**
- Indistinguishable candidates with reasoning disabled → deterministic tie-break (e.g. lower Code wins) + flag for Human attention.
- Reasoning invocation fails → fall back to deterministic tie-break; never block the pipeline on the LLM.

### 5.4 Review Workbench

**Input:** `ScoredCandidates`.

**Responsibilities:**
- Present ranked candidates to the Human, grouped by Blueprint slot/coverage area.
- Show the score breakdown and coverage fit so decisions are explainable.
- Let the Human **add, remove, reorder, and substitute** candidates.
- Lazy-load full Question content **only for candidates the Human expands** — paginated, on demand.
- Capture the Human's final `ApprovedSelection`.

**Hard rules:**
- The Human's decision is final within this stage. The Engine never overrides a Human edit.
- No LLM in the Workbench itself.
- Content fetch is per-candidate, per-page — never "load all 100 full questions at once" unless the Human explicitly requests it.

**Failure modes:**
- Human abandons review → Draft remains unapproved; no Exam Set is created. The Engine never auto-publishes.
- Human substitutes a Code outside the candidate pool → allowed (Human authority), but flagged as "off-blueprint" for auditability.

### 5.5 Draft Builder

**Input:** `ApprovedSelection`.

**Responsibilities:**
- Convert the approved Codes into a **Draft Exam Set** (`status = 'draft'`) using the **existing Exam Set CRUD** — the same `createExamSetAction` path a Human uses manually.
- Populate `display_order` from the Human's ordering.
- Attach Blueprint provenance (which Blueprint produced this Draft) for auditability.
- Hand off to the existing publish lifecycle (`setExamSetStatusAction`) — **Publish is not the Engine's job.**

**Hard rules:**
- No LLM.
- No Question creation, editing, or duplication — it links **existing** Codes via the existing `exam_set_questions` junction.
- Must reuse the existing Exam Set foundation (migration 026 fields: `exam_type`, `subject`, `document`, `status`).

**Failure modes:**
- Junction write fails → transactional rollback; no partial Draft.
- Code no longer exists (deleted between Review and Build) → reject with the missing Code; Human must re-review.

---

## 6. Admin Workflow

The Admin (content operations) workflow is entirely human-driven. The Engine assists; it does not act autonomously.

### 6.1 End-to-End Admin Flow

```
1. Admin selects an Assessment Blueprint
        │
        ▼
2. Admin clicks "Generate Candidates"
        │  (Engine runs Stages 1–3 deterministically)
        ▼
3. Admin opens Review Workbench
        │  (sees ranked Candidate Codes + metadata + scores)
        ▼
4. Admin reviews, substitutes, reorders
        │  (full content loaded on expand, per candidate)
        ▼
5. Admin approves selection
        │
        ▼
6. Engine builds Draft Exam Set (status = 'draft')
        │
        ▼
7. Admin opens Draft in existing Exam Set editor
        │  (further edits allowed; normal Exam Set UX)
        ▼
8. Admin publishes via existing Publish action
        (setExamSetStatusAction → validate_exam_set_for_publish RPC)
```

### 6.2 Workflow Principles

- **Every Engine run is bound to a Blueprint and a Human.** No background autonomous assembly.
- **Every transition is reviewable.** The Admin sees candidates, scores, and coverage fit before approving.
- **The Draft is editable.** The Engine's output is a starting point, not a locked artifact. The Admin can use the full Exam Set editor (Session 6.17) on the Draft before publishing.
- **Publish is the existing path.** The Engine does not bypass `setExamSetStatusAction` or its server-side validation RPC. A Draft assembled by the Engine must pass the same publish rules as a manually created set.

---

## 7. Failure Handling

The Engine fails **safe and loud**. It never silently produces a degraded Draft.

### 7.1 Failure Philosophy

- **Never auto-publish.** Any failure halts before Draft Builder or surfaces to the Human.
- **Never guess.** If the Bank cannot satisfy a Blueprint slice, the Engine reports the shortfall rather than substituting silently.
- **Never lose Human work.** The Review Workbench's in-progress state is durable across Engine failures.
- **Degrade to deterministic.** If the optional LLM stage fails, the Engine falls back to rule-based ranking — it never blocks on the LLM.

### 7.2 Failure Catalogue

| Failure | Stage | Handling |
|---|---|---|
| Malformed Blueprint | 1 | Reject before any Bank access; structured error to Admin |
| Unsatisfiable coverage (e.g. not enough Hard Qs) | 1 or 2 | Reject with per-slice shortfall report |
| Empty candidate pool | 2 | Return empty CandidateSet + shortfall; Admin adjusts Blueprint or Bank |
| Bank query timeout | 2 | Bounded retry; surface to Admin on exhaustion |
| Ranking indistinguishable, reasoning disabled | 3 | Deterministic tie-break + flag for Human |
| Optional LLM invocation fails | 3 (gated) | Fall back to deterministic tie-break; never block |
| Human abandons review | 4 | No Draft created; in-progress state preserved |
| Human substitutes off-blueprint Code | 4 | Allowed; flagged "off-blueprint" for audit |
| Junction write fails | 5 | Transactional rollback; no partial Draft |
| Code deleted between Review and Build | 5 | Reject with missing Code; re-review required |

### 7.3 Auditability

Every Engine run records:
- The Blueprint it ran against.
- The CandidateSet it produced (Codes + provenance).
- The ranking scores and any LLM reasoning notes.
- The Human's edits (adds/removes/reorders/substitutions).
- The resulting Draft Exam Set ID.

This audit trail is metadata-only (Codes + decisions), so it is cheap to store at scale.

---

## 8. Future Extensibility

The v1.0 architecture is deliberately narrow: one Blueprint in → one Draft Exam Set out, Human-gated. The module boundaries are chosen so future capabilities extend without restructure.

### 8.1 Extension Principles

1. **Profiles extend, not fork.** The `AssemblyRequest` carries a `profile` field. Future Profiles (Diagnostic, Weekly Challenge, Final Challenge, AI Adaptive) extend the ruleset — they do not fork the Engine. The module contracts stay fixed; only the rules inside Candidate Generator and Ranking change per Profile. (This mirrors the established Blueprint Profile model: shared rules + Profile-specific rules.)

2. **New selection strategies plug into Ranking.** v1.0 uses rule-based scoring. Future strategies (e.g. similarity-aware selection, coverage maximization algorithms) are new implementations of the same Ranking contract — they consume a CandidateSet and emit ScoredCandidates.

3. **LLM use broadens only behind gates.** Any future LLM-powered feature (e.g. difficulty estimation, distractor-quality hints) is a **gated, optional stage** that receives metadata, never content. The "filter before reason" principle is permanent and applies to all future modules.

4. **The Bank contract is read-only and stable.** The Engine depends only on Question Codes + the existing metadata substrate. Any future Bank enrichment (new metadata columns) is available to the Engine automatically; the Engine never writes to the Bank.

5. **Draft Builder is the only writer, and only via existing CRUD.** No future module writes to Exam Sets except through the established CRUD + publish lifecycle. This guarantees all Drafts — manual or Engine-produced — pass the same validation.

### 8.2 Explicitly Deferred (Out of v1.0)

These are intentionally **not** designed in v1.0 and should not be inferred:

- Auto-publish or scheduled assembly
- AI-generated Questions or explanations (belongs to Learning System)
- Similarity detection between candidates
- Adaptive / branching assessments
- Coverage analytics dashboards
- Versioned Blueprints
- Multi-Draft batch assembly
- Real-time candidate streaming

Deferral is a feature, not a gap: v1.0's value is a **reliable, token-cheap, Human-gated assembler**. Each deferred item is a candidate for a later version against the same module contracts.

---

## 9. Token-Efficient Architecture

This section elevates token efficiency from a goal to an enforceable contract. Every module must satisfy it.

### 9.1 The Mandate

> The Engine's token cost must scale with the **Blueprint's target question count**, never with the **Bank size**. A Blueprint targeting 100 Questions out of a 250,000-Question Bank must cost roughly the same tokens as the same Blueprint against a 10,000-Question Bank.

### 9.2 The Eight Principles, Enforced

| # | Principle | How v1.0 Enforces It |
|---|---|---|
| 1 | **Filter before reason** | Stages 1–3 are deterministic SQL/app logic; LLM only at gated Stage 4 |
| 2 | **Never send unnecessary content** | Modules exchange Codes + metadata; content leaves the Bank only when a Human expands a candidate |
| 3 | **Prefer metadata over full questions** | CandidateSet carries only the metadata axes the Blueprint filters/scores on |
| 4 | **Prefer Codes and IDs over objects** | The unit of exchange is the Question Code; full objects never flow between modules |
| 5 | **SQL/app logic does the DB work** | Filtering, sorting, grouping, counting, candidate generation are all in Postgres/app — the LLM does zero DB work |
| 6 | **LLM only reasons** | The LLM's permitted inputs are metadata subsets; its permitted outputs are ranking hints / reasoning notes — never selections, never content |
| 7 | **No repeated context** | Each stage consumes the previous stage's output in place; nothing is re-fetched or re-sent. The optional LLM stage receives only the *residual* (tied candidates), not the full CandidateSet |
| 8 | **Minimum token design per module** | Every module's contract specifies its max payload shape; payloads are bounded by `target_count`, not Bank size |

### 9.3 Anti-Patterns the Architecture Forbids

These are explicit **non-gratae** in v1.0 and all future versions:

- ❌ Sending the full Question Bank (or any large slice) to an LLM "to pick from."
- ❌ Sending full Question content between modules.
- ❌ Asking an LLM to count, filter, sort, or group.
- ❌ Re-sending identical context across LLM calls.
- ❌ Token cost proportional to Bank size.
- ❌ Using the LLM as the default path when rules suffice.

### 9.4 Scaling Posture

At 250,000 Questions:
- CandidateSet size is bounded by Blueprint filter cardinality (typically hundreds of Codes), not 250,000.
- LLM context, when invoked, is bounded by the residual tied set (typically tens of Codes), not the CandidateSet.
- Human Review loads content paginated, on demand — at most a screenful at a time.
- Audit trail is Codes + decisions — O(target_count), not O(Bank).

The Engine's token bill is a function of *how many Questions the Blueprint asks for*, not *how many exist*.

---

## 10. Recommended Implementation Roadmap

A staged path from this specification to a first production release. Each phase is independently shippable and Human-gated end-to-end.

### Phase A — Deterministic Backbone (no LLM)

**Goal:** Prove the token-efficient core without any LLM dependency.

- Implement the `AssemblyRequest` contract and Blueprint Reader.
- Implement Candidate Generator as pure SQL over the existing metadata substrate + read-only RPCs.
- Implement Candidate Ranking as pure rule-based scoring.
- Implement Draft Builder on top of existing Exam Set CRUD.
- Ship a minimal Review Workbench (ranked list + add/remove/reorder + approve).

**Exit criteria:** An Admin can take a Blueprint, get a deterministic Draft, edit it, and publish — with **zero LLM calls**. This alone is a useful product and validates the architecture.

### Phase B — Transparency & Audit

**Goal:** Make the Engine trustworthy.

- Persist the audit trail (Blueprint → CandidateSet → scores → Human edits → Draft).
- Surface score breakdowns and coverage fit in the Workbench.
- Surface shortfalls and off-blueprint substitutions clearly.

**Exit criteria:** Every Draft is fully explainable: which Blueprint, which candidates, why ranked, what the Human changed.

### Phase C — Gated LLM Reasoning (optional)

**Goal:** Add LLM value only where rules are insufficient.

- Add the optional, gated Stage 4 tie-breaker.
- Strict input contract: metadata subset of tied candidates only.
- Strict output contract: ranking hints + reasoning notes, never selections.
- Always-fail-safe to deterministic ranking.

**Exit criteria:** LLM use is measurable, bounded, and off by default; turning it on improves tie-breaks without changing token scaling.

### Phase D — Profile Expansion

**Goal:** Extend beyond the v1.0 Profile without restructuring.

- Add new Profiles (Diagnostic, Weekly Challenge, etc.) as rulesets inside the existing module contracts.
- No changes to module boundaries, data-flow contracts, or the Bank interface.

**Exit criteria:** A new Profile ships as configuration + rules, not as new modules.

### Roadmap Principles

- **Phase A is the product.** Phases B–D make it better, but Phase A alone fulfills the spec's core promise: a token-efficient, Human-gated assembler of existing Question Codes.
- **No phase adds an LLM dependency that blocks the pipeline.** Phase C makes the LLM *available*, never *required*.
- **Every phase preserves the separation.** The Learning System is untouched throughout.

---

## Appendix A — Glossary

| Term | Definition |
|---|---|
| **Assessment Blueprint** | The specification of a desired assessment: target count, coverage, difficulty, exclusions, constraints. Input to the Engine. |
| **AssemblyRequest** | The normalized, validated form of a Blueprint, emitted by the Blueprint Reader. |
| **CandidateSet** | The set of Question Codes (+ metadata) produced by querying the Bank against an AssemblyRequest. Codes only. |
| **ScoredCandidates** | The CandidateSet after rule-based ranking, with per-Code score breakdowns. |
| **ApprovedSelection** | The Human's final selection + ordering, captured by the Review Workbench. |
| **Draft Exam Set** | An Exam Set with `status = 'draft'`, produced by Draft Builder via existing CRUD. |
| **Profile** | A named ruleset that specializes the Blueprint (e.g. simulation, diagnostic). Shared rules + Profile-specific rules. |
| **Question Code** | The immutable business identifier of a Question (e.g. `Q-000001`). The unit of exchange between modules. |
| **Learning System** | Reference → Question Bank → Document Exam Sets → Packages. Untouched by this spec. |
| **Assessment System** | Blueprint → Engine → Draft → Publish. The system this spec defines. |

---

## Appendix B — Boundary Assertions

These are the non-negotiable contracts of v1.0. Any future change must be evaluated against them.

1. The Engine **reads** the Question Bank; it **never writes** to it.
2. The Engine **assembles** existing Question Codes; it **never creates, edits, or rewrites** Questions.
3. The Engine **never generates explanations.**
4. The Engine **never publishes.** Publish is the existing Exam Set lifecycle.
5. The Engine **never overrides Human Review.** The Human's ApprovedSelection is final within the run.
6. The Engine's token cost scales with **target_count**, never **Bank size.**
7. The LLM is **gated and optional.** The default path is fully deterministic.
8. The Engine belongs to the **Assessment System** and must not alter the **Learning System.**

---

*End of Sobdai Assessment Assembly Engine — Foundation v1.0.*
