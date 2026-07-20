# Sobdai Scoring Model Specification — v1.0

**Status:** Official Architecture Specification (Architecture only — no implementation, no algorithm, no formulas, no pseudocode, no tuning, no SQL, no code, no UI)
**Sources of truth (exhaustive, immutable):**
1. `assessment_assembly_engine_foundation_v1.md` — Assessment Assembly Engine Foundation v1.0
2. `blueprint_integration_specification_v1.md` — Blueprint Integration Specification v1.0
3. `blueprint_reader_pipeline_architecture_v1.md` — Blueprint Reader Pipeline Architecture v1.0
4. `candidate_generation_architecture_v1.md` — Candidate Generation Architecture v1.0
**Version:** 1.0
**Owner:** Chief Assessment Architect, Sobdai

> **What this document is.** This is not a module specification. It is a **language specification** — the contract that every future Ranking implementation must speak. The relationship is exact:
>
> *"The `AssemblyRequest` is to the Reader what the Scoring Model is to Ranking."*
>
> The `AssemblyRequest` fixes what a Blueprint *means* to the Engine, independent of how any Reader produces it. The Scoring Model fixes what a Candidate's evaluation *means* to the Assessment System, independent of how any Ranking implementation computes it. A new Ranking implementation may ship; the Scoring Model does not change. A new score component may be added; the Scoring Model's vocabulary, ownership, and contracts absorb it without rupture.
>
> **What this document is not.** Not an algorithm. Not a formula. Not a weighting scheme. Not a tuning strategy. Not an implementation. Not a SQL schema. Not a UI. It defines the **vocabulary, contracts, ownership, and lifecycle** of scoring — the *language*, not the *mechanics*.

---

## 0. Executive Summary

The Assessment Engine transforms a Blueprint into a set of candidate Question Codes. Between "these Codes exist" and "these Codes are chosen" sits an evaluation: **how well does each Candidate fit the Blueprint, and how much should the system trust that fit?** The Scoring Model is the official language for that evaluation.

The model rests on a single architectural separation that appears in every section: **Scoring ≠ Selection**. A Score is a structured, explainable, auditable evaluation of one Candidate against one Blueprint. It is **never** a decision. The Constraint Solver consumes ranked Candidates to find a feasible allocation; the Human Reviewer consumes the same to make the final call. Scoring *assists* decision; it never *is* the decision. A high Composite Score does not mean "best question" — it means "best-evaluated fit, given current evidence and current confidence."

Three relationships define the model's place in the system:

- **Scoring ↔ Candidate Ranking.** Ranking is the consumer and compute owner of Scores. The Scoring Model defines what Ranking may emit; Ranking may not invent score types, rename components, or emit unexplained aggregates. Ranking implements this spec; it does not extend it unilaterally.
- **Scoring ↔ Constraint Solver.** The Solver consumes *ranked* Candidates to find joint allocations that satisfy Blueprint constraints. The Solver does not re-score — it consumes Ranking's output. Scoring gives the Solver an ordering and per-Candidate evidence; the Solver's job is *combination*, not *evaluation*.
- **Scoring ↔ Human Reviewer.** Every Score is explainable to a Human in plain terms. The Human may override any Score-derived ordering. The Human is the final authority; Scores are advisory.

The Scoring Model is **deterministic given its inputs, content-free in computation (though content may inform signals upstream), transparent by construction, and bounded by CandidateSet size** — never by Bank size. It is the language in which the Engine's evaluation is spoken, and it is owned at the architecture level so that no implementation can quietly change what the Engine *means*.

---

## 1. Why Scoring Exists

### 1.1 The Problem Scoring Solves

