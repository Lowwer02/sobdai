# Sobdai Candidate Ranking Architecture — v1.0

**Status:** Official Architecture Specification (Architecture only — no implementation, no algorithm, no SQL, no code, no formulas, no pseudocode, no UI)
**Sources of truth (exhaustive, immutable):**
1. `assessment_assembly_engine_foundation_v1.md` — Assessment Assembly Engine Foundation v1.0
2. `blueprint_integration_specification_v1.md` — Blueprint Integration Specification v1.0
3. `blueprint_reader_pipeline_architecture_v1.md` — Blueprint Reader Pipeline Architecture v1.0
4. `candidate_generation_architecture_v1.md` — Candidate Generation Architecture v1.0
5. `scoring_model_specification_v1.md` — Scoring Model Specification v1.0
**Version:** 1.0
**Owner:** Chief Assessment Architect, Sobdai

> **What this document is.** This is the architecture of the **first consumer of the Scoring Model**. Candidate Ranking takes a `CandidateSet` and produces a `RankedCandidateSet` — a deterministic, fully-explained ordering of Candidates per Blueprint slot. Where the Scoring Model fixed the *language* of evaluation (Components, Composite, Confidence, Penalty, Breakdown), this spec fixes the *runtime pipeline* that produces ordering and the *output contract* the Constraint Solver consumes.
>
> **What this document is not.** Not an algorithm. Not a sorting routine. Not a weighting scheme. Not the Scoring Model (immutable; consumed exactly as defined). Not the Constraint Solver, Review Workbench, or Draft Builder (later sessions). Ranking evaluates and orders; it does not select, allocate, or decide.
>
> **Authoritative-source note.** The Scoring Model v1.0 §3 fixes the scoring lifecycle as: Signals → Components → Normalized Scores → Composite → Confidence (propagated) → Penalties. This spec's runtime pipeline honors that lifecycle exactly. The stage list below names the *runtime* phases of Ranking's work; where the names parallel Scoring Model stages, the Scoring Model is authoritative on semantics and Ranking is authoritative on *when and how* those stages execute at runtime.

---

## 0. Executive Summary

Candidate Ranking is an **evaluation module, not a decision module**. Its sole output is a `RankedCandidateSet`: for every Blueprint slot, a deterministic ordering of the Candidates that could fill it, each position fully explainable and each ordering decision backed by evidence. Ranking does not choose which Candidates become a Draft — the Constraint Solver finds a feasible joint allocation, the Human Reviewer makes the final call. Ranking's job is to give both of them the best-possible ordered input.

The module's defining relationship is with the **Scoring Model**. Ranking is the Scoring Model's first and canonical consumer. Concretely:

- Ranking **computes** Scores (it owns score computation; no other module does — Scoring Model §9).
- Ranking **consumes** the Scoring Model's vocabulary exactly — it does not invent Components, redefine Confidence, or alter Penalty semantics.
- Ranking **emits** Scores inside its RankedCandidateSet — and downstream modules (Solver, Review) consume them read-only.

The architectural separation at the heart of this spec is **Score vs. Rank**. A Score is an evaluation of one Candidate against one slot (per Scoring Model: per-(Candidate × slot), carrying value + Confidence + Penalties + Breakdown). A Rank is a **position in an ordering**. They are related but distinct: a high Score usually implies a high Rank, but ties, ordering stability requirements, and slot-relative context mean the mapping is not mechanical. Ranking owns the translation from Scores to Ranks, and that translation must be transparent, deterministic, and explainable.

Three operating principles govern the design:

1. **Scoring Model Driven (Principle 2).** Ranking's evaluation vocabulary is fixed upstream. Ranking implements the model; it does not extend it.
2. **Metadata First (Principle 3).** Signal Extraction operates on CandidateSet metadata; Question content never enters Ranking (Scoring Model §12.2; content boundary is inherited).
3. **Deterministic Ordering (Principle 1).** Same CandidateSet → same RankedCandidateSet, always. Ordering is reproducible across runs and implementations.

The architecture scales with **CandidateSet size, not Bank size** (Scoring Model §12.5; Candidate Generation §12.3) — Ranking never touches the Bank, only the CandidateSet it receives.

---

## 1. Module Overview

### 1.1 Purpose

To transform a `CandidateSet` into a deterministic, fully-explained `RankedCandidateSet` — one ordering per Blueprint slot — by consuming the Scoring Model to evaluate every Candidate and then translating evaluations into stable, transparent ranks.

### 1.2 Responsibilities

| Ranking IS responsible for | Ranking is NOT responsible for |
|---|---|
| Extracting Raw Signals from CandidateSet metadata | Generating or modifying the CandidateSet |
| Computing Score Components, Composite, Confidence, Penalties (per Scoring Model) | Inventing Score Components outside the v1.0 vocabulary |
| Ordering Candidates per slot | Selecting Candidates (Constraint Solver) |
| Resolving ties deterministically | Solving joint constraints (Constraint Solver) |
| Producing the RankedCandidateSet contract | Producing Drafts (Draft Builder) |
| Explaining every rank position | Authoring or modifying the Blueprint |
| Honoring Maximum Recall (penalize, not drop) | Reading Question content |

### 1.3 Ownership

