# Sobdai Candidate Generation Architecture — v1.0

**Status:** Official Architecture Specification (Architecture only — no implementation, no SQL, no code, no schema, no UI)
**Sources of truth (exhaustive, immutable):**
1. `assessment_assembly_engine_foundation_v1.md` — Assessment Assembly Engine Foundation v1.0
2. `blueprint_integration_specification_v1.md` — Blueprint Integration Specification v1.0
3. `blueprint_reader_pipeline_architecture_v1.md` — Blueprint Reader Pipeline Architecture v1.0
4. `Blueprint/simulation_exam_blueprint.md` — Assessment Blueprint v3.0
**Version:** 1.0
**Owner:** Sobdai Architecture

> **What this document owns.** The Candidate Generator is the **first runtime module** of the Assessment Engine. It receives a validated `AssemblyRequest` and produces a `CandidateSet` — the complete set of Question Codes that *could legally* satisfy the Blueprint, before any ranking or selection. This spec owns the Generator's internal pipeline, its data contracts (Candidate, Candidate Pool, CandidateSet), its validation and expansion behavior, and its failure posture.
>
> **What this document does not own.** The `AssemblyRequest` (fixed by Integration Spec v1.0). The Reader (fixed by Reader Pipeline Architecture v1.0). Ranking, Constraint Solving, Review, and Draft Building — each explicitly out of scope per this session's prompt and belonging to later sessions. The Generator does not choose; it discovers.

---

## 0. Executive Summary

The Candidate Generator answers one question: **"Which existing Question Codes could legally appear in a Draft produced from this Blueprint?"** It does not answer "which should appear" — that is Ranking. It does not answer "which set of Codes jointly satisfies the constraints" — that is Constraint Solving. It produces the **complete legal pool**, no more (no invalid candidates) and no less (no false exclusions), and hands it forward.

The Generator is **the first runtime module** because everything upstream of it (Reader, validation, normalization) is pure transformation with no dependency on Question Bank state, and everything downstream of it (Ranking, Solving, Review) operates on the pool it produces. The Generator is where the Engine first touches live Bank data — read-only, metadata-only, never content.

The defining architectural decision is the **strict separation of filtering from selection**. The Generator filters (which Codes are *eligible*) and discovers (which Codes *exist*); it does **not** select (which Codes *win*) or solve (which Codes *jointly fit*). Blueprint v3.0's distribution constraints (sum=100 per set, tier floors/ceilings, anchor rule) form a constraint-satisfaction problem that is **out of scope** for the Generator — Integration Spec IG-5 records this honestly. The Generator's job is to ensure the constraint solver has **every Code it could legally use**; whether a feasible joint allocation exists is the solver's problem, surfaced through Pool Validation (§7) and Failure Handling (§11).

Three operating principles govern the design:

1. **Metadata First** (Principle 2). Content never enters the Generator. The CandidateSet is Codes + metadata axes.
2. **Filter Before Reason** (Principle 3). Every deterministic filter happens inside the Generator, before any downstream reasoning stage ever sees a Candidate. The Generator is where "filter before reason" becomes operational.
3. **Maximum Recall** (Principle 4). The Generator prefers controlled over-fetch over false negatives. Excluding a valid candidate silently is the worst failure mode; including a marginal one (flagged) is acceptable. Ranking and the Human decide later.

The Generator is **deterministic, stateless, read-only, and LLM-free**. Same `AssemblyRequest` against the same Bank state → same `CandidateSet`, always.

---

## 1. Module Overview

### 1.1 Purpose

To transform a validated `AssemblyRequest` into a complete, provenance-tracked `CandidateSet` of Question Codes that could legally satisfy the Blueprint — without choosing, ranking, or solving.

### 1.2 Responsibilities

| The Generator IS responsible for | The Generator is NOT responsible for |
|---|---|
| Interpreting the `AssemblyRequest`'s axes into a query plan | Authoring or modifying the `AssemblyRequest` |
| Filtering the Bank by metadata (coverage, difficulty, document, pattern, LO, exclusions) | Ranking candidates (Ranking module) |
| Discovering all matching Question Codes | Selecting winners (Ranking) |
| Validating that the pool can in principle satisfy each Blueprint axis | Solving joint constraints (Constraint Solver) |
| Over-fetching controlled amounts when needed for Ranking headroom | Generating Questions (forbidden system-wide) |
| Recording provenance for every Candidate | Editing or rewriting Questions |
| Detecting shortages and surfacing them loudly | Touching Question content |
| Producing the final `CandidateSet` contract | Publishing or producing Drafts |

### 1.3 Boundaries (summary — full matrix in §13)

- **CAN:** read Bank metadata; filter; discover; validate the pool; expand the pool; emit a `CandidateSet`.
- **CANNOT:** read content; rank; solve; write anywhere; touch upstream or downstream modules.
- **MUST NEVER:** invoke an LLM; perform content-based reasoning; silently weaken a Blueprint rule; silently drop a valid candidate; infer missing metadata.
- **MUST ALWAYS:** be deterministic; preserve maximum recall; record provenance; fail fast/loud/deterministically.

### 1.4 Lifecycle

The Generator is **stateless and synchronous** within a single run:

- **Invocation:** one `AssemblyRequest` in (and read access to Bank metadata).
- **Processing:** the §2 pipeline.
- **Termination:** either a `CandidateSet` out, or a structured failure (§11). No state persists between runs.
- **Re-runs:** identical `AssemblyRequest` against identical Bank state → identical `CandidateSet` (Principle 1 — Determinism). Note: the Generator is deterministic *given Bank state*; if the Bank changes between runs, the CandidateSet may change — that is correct behavior, not nondeterminism.

### 1.5 Ownership

The Generator owns **one transformation**: `AssemblyRequest → CandidateSet`. It does not own the `AssemblyRequest` (Reader/Integration Spec), the Bank (the Bank is read substrate), or anything downstream. Within its transformation it owns the query plan, the filters, the discovery rules, the Candidate/Pool/CandidateSet contracts, and the failure classifications.