A Blueprint produces a CandidateSet — potentially hundreds of Question Codes that *could legally* appear in a Draft. The Generator established legality (every Candidate passed every filter). But legality is a low bar: a Candidate may be legal yet be a poor fit (over-used already, stale, mismatched to the slot's difficulty intent, redundant with other Candidates). Conversely, the Constraint Solver cannot reason over hundreds of unranked Candidates efficiently, and the Human Reviewer cannot triage them unaided.

Scoring exists to **convert legality into priority** — to give the downstream stages (Ranking, Solver, Review) a structured, comparable, explainable basis for choosing among legal Candidates.

### 1.2 What Scoring Provides

- **Comparability.** A common evaluation language across Candidates, slots, and runs.
- **Explainability.** Every evaluation traces to evidence and a metadata source (§8).
- **Confidence-awareness.** Every evaluation carries an honest trust level, propagated from evidence quality (§6).
- **Decoupling.** Scoring logic is owned at the architecture level, not scattered across Ranking implementations.

### 1.3 What Scoring Does Not Provide

- Decisions. Scoring never selects.
- Truth. A Score is an evaluation, not a fact about the Question.
- Content judgment. Scoring operates on metadata and signals, not on Question bodies (§12).
- Human replacement. The Human remains the final authority.

---

## 2. Philosophy

### 2.1 Scoring ≠ Selection

The foundational principle. A Score evaluates; it does not choose. The boundary is strict:

| Stage | Question It Answers | Output |
|---|---|---|
| **Scoring** | "How well does this Candidate fit, and how sure are we?" | Score (per Candidate × slot) |
| **Ranking** | "In what order should these Candidates be considered?" | Ordered list |
| **Constraint Solver** | "Which joint allocation satisfies the constraints?" | Feasible assignment |
| **Human Review** | "What actually goes into the Draft?" | Final selection |

A Candidate with the highest Composite Score may still be *rejected* by the Solver (because selecting it makes the joint allocation infeasible) or by the Human (because the Human sees something the Score cannot). This is correct behavior. The Score's job is to *inform*, not to *decide*.

### 2.2 Score Assists Decision

Every downstream consumer of a Score uses it as **input to a decision, not as the decision itself**:
- Ranking orders Candidates by Score, but ordering is not selection.
- The Solver prefers higher-Score Candidates when feasible, but feasibility — not Score — governs its output.
- The Reviewer consults Scores to triage efficiently, but may override any Score.

### 2.3 The Human Remains the Final Authority

No Score, no ranking, and no solver output is final until the Human approves. Scoring is the Engine's most opinionated stage, and it is therefore the stage most in need of Human oversight. The Scoring Model enforces this by making every Score fully explainable (§8) and fully overridable in Review.

### 2.4 Honesty Over Fluency

When evidence is missing or conflicting, the Scoring Model **does not smooth over the gap**. It propagates reduced Confidence (§6) and, where required, applies Penalties (§7) — but it never invents values to produce a clean-looking Score (§11, Anti-Pattern AP-9). A low-Confidence Score is more honest than a confident wrong one.

---

## 3. Scoring Lifecycle

The lifecycle is the spine of the model. Each stage has a single owner and a single responsibility.

```
Candidate (from CandidateSet)
        │
        ▼
   Raw Signals          ── extracted facts about the Candidate
        │                  (owned by: Ranking, sourced from CandidateSet metadata)
        ▼
   Score Components     ── per-axis evaluations
        │                  (owned by: Ranking)
        ▼
   Normalized Scores    ── components placed on common scales
        │                  (owned by: Ranking)
        ▼
   Composite Score      ── the structured aggregate
        │                  (owned by: Ranking)
        ▼
   Confidence           ── the trust level, propagated from evidence
        │                  (owned by: Ranking, consumed by all downstream)
        ▼
   Penalties            ── structured demerits (soft/hard/disqualify)
        │                  (owned by: Ranking, may be augmented by the Solver)
        ▼
   Ranked Candidates    ── input to the Constraint Solver
        │                  (owned by: Ranking)
        ▼
   (Solver, Review, Draft Builder — later modules)
```

### 3.1 Stage Ownership

| Stage | Owner | Responsibility |
|---|---|---|
| Raw Signals | Candidate Ranking | Extract factual signals from CandidateSet metadata. No invention. |
| Score Components | Candidate Ranking | Evaluate each Candidate per axis. |
| Normalized Scores | Candidate Ranking | Place components on common scales for comparability. |
| Composite Score | Candidate Ranking | Aggregate into a single structured evaluation per (Candidate × slot). |
| Confidence | Candidate Ranking | Compute and propagate the trust level. |
| Penalties | Candidate Ranking (primary), Constraint Solver (may augment) | Apply structured demerits. |
| Ranked Output | Candidate Ranking | Emit the ordered list consumed by the Solver. |

### 3.2 Critical Ownership Boundaries

- **The Candidate Generator does not score.** (Candidate Generation Architecture §13 AP-3 prohibits ranking.) The Generator's `Confidence` facet (per-Candidate, metadata-quality) is an *input* to Scoring's Confidence — it is not itself a Score. See §6.5 for the reconciliation.
- **The Constraint Solver does not score.** It consumes ranked Candidates and may *augment penalties* (e.g. applying a hard penalty when a Candidate's selection would violate a joint constraint), but it does not re-evaluate Candidates or invent components.
- **The Review Workbench does not score.** It displays Scores and captures Human overrides.
- **The Draft Builder does not score.** It materializes an approved selection into a Draft Exam Set.

Only **Candidate Ranking** computes Scores. This is the single-responsibility guarantee.

### 3.3 Lifecycle Within a Run

The lifecycle is **synchronous and stateless within a run**: CandidateSet in → Ranked Candidates out. No Score persists between runs (though Scores may be cached for audit/debugging — caching is input-deterministic and does not affect correctness).

---

## 4. Score Components

Score Components are the **per-axis evaluations** that compose a Composite Score. Each component evaluates one facet of the Candidate's fit. The component vocabulary is **fixed at the architecture level**; implementations compute values for these components but may not invent new ones without a spec version bump (§15).

### 4.1 The Component Vocabulary

The following components are the v1.0 vocabulary, derived from what the CandidateSet and `AssemblyRequest` can evidence. Each is a *concept*, not a formula.

| Component | Evaluates | Input | Output Concept | Why It Exists |
|---|---|---|---|---|
| **Coverage Fit** | How well the Candidate satisfies a mandatory-topic binding or coverage rule | Candidate's `(document, topic)` vs. slot's coverage requirement | A fit indicator + the binding satisfied | Ensures Blueprint coverage rules actually drive selection |
| **Difficulty Fit** | How well the Candidate's `difficulty` matches the slot's target difficulty | Candidate's `difficulty` vs. slot's `difficulty` | A match indicator | Keeps the Blueprint's difficulty distribution honest |
| **Distribution Fit** | How selecting this Candidate moves the slot toward its distribution target | Slot's current fill state vs. target count | A progress indicator | Prevents over- or under-filling any distribution bucket |
| **Pattern Fit** | How well the Candidate's `pattern` matches the slot's pattern (Positive/Negative/Best Answer/Scenario/Sequence/Matching) | Candidate's `pattern` vs. slot's `pattern` | A match indicator | Honors the Question Pattern Layer (subject to IG-2) |
| **LO Fit** | How well the Candidate's `learning_objective` matches the slot's LO | Candidate's `lo` vs. slot's `lo` | A match indicator | Honors the LO distribution (subject to IG-2) |
| **Freshness** | How recent or current the Candidate is | Candidate's lifecycle timestamps | A recency indicator | Prevents stale Questions from dominating |
| **Usage** | How heavily the Candidate is already used across existing Exam Sets | Candidate's usage count (from Bank) | A load indicator | Promotes distribution diversity across the catalog |
| **Diversity** | How selecting this Candidate affects the (Topic × Difficulty × Type) combinatorial diversity of the slot | Slot's current diversity state | A distinctness indicator | Supports Duplicate Prevention rules L1–L5 |
| **Constraint Readiness** | How selecting this Candidate affects the feasibility of satisfying the Blueprint's joint constraints (tier floors/ceilings, anchor rule) | Slot's constraint headroom | A feasibility indicator | Gives the Solver a head start; not a Solver substitute |
| **Blueprint Alignment** | A holistic indicator of how well the Candidate matches the Blueprint's overall intent for the slot | Composite of the above + Blueprint context | An alignment indicator | Captures intent that per-axis components miss |

### 4.2 Component Properties

Every Score Component, regardless of axis, carries:

| Property | Content |
|---|---|
| **Purpose** | Which facet of fit this component evaluates |
| **Input** | The signals it consumes (from the CandidateSet; never from Question content) |
| **Output** | The component's value + its normalized form |
| **Ownership** | Candidate Ranking (always) |
| **Lifecycle** | Born when Ranking evaluates the Candidate; consumed when Ranking aggregates into the Composite Score |
| **Evidence** | The signals and rules that produced the value (§8) |
| **Confidence** | The component-level trust level (§6), propagated from input quality |

### 4.3 What Components Are NOT

- ❌ Components are **not** formulas. Their values are computed by Ranking implementations; the spec fixes the *vocabulary*, not the *math*.
- ❌ Components are **not** independent decisions. No component alone determines selection.
- ❌ Components are **not** UI elements. They are evaluation concepts; the Review Workbench may render them, but they exist independent of any rendering.
- ❌ Components are **not** Bank columns. They are computed at evaluation time from CandidateSet metadata.

### 4.4 Component Extension

New components may be added in future spec versions (§15). A Ranking implementation may **not** add a component unilaterally — doing so would fracture the language across implementations. New components require a Scoring Model version bump, so that every consumer knows the vocabulary has grown.

---

## 5. Composite Score

### 5.1 Why a Composite Score Exists

Per-axis components evaluate facets; the Composite Score exists to produce **one structured evaluation per (Candidate × slot)** that downstream stages can compare and order. Without it, Ranking would have no common currency; the Solver would have no ordering; the Reviewer would have to mentally aggregate ten components per Candidate.

### 5.2 What the Composite Score Represents

The Composite Score represents **the system's structured, evidence-backed evaluation of how well this Candidate fits this slot, given current evidence and current confidence**. It is:

- **Per (Candidate × slot).** A Candidate may have different Composite Scores against different slots.
- **Evidence-backed.** Every Composite traces to its components, which trace to signals (§8).
- **Confidence-weighted.** The Composite carries a propagated Confidence (§6); a high-value, low-Confidence Composite is *not* equivalent to a high-value, high-Confidence one.
- **Comparable.** Two Composites for the same slot are directly comparable.

### 5.3 What the Composite Score Does NOT Represent (Critical)

The Composite Score is the most easily misinterpreted artifact in the Engine. The model explicitly rejects these readings:

| Misreading | Why It Is Wrong |
|---|---|
| "Highest Composite = best Question" | A Question is not good or bad in isolation; the Composite evaluates *fit to a slot*, not *quality*. The same Question may have a low Composite for one slot and a high one for another. |
| "Highest Composite = the choice" | Selection is the Solver's and Human's job (§2.1). The highest-Composite Candidate may be rejected for infeasibility or Human judgment. |
| "Composite = truth" | The Composite is an evaluation, not a fact. It reflects current evidence and current confidence, both of which may change. |
| "Composite = objective" | Components encode Blueprint intent (which is authored) and evidence (which is Bank-state-dependent). The Composite is principled, not objective. |
| "Composite replaces Human judgment" | The Human is the final authority (§2.3). The Composite *informs*; it never *replaces*. |

### 5.4 Composite Score Properties

The Composite carries:

- The aggregated value.
- Its component breakdown (§8) — the Composite is **never** an opaque number.
- Its propagated Confidence (§6).
- Any Penalties applied (§7).
- The slot it was evaluated against.

A Composite without its breakdown is **non-conformant**. This is the operational form of Score Transparency (§8).

---

## 6. Confidence Model

Confidence is the model's honesty mechanism. It answers: **"How much should the system trust this Score?"**

### 6.1 Definition

Confidence is a **per-Score trust level** that reflects the quality, completeness, and consistency of the evidence underlying the Score. It is **not** a probability, **not** a ranking axis, and **not** a substitute for the Score itself. It is a separate, parallel evaluation that travels with every Score.

### 6.2 The Confidence Vocabulary

| Concept | Meaning |
|---|---|
| **Evidence** | The signals and metadata that underlie a Score Component or Composite. Every Score has evidence; without evidence, there is no Score. |
| **Known** | A signal is present and trustworthy (e.g. `difficulty = Easy` from a complete Bank row). |
| **Unknown** | A signal is genuinely absent and cannot be derived (e.g. `pattern` is missing because the column does not exist — Integration Gap IG-2). |
| **Incomplete Metadata** | A signal is partially present (e.g. `topic` exists but does not match the Blueprint's curated Topic strings — Integration Spec IG-1 analog). |
| **Missing Metadata** | A signal is entirely absent (a stronger form of Unknown). |
| **Conflicting Evidence** | Two signals disagree (e.g. a Candidate's `document` maps to Tier 2 by the Registry but its tags suggest Tier 3). |
| **Low Confidence** | The Score is computed, but its trust level is reduced because the evidence is unknown, incomplete, missing, or conflicting. |
| **High Confidence** | The Score is computed from complete, consistent, known evidence. |

### 6.3 Confidence Propagation

Confidence **propagates** through the lifecycle (§3):

1. Each **Raw Signal** carries a confidence level: known / incomplete / missing / conflicting.
2. Each **Score Component** derives its confidence from its input signals. A component built on a missing signal (IG-2) is low-confidence — *not* dropped, *not* invented.
3. The **Composite Score**'s confidence is derived from its components' confidences. A Composite built on several low-confidence components is itself low-confidence, even if its value is high.
4. The propagated Confidence travels with the Composite into Ranking output, the Solver, and the Reviewer.

**Propagation is non-negotiable.** A high-value Score built on missing evidence must surface as high-value-but-low-confidence — never as a clean high-confidence Score. This is the operational form of §2.4 (Honesty Over Fluency) and the architectural answer to Integration Gap IG-2: missing Bank columns reduce Confidence; they do not silently inflate Composites.

### 6.4 Confidence ≠ Score

Confidence and Score are **two parallel evaluations**:

- **Score** answers: "How well does this Candidate fit?"
- **Confidence** answers: "How much do we trust that fit evaluation?"

A Candidate may have a high Score and low Confidence (a great fit on paper, but the evidence is shaky). Another may have a moderate Score and high Confidence (a decent fit we're sure about). Downstream consumers — especially the Solver and Reviewer — use *both*. Ranking output orders by Score, but flags low-Confidence Candidates prominently.

### 6.5 Reconciliation: Generator Confidence vs. Scoring Confidence

The Candidate Generation Architecture (§5.2) defines a per-Candidate `Confidence` facet — a **metadata-quality signal** captured at generation time (e.g. "this Candidate's tier was derived via fallback"). The Scoring Model's Confidence is broader — it propagates through components into the Composite.

**The reconciliation:** the Generator's Confidence is an **input** to Scoring. Ranking consumes the Generator's per-Candidate Confidence as one signal among many. The two are not in conflict; they compose. Specifically:

- Generator Confidence is set once, at CandidateSet creation, and reflects Bank metadata quality at generation time.
- Scoring Confidence is computed per (Candidate × slot), reflects the *evaluation's* trust, and propagates through the lifecycle.

A Candidate with low Generator Confidence (e.g. missing `pattern`) will produce Components with reduced Scoring Confidence for any slot that requires `pattern`, and the Composite will inherit that reduction. The two Confidences thus tell a consistent story.

---

## 7. Penalty Model

Penalties are **structured demerits** that reduce a Candidate's effective evaluation or remove it from consideration. They are the model's mechanism for encoding "this Candidate is problematic" without discarding the evaluation itself.

### 7.1 The Penalty Vocabulary

| Penalty Type | Meaning | Effect |
|---|---|---|
| **Soft Penalty** | The Candidate is viable but disadvantaged for this slot. | Reduces the Composite Score's effective value. The Candidate remains in contention. |
| **Hard Penalty** | The Candidate is severely disadvantaged; selecting it would be a deliberate choice. | Strongly reduces the effective value; flags the Candidate for Reviewer attention. |
| **Disqualification** | The Candidate is ineligible for this slot, despite passing Generator filters. | Removes the Candidate from this slot's contention entirely. Recorded with reason. |

### 7.2 What Triggers Penalties

Penalties are triggered by **evaluable conditions** on the Candidate, slot, or run state. Examples (non-exhaustive, non-binding — exact triggers are an implementation concern):

- **Soft:** Candidate is heavily used across existing Exam Sets (Usage load).
- **Soft:** Candidate's metadata is incomplete (Confidence penalty propagation).
- **Hard:** Candidate would create a near-duplicate of an already-selected Candidate (Diversity violation risk).
- **Hard:** Candidate's selection would consume the last of a constraint's headroom (Constraint Readiness risk).
- **Disqualification:** Candidate conflicts with a hard exclusion discovered post-Generator (rare; the Generator should have caught it).

### 7.3 How Penalties Combine

Penalties combine **structurally, not numerically**. The model specifies:

- Multiple Soft penalties may accumulate; their combined effect is bounded (a Candidate cannot be penalized into a Hard equivalent by Soft accumulation alone).
- A Hard penalty dominates Soft penalties for this slot.
- A Disqualification is terminal for this (Candidate × slot) pair — it cannot be overruled by other penalties or by Score.

**The model does not specify the arithmetic.** How penalties combine numerically is an implementation concern, bounded by the structural rules above. This is consistent with the spec's "architecture, not algorithm" posture.

### 7.4 Penalty Ownership

| Owner | May Apply |
|---|---|
| **Candidate Ranking** | Soft, Hard, and Disqualification penalties — as part of scoring. |
| **Constraint Solver** | May augment Hard penalties when a Candidate's selection would violate a joint constraint (e.g. tier ceiling). The Solver does **not** invent score components; it augments penalties only. |
| **Review Workbench / Human** | May *remove* penalties (Human override) but may not *add* them post-Ranking. |

### 7.5 Penalty Transparency

Every penalty is explainable: type, trigger, evidence, and effect on the Composite. An unexplained penalty is non-conformant. This is the operational form of §8.

### 7.6 Penalties ≠ Confidence Reduction

These are distinct mechanisms:

- **Confidence reduction** says: "we're less sure about this evaluation."
- **Penalty** says: "we're sure, and the evaluation is *lower*."

A Candidate may have both (e.g. a Soft penalty for high Usage, applied to a Score with reduced Confidence because `pattern` is missing). They travel together but they mean different things, and the Reviewer sees both distinctly.

---

## 8. Score Transparency

### 8.1 The Transparency Contract

Every Score — Component, Composite, Confidence, Penalty — is **fully explainable**. The model forbids opaque scoring. Specifically, every Score carries:

| Element | Content |
|---|---|
| **Score Breakdown** | The full decomposition: which Components contributed, with what values, weights, and normalized forms. |
| **Evidence** | The Raw Signals each Component consumed. |
| **Reasons** | Plain-language explanation of why the Component took its value (e.g. "Difficulty Fit = full match: Candidate is Easy, slot requires Easy"). |
| **Metadata Source** | Which CandidateSet field (and ultimately which Bank column) each signal came from. |
| **Human Explainability** | A rendering of the above in terms a Human Reviewer can act on. |
| **Auditability** | A complete, reproducible trace from Candidate → Signal → Component → Composite, sufficient to re-derive the Score given the same inputs. |

### 8.2 Why Transparency Is Non-Negotiable

Three reasons:

1. **Human Authority (§2.3).** A Human cannot override a Score they cannot understand. Opaque scoring silently displaces the Human.
2. **Auditability.** A Draft's quality must be traceable to the Scores that produced it. When a Reviewer asks "why is Q-000123 in this Draft?", the answer must be fully reconstructable.
3. **Trust calibration.** The Engine asks Humans to trust its evaluation. Trust requires transparency; a black-box Score is an article of faith, not engineering.

### 8.3 Transparency Across the Lifecycle

Transparency is **not a final-stage addition**. It is built in at every stage:

- Raw Signals record their source and confidence at extraction.
- Components record their inputs, value, and reasoning at evaluation.
- The Composite records its component contributions at aggregation.
- Confidence records its propagation path.
- Penalties record their trigger and effect.

By the time a Composite reaches the Reviewer, its full provenance is already assembled — not reverse-engineered.

### 8.4 Transparency vs. Verbosity

Transparency does not mean **verbose by default**. The model distinguishes:

- **Always-present:** Score Breakdown, Confidence, applied Penalties, top reasons.
- **On-demand:** Full signal-level detail, metadata source tracing, audit trace.

The Review Workbench shows always-present information by default and expands to on-demand detail when the Reviewer asks. This keeps the UI tractable while preserving full auditability (Token Efficiency, §12, applied to transparency itself).

---

## 9. Score Ownership

The single most important ownership rule: **only Candidate Ranking computes Scores.** Every other module either consumes Scores (read-only) or augments a specific, narrowly-scoped facet.

| Module | Score Relationship | What It May Do | What It May Not Do |
|---|---|---|---|
| **Candidate Generator** | Produces input (CandidateSet + per-Candidate Generator Confidence) | Emit Candidates with metadata-quality Confidence | Compute any Score Component or Composite |
| **Candidate Ranking** | **Owns all Scoring** | Compute Signals, Components, Composites, Confidence, Penalties; emit Ranked Candidates | Delegate scoring to another module; invent components not in the vocabulary |
| **Constraint Solver** | Consumes Ranked Candidates | Augment Hard penalties when joint constraints are at risk | Re-score; invent components; alter Confidence |
| **Review Workbench** | Displays Scores and captures overrides | Render Scores; allow Human to override ranking, remove penalties, force-include/exclude Candidates | Compute Scores; alter Score values silently |
| **Draft Builder** | None | Materialize approved selection into a Draft | Touch Scores |
| **Human Reviewer** | Final authority over ranking output | Override any Score-derived ordering; force decisions | Compute Scores themselves (they consume and decide) |

### 9.1 Why Ownership Is Centralized

If multiple modules compute Scores, the language fractures: each implementation invents its own components, its own confidence semantics, its own penalty triggers. The result is a system where no Score is comparable across modules and no evaluation is auditable end-to-end. Centralizing scoring in Ranking — and fixing the vocabulary in this spec — is what makes the Engine's evaluation coherent.

### 9.2 The Solver's Narrow Augmentation Exception

The Constraint Solver is the one module that may *augment* (not compute) Scores, and only in one way: applying a Hard penalty when a Candidate's selection would violate a joint constraint. This is necessary because joint constraints are not visible at scoring time (Candidate Generation Architecture §7.3 — per-axis validation only). The Solver's augmentation is:

- **Narrow:** only Hard penalties for joint-constraint risk.
- **Transparent:** every Solver-applied penalty is recorded with the constraint it protects.
- **Non-recomputing:** the Solver does not change Component values, Composites, or Confidence.

This is the architectural resolution of Integration Gap IG-5: the Generator's per-axis ceiling is honored, and the Solver handles joint constraints via penalty augmentation rather than re-scoring.

---

## 9. Score Ownership (continued)

### 9.3 Cross-Run Score Identity

A Score is **per (Candidate × slot × run)**. It is not a persistent property of a Candidate. The same Candidate evaluated against the same slot in a different run (with different Bank state, different slot fill state, different exclusions) may receive a different Score. This is correct behavior — Scores reflect current evidence, not eternal truth.

Persistence of Scores across runs is permitted **only** for audit and debugging, and never as input to a future run. Each run computes Scores fresh from the current CandidateSet.

---

## 10. Data Contracts

The conceptual contracts of the Scoring Model. These are **vocabulary, not schemas** — implementation shapes are an implementation concern, but the conceptual elements are fixed here.

### 10.1 Raw Signal

| Aspect | Definition |
|---|---|
| **What it is** | A factual observation about a Candidate, extracted from CandidateSet metadata |
| **Owns** | One atomic fact (e.g. `difficulty = Easy`, `usage_count = 7`) |
| **Carries** | Value + source (CandidateSet field) + extraction confidence |
| **Does not carry** | Evaluation, opinion, or comparison |

### 10.2 Score Component

| Aspect | Definition |
|---|---|
| **What it is** | A per-axis evaluation of a Candidate for a slot |
| **Owns** | One facet of fit (e.g. Difficulty Fit, Usage) |
| **Carries** | Value + normalized form + inputs (Raw Signals) + reasoning + component Confidence + applied penalties |
| **Does not carry** | Decision, selection, or cross-Candidate comparison |

### 10.3 Composite Score

| Aspect | Definition |
|---|---|
| **What it is** | The structured aggregate evaluation of a Candidate for a slot |
| **Owns** | One holistic evaluation per (Candidate × slot) |
| **Carries** | Aggregated value + full Score Breakdown + propagated Confidence + applied Penalties + slot reference |
| **Does not carry** | Decision, selection, or claim of Question quality |

### 10.4 Score Breakdown

| Aspect | Definition |
|---|---|
| **What it is** | The decomposition of a Composite into its contributing Components |
| **Owns** | The transparency of the Composite |
| **Carries** | Per-Component values, contributions, and reasons |
| **Does not carry** | Anything not in the Components (no hidden contributions) |

### 10.5 Confidence

| Aspect | Definition |
|---|---|
| **What it is** | The trust level of a Score, propagated from evidence quality |
| **Owns** | One parallel evaluation traveling with every Score |
| **Carries** | Level (e.g. high/low) + propagation path + the specific signals that reduced it |
| **Does not carry** | A probability, a ranking, or a substitute for the Score |

### 10.6 Penalty

| Aspect | Definition |
|---|---|
| **What it is** | A structured demerit applied to a Candidate for a slot |
| **Owns** | One disadvantage or disqualification |
| **Carries** | Type (Soft/Hard/Disqualification) + trigger + evidence + effect |
| **Does not carry** | A re-evaluation of the Candidate's fit (penalty modifies effect; it does not re-score) |

### 10.7 Relationships Among Contracts

```
Raw Signal ───┐
              ├─► Score Component ──┐
Raw Signal ───┘                    │
                                   ├─► Composite Score ──► Confidence (parallel)
Raw Signal ───┐                    │           │
              ├─► Score Component ──┘           └─► Score Breakdown
Raw Signal ───┘                                │
                                               └─► Penalty (applied to Composite)
```

Every Composite traces to its Components; every Component traces to its Signals; every Confidence and Penalty is bound to the Composite it qualifies.

---

## 11. Failure Handling

Scoring's failure posture inherits the Engine-wide discipline (Engine Foundation §7): Fail Fast, Fail Loud, Remain Deterministic. Scoring adds a scoring-specific rule: **Never invent values.**

### 11.1 Failure Modes

| Failure | What It Means | Scoring Behavior |
|---|---|---|
| **Missing Metadata** (IG-2) | A signal required for a Component is absent (e.g. `pattern` column missing) | The Component is computed at reduced Confidence (§6); the value is **not** invented. The Composite inherits the reduced Confidence. Surfaced in Breakdown. |
| **Unknown Values** | A signal is present but not interpretable (e.g. `difficulty = "Trivial"`, outside the enum) | Treated as missing for the affected Component; reduced Confidence. Surfaced. |
| **Conflicting Evidence** | Two signals disagree (e.g. document-implied Tier vs. tag-implied Tier) | Both signals recorded; Component Confidence reduced; conflict flagged for Reviewer. **Not** resolved by picking a winner. |
| **Incomplete Candidate** | A Candidate lacks multiple signals, such that meaningful scoring is impossible | The Composite is emitted at very low Confidence with explicit "incomplete evidence" reasoning. The Reviewer is notified. The Candidate is **not** dropped (Maximum Recall), but is effectively deprioritized. |
| **Low Confidence Across All Components** | Every Component is low-Confidence | The Composite is low-Confidence. The Candidate is ranked but flagged prominently. **Not** dropped. |
| **Conflicting Components** | Components disagree in their evaluation direction | This is normal (a Candidate may have high Difficulty Fit and low Usage Fit). The Composite aggregates; disagreement is preserved in the Breakdown, not flattened. |
| **Computation Failure** | A Component's computation throws or returns no value | The Component is marked "unevaluated"; the Composite's Confidence is reduced; the failure is logged loudly. The Candidate is **not** dropped silently. |

### 11.2 The "Never Invent Values" Rule

The single most important scoring-failure rule. When evidence is absent, conflicting, or uninterpretable, the Scoring Model **does not**:

- Substitute a default value to keep the math clean.
- Treat missing data as a wildcard match (which would inflate the Score).
- Average conflicting signals to manufacture consensus.
- Drop the Candidate to avoid the awkwardness.

Instead, it propagates reduced Confidence (§6), records the gap in the Breakdown (§8), and lets downstream consumers — especially the Reviewer — decide with full visibility. This is the architectural answer to Integration Gap IG-2 propagating into scoring: the gap becomes visible as reduced Confidence and explicit reasoning, never as a silent distortion of the Composite.

### 11.3 Scoring Never Halts on Missing Data

Unlike the Reader (which Fails Fast on structural errors) or the Generator (which Fails Fatal on missing required columns), **Scoring does not halt on missing data** — because Scoring operates on already-generated Candidates, and its job is to evaluate what exists. A Candidate with missing metadata is still a Candidate; it is evaluated at reduced Confidence. Halting would discard legal Candidates and violate Maximum Recall.

Scoring halts **only** on:
- Computation failures that cannot be contained to a single Component (extremely rare; treated as Fatal).
- Version mismatches (the CandidateSet's spec version is unsupported — Fatal).

Everything else is absorbed into Confidence and surfaced.

---

## 12. Token Efficiency

### 12.1 Scores Are Lightweight Metadata

A Score is metadata about a Candidate — not the Candidate itself. The entire Scoring lifecycle (Signals → Components → Composite → Confidence → Penalties) operates on **metadata**, never on Question content. This makes Scores cheap to compute, cheap to transmit, and cheap to render.

### 12.2 Ranking Must Never Use Question Content

This is the content boundary, restated for scoring (and consistent with the Generator's content boundary, Candidate Generation Architecture §4.2):

> **Scoring operates on CandidateSet metadata. It never reads Question content (`content`, `choice_*`, `hint`, `explanations`, `reference`).**

The reasoning is twofold:
- **Architectural consistency.** The entire Assessment System is metadata-first (Engine Foundation §9; Candidate Generation §4). Scoring is no exception.
- **Scalability.** A CandidateSet of 750 Candidates, each scored on metadata, is a tractable computation. The same 750 Candidates scored on full content would balloon token and compute cost without commensurate evaluation gains — and would invite the Anti-Pattern of LLM-judging content (AP-8).

If future evaluation genuinely requires content (e.g. semantic similarity), it enters via a *signal* computed upstream and carried as metadata — never by Scoring reading content directly (§15).

### 12.3 Scoring Scales with CandidateSet, Not Bank

The Scoring lifecycle's cost is bounded by **CandidateSet size**, which (per Candidate Generation Architecture §12.3) is bounded by **Blueprint structure**, not Bank size. Concretely:

- A 100-Question Blueprint producing a CandidateSet of ~750 Candidates incurs the same scoring cost whether the Bank has 10,000 or 10,000,000 Questions.
- Scoring does not touch the Bank directly. It consumes the CandidateSet, which has already absorbed Bank-scale filtering.
- Score caching (for audit) is bounded by CandidateSet size; it does not grow with Bank size.

### 12.4 Transparency Is Not a Token Liability

Full transparency (§8) might appear to inflate token cost. The model mitigates this by distinguishing always-present vs. on-demand transparency (§8.4): the always-present layer is compact (value + confidence + top reasons + penalty summary); the on-demand layer (full signal trace) is expanded only when a Reviewer requests it. Audit trails are stored, not constantly transmitted.

### 12.5 The Scaling Posture

| Stage | Cost Driver | Bounded By |
|---|---|---|
| Raw Signal extraction | CandidateSet size × axes per Candidate | Blueprint structure |
| Score Components | Candidates × slots × components | Blueprint structure |
| Composite aggregation | Candidates × slots | Blueprint structure |
| Confidence propagation | Candidates × slots × components | Blueprint structure |
| Ranked output | Candidates × slots | Blueprint structure |

**Every stage is Blueprint-bounded, never Bank-bounded.** This is the Scoring Model's scaling promise, and it inherits directly from the Candidate Generation Architecture's CandidateSet-size bound.

---

## 13. Layer Boundaries

### 13.1 Candidate Ranking (the Scoring owner)

- **CAN:**
  - Consume the CandidateSet (read-only).
  - Extract Raw Signals from CandidateSet metadata.
  - Compute Score Components, Normalized Scores, Composite Scores, Confidence, Penalties.
  - Emit Ranked Candidates.
  - Cache Scores for audit/debugging (input-deterministic).
- **CANNOT:**
  - Read Question content.
  - Modify the CandidateSet or the AssemblyRequest.
  - Select Candidates (that's the Solver/Human).
  - Solve joint constraints.
  - Touch the Bank directly (only via the CandidateSet).
- **MUST NEVER:**
  - Invent Score Components outside the v1.0 vocabulary (§4) without a spec bump.
  - Emit an opaque Composite (no Breakdown — non-conformant).
  - Invent values for missing evidence (§11.2).
  - Treat missing data as a wildcard match.
  - Invoke an LLM for scoring (AP-8).
  - Couple Score computation to SQL (AP-6) or to UI rendering (AP-7).
  - Allow Score to mean "selection" or "best Question" (§5.3).
- **MUST ALWAYS:**
  - Be deterministic given CandidateSet state.
  - Produce fully transparent Scores (Breakdown + Confidence + Penalties + reasons).
  - Propagate Confidence honestly.
  - Preserve Maximum Recall (penalize, don't silently drop).
  - Fail loud on computation failures and version mismatches.

### 13.2 Constraint Solver (consumer + narrow augmenter)

- **CAN:** Consume Ranked Candidates; augment Hard penalties for joint-constraint risk.
- **CANNOT:** Re-score; invent components; alter Confidence; alter the Composite value.
- **MUST NEVER:** Silently demote a Candidate without recording the penalty + constraint.
- **MUST ALWAYS:** Record every augmented penalty with its trigger.

### 13.3 Review Workbench (consumer)

- **CAN:** Render Scores; capture Human overrides (re-rank, force-include, force-exclude, remove penalty).
- **CANNOT:** Compute Scores; alter Score values silently.
- **MUST NEVER:** Hide the Breakdown from the Reviewer.
- **MUST ALWAYS:** Surface Confidence and Penalties alongside the Score value.

### 13.4 Draft Builder (non-consumer)

- **CAN:** Materialize an approved selection into a Draft.
- **CANNOT:** Touch Scores.
- **MUST NEVER:** Reorder the approved selection by Score.
- **MUST ALWAYS:** Honor the Human's approved selection as-is.

### 13.5 Human Reviewer (final authority)

- **CAN:** Override any Score-derived ordering; force any decision; remove any penalty.
- **CANNOT:** Compute Scores (they consume and decide).
- **MUST NEVER:** Be silently overridden by the Engine.
- **MUST ALWAYS:** Remain the final authority.

---

## 14. Anti-Patterns

Explicitly prohibited. Any future change must be evaluated against this list.

| # | Anti-Pattern | Why Prohibited |
|---|---|---|
| AP-1 | **Scoring inside the Generator** | Violates single-responsibility (Generator discovers; Ranking scores). Candidate Generation Architecture §13 AP-3. |
| AP-2 | **Ranking inventing new Score types** | Fractures the language. New components require a spec version bump (§4.4, §15). |
| AP-3 | **Hidden scoring** | Violates Transparency (§8). Every Score must be explainable. |
| AP-4 | **Magic weights** | Weight values are an implementation concern; hidden or unexplained weights destroy auditability. |
| AP-5 | **Unexplained Scores** | A Score without a Breakdown is non-conformant (§5.4, §8). |
| AP-6 | **Score coupled to SQL** | Scoring is architecture; SQL is implementation. Coupling reduces portability and auditability. |
| AP-7 | **Score coupled to UI** | Scores exist independent of any rendering. The Review Workbench renders them; it does not define them. |
| AP-8 | **Score coupled to LLM** | Scoring is deterministic. LLMs are not. (Future *signal sources* may use LLMs upstream, but Scoring itself does not — §15.) |
| AP-9 | **Composite Score replacing Human judgment** | The Composite informs; it never decides (§2.1, §5.3). |
| AP-10 | **Inventing values for missing evidence** | Violates Honesty Over Fluency (§2.4) and the Never-Invent rule (§11.2). |
| AP-11 | **Treating missing data as a wildcard** | Silently inflates Scores; masks IG-2 instead of surfacing it as reduced Confidence. |
| AP-12 | **Confidence collapse** | Silently flattening low Confidence into high Confidence to produce a clean Composite. |
| AP-13 | **Penalty as a re-score** | Penalties modify effect; they do not re-evaluate fit (§7.6, §10.6). |
| AP-14 | **Cross-module Score computation** | Only Ranking computes Scores (§9). The Solver's narrow penalty augmentation is the sole exception. |
| AP-15 | **Persistent Scores as run input** | Each run computes Scores fresh (§9.3). Cached Scores are for audit only. |
| AP-16 | **Scoring on Question content** | Violates the content boundary (§12.2); destroys scalability. |

---

## 15. Future Extensibility

The Scoring Model is designed to grow without rupture. New evaluation needs enter through defined seams, never by fracturing the language.

### 15.1 New Score Components

A future need ("we must evaluate cognitive load") is handled by:

1. Identifying the new Component's purpose, input, output, and evidence (per §4.2).
2. Bumping the Scoring Model version (v1.0 → v2.0).
3. Adding the Component to the vocabulary.
4. Updating Ranking implementations to compute it.

The Composite, Confidence, Penalty, and Transparency contracts absorb the new Component without structural change. Downstream consumers (Solver, Review) see a richer Breakdown; nothing else moves.

### 15.2 Future AI Scoring

If AI-derived evaluation becomes desirable (e.g. an LLM judges a Candidate's likely quality from its metadata), it enters the model as a **Signal Source**, not as Scoring itself:

- The AI runs **upstream** of Scoring, producing a signal (e.g. `ai_quality_indicator`) carried as CandidateSet metadata.
- Scoring consumes that signal like any other — through a Component, with Confidence reflecting the signal's reliability.
- Scoring itself remains deterministic and LLM-free (AP-8).

This keeps the AI's nondeterminism outside the Scoring lifecycle, where it can be flagged, versioned, and overridden.

### 15.3 Future Semantic Scoring

Semantic similarity (e.g. for Duplicate Prevention L1–L5, which Blueprint v3.0 specifies via a Jaccard metric over keywords) is, in this model, a **Signal**, not a Score Component. It is computed upstream (Candidate Generation or a dedicated Similarity stage), carried as metadata, and consumed by the Diversity Component. The Scoring Model does not compute similarity; it consumes it.

### 15.4 Future Adaptive Scoring

If future Profiles (Diagnostic, Weekly Challenge, AI Adaptive — per Engine Foundation §8.1) require scoring to adapt to a learner's history, the adaptation enters as **additional signals** (e.g. `learner_history_vector`), and the Component vocabulary extends to consume them. The model's contracts (Composite, Confidence, Transparency) are unchanged.

### 15.5 Future Psychometric Scoring

Psychometric evaluation (e.g. IRT-based difficulty/discrimination) would enter as one or more new Components (e.g. a Psychometric Fit component), computed from Bank signals that the Bank must persist (analogous to how IG-2 today gates Pattern/LO components). The Component vocabulary extends; the model's structure does not.

### 15.6 Versioning the Scoring Model

The Scoring Model is versioned (currently v1.0). A version bump is required when:
- The Component vocabulary changes (additions, removals, semantic shifts).
- The Confidence semantics change.
- The Penalty model changes structurally.
- The Transparency contract changes.

A version bump does **not** affect:
- The `AssemblyRequest` (different contract, different owner).
- The CandidateSet (different contract, different owner).
- The Engine Foundation (immutable).

Consumers detect the Scoring Model version and adapt their rendering/logic. The model is forward-compatible where possible (a v1.0 consumer ignores v2.0 Components it doesn't understand) and fail-loud where not (a v2.0-required Component absent in a v1.0 CandidateSet is surfaced as missing).

### 15.7 What Does NOT Change

- **Scoring ≠ Selection** (§2.1) — the architectural invariant.
- **Only Ranking computes Scores** (§9) — the ownership invariant.
- **The content boundary** (§12.2) — the scalability invariant.
- **Transparency is non-negotiable** (§8) — the auditability invariant.
- **Never invent values** (§11.2) — the honesty invariant.

---

## Appendix A — Glossary

| Term | Definition |
|---|---|
| **Score** | A structured, explainable evaluation of a Candidate for a slot. |
| **Raw Signal** | A factual observation about a Candidate, extracted from CandidateSet metadata. |
| **Score Component** | A per-axis evaluation (e.g. Difficulty Fit, Usage, Diversity). |
| **Normalized Score** | A Component value placed on a common scale for comparability. |
| **Composite Score** | The structured aggregate evaluation per (Candidate × slot). Never opaque. |
| **Score Breakdown** | The decomposition of a Composite into its Components and signals. |
| **Confidence** | The trust level of a Score, propagated from evidence quality. Not a probability. |
| **Penalty** | A structured demerit: Soft, Hard, or Disqualification. |
| **Slot** | A Blueprint distribution cell (e.g. `{set: 1, difficulty: Easy, pattern: Memory}`). |
| **Evidence** | The signals and metadata underlying a Score. |
| **Known / Unknown / Missing / Conflicting** | Signal quality states that drive Confidence. |
| **Ranked Candidates** | Ranking's output: Candidates ordered by Score, consumed by the Solver. |

---

## Appendix B — Boundary Assertions

The non-negotiable contracts of this specification.

1. **Scoring ≠ Selection.** A Score evaluates; it never decides.
2. **Only Candidate Ranking computes Scores.** No other module scores; the Solver's narrow penalty augmentation is the sole exception.
3. **The Component vocabulary is fixed at v1.0.** New components require a spec version bump.
4. **Every Composite carries a Breakdown.** Opaque Composites are non-conformant.
5. **Confidence propagates honestly.** Missing evidence reduces Confidence; it is never smoothed away.
6. **Never invent values.** Missing evidence is surfaced, not fabricated.
7. **Penalties modify effect; they do not re-score.**
8. **Scoring never reads Question content.** Metadata only.
9. **Scoring scales with CandidateSet size, never Bank size.**
10. **The Human is the final authority.** Every Score is overridable; every evaluation is advisory.
11. **Scoring is deterministic, transparent, auditable, and LLM-free.**
12. **The Composite is not "the best Question" and never replaces Human judgment.**

---

## Appendix C — Provenance & Cross-References

- **Engine alignment:** Scoring is the evaluation layer the Engine Foundation anticipated (Engine Foundation §3.2, Module 3 "Candidate Ranking"). The Foundation deferred the scoring language; this spec closes that deferral.
- **Integration Spec alignment:** Scoring consumes the `AssemblyRequest`'s intent (Coverage, Difficulty, Pattern, LO, etc.) via the CandidateSet's per-axis metadata. Integration Gaps IG-1 (Tier derivation) and IG-2 (missing Bank columns) propagate into Scoring as reduced Confidence (§6, §11) — never as silent distortion.
- **Reader alignment:** No direct interaction. The Reader's output is the `AssemblyRequest`; Scoring is three modules downstream.
- **Candidate Generation alignment:** Scoring consumes the CandidateSet and the Generator's per-Candidate Confidence (§6.5). The Generator does not score (Candidate Generation Architecture §13 AP-3); this spec honors that boundary by centralizing all scoring in Ranking.
- **Solver alignment (forward):** The Constraint Solver consumes Ranked Candidates and may augment Hard penalties for joint-constraint risk (§9.2). This is the architectural resolution of Integration Gap IG-5: per-axis scoring in Ranking; joint-constraint handling via Solver penalty augmentation.
- **Blueprint fidelity:** Blueprint v3.0's axes (Coverage, Difficulty, Pattern, LO, Duplicate Prevention, Distribution) are each represented in the Component vocabulary (§4.1). Blueprint rules are honored through evaluation, not reinterpreted.

---

*End of Sobdai Scoring Model Specification — v1.0.*

**Upstream sources (immutable):**
- Assessment Assembly Engine Foundation v1.0
- Blueprint Integration Specification v1.0
- Blueprint Reader Pipeline Architecture v1.0
- Candidate Generation Architecture v1.0

**Next modules to specify (later sessions):**
- Candidate Ranking Architecture (implements this Scoring Model)
- Constraint Solver Architecture (consumes Ranked Candidates; closes IG-5)
- Review Workbench Architecture
- Draft Builder Architecture