Ranking owns **one transformation**: `CandidateSet → RankedCandidateSet`. Within it, Ranking owns:
- Signal Extraction (its mechanics, not the Scoring Model's — Scoring Model defines what a Signal *is*; Ranking defines *how* Signals are pulled at runtime).
- Score computation (per Scoring Model vocabulary).
- Ordering and tie resolution (Ranking's exclusive domain — no other module orders).
- The RankedCandidateSet output contract.

Ranking does **not** own: the CandidateSet (Generator owns), the Scoring Model vocabulary (Scoring Model spec owns), the joint allocation (Solver owns), or the final selection (Human owns).

### 1.4 Lifecycle

Ranking is **stateless and synchronous** within a run:
- **Invocation:** one CandidateSet in.
- **Processing:** the §2 pipeline.
- **Termination:** either a RankedCandidateSet out, or a structured failure (§10). No state persists between runs.
- **Re-runs:** identical CandidateSet → identical RankedCandidateSet (Principle 1). Determinism is unconditional *given the input*; Ranking does not consult the Bank, the clock, or any external state.

### 1.5 Boundaries (summary — full matrix in §12)

- **CAN:** consume CandidateSet (read-only); compute Scores; order; resolve ties; emit RankedCandidateSet.
- **CANNOT:** read content; select; solve; touch the Bank; modify upstream/downstream contracts.
- **MUST NEVER:** invent Components; emit opaque rankings; modify Scores/Confidence/Penalties after computation; read content; use an LLM.
- **MUST ALWAYS:** be deterministic; consume the Scoring Model exactly; explain every rank; preserve Maximum Recall.

---

## 2. Runtime Pipeline

Seven runtime stages, each with one responsibility. Every stage is a pure function of its input; the pipeline is deterministic end-to-end.

### 2.1 Stage Map

| # | Stage | Responsibility | Scoring Model Alignment |
|---|---|---|---|
| 1 | **Signal Extraction** | Pull Raw Signals from CandidateSet metadata | Scoring Model §3: Raw Signals stage |
| 2 | **Scoring** | Compute Components → Normalized → Composite | Scoring Model §3 + §4 + §5 |
| 3 | **Confidence** | Propagate Confidence through Composite | Scoring Model §3 + §6 (propagated *with* scoring, honored here) |
| 4 | **Penalty Application** | Apply Soft/Hard/Disqualification penalties | Scoring Model §3 + §7 |
| 5 | **Ordering** | Translate (Composite, Confidence, Penalties) → per-slot order | Ranking's exclusive domain |
| 6 | **Tie Resolution** | Resolve equal-order Candidates deterministically | Ranking's exclusive domain |
| 7 | *(RankedCandidateSet)* | Final output contract | Ranking's exclusive domain |

**No stage reads Question content. No stage invokes an LLM. No stage consults the Bank.** Ranking operates on the CandidateSet alone.

### 2.2 Reconciliation with the Scoring Model Lifecycle

The Scoring Model v1.0 §3 establishes Confidence as **propagated through** scoring (Components → Composite), not appended after it. This spec honors that: the runtime "Confidence" stage above is the *materialization* of the propagated Confidence, not a separate computation bolted on after scoring. Concretely, during Scoring (stage 2), each Component carries its own Confidence; during the Confidence stage (3), those propagate into the Composite. The staging is a runtime phasing of one logical lifecycle, faithfully reflecting the Scoring Model.

### 2.3 Stage Contracts

| Stage | Input | Output | Responsibility | Failure Mode |
|---|---|---|---|---|
| Signal Extraction | CandidateSet | Raw Signals (per Candidate) | Extract factual signals with source + integrity + completeness | Fatal on malformed CandidateSet |
| Scoring | Raw Signals | Score Components → Normalized → Composite | Evaluate per Scoring Model vocabulary | Fatal on unsupported Scoring Model version |
| Confidence | Per-Component Confidence | Propagated Composite Confidence | Propagate honestly per Scoring Model §6 | Never fails (propagates; per Scoring Model §11) |
| Penalty Application | Composite + slot context | Composite + applied Penalties | Apply Scoring Model §7 penalties | Never fails (penalties are evaluations, not errors) |
| Ordering | Composite + Confidence + Penalties, per slot | Per-slot ordered list | Translate evaluation into rank | Fatal on internal ordering inconsistency |
| Tie Resolution | Per-slot ordered list with ties | Per-slot ordered list, ties resolved | Break ties deterministically | Fatal on unbounded tie overflow (§10) |
| RankedCandidateSet Emission | Resolved orderings + Scores | RankedCandidateSet | Final contract output | n/a |

### 2.4 Two Invariants Across the Pipeline

1. **Evaluation monotonically enriches; ordering monotonically reduces.** Stages 1–4 add information to each Candidate (Signals → Components → Composite → Confidence → Penalties). Stages 5–6 reduce multiplicity (Candidates become a single position per slot). No stage both enriches and orders.
2. **No silent dropping.** A Candidate that enters Ranking leaves it in some position (possibly last, possibly tie-resolved downward), with penalties applied — but it is never silently removed. Maximum Recall is preserved (Scoring Model §11; Candidate Generation §8.3).

---

## 3. Signal Extraction

### 3.1 Responsibility

Extract **Raw Signals** — factual observations about each Candidate — from CandidateSet metadata. Signals are the input to every Score Component; their quality determines downstream Confidence (Scoring Model §6).

### 3.2 Raw Signals

A Raw Signal is one atomic fact about a Candidate, drawn from CandidateSet metadata. Per Scoring Model §10.1, every Signal carries: value, source (which CandidateSet field), and extraction confidence (known / incomplete / missing / conflicting).

The signal inventory mirrors the Scoring Model's Component inputs (Scoring Model §4.1). Examples (the actual inventory is determined by the Component vocabulary, not invented by Ranking):

- `difficulty` (from CandidateSet metadata)
- `pattern` (from CandidateSet metadata; subject to Integration Gap IG-2)
- `learning_objective` (from CandidateSet metadata; subject to IG-2)
- `document`, `topic` (from CandidateSet metadata)
- `tier` (derived from `document` via the Document Registry; subject to IG-1)
- `usage_count` (from CandidateSet metadata)
- Freshness-relevant timestamps
- Generator Confidence (per Candidate Generation §5.2; an input to Scoring Confidence per Scoring Model §6.5)

### 3.3 Metadata Sources

Signals come **only from the CandidateSet**. Ranking does not:
- Query the Bank (the CandidateSet has already absorbed Bank data; Scoring Model §12.3).
- Read Question content (Scoring Model §12.2; content boundary).
- Consult external services.
- Re-derive data the Generator already produced.

This is the operational form of "Ranking scales with CandidateSet, not Bank."

### 3.4 Signal Integrity

Each Signal carries an **integrity classification** at extraction time:

| State | Meaning | Effect on Confidence |
|---|---|---|
| **Known** | Signal is present and trustworthy | No Confidence reduction |
| **Incomplete** | Signal is partially present (e.g. `topic` exists but doesn't match the Blueprint's curated strings) | Confidence reduced |
| **Missing** | Signal is entirely absent (e.g. `pattern` missing because the column doesn't exist — IG-2) | Confidence reduced; flagged |
| **Conflicting** | Two signals disagree (e.g. document-implied Tier vs. tag-implied Tier) | Confidence reduced; conflict flagged; **not** resolved by picking a winner |

Integrity is recorded per-Signal and propagates per Scoring Model §6.

### 3.5 Signal Completeness

Per-Candidate, Signal Extraction produces a **completeness summary**: which required signals are Known, which are not, and the overall integrity picture. This summary feeds:
- The Generator-Confidence input (Scoring Model §6.5).
- Each affected Component's Confidence (Scoring Model §6.3).
- The Breakdown's transparency (Scoring Model §8).

### 3.6 Signal Ownership

- **Extraction mechanics:** owned by Ranking (this spec).
- **Signal definition (what a Signal is):** owned by Scoring Model §10.1.
- **Signal sources (CandidateSet metadata fields):** owned by Candidate Generation Architecture (the CandidateSet contract).
- **Signal quality semantics:** owned by Scoring Model §6 (Confidence vocabulary).

Ranking extracts; it does not redefine.

### 3.7 What Signal Extraction Does NOT Do

- ❌ Does not invent signals.
- ❌ Does not resolve conflicts (it flags them).
- ❌ Does not read content.
- ❌ Does not query the Bank.
- ❌ Does not score (that's stage 2).

---

## 4. Scoring Integration

### 4.1 Responsibility

Compute Scores per the Scoring Model — Components, Normalized Scores, Composite, Confidence, Penalties — using the Signals extracted in stage 1.

### 4.2 How Ranking Consumes the Scoring Model

Ranking is the **canonical consumer and compute owner** of the Scoring Model (Scoring Model §9). Concretely:

| Scoring Model Element | Ranking's Relationship |
|---|---|
| **Score Components** (v1.0 vocabulary, Scoring Model §4.1) | Computes each, using extracted Signals. **May not invent** components outside v1.0. |
| **Normalized Scores** (Scoring Model §3) | Computes, per the model's common-scale requirement. |
| **Composite Score** (Scoring Model §5) | Computes per (Candidate × slot), with full Breakdown. |
| **Confidence** (Scoring Model §6) | Computes and propagates; honors Generator Confidence as input (§6.5). |
| **Penalties** (Scoring Model §7) | Applies Soft/Hard/Disqualification per model triggers. |
| **Breakdown** (Scoring Model §8) | Materializes for every Composite; non-negotiable. |

### 4.3 What "Consume" Means Here

"Consume the Scoring Model" does not mean "treat as a black box." Ranking **implements** the Scoring Model — it is the model's runtime. The constraints are:

- **Vocabulary fidelity.** Ranking computes exactly the v1.0 Components, no more, no less. New Components require a Scoring Model version bump (Scoring Model §15.6), not a unilateral Ranking extension.
- **Semantic fidelity.** Confidence means what Scoring Model §6 says it means; Penalties mean what §7 says they mean. Ranking does not reinterpret.
- **Transparency fidelity.** Every Composite carries a Breakdown per §8. Ranking may not emit opaque Composites.

### 4.4 What Ranking Does NOT Redefine

- ❌ The Component vocabulary.
- ❌ Confidence semantics or propagation rules.
- ❌ Penalty types or triggers.
- ❌ The Composite contract.
- ❌ The Breakdown contract.

If a future need appears to require changing any of these, the answer is a **Scoring Model version bump**, not a Ranking-side divergence. Ranking implementations track the Scoring Model version they implement.

### 4.5 Scoring Model Version Detection

The CandidateSet carries the Scoring Model version it expects (forward reference; the CandidateSet's metadata includes the scoring vocabulary version it was generated against). Ranking detects the version and either:
- Implements it (continue), or
- Fails loud (Fatal) if it cannot — never silently downgrades or upgrades.

---

## 5. Ordering

> Ordering and Tie Resolution (§6) are Ranking's exclusive domain. No other module orders Candidates.

### 5.1 Ordering Philosophy

Ordering translates **evaluation into position**. Each Candidate has, after stage 4, a per-slot evaluation: a Composite (value + Breakdown), a Confidence, and a set of applied Penalties. Ordering turns that evaluation into a position in a per-slot list.

The core principle: **ordering is evidence-based, not arbitrary.** Every position must be derivable from the evaluation. "Magic ordering" — ranks that cannot be traced to Scores — is an explicit Anti-Pattern (AP-8).

### 5.2 Ordering Inputs

Per slot, the ordering stage consumes:
- Each Candidate's Composite value.
- Each Candidate's propagated Confidence.
- Each Candidate's applied Penalties (Soft/Hard/Disqualification).
- Slot context (target counts, current fill state, constraint headroom — read-only from CandidateSet metadata).

### 5.3 Ordering Lifecycle

Ordering runs **after** Scoring + Confidence + Penalties are complete for the slot. It is a pure function of the evaluations; it does not feed back into scoring.

### 5.4 Ordering Stability

A stable ordering is one where **identical evaluations yield identical positions**. Concretely: if two runs produce identical Composites, Confidences, and Penalties for the same set of Candidates in the same slot, the ordering must be identical. Stability is the operational form of Determinism (Principle 1) at the ordering layer.

Stability requires:
- A **fixed ordering key** — the ordered tuple of evaluation facets that determines position (e.g. `⟨effective_value, confidence, penalty_status, tie_breaker_key⟩`). The exact key is an implementation concern, but it must be fixed and inspectable.
- **No dependence on input order.** The order in which Candidates appear in the CandidateSet must not affect the RankedCandidateSet. (This is why Ranking must not iterate CandidateSet order as part of its ordering key.)

### 5.5 Ordering Determinism

Three rules, jointly:

1. **Same input → same output.** Identical CandidateSet → identical RankedCandidateSet. Always.
2. **No external state.** Ordering does not consult the clock, random sources, the Bank, or any state outside the CandidateSet.
3. **Implementation-independence at the contract level.** Two conformant Ranking implementations given the same CandidateSet may differ in *how* they compute Scores (within the Scoring Model's freedom), but the *RankedCandidateSet contract* — its ordering shape, transparency fields, and explainability — is identical. (Numerical values may differ within Scoring Model latitude; positions are explainable either way.)

### 5.6 Ordering Transparency

Every position in the ordering must carry **why it is there** (§9). Transparency at the ordering layer means:
- Which evaluation facets determined the position.
- How the Candidate compares to its neighbors (the candidate immediately above and below in the slot).
- Whether the position is a result of a clear evaluation gap or a tie (resolved per §6).

### 5.7 What Ordering Does NOT Do

- ❌ Does not select (it orders; the Solver selects).
- ❌ Does not solve joint constraints (that's the Solver).
- ❌ Does not consult the Bank.
- ❌ Does not invent evaluation facets (it consumes Scoring Model outputs).
- ❌ Does not depend on CandidateSet iteration order.

---

## 6. Tie Resolution

### 6.1 The Tie Problem

Two Candidates with identical evaluations on the ordering key are **tied**. Ties are not errors — they are a normal consequence of finite-precision evaluation and Blueprint structure (e.g. many Candidates may have the same difficulty/document/topic/pattern profile). A deterministic ranking must resolve them, not leave them ambiguous.

### 6.2 How Ties Are Represented

A tie is represented explicitly in the RankedCandidateSet:
- The tied Candidates share a **tie group** identifier.
- Their internal order (within the tie group) is determined by Tie Resolution.
- The tie itself is **visible** in the output — not hidden. A downstream consumer (or Reviewer) can see "these N Candidates were tied; they were ordered thus for these reasons."

Hiding ties is an explicit Anti-Pattern (AP-9, "Hidden Tie Breakers").

### 6.3 How Ties Are Resolved

Tie resolution applies a **deterministic secondary key**, drawn only from Candidate identity and metadata — never from external state. The architecture fixes what a tie-breaker *may* be, not the exact key (which is an implementation concern within the architecture's constraints):

| Permitted Tie-Breaker Source | Example |
|---|---|
| **Stable identity** | Question Code (the immutable business identifier, Candidate Generation §5.4) |
| **Deterministic metadata** | Creation timestamp, document id, difficulty rank |
| **Scoring-Model-derived sub-facets** | A specific Component value used as a finer-grained tie-breaker |

| Forbidden Tie-Breaker Source | Why |
|---|---|
| CandidateSet iteration order | Non-deterministic across implementations |
| Random values | Non-deterministic by construction |
| Bank queries | Ranking has no Bank access |
| LLM judgment | Non-deterministic; violates Scoring Model AP-8 |
| Content-based heuristics | Violates the content boundary (Scoring Model §12.2) |

### 6.4 Deterministic Ordering Preservation

Three rules guarantee determinism:

1. **Fixed tie-breaker key.** The tie-breaker key is fixed and inspectable — not chosen per-run.
2. **Total order.** The tie-breaker must produce a **total order** within any tie group: no remaining ties after resolution. (If a secondary key still produces ties, a tertiary key is applied; Question Code as the final fallback guarantees totality, since Codes are unique.)
3. **No hidden resolution.** Every tie-break decision is recorded in the output's ordering reasons (§9).

### 6.5 Tie Overflow (Failure Mode)

Tie Resolution has one failure mode: **tie overflow** — a tie group so large that resolving it would be intractable or would indicate an upstream problem (e.g. thousands of Candidates tied on every key, suggesting the CandidateSet is degenerate). Tie overflow is a **Fatal** error (§10): it signals a problem upstream (likely at Candidate Generation or Scoring), not a tie-resolution bug.

The threshold for "overflow" is an implementation concern; the architecture's contract is that *unbounded* tie resolution is prohibited and overflow surfaces loudly.

### 6.6 What Tie Resolution Does NOT Do

- ❌ Does not select (resolved Candidates are still ordered, not chosen).
- ❌ Does not invent evaluation.
- ❌ Does not hide ties.
- ❌ Does not depend on external state.

---

## 7. RankedCandidateSet

### 7.1 Purpose

The RankedCandidateSet is Ranking's **output contract**: for every Blueprint slot, a deterministic, fully-explained ordering of the Candidates that could fill it. It is the input to the Constraint Solver.

### 7.2 Why RankedCandidateSet Is a Different Contract from CandidateSet

| | CandidateSet | RankedCandidateSet |
|---|---|---|
| **Producer** | Candidate Generator | Candidate Ranking |
| **What it carries** | The legal pool (Codes + metadata + Generator provenance + shortfall report) | The legal pool *plus* per-slot orderings, Scores, Confidences, Penalties, ordering explanations |
| **Ordering** | Unordered (or stable-key-only) | Deterministically ordered per slot |
| **Evaluation** | None (legality only) | Full Scoring Model evaluation per (Candidate × slot) |
| **Audience** | Ranking (and any module that needs the legal pool) | Constraint Solver, Review Workbench |
| **Stability** | Stable as a set | Stable as a set *and* as an ordering |

The distinction is contractual, not just incremental. The CandidateSet answers *"which Codes are legal?"*; the RankedCandidateSet answers *"in what order should the Solver consider them, and why?"* Downstream modules depend on the RankedCandidateSet's shape; it is therefore versioned and stable.

### 7.3 Conceptual Shape

```
RankedCandidateSet
├── identity                  (CandidateSet id, Scoring Model version, Ranking version)
├── slots[]                   (one entry per Blueprint slot)
│   ├── slot_id               (e.g. {set: 1, difficulty: Easy, pattern: Memory})
│   ├── ranked_candidates[]   (ordered; each entry below)
│   │   ├── code              (Question Code)
│   │   ├── rank              (position; total order within slot)
│   │   ├── tie_group_id      (null if not tied; shared id if tied)
│   │   ├── composite         (Composite Score, with Breakdown)
│   │   ├── confidence        (propagated Confidence)
│   │   ├── penalties[]       (applied Penalties with triggers)
│   │   ├── signals           (the Raw Signals that fed the Components)
│   │   └── ordering_reason   (why this position — §9)
│   └── slot_summary          (tie groups, top-of-slot rationale, etc.)
├── shortfall_report          (carried forward from CandidateSet, unchanged)
├── coverage_satisfaction     (carried forward from CandidateSet, unchanged)
├── warnings[]                (carried forward + any Ranking-emitted warnings)
└── meta                      (spec_version = "1.0", ranking_version, scoring_model_version)
```

### 7.4 Carried-Forward Fields

The RankedCandidateSet **carries forward** several CandidateSet fields unchanged: `shortfall_report`, `coverage_satisfaction`. Ranking does not modify them. This preserves the Generator's findings (shortfalls, coverage state) for the Solver and Reviewer, who need them.

### 7.5 Ownership

- **Information content:** owned by this spec (§7.3).
- **Production:** owned by Ranking.
- **Consumption:** by the Constraint Solver (later session) and Review Workbench (later session). The shape is contract-stable.

### 7.6 Lifecycle

- **Birth:** emitted by Ranking at successful termination.
- **Stability:** immutable once emitted.
- **Death:** consumed and discarded by downstream modules. Caching for audit is permitted (input-deterministic; Scoring Model §9.3).

### 7.7 Boundaries

The RankedCandidateSet is **read-only for downstream**. The Solver may annotate Candidates with assignment state; the Reviewer may annotate with overrides — but those are **layered on top**, never modifying the RankedCandidateSet's core contract.

### 7.8 What the RankedCandidateSet Is NOT

- ❌ Not a **selection**. It is an ordering.
- ❌ Not a **solution**. It does not specify which Codes jointly satisfy constraints.
- ❌ Not **opaque**. Every position is explainable.
- ❌ Not **content-bearing**. Metadata only.

---

## 8. Score Consumption

### 8.1 Ranking as Consumer

The Scoring Model is the authority on what Scores *mean* (Scoring Model §9). Ranking is its **canonical consumer and compute owner**, but the relationship is asymmetric: Ranking computes Scores *per the model*, then treats its own output as a consumer would — read-only, semantically fixed.

This self-consumption pattern matters for two reasons:

1. **It prevents Ranking from drifting.** If Ranking could freely reinterpret its own Scores, the Scoring Model's fixity would be undermined. Ranking treats its Computed Scores as immutable artifacts once computed.
2. **It makes downstream consumption symmetric.** The Solver and Reviewer consume Scores exactly as Ranking does — read-only, per the model. There is one consumption contract, not three.

### 8.2 What Ranking Consumes (Read-Only, Post-Computation)

After stage 4 (Penalty Application), Ranking's own outputs are treated as immutable inputs to stages 5–6:

| Artifact | Ranking's Post-Computation Relationship |
|---|---|
| **Composite Score** | Read-only. Ordering consumes it; does not modify. |
| **Confidence** | Read-only. Ordering consumes it; does not modify. |
| **Penalty** | Read-only. Ordering consumes it; does not modify. (Penalties are applied in stage 4; ordering only reads them.) |
| **Breakdown** | Read-only. Carried into the RankedCandidateSet unchanged. |

### 8.3 The No-Modification Rule

Once a Composite, Confidence, or Penalty is computed (stages 2–4), Ranking **does not modify it**. Stages 5–6 (Ordering, Tie Resolution) are pure functions of the evaluations; they do not touch evaluation values.

This is the operational form of Scoring Model §9's ownership discipline, applied within Ranking itself. It means the RankedCandidateSet's Scores are byte-identical to what stages 2–4 produced — auditable end-to-end.

### 8.4 What Consumption Does NOT Do

- ❌ Does not re-score (Scores are computed once).
- ❌ Does not alter Confidence after propagation.
- ❌ Does not add or remove Penalties after stage 4 (the Solver's later augmentation is the sole exception, per Scoring Model §9.2).
- ❌ Does not reinterpret Score semantics.

---

## 9. Ranking Transparency

### 9.1 The Transparency Contract

Every ranked position in the RankedCandidateSet must explain **why it exists** — both why the Candidate was evaluated as it was (Score transparency, inherited from Scoring Model §8) and why it occupies its specific position (ordering transparency, owned here).

### 9.2 Ranking Explanation Components

| Element | Content | Owner |
|---|---|---|
| **Score Breakdown** | Full Composite decomposition (Components, signals, reasons) | Scoring Model §8 (carried forward) |
| **Confidence** | Propagated trust level + the signals that reduced it | Scoring Model §6 (carried forward) |
| **Penalty Summary** | Applied Penalties with type, trigger, evidence, effect | Scoring Model §7 (carried forward) |
| **Ordering Reason** | Why this Candidate occupies this position in this slot: which evaluation facets determined it, how it compares to neighbors | Ranking (this spec, §5.6) |
| **Tie Status** | Whether the Candidate is in a tie group, the group's members, the tie-breaker applied | Ranking (this spec, §6.2) |
| **Evidence** | The underlying Raw Signals and their integrity | Scoring Model §10.1 + Ranking §3 |
| **Audit Trail** | Full reproducible trace: Candidate → Signals → Components → Composite → Confidence → Penalties → Rank | Composed (all stages) |

### 9.3 Audit Trail

The audit trail is the **end-to-end explainability** of a rank position. Given the same CandidateSet and the same Scoring Model + Ranking versions, the audit trail allows a reviewer (or an automated check) to re-derive the exact rank. This is the operational form of "Ranking must always be reproducible" (§5.3).

### 9.4 Transparency vs. Verbosity

Inheriting Scoring Model §8.4: transparency is **layered**, not verbose by default.

- **Always-present** (in every RankedCandidateSet entry): rank, Composite value, Confidence, Penalty summary, top ordering reason.
- **On-demand** (expansible at the Reviewer's request): full signal trace, neighbor comparison, tie-group detail.

This keeps the Review Workbench tractable while preserving full auditability.

### 9.5 Why Transparency Is Non-Negotiable

Three reasons (mirroring Scoring Model §8.2):

1. **Human Authority.** A Reviewer cannot trust a rank they cannot understand.
2. **Auditability.** A Draft's composition must trace back to the ranks that produced it.
3. **Trust calibration.** The Engine asks Humans to trust its ordering; trust requires transparency.

---

## 10. Failure Handling

Ranking's failure posture inherits the Engine-wide discipline (Engine Foundation §7): Fail Fast, Fail Loud, Remain Deterministic. Ranking adds the scoring-specific rule (Scoring Model §11.2): **Never invent scores.**

### 10.1 Failure Modes

| Failure | Stage | Severity | Ranking Behavior |
|---|---|---|---|
| **Missing Score** (a required Component cannot be computed) | Scoring | Fatal | Halt; identify the Component, the missing signal, the affected Candidates. **Never substitute a default.** |
| **Missing Confidence** (Confidence propagation cannot complete) | Confidence | Fatal | Halt; identify the propagation break. (Per Scoring Model §11, this is rare — Confidence propagates by recording gaps, not by halting. If propagation itself fails, that's a Fatal bug.) |
| **Unknown Score** (a Component returns an out-of-vocabulary value) | Scoring | Fatal | Halt; identify the Component and the offending value. |
| **Incomplete Candidate** (Candidate lacks signals for meaningful scoring) | Signal Extraction → Scoring | Non-fatal | Score at reduced Confidence per Scoring Model §11. **Do not drop.** Surface in Breakdown. |
| **Version Mismatch** (Scoring Model version unsupported, or CandidateSet's expected version unsupported) | Scoring Integration | Fatal | Halt; identify the unsupported version. **Never silently downgrade/upgrade.** |
| **Conflicting Metadata** (two signals disagree) | Signal Extraction | Non-fatal | Flag conflict; propagate reduced Confidence per Scoring Model §6. **Do not resolve by picking a winner.** |
| **Tie Overflow** (tie group exceeds tractable size) | Tie Resolution | Fatal | Halt; report the tie group size and the affected slot. Signals upstream problem. |
| **Ordering Inconsistency** (internal ordering state contradicts itself — should not happen) | Ordering | Fatal | Halt; treat as a bug. |

### 10.2 The "Never Invent Scores" Rule

Inherited from Scoring Model §11.2. When a Component cannot be computed (missing signal, conflicting signals, unknown value), Ranking **does not**:

- Substitute a default value.
- Treat missing data as a wildcard.
- Average conflicting signals.
- Drop the Candidate.

Instead, it either halts (Fatal, for computation failures) or propagates reduced Confidence (non-fatal, for missing/conflicting evidence per Scoring Model §11). This is how Integration Gap IG-2 propagates through Ranking: visibly, as reduced Confidence and explicit reasoning — never as a silent distortion.

### 10.3 Ranking Halts Where Scoring Does Not

Important asymmetry: Scoring Model §11.3 establishes that scoring **does not halt on missing data** (it propagates reduced Confidence). Ranking, by contrast, **does halt** on:

- Computation failures (a Component throws or returns no value — Fatal).
- Version mismatches (Fatal).
- Tie overflow (Fatal).
- Internal inconsistencies (Fatal).

The difference: scoring's job is to evaluate what exists (halt would discard Candidates); Ranking's job includes contract integrity (halting on Fatal failures protects downstream modules from corrupt input). Missing-data cases follow scoring's non-halt rule; structural/computational failures follow Ranking's halt rule.

### 10.4 Every Failure Must

- **Fail Fast:** halt at the first unrecoverable problem.
- **Fail Loud:** structured error with category, location (slot + Candidate), severity, explanation, recommendation — mirroring the Reader's and Scoring Model's error anatomy for cross-Engine consistency.
- **Remain Deterministic:** same CandidateSet → same failure.
- **Never invent scores:** the worst Ranking failure mode is fabricating evaluations to keep the pipeline moving.

---

## 11. Token Efficiency

### 11.1 The Flow

```
CandidateSet        (Blueprint-bounded — Candidate Generation §12.3)
        │
        ▼
Signal Extraction   (per-Candidate; bounded by CandidateSet size × axes)
        │
        ▼
Scoring             (per-(Candidate × slot); bounded by CandidateSet × slots × components)
        │
        ▼
RankedCandidateSet  (Blueprint-bounded; per-slot orderings + evaluations)
```

### 11.2 Token Growth and Reduction

| Transformation | Size Change | Why |
|---|---|---|
| CandidateSet → Raw Signals | Growth | Each Candidate expands into multiple Signals (one per axis). Bounded by CandidateSet × axes. |
| Raw Signals → Composite | Reduction | Multiple Signals collapse into Components, then into one Composite per (Candidate × slot). |
| Composite → RankedCandidateSet | Growth (bounded) | Each Composite gains ordering context (rank, neighbor comparison, ordering reason). Bounded by CandidateSet × slots. |

**Net effect:** the RankedCandidateSet is larger than the CandidateSet (it carries evaluations + orderings), but its size remains **bounded by Blueprint structure** — never by Bank size.

### 11.3 Ranking Cost

Ranking's compute cost scales with:
- **CandidateSet size** (number of Candidates).
- **Slots** (number of Blueprint distribution cells).
- **Components** (Scoring Model v1.0 vocabulary size — fixed).

It does **not** scale with Bank size (Ranking never touches the Bank).

### 11.4 Ordering Cost

Ordering is, in the worst case, a per-slot sort. Its cost scales with **Candidates-per-slot** (bounded by CandidateSet size divided across slots), not with total CandidateSet size. Tie Resolution adds a bounded secondary cost per tie group.

### 11.5 Scalability (Principle 6)

The architecture supports CandidateSets of 100 / 1,000 / 10,000 / 100,000 Candidates without redesign because:
- Every stage's cost is bounded by CandidateSet × slots × components.
- No stage consults the Bank.
- Ordering is per-slot (parallelizable across slots, though parallelism is an implementation concern, not architectural).

For very large CandidateSets (>100k), implementation-level optimizations (parallelism, streaming) may be required — but **no architectural change** is needed. This is consistent with Candidate Generation §15.3 and Scoring Model §12.5.

### 11.6 What Token Efficiency Does NOT Mean

- ❌ Does not mean dropping Candidates (violates Maximum Recall).
- ❌ Does not mean opaque rankings (violates Transparency).
- ❌ Does not mean skipping the Breakdown (Breakdown is always-present per Scoring Model §8.4).
- ❌ Does not mean reading content (forbidden by Scoring Model §12.2).

---

## 12. Layer Boundaries

### 12.1 Candidate Ranking

- **CAN:**
  - Consume the CandidateSet (read-only).
  - Extract Raw Signals.
  - Compute Scores per the Scoring Model.
  - Apply Penalties per the Scoring Model.
  - Order Candidates per slot.
  - Resolve ties deterministically.
  - Emit a RankedCandidateSet.
- **CANNOT:**
  - Read Question content.
  - Query the Bank.
  - Select Candidates (Solver's job).
  - Solve joint constraints (Solver's job).
  - Modify the CandidateSet, AssemblyRequest, or Blueprint.
  - Invent Score Components outside v1.0.
  - Modify Scores/Confidence/Penalties after stage 4.
- **MUST NEVER:**
  - Invent evaluations or Scores.
  - Emit opaque rankings (no ordering reason).
  - Hide tie breakers.
  - Use non-deterministic tie breakers (random, CandidateSet order, LLM).
  - Invoke an LLM.
  - Couple ranking logic to SQL or UI.
  - Allow rank to mean "selection."
- **MUST ALWAYS:**
  - Be deterministic given CandidateSet.
  - Consume the Scoring Model exactly.
  - Explain every rank.
  - Preserve Maximum Recall (penalize, don't drop).
  - Carry forward CandidateSet findings (shortfall, coverage).
  - Fail fast, fail loud, remain deterministic.

### 12.2 Relationship with Adjacent Modules

| Boundary | Ranking's Side | Other Side |
|---|---|---|
| **Ranking ↔ Candidate Generator** | Consumes CandidateSet (read-only) | Generator produces it; Ranking never modifies |
| **Ranking ↔ Scoring Model** | Implements the model (compute owner) | Scoring Model fixes the vocabulary; Ranking does not extend it |
| **Ranking ↔ Constraint Solver** | Emits RankedCandidateSet (contract-stable) | Solver consumes; may augment Hard penalties (Scoring Model §9.2); never re-orders |
| **Ranking ↔ Review Workbench** | Emits RankedCandidateSet | Reviewer consumes; may override ordering; never re-ranks |
| **Ranking ↔ Draft Builder** | No direct relationship | Draft Builder consumes Reviewer's approved selection, not RankedCandidateSet directly |

---

## 13. Anti-Patterns

Explicitly prohibited. Any future change must be evaluated against this list.

| # | Anti-Pattern | Why Prohibited |
|---|---|---|
| AP-1 | **Selecting Questions** | Violates Ranking ≠ Selection (§1.2, §0). Selection is the Solver/Human's job. |
| AP-2 | **Constraint Solving** | Joint-constraint satisfaction is the Solver's job (IG-5). |
| AP-3 | **Business Rule Modification** | Ranking consumes the AssemblyRequest's intent via the CandidateSet; it never edits it. |
| AP-4 | **Reading Question Content** | Violates Scoring Model §12.2; destroys scalability. |
| AP-5 | **LLM Ranking** | Violates determinism (Scoring Model AP-8). |
| AP-6 | **SQL Ranking Logic** | Ranking logic is architecture; SQL is implementation. |
| AP-7 | **Magic Ordering** | Ranks untraceable to Scores violate §5.6. |
| AP-8 | **Opaque Ranking** | A rank without an ordering reason is non-conformant (§9). |
| AP-9 | **Hidden Tie Breakers** | Ties and their resolution must be visible (§6.2). |
| AP-10 | **Score Modification** | Post-computation Score modification violates §8.3. |
| AP-11 | **Confidence Modification** | Post-propagation Confidence modification violates §8.3. |
| AP-12 | **Penalty Modification** | Post-application Penalty modification violates §8.3. (The Solver's Hard-penalty augmentation is the sole exception, per Scoring Model §9.2.) |
| AP-13 | **Inventing Score Components** | Vocabulary is fixed at Scoring Model v1.0. |
| AP-14 | **CandidateSet iteration order in the ordering key** | Non-deterministic across implementations (§5.4). |
| AP-15 | **Persistent rankings as run input** | Each run computes fresh (Scoring Model §9.3). |
| AP-16 | **Anything outside Ranking ownership** | Single responsibility (§1.3). |

---

## 14. Future Extensibility

The architecture is designed to grow without rupture. Future capabilities enter as **additive extensions**, never as redesigns.

### 14.1 New Score Components

A future need (e.g. a Psychometric Fit component) enters via a **Scoring Model version bump** (Scoring Model §15.6). Ranking implements the new component; the RankedCandidateSet grows a new evaluation facet. No structural change to the pipeline.

### 14.2 Future AI Ranking

If AI-derived evaluation becomes desirable, it enters as a **Signal Source** upstream (Scoring Model §15.2), not as Ranking itself. Ranking consumes the AI-derived signal like any other, through a Component, with Confidence reflecting the signal's reliability. Ranking itself remains deterministic and LLM-free (AP-5).

### 14.3 Future Adaptive Ranking

If future Profiles require Ranking to adapt to learner history, the adaptation enters as **additional signals** (e.g. `learner_history_vector`) consumed by Components. The ordering pipeline, tie resolution, and RankedCandidateSet contract are unchanged.

### 14.4 Future Semantic Ranking

Semantic similarity (e.g. for Duplicate Prevention L1–L5) is a **Signal** computed upstream (Candidate Generation or a dedicated Similarity stage), consumed by the Diversity Component (Scoring Model §4.1). Ranking does not compute semantic similarity; it consumes it.

### 14.5 Future Psychometric Ranking

Psychometric evaluation (IRT-based difficulty/discrimination) would enter as new Components (Psychometric Fit) computed from Bank signals. The Component vocabulary extends via Scoring Model bump; Ranking's structure does not.

### 14.6 Implementation Swappability

A new Ranking implementation may ship (different algorithms within the Scoring Model's latitude, different performance characteristics) **without bumping this spec**, provided it:
- Consumes the Scoring Model exactly.
- Produces a conformant RankedCandidateSet.
- Honors all layer boundaries (§12) and anti-patterns (§13).

The RankedCandidateSet contract is the swappability boundary: any implementation that emits it is a valid Ranking.

### 14.7 What Does NOT Change

- **Ranking ≠ Selection** (§0) — the architectural invariant.
- **Ranking consumes the Scoring Model exactly** (§4) — the vocabulary invariant.
- **Only Ranking orders Candidates** (§5) — the ownership invariant.
- **The content boundary** (Scoring Model §12.2) — the scalability invariant.
- **Tie visibility** (§6.2) — the transparency invariant.
- **Deterministic ordering** (§5.5) — the reproducibility invariant.

---

## Appendix A — Glossary

| Term | Definition |
|---|---|
| **CandidateSet** | Generator's output: the legal pool. |
| **RankedCandidateSet** | Ranking's output: per-slot orderings with full evaluation + explanation. |
| **Raw Signal** | Factual observation extracted from CandidateSet metadata (Scoring Model §10.1). |
| **Score Component** | Per-axis evaluation (Scoring Model §4). |
| **Composite Score** | Structured aggregate per (Candidate × slot) (Scoring Model §5). |
| **Confidence** | Propagated trust level (Scoring Model §6). |
| **Penalty** | Structured demerit: Soft/Hard/Disqualification (Scoring Model §7). |
| **Ordering** | Translation from evaluation to per-slot position. Ranking's exclusive domain. |
| **Tie Group** | Candidates with identical evaluations on the ordering key. |
| **Tie Breaker** | Deterministic secondary key resolving ties. |
| **Ordering Reason** | Per-position explanation of why a Candidate occupies its rank. |
| **Slot** | A Blueprint distribution cell (e.g. `{set: 1, difficulty: Easy, pattern: Memory}`). |

---

## Appendix B — Boundary Assertions

The non-negotiable contracts of this specification.

1. **Ranking evaluates and orders; it never selects.** Selection is the Solver/Human's job.
2. **Ranking consumes the Scoring Model exactly.** No invented Components; no redefined Confidence/Penalty semantics.
3. **Only Ranking orders Candidates.** No other module produces orderings.
4. **Ranking never reads Question content.** Metadata only.
5. **Ranking never consults the Bank.** CandidateSet only.
6. **Ordering is deterministic.** Same CandidateSet → same RankedCandidateSet, always, across implementations at the contract level.
7. **Ties are visible.** Hidden tie breakers are non-conformant.
8. **Every rank is explainable.** Opaque rankings are non-conformant.
9. **Scores/Confidence/Penalties are immutable once computed.** Stages 5–6 consume them read-only.
10. **Ranking preserves Maximum Recall.** Penalize, never silently drop.
11. **Ranking is deterministic, transparent, auditable, and LLM-free.**
12. **The RankedCandidateSet is the swappability boundary.** Any implementation emitting it is valid.

---

## Appendix C — Provenance & Cross-References

- **Engine alignment:** Ranking is Engine Foundation v1.0's "Candidate Ranking" module (§3.2, Module 3). Its output, RankedCandidateSet, is the Foundation's "ScoredCandidates" payload (§4.2), realized with the full transparency the Foundation requires.
- **Integration Spec alignment:** Ranking consumes the CandidateSet, which carries the `AssemblyRequest`'s intent. Integration Gaps IG-1 (Tier derivation) and IG-2 (missing Bank columns) propagate through Ranking as reduced Confidence (Scoring Model §6, §11), never as silent distortion.
- **Reader alignment:** No direct interaction. Ranking is two modules downstream of the Reader.
- **Candidate Generation alignment:** Ranking consumes the CandidateSet (read-only) and the Generator's per-Candidate Confidence (Scoring Model §6.5). The Generator does not rank (Candidate Generation §13 AP-3); this spec honors that boundary.
- **Scoring Model alignment:** Ranking is the Scoring Model's canonical consumer and compute owner (Scoring Model §9). Every contract here defers to the Scoring Model on evaluation semantics.
- **Solver alignment (forward):** The Constraint Solver consumes the RankedCandidateSet. Per Scoring Model §9.2, the Solver may augment Hard penalties for joint-constraint risk — the sole exception to the "only Ranking orders/scores" rule, and one that this spec accommodates by making the RankedCandidateSet's annotations layerable.
- **Blueprint fidelity:** Blueprint v3.0's axes are honored through the Scoring Model's Components (evaluated by Ranking) and the per-slot orderings (produced by Ranking).

---

*End of Sobdai Candidate Ranking Architecture — v1.0.*

**Upstream sources (immutable):**
- Assessment Assembly Engine Foundation v1.0
- Blueprint Integration Specification v1.0
- Blueprint Reader Pipeline Architecture v1.0
- Candidate Generation Architecture v1.0
- Scoring Model Specification v1.0

**Next modules to specify (later sessions):**
- Constraint Solver Architecture (consumes RankedCandidateSet; closes IG-5 via penalty augmentation)
- Review Workbench Architecture (renders RankedCandidateSet; captures Human overrides)
- Draft Builder Architecture (materializes approved selection into a Draft Exam Set)