---

## 2. Pipeline Overview

Six runtime stages, each with exactly one responsibility. Every stage is a pure function of its input plus read-only Bank access; no stage mutates Bank state.

### 2.1 Stage Map

| # | Stage | Responsibility | Reads Content? |
|---|---|---|---|
| 1 | **Query Planning** | Interpret the `AssemblyRequest` into a structured query plan | No |
| 2 | **Metadata Filtering** | Apply deterministic filters to Bank metadata | No |
| 3 | **Candidate Discovery** | Materialize matching Codes as Candidate objects with metadata + provenance | No |
| 4 | **Pool Validation** | Validate the pool against each Blueprint axis; detect shortages | No |
| 5 | **Pool Expansion** (conditional) | Over-fetch controlled amounts to resolve warnings | No |
| 6 | *(CandidateSet)* | Final output contract | No |

**No stage reads content. No stage invokes an LLM. No stage writes anywhere.** The Generator is the most read-constrained component in the Engine: it sees metadata, and only metadata.

### 2.2 Stage Contracts

| Stage | Input | Output | Responsibility | Failure Mode |
|---|---|---|---|---|
| Query Planning | `AssemblyRequest` | Query Plan | Translate every Blueprint axis into an executable filter specification | Fatal on malformed `AssemblyRequest` (should not happen — Reader validates) |
| Metadata Filtering | Query Plan + Bank metadata | Filtered metadata rows | Apply filters deterministically; reduce the Bank to eligible rows | Fatal on filter execution error |
| Candidate Discovery | Filtered rows | Candidate Pool | Materialize Candidates with identity, metadata, provenance, completeness, confidence | Fatal on malformed Bank metadata |
| Pool Validation | Candidate Pool + `AssemblyRequest` | Validated Pool + Shortfall Report | Check per-axis completeness; classify Pass/Warning/Blocking/Fatal | Blocking/Fatal per classification |
| Pool Expansion | Validated Pool + Shortfall Report | Expanded Pool (or unchanged) | Resolve warnings via controlled over-fetch; never weaken rules | Stops at limits (§8.4) |
| CandidateSet Emission | Expanded Pool | `CandidateSet` | Final contract output | n/a |

### 2.3 Two Invariants Across the Pipeline

1. **Monotonic reduction in candidate multiplicity, monotonic growth in candidate richness.** As a Code moves through filtering → discovery → validation, the *number* of Codes only shrinks (filters remove); each surviving Code's *metadata record* only grows (provenance, completeness, confidence are added). No stage both adds and removes Codes.
2. **No information loss about eligibility.** A Code that survives filtering is never silently dropped later. If it is excluded at validation (e.g. it's in a shortfall bucket), the exclusion is *recorded in the Shortfall Report*, not hidden.

---

## 3. Query Planning

### 3.1 Responsibility

Translate the `AssemblyRequest`'s business axes into a **structured query plan** — a specification of *what to look for*, independent of *how to look for it* (which is filtering, §4) and *where to look* (which is the Bank). Query Planning is a pure transformation of the `AssemblyRequest`; it touches no Bank data.

### 3.2 What Query Planning Interprets

The `AssemblyRequest` carries (per Integration Spec §4.3) these axes, each of which the Query Planner translates into a filter specification:

| `AssemblyRequest` Axis | Planner Translation |
|---|---|
| **Coverage** (CR-1…CR-5, mandatory topics) | A set of coverage *requirements*: which documents/topics must be represented, with what enforcement level |
| **Difficulty** (Easy/Medium/Hard distribution) | A set of difficulty *slots* per Set: each slot = `{set, difficulty, target_count}` |
| **Documents** (Document Registry + Tier) | The closed set of permitted documents; Tier is a derived property used in constraints (not a filter on Questions) |
| **Patterns** (Positive/Negative/Best Answer/Scenario/Sequence/Matching) | A set of pattern *slots* per Set: each slot = `{set, pattern, target_count}` |
| **Learning Objectives** (LO1–LO4) | A set of LO *slots* per Set: each slot = `{set, lo, target_count}` (LO is typically a derived/scoring axis, but v3.0 distribution targets make it a filter axis) |
| **Duplicate Rules** (L1–L5) | *Not* a filter on individual Questions — a constraint on combinations. Recorded in the plan as constraint metadata for Pool Validation; not turned into a per-Question filter |
| **Exclusions** (already-used Codes, recent Codes) | A literal set of Code identifiers to exclude |

### 3.3 What Query Planning Does NOT Do

- ❌ Does not execute any query. It produces a *plan*, not results.
- ❌ Does not access the Bank.
- ❌ Does not decide filter execution order (that's Metadata Filtering, §4).
- ❌ Does not interpret duplicate rules as filters — they're combination constraints, not per-Question predicates.
- ❌ Does not infer missing axes. If the `AssemblyRequest` lacks an axis, the plan lacks it; downstream stages handle absence explicitly.

### 3.4 Why Planning Is a Separate Stage

Two reasons:

1. **Inspectability.** The Query Plan is an intermediate artifact that can be examined, debugged, and diffed. If filtering produces unexpected results, the plan tells you *what was asked for* before you investigate *what was found*.
2. **Bank-independence.** The plan is a pure function of the `AssemblyRequest`. It can be generated, cached, and replayed against different Bank states (e.g. test vs. production, or before/after a Bank refresh) to isolate "Blueprint intent" from "Bank reality."

### 3.5 The Tier Subtlety (from Integration Spec IG-2 / IG-1)

Blueprint v3.0's Tier constraints (tier-1 floor ≥30, tier-4 ceiling ≤25, tier min/max per document) are constraints on **Documents**, not on Questions. The Query Planner records Tier as a **derived property** of a candidate — computed by looking up the candidate's `document` in the Document Registry — not as a per-Question filter. Pool Validation (§7) then aggregates Tier across the pool to check feasibility.

**Honest acknowledgment (Integration Gap IG-1):** this derivation assumes the candidate's `document` value reliably matches a Document Registry entry. If the Bank's `document` column is free-text and doesn't match, Tier derivation fails — and the Generator surfaces this loudly (§11), it does not silently guess.

---

## 4. Metadata Filtering

### 4.1 Responsibility

Apply the Query Plan's filters to Bank metadata, producing the set of eligible rows. This is the stage where "Filter Before Reason" (Principle 3) becomes operational: every deterministic filter happens **here**, before any Candidate is materialized or any reasoning stage runs.

### 4.2 The Filters

| Filter | Responsibility |
|---|---|
| **Document Filter** | Restrict to Questions whose `document` ∈ Document Registry |
| **Difficulty Filter** | Restrict to Questions whose `difficulty` ∈ {Easy, Medium, Hard} as the Blueprint requires |
| **Pattern Filter** | Restrict to Questions whose `pattern` ∈ the Blueprint's permitted pattern set |
| **LO Filter** | Restrict to Questions whose `learning_objective` ∈ the Blueprint's LO set |
| **Coverage Filter** | Restrict to Questions whose `(document, topic)` satisfies at least one coverage requirement (mandatory-topic bindings) |
| **Exclusion Filter** | Remove Questions whose Code ∈ the `AssemblyRequest.exclusions` set |
| **Status Filter** | Remove Questions whose lifecycle status disqualifies them (e.g. only `Published` Questions may appear in a published Blueprint — policy decision, recorded in the plan) |

**Integration Gap IG-2 (honest acknowledgment):** the Pattern Filter and LO Filter require Bank columns (`pattern`, `learning_objective`) that do not exist as of Session 6.16. If those filters cannot execute because the Bank lacks the column, the Generator **fails loud** (§11) — it does not silently skip the filter. Skipping would silently weaken the Blueprint, which is the worst failure mode.

### 4.3 Execution Order (and Why It Matters)

Filter order is **not arbitrary**. The Generator executes filters in order of **selectivity and cost**, following the database-engineering principle "most selective first":

1. **Exclusion Filter** — cheapest (a set membership test on Codes); removes rows before any other work.
2. **Status Filter** — cheap (single enum check); removes ineligible lifecycle states.
3. **Document Filter** — highly selective (typically reduces the Bank by ~90%, since a Blueprint covers a closed document set).
4. **Coverage Filter** — selective (mandatory-topic bindings are a narrow requirement).
5. **Difficulty Filter** — moderately selective.
6. **Pattern Filter** — moderately selective (requires IG-2 column).
7. **LO Filter** — least selective (often overlapping with Pattern via the LO↔BlueprintType correspondence).

**Why order matters:**
- **Performance at scale (Principle 6).** A 1,000,000-Question Bank reduced to ~50,000 by the Document Filter means subsequent filters process 50,000 rows, not 1,000,000. Order is an order-of-magnitude decision.
- **Failure locality (§11).** If the Pattern Filter fails because the column is missing (IG-2), failing *after* the Document Filter has run means the error message can say "of the 47,312 candidates matching the document set, the pattern axis is unavailable" — far more actionable than "the Bank has no pattern column."
- **Determinism.** A fixed execution order makes the filter pipeline a pure function. Arbitrary order (e.g. hash-map iteration) would risk nondeterminism across runs.

### 4.4 What Metadata Filtering Does NOT Do

- ❌ Does not rank. Filter output is unordered (or ordered by stable key only for determinism).
- ❌ Does not materialize Candidates. Output is filtered rows; Candidate materialization is Discovery (§5).
- ❌ Does not read content. The filter never touches `content`, `choice_*`, `hint`, `full_explanation`, etc.
- ❌ Does not weaken filters. Every filter in the plan is executed; none is silently skipped.
- ❌ Does not access the Bank's write path. Read-only.

---

## 5. Candidate Discovery

### 5.1 Responsibility

Materialize the filtered rows into **Candidate objects** — the Generator's internal representation of a potential Blueprint-satisfying Question. Discovery adds the richness that filtering deliberately omitted: provenance, completeness, confidence.

### 5.2 The Candidate Contract

Every Candidate carries five facets (per the prompt's explicit list):

| Facet | Content | Source |
|---|---|---|
| **Identity** | The Question Code (e.g. `Q-000001`) and the underlying Question id | Bank |
| **Metadata** | The full axis set the Blueprint cares about: `document`, `difficulty`, `pattern`, `learning_objective`, `topic`, `tier` (derived), `status`, plus `tags`/`category` if relevant | Bank + Tier derivation |
| **Provenance** | Why this Candidate exists in the pool: which filters it passed, which coverage requirements it satisfies, which Blueprint slots it could fill | Generator (recorded during filtering) |
| **Completeness** | A per-axis flag indicating whether the Candidate's metadata is *complete enough* to be evaluated against every Blueprint axis. A Candidate missing `pattern` (IG-2 gap) is marked `pattern: incomplete` — not dropped, but flagged. | Generator |
| **Confidence** | A coarse, deterministic indicator of how well-matched the Candidate is *to the filter axes*. **Not a ranking score** — Ranking is a separate module. Confidence is a metadata-quality signal (e.g. "all axes present and unambiguous" vs. "axis derived via fallback"). | Generator |

### 5.3 Why These Five Facets

- **Identity** is the unit of exchange — Codes, not objects (Engine Foundation §4.1).
- **Metadata** is what Ranking and the Solver will reason over.
- **Provenance** is Principle 5 (Explainability) made operational. Every Candidate can answer "why am I here?" — essential for Human Review and for debugging.
- **Completeness** is the honest handling of IG-2. Rather than dropping Candidates with missing axes (which would violate Maximum Recall) or silently treating missing axes as wildcards (which would silently weaken the Blueprint), the Generator flags them and lets downstream stages decide.
- **Confidence** is a deterministic metadata-quality signal, carefully distinguished from a ranking score (which would be Ranking's job). It captures facts like "this Candidate's `pattern` was inferred from `tags` because the `pattern` column was empty" — useful information without crossing into ranking.

### 5.4 Candidate Identity

A Candidate's identity is its **Question Code** (the immutable business identifier from migration 026). Two Candidates with the same Code are the same Candidate. The underlying Question id is carried for Bank lookups downstream but is **not** the unit of exchange.

### 5.5 Candidate Metadata — What's In, What's Out

**In** (carried on every Candidate):
- `document`, `difficulty`, `topic`, `status` — directly from Bank
- `tier` — derived from `document` via the Document Registry
- `pattern`, `learning_objective` — from Bank (subject to IG-2 availability)
- `tags`, `category` — carried for Ranking/Similarity stages

**Out** (never on a Candidate):
- `content`, `choice_a`…`choice_d`, `correct_answer` — content, forbidden
- `hint`, `full_explanation`, `why_*_wrong` — content, forbidden
- `reference` — content-adjacent; carried only if Ranking needs it (policy decision, default: not carried)

### 5.6 What Discovery Does NOT Do

- ❌ Does not rank Candidates.
- ❌ Does not select between Candidates.
- ❌ Does not solve joint constraints.
- ❌ Does not read content.
- ❌ Does not infer missing axes (it flags them via Completeness).

---

## 6. Candidate Pool vs. CandidateSet

The prompt explicitly asks for these to be distinguished. They are different artifacts with different roles.

### 6.1 Definitions

| | Candidate Pool | CandidateSet |
|---|---|---|
| **What it is** | The internal working set of Candidates produced by Discovery | The final output contract emitted to the next module |
| **When it exists** | After Discovery, before Validation | After Expansion, at Generator termination |
| **Validation state** | Unvalidated | Fully validated |
| **Shortfalls** | Not yet detected | Detected and reported |
| **Audience** | The Generator (internal) | Ranking / Constraint Solver / Review (external) |
| **Stability** | Internal, may evolve through Expansion | Contract-stable; downstream modules depend on its shape |

### 6.2 The Pipeline Relationship

```
Candidate Pool  (internal, post-Discovery)
       │
       ▼
   Pool Validation  ─── produces Shortfall Report
       │
       ▼
   Pool Expansion   ─── may grow the Pool (controlled over-fetch)
       │
       ▼
   CandidateSet     (external contract, final output)
```

The Candidate Pool is **mutable within the Generator** (Expansion may add Candidates). The CandidateSet is **immutable once emitted** — it is the Generator's output contract, consumed by Ranking and the Solver.

### 6.3 Why the Distinction Matters

- **Contract stability.** Downstream modules (Ranking, Solver) consume the CandidateSet; its shape must not change during their execution. The Candidate Pool is allowed to be in flux because nothing outside the Generator sees it.
- **Validation honesty.** The Shortfall Report is produced *against the Candidate Pool*, then carried into the CandidateSet as metadata. This separates "what we found" (Pool) from "what we certified" (CandidateSet).
- **Debuggability.** A problematic CandidateSet can be traced back to the Pool state and the Validation/Expansion decisions that shaped it.

---

## 7. Pool Validation

### 7.1 Responsibility

Validate the Candidate Pool against **every** Blueprint axis, detect shortfalls, and classify the result. Validation asks: *"Given this pool, can the Blueprint in principle be satisfied — per axis?"* It does **not** ask "is there a feasible joint allocation?" (that's the Constraint Solver's job).

### 7.2 The Per-Axis Validation Checks

| Check | What It Validates | Failure Signal |
|---|---|---|
| **Coverage Completeness** | For each mandatory topic (CR-1), is there at least one Candidate in the pool with that `(document, topic)`? | Shortfall: missing mandatory topic |
| **Difficulty Completeness** | For each Set × Difficulty slot, are there enough Candidates to fill the target count? (Account for over-fetch headroom.) | Shortfall: difficulty bucket under-filled |
| **Document Completeness** | For each Document in the distribution, are there enough Candidates to meet the per-Set target? | Shortfall: document bucket under-filled |
| **Pattern Completeness** | For each Set × Pattern slot, are there enough Candidates? (Subject to IG-2.) | Shortfall: pattern bucket under-filled |
| **LO Completeness** | For each Set × LO slot, are there enough Candidates? (Subject to IG-2.) | Shortfall: LO bucket under-filled |
| **Duplicate Constraints** | Are there enough *distinct* (Topic × Difficulty × Type) combinations to satisfy L1 within each Set? | Shortfall: insufficient combinatorial diversity |
| **Exclusion Rules** | Have all excluded Codes been successfully removed? | Internal error if an excluded Code appears (shouldn't happen) |
| **Shortfall Detection** | Aggregate all of the above into a structured Shortfall Report | Carried forward into the CandidateSet |

### 7.3 The Joint-Constraint Boundary (Critical)

**Validation is per-axis. It does not solve joint constraints.**

Blueprint v3.0's distribution constraints — `SUM(documents) = 100` per Set, tier floors/ceilings, the anchor rule — are **joint** constraints: they constrain the *combination* of selected Questions, not the pool. Pool Validation checks that **each axis individually has enough Candidates**; whether a joint allocation exists that satisfies all axes simultaneously is the **Constraint Solver's** problem (out of scope per this session's prompt; recorded as Integration Spec IG-5).

**This boundary is deliberate and important:**
- Per-axis validation is cheap, deterministic, and Bank-bounded.
- Joint-constraint satisfaction is potentially NP-hard (it's an integer feasibility problem) and belongs in a dedicated solver stage with its own failure handling.
- Mixing them would couple the Generator to solver concerns, breaking separation.

**Consequence:** a Pool can **pass per-axis validation** (every axis has enough Candidates) and still produce an **infeasible** CandidateSet from the Solver's perspective. That outcome is the Solver's to detect and surface — not the Generator's. The Generator's contract is: *"here is every Code that could legally participate; whether they can be jointly selected is downstream."*

### 7.4 Classification

Every validation outcome is classified into one of four severities. Classification is precise — not a slider:

| Severity | Meaning | Generator Action |
|---|---|---|
| **Pass** | The axis is fully satisfiable from the pool; no action needed. | Continue. |
| **Warning** | The axis is satisfiable but with reduced headroom (e.g. exactly enough Candidates, no spare for Ranking to optimize). | Continue; warning carried into CandidateSet metadata. |
| **Blocking** | The axis has a shortfall that Pool Expansion cannot resolve (e.g. mandatory topic with zero Candidates). | Halt by default; surface to Human Review. Override is explicit and auditable. |
| **Fatal** | The Generator cannot produce a meaningful CandidateSet at all (e.g. a required Bank column is missing — IG-2; or the Document Registry references documents absent from the Bank — IG-1). | Halt unconditionally. No CandidateSet produced. |

### 7.5 What Validation Does NOT Do

- ❌ Does not solve joint constraints (the Solver's job).
- ❌ Does not select between Candidates.
- ❌ Does not modify the Blueprint to make it pass.
- ❌ Does not silently relax a rule.

---

## 8. Pool Expansion

### 8.1 When Expansion Runs

Pool Expansion runs **only if Pool Validation produced Warnings** — i.e. the pool is satisfiable but has insufficient headroom for Ranking to optimize. Expansion does **not** run for Blocking or Fatal outcomes (those halt or surface to Human Review).

### 8.2 Expansion Strategy

Controlled over-fetch (Principle 4 — Maximum Recall). Expansion broadens the Candidate Pool by relaxing **only the over-fetch headroom**, never the Blueprint's hard rules:

| Strategy | What It Does | What It Does NOT Do |
|---|---|---|
| **Controlled Over-Fetch** | Fetch additional Candidates per under-headroom bucket (e.g. +20% per slot, capped) to give Ranking room | Does not relax axis filters (Document/Difficulty/Pattern/LO) |
| **Expansion Priority** | Prioritize buckets with the worst headroom ratio (e.g. a slot with exactly-target Candidates before a slot with 2× target) | Does not prioritize one Blueprint over another |
| **Expansion Limits** | Hard caps on total expansion (e.g. CandidateSet size cap, per-bucket cap) to bound cost | Does not expand without bound |
| **Stopping Conditions** | Stop when headroom reaches a target threshold OR the expansion cap is hit OR the Bank is exhausted | Does not keep expanding after a stop condition |

### 8.3 The Non-Negotiable Rule

> **The Generator must never silently weaken Blueprint rules.**

Expansion broadens the **pool size within the existing filter axes**. It does **not**:
- Remove a Document from the Document Filter to find more Candidates.
- Expand the Difficulty filter to include "Medium" when the slot needs "Hard".
- Treat missing `pattern` (IG-2) as a wildcard to inflate counts.
- Drop a coverage requirement because it's hard to fill.

If a rule cannot be satisfied without weakening it, the outcome is **Blocking** (§7.4), surfaced to Human Review. The Human may decide to weaken the Blueprint (e.g. reduce a target count, or add Questions to the Bank) — but that is a human decision, not a Generator action.

### 8.4 Expansion Limits

Hard caps, owned by the Generator:
- **Per-bucket cap:** expansion never more than doubles a bucket's target count.
- **Total CandidateSet cap:** a global maximum CandidateSet size (configurable; scales with `target_count × sets × headroom_factor`).
- **Bank exhaustion:** if the Bank has no more eligible Candidates for a bucket, expansion stops at what's available.

These caps ensure the Generator's output size is bounded by the Blueprint's structure, not by Bank size — consistent with Engine Foundation §9.4.

### 8.5 What Expansion Does NOT Do

- ❌ Does not weaken rules (the non-negotiable rule above).
- ❌ Does not invoke ranking to choose which expanded Candidates to keep.
- ❌ Does not bypass the Bank.
- ❌ Does not exceed its caps.

---

## 9. Candidate Provenance

### 9.1 Responsibility

Ensure every Candidate in the CandidateSet can explain **why it exists** — which filters it passed, which Blueprint requirements it satisfies, which slots it could fill. Provenance is Principle 5 (Explainability) made operational, and it is the Generator's main contribution to Human Review's ability to trust the output.

### 9.2 Provenance Components

| Component | Content |
|---|---|
| **Filter History** | The ordered list of filters the Candidate passed (Document, Difficulty, Pattern, LO, Coverage, Status). Exclusion is recorded as a negative ("not in exclusions"). |
| **Slot Eligibility** | The set of Blueprint slots this Candidate could legally fill (e.g. `{set: 1, difficulty: Easy, pattern: Memory, document: D1}` and `{set: 2, difficulty: Easy, pattern: Memory, document: D1}`). A Candidate may be eligible for multiple slots. |
| **Coverage Satisfaction** | Which mandatory-topic bindings (CR-1) this Candidate satisfies, if any. |
| **Completeness Flags** | Which axes are `complete` vs. `incomplete` (IG-2 gaps). |
| **Confidence Reason** | If Confidence is reduced, the reason (e.g. "tier derived via document fallback"). |

### 9.3 Traceability

Provenance enables **full traceability** from any selected Question back to:
- The Blueprint slot it was chosen for (via Slot Eligibility).
- The filters that admitted it (via Filter History).
- The coverage rules it satisfies (via Coverage Satisfaction).
- The data quality caveats it carries (via Completeness/Confidence).

This is what makes Human Review tractable: a Human inspecting a Candidate in the Review Workbench can see *exactly* why the Generator offered it, with no black-box inference.

### 9.4 Decision Transparency

Provenance also covers the **negative case**: a Question that *could have been* a Candidate but was excluded (e.g. by the Document Filter or the Exclusion Filter) is recorded in the **Shortfall Report's exclusion log** — not in any Candidate's provenance, but accessible for debugging. A Human asking "why isn't Q-000123 in the pool?" can get a precise answer.

### 9.5 What Provenance Does NOT Do

- ❌ Does not rank Candidates.
- ❌ Does not score Candidates (Confidence is metadata quality, not a score).
- ❌ Does not justify a *selection* (that's Ranking's provenance, a separate concern).

---

## 10. CandidateSet Contract

### 10.1 Purpose

The CandidateSet is the Generator's **output contract**: the complete, validated, provenance-tracked set of Question Codes that could legally satisfy the Blueprint. It is the input to the next module (Ranking and/or Constraint Solver).

### 10.2 Ownership

- **Information content:** owned by this spec (§10.3).
- **Production:** owned by this spec (§2, §5–§8).
- **Consumption:** by Ranking (later session) and the Constraint Solver (later session). The CandidateSet shape is contract-stable; downstream modules depend on it.

### 10.3 Conceptual Shape

```
CandidateSet
├── identity              (AssemblyRequest id, generation timestamp, Bank state hash)
├── candidates[]          (Candidate objects: Code + metadata + provenance)
├── slot_index            (pre-computed index: which Candidates are eligible for which Blueprint slots)
├── shortfall_report      (per-axis shortfalls + severity classifications)
├── coverage_satisfaction (which mandatory topics are covered, by which Candidates)
├── warnings[]            (carried forward from Validation/Expansion)
├── meta                  (spec_version = "1.0", generator_version)
└── exclusions_log        (Codes excluded, with reason — for debugging)
```

The `slot_index` is a critical denormalization: it lets Ranking and the Solver look up "all Candidates eligible for slot X" without re-deriving eligibility. This is a token-efficiency optimization — provenance is computed once in the Generator, not re-derived downstream.

### 10.4 Lifecycle

- **Birth:** emitted by the Generator at successful termination.
- **Stability:** immutable once emitted.
- **Death:** consumed and discarded by downstream modules; not persisted by the Generator (though it may be cached for audit/debugging — caching does not affect determinism since it's input-bound).

### 10.5 Boundaries

The CandidateSet is **read-only for downstream modules**. Ranking may annotate Candidates with scores; the Solver may annotate them with assignment state — but those annotations are **layered on top**, never modifying the CandidateSet's core contract. This keeps the Generator's output stable regardless of what downstream modules do.

### 10.6 What the CandidateSet Is NOT

- ❌ Not a **selection**. It is the legal pool, not the chosen set.
- ❌ Not a **solution**. It does not specify which Codes jointly satisfy constraints.
- ❌ Not **ranked**. Candidates appear in stable-key order, not score order.
- ❌ Not **content-bearing**. No Question body, choices, or explanations are included.

---

## 11. Failure Handling

### 11.1 Failure Posture

The Generator obeys the Engine-wide failure discipline (Engine Foundation §7):
- **Fail Fast:** halt at the first unrecoverable problem.
- **Fail Loud:** every failure produces a structured, actionable error.
- **Remain Deterministic:** same input + Bank state → same failure.

### 11.2 Failure Catalogue

| Failure | Stage | Severity | Generator Action |
|---|---|---|---|
| **Empty Pool** | Validation | Blocking (if a Blueprint requires >0) / Pass (if Blueprint legitimately has zero candidates for an axis and the Blueprint permits it — rare) | Halt; surface to Human Review with the empty axis identified |
| **Partial Coverage** (some axes satisfiable, others not) | Validation | Blocking | Halt; Shortfall Report identifies which axes failed |
| **Impossible Blueprint** (joint constraints unsatisfiable on paper — e.g. tier floors exceed 100) | Validation (per-axis detects precursors) / Solver (detects the actual infeasibility) | Per-axis: Blocking. Joint: **out of scope** — flagged in shortfall metadata for the Solver |
| **Conflicting Metadata** (e.g. a Question claims a document not in the Registry) | Discovery | Fatal | Halt; identify the offending Question Code + the conflict |
| **Missing Metadata** (IG-2: required axis column absent from Bank) | Filtering | Fatal | Halt; identify the missing column and the filters it blocks |
| **Version Mismatch** (`AssemblyRequest.meta.spec_version` unsupported by this Generator) | Query Planning | Fatal | Halt; identify the unsupported version |
| **Tier Derivation Failure** (IG-1: Question's `document` doesn't match any Registry entry) | Discovery | Fatal per-Question, or Blocking per-Pool depending on policy | Surface the offending Codes; halt or flag |
| **Expansion Limit Hit** (Bank exhausted before headroom reached) | Expansion | Warning | Continue with reduced headroom; warn in CandidateSet metadata |

### 11.3 Every Failure Must

- **Fail Fast:** no continued processing in hopes of recovery.
- **Fail Loud:** structured error with category, location, severity, explanation, recommendation (mirroring the Reader's error anatomy — consistency across the Engine).
- **Remain Deterministic:** same input + Bank → same error.

### 11.4 No Silent Weakening

The worst Generator failure mode is **silently weakening a Blueprint rule to produce a CandidateSet**. Every failure classification above either halts (Fatal/Blocking) or carries the shortfall forward as explicit metadata (Warning). The Generator **never** drops a filter to make the numbers work, **never** treats missing data as a wildcard, **never** relaxes a target count to avoid a shortfall. If the Blueprint cannot be honestly satisfied, that fact is surfaced — not concealed.

---

## 12. Token Efficiency

### 12.1 The Flow

```
AssemblyRequest       (small, fixed — proportional to sets × axes × documents)
        │
        ▼
Query Planning        (pure transformation — no Bank access; plan size ≈ AssemblyRequest size)
        │
        ▼
Candidate Pool        (potentially large — bounded by Bank size × filter selectivity)
        │
        ▼
CandidateSet          (output — bounded by Blueprint structure, not Bank size)
```

### 12.2 Information Growth and Reduction

| Transformation | Size Change | Why |
|---|---|---|
| AssemblyRequest → Query Plan | ~Same (slight growth) | Plan is the AssemblyRequest reorganized; adds filter specifications, no Bank data |
| Query Plan → Candidate Pool | **Large growth** (bounded by Bank) | Pool size is proportional to *(Bank size × selectivity)*. For a 1M-Question Bank with a 12-document Blueprint, this might be ~50,000 Candidates. **This is the only stage that touches Bank-scale data.** |
| Candidate Pool → CandidateSet (post-Validation + Expansion) | **Reduction** | The CandidateSet is bounded by *(target_count × sets × headroom_factor)* — for v3.0, roughly 100 × 5 × 1.5 ≈ ~750 Candidates. Bank-scale data does **not** escape the Generator. |

### 12.3 The Scaling Promise (Principle 6)

> The CandidateSet's size is bounded by **Blueprint structure**, not by **Bank size**.

Concretely:
- A 100,000-Question Bank and a 1,000,000-Question Bank producing the same Blueprint yield **the same-size CandidateSet** (assuming both Banks satisfy the filters).
- The Candidate **Pool** (internal) does scale with Bank size — but the Pool never leaves the Generator. Only the bounded CandidateSet is emitted.
- Downstream modules (Ranking, Solver) see only the CandidateSet; their cost is bounded by Blueprint structure, not Bank size.

### 12.4 What Token Efficiency Does NOT Mean

- ❌ Does not mean **excluding valid Candidates** to keep the set small (that violates Maximum Recall).
- ❌ Does not mean **skipping provenance** to save tokens (provenance is essential for Review).
- ❌ Does not mean **under-fetching** to avoid Pool growth (the Pool is internal; its size is a performance concern, not a contract concern).

### 12.5 The Content Boundary (Reinforced)

The Generator's token efficiency rests fundamentally on **never reading content**. Every token-saving argument above assumes the Generator works with Codes + metadata only. If content entered the Generator, scaling to 1M Questions would be impossible. The content boundary (Principle 2) is therefore both a correctness rule and a scalability rule.

---

## 13. Layer Boundaries

### 13.1 The Candidate Generator

- **CAN:**
  - Read Bank metadata (read-only).
  - Filter, discover, validate, expand.
  - Emit a CandidateSet.
  - Record provenance and shortfalls.
- **CANNOT:**
  - Read Question content.
  - Rank Candidates.
  - Select winners.
  - Solve joint constraints.
  - Write anywhere (Bank or otherwise).
  - Modify the AssemblyRequest.
  - Touch the Reader, Ranking, Solver, Review, or Draft Builder.
- **MUST NEVER:**
  - Invoke an LLM.
  - Perform content-based reasoning.
  - Silently weaken a Blueprint rule.
  - Silently drop a valid Candidate.
  - Infer missing metadata (must flag, not guess).
  - Treat missing data as a wildcard to inflate counts.
  - Persist runtime state between runs.
  - Perform SQL-specific logic at the architecture level (the Generator expresses filters; *how* they execute against Postgres is an implementation concern).
- **MUST ALWAYS:**
  - Be deterministic (given Bank state).
  - Preserve maximum recall.
  - Record provenance for every Candidate.
  - Bound the CandidateSet by Blueprint structure, not Bank size.
  - Fail fast, fail loud, remain deterministic.

### 13.2 Separation from Adjacent Modules

| Boundary | Generator's Side | Other Side |
|---|---|---|
| **Generator ↔ Reader** | Consumes `AssemblyRequest` (read-only) | Reader emits it; Generator never modifies |
| **Generator ↔ Bank** | Reads metadata only (read-only) | Bank is substrate; Generator never writes |
| **Generator ↔ Ranking** | Emits CandidateSet (contract-stable) | Ranking consumes it; may annotate but not modify core |
| **Generator ↔ Constraint Solver** | Emits CandidateSet | Solver consumes it; joint-constraint satisfaction is Solver's job (IG-5) |
| **Generator ↔ Review** | Emits CandidateSet + Shortfall Report | Review consumes them; Human decisions are final |

---

## 14. Anti-Patterns

Explicitly prohibited. Any future change must be evaluated against this list.

| # | Anti-Pattern | Why Prohibited |
|---|---|---|
| AP-1 | **Reading Question Content** | Violates Principle 2 (Metadata First); destroys scalability (§12.5) |
| AP-2 | **Generating Questions** | Forbidden system-wide (Engine Foundation §1); the Generator assembles, never creates |
| AP-3 | **Ranking Questions** | Crosses into Ranking's responsibility; the Generator discovers, never judges |
| AP-4 | **Constraint Solving** | Joint-constraint satisfaction is the Solver's job (IG-5); per-axis validation is the Generator's ceiling |
| AP-5 | **LLM Usage** | Violates determinism (Principle 1); the Generator is metadata-filtering, not reasoning |
| AP-6 | **SQL-specific logic in the architecture** | Filter *specifications* are architecture; *SQL* is implementation. Coupling them reduces portability across future Bank substrates. |
| AP-7 | **Business Rule Modification** | The Generator never edits the AssemblyRequest; it executes it |
| AP-8 | **Silent Rule Relaxation** | The worst failure mode (§11.4); violates Maximum Recall's spirit and Blueprint fidelity |
| AP-9 | **Hidden Assumptions** | Every filter, every derivation, every completeness flag must be explicit and inspectable |
| AP-10 | **Mixing per-axis validation with joint-constraint solving** | Breaks separation (§7.3); couples the Generator to Solver concerns |
| AP-11 | **Emitting a Pool-sized CandidateSet** | Violates the scaling promise (§12.3); the CandidateSet is Blueprint-bounded, not Bank-bounded |
| AP-12 | **Treating missing metadata as a wildcard** | Silently inflates counts; masks IG-2 gaps instead of surfacing them |

---

## 15. Future Extensibility

### 15.1 New Filter Axes

If a future Blueprint version introduces a new metadata axis (e.g. "cognitive load tier"), the Generator extends additively:
- Query Planning learns the new axis.
- Metadata Filtering gains a new filter.
- Discovery attaches the new metadata to Candidates.
- Validation gains a new completeness check.

No existing contract changes; the CandidateSet grows a new metadata field. Downstream modules extend forward-compatibly.

### 15.2 New Bank Substrates

The Generator's architecture is Bank-substrate-independent at the spec level: it expresses *filter specifications*, not SQL. A future Bank substrate (e.g. a different storage engine, or a sharded Bank for >10M Questions) requires a new filter executor — not a new Generator architecture. This is why AP-6 prohibits SQL-specific logic in the architecture.

### 15.3 Scaling Beyond 1M Questions

The architecture scales by construction (§12.3): CandidateSet size is Blueprint-bounded. The internal Candidate Pool does scale with Bank size, which is a performance concern addressed by:
- Filter order (§4.3) — most selective first.
- Substrate-appropriate indexing (implementation concern, not architectural).
- Pool-internal pagination/streaming for very large Banks (implementation concern).

No architectural change is required to scale from 1K to 1M Questions. Beyond 1M may require substrate sharding — but that is a Bank concern, not a Generator concern.

### 15.4 What Does NOT Change

- The Candidate/Pool/CandidateSet distinction (§6).
- The filtering-vs-selection separation (the Generator's defining boundary).
- The per-axis validation ceiling (joint solving belongs to the Solver).
- The content boundary (Principle 2 — architectural invariant).
- The Maximum Recall posture (Principle 4 — architectural invariant).

---

## Appendix A — Glossary

| Term | Definition |
|---|---|
| **AssemblyRequest** | Engine input contract (Integration Spec v1.0). The Generator's input. |
| **Query Plan** | The Generator's interpretation of the AssemblyRequest into filter specifications. Bank-independent. |
| **Candidate** | A Question Code + metadata + provenance + completeness + confidence. The Generator's internal unit. |
| **Candidate Pool** | The internal, mutable working set of Candidates produced by Discovery. |
| **CandidateSet** | The final, validated, contract-stable output. Bounded by Blueprint structure, not Bank size. |
| **Slot** | A Blueprint distribution cell (e.g. `{set: 1, difficulty: Easy, pattern: Memory}`). |
| **Slot Eligibility** | The set of slots a Candidate could legally fill. Part of provenance. |
| **Shortfall Report** | The per-axis accounting of unmet Blueprint requirements. |
| **Tier** | A Document property (1–4) used in constraints; derived per Candidate via the Document Registry. |
| **Provenance** | Per-Candidate explanation of why it exists in the CandidateSet. |
| **Completeness** | Per-axis flag indicating whether a Candidate's metadata is complete enough to evaluate. |
| **Confidence** | Deterministic metadata-quality signal (not a ranking score). |
| **Headroom** | The ratio of available Candidates to target count for a slot. |

---

## Appendix B — Boundary Assertions

The non-negotiable contracts of this specification.

1. The Generator receives an `AssemblyRequest` and produces a `CandidateSet`. **Nothing else crosses its boundary.**
2. The Generator **never reads Question content**. Metadata only.
3. The Generator **discovers, never selects**. Ranking and selection belong to downstream modules.
4. The Generator performs **per-axis validation only**. Joint-constraint satisfaction belongs to the Constraint Solver (IG-5).
5. The Generator **never silently weakens** a Blueprint rule. Shortfalls are surfaced, not concealed.
6. The Generator **never treats missing metadata as a wildcard** (IG-2 gaps are flagged, not exploited).
7. The CandidateSet's size is **bounded by Blueprint structure, not Bank size**.
8. The Generator is **deterministic given Bank state**, stateless across runs, and **LLM-free**.
9. Every Candidate carries **provenance** explaining why it exists.
10. Every failure is **fast, loud, and deterministic**.

---

## Appendix C — Provenance & Cross-References

- **Engine alignment:** The Generator is Engine Foundation v1.0's "Candidate Generator" module (§3.2). Its output, the CandidateSet, is the Engine Foundation's "CandidateSet" payload (§4.2).
- **Integration Spec alignment:** The Generator consumes the `AssemblyRequest` contract (Integration Spec §4). It honors every axis declared there, including those the Bank cannot yet satisfy (IG-2) — by surfacing the gap, not by dropping the axis.
- **Reader alignment:** The Generator receives the Reader's output (`AssemblyRequest`) read-only. It never modifies or re-derives it.
- **Blueprint fidelity:** Every Blueprint v3.0 axis — Coverage, Difficulty, Documents, Patterns, LOs, Duplicate Rules, Exclusions — is interpreted by Query Planning (§3) and executed by Filtering (§4). No axis is silently dropped.
- **Honesty:** Integration Gaps IG-1 (Tier derivation) and IG-2 (missing Bank columns) are surfaced as Fatal/Blocking failures (§11), not concealed. IG-5 (joint constraints) is honored by the Generator's strict per-axis validation ceiling (§7.3).

---

*End of Sobdai Candidate Generation Architecture — v1.0.*

**Upstream sources (immutable):**
- Assessment Assembly Engine Foundation v1.0
- Blueprint Integration Specification v1.0
- Blueprint Reader Pipeline Architecture v1.0
- Assessment Blueprint v3.0

**Next modules to specify (later sessions):**
- Candidate Ranking Architecture
- Constraint Solver Architecture (closes IG-5)
- Review Workbench Architecture
- Draft Builder Architecture
