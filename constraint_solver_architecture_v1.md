# Sobdai Constraint Solver Architecture — v1.0

**Status:** Official Architecture Specification (Architecture only — no implementation, no algorithm, no search strategy, no heuristics, no optimization formulas, no pseudocode, no SQL, no code, no UI)
**Sources of truth (exhaustive, immutable):**
1. `assessment_assembly_engine_foundation_v1.md` — Assessment Assembly Engine Foundation v1.0
2. `blueprint_integration_specification_v1.md` — Blueprint Integration Specification v1.0
3. `blueprint_reader_pipeline_architecture_v1.md` — Blueprint Reader Pipeline Architecture v1.0
4. `candidate_generation_architecture_v1.md` — Candidate Generation Architecture v1.0
5. `scoring_model_specification_v1.md` — Scoring Model Specification v1.0
6. `candidate_ranking_architecture_v1.md` — Candidate Ranking Architecture v1.0
7. `allocation_model_specification_v1.md` — Allocation Model Specification v1.0
**Version:** 1.0
**Owner:** Chief Assessment Architect, Sobdai

> **What this document is.** This is the architecture of the Constraint Solver — the runtime that transforms a `RankedCandidateSet` into an `AllocatedCandidateSet` by satisfying all Blueprint constraints. The Solver is the **behavior** layer of allocation; the Allocation Model is the **language** layer. Together they close Integration Gap IG-5: the Allocation Model closed it at the *vocabulary* level (what placement *means*); this spec closes it at the *runtime* level (what the Solver *does* to produce a feasible placement).
>
> **Role inversion from the prior spec.** The Allocation Model v1.0 said: *"This is not the Solver — it is the language the Solver speaks."* This spec says the inverse: *"This is the Solver — not the language."* The Solver consumes the Allocation Model's vocabulary exactly; it does not redefine Slot, Assignment, Reservation, Conflict, Lock, or Replacement. The Solver owns **behavior** (search, placement, conflict resolution, feasibility); the Allocation Model owns **semantics** (what those terms mean). Confusing the two would fracture the language across Solver implementations.
>
> **What this document is not.** Not an algorithm. Not a search strategy. Not a heuristic. Not an optimization formula. Not pseudocode. Not code. Not the Allocation Model (immutable). Not the Scoring Model (immutable). Not the Candidate Ranking (immutable). The Solver consumes those upstream contracts read-only and produces one output: the `AllocatedCandidateSet`.

---

## 0. Executive Summary

The Constraint Solver is the **brain** of the Assessment Engine. Every prior module either transformed representation (Reader), discovered legality (Generator), evaluated fit (Scoring), produced ordering (Ranking), or defined the language of placement (Allocation Model). The Solver is the first module that **acts structurally on the whole** — it takes the per-slot orderings and produces a joint mapping that satisfies every Blueprint constraint simultaneously, across all slots and all sets.

The Solver answers one question, repeatedly and at scale: **"Can this Candidate be placed here, *given the entire Blueprint and everything already placed*, without violating any constraint?"** The phrase "*given everything already placed*" is what makes the question non-trivial — it is the source of joint constraints, conflicts, and the need for search.

The defining architectural separation: **the Solver owns behavior; language is owned upstream**. Concretely:

| Concern | Owner | Solver's Relationship |
|---|---|---|
| Placement vocabulary (Slot, Assignment, Reservation, Conflict, Lock, Replacement) | Allocation Model v1.0 | Consumed exactly. Solver may not extend. |
| Evaluation vocabulary (Components, Composite, Confidence, Penalty) | Scoring Model v1.0 | Consumed read-only. Solver may augment Hard Penalties per §9.2 of that spec. |
| Per-slot ordering | Candidate Ranking v1.0 | Consumed read-only. Solver inherits priority from Rankings. |
| Blueprint constraints (distribution, coverage, duplicate prevention) | AssemblyRequest (Integration Spec) | Honored verbatim. Never silently weakened. |
| Question legality | Candidate Generator | Consumed read-only via CandidateSet. |
| Final selection authority | Human Reviewer | Solver's output is advisory; Reviewer may override. |
| **Search, placement, conflict resolution, feasibility** | **Constraint Solver (this spec)** | **Sole owner.** |

The Solver's output — the `AllocatedCandidateSet` — is a feasible (or honestly partial) joint mapping of Candidates to Slots, with full audit trail. It is **not** a final selection (the Reviewer decides), **not** a Draft (the Draft Builder builds), and **not** a publication (the existing Exam Set publish lifecycle publishes).

Three operating principles govern the Solver's design:

1. **Blueprint Fidelity.** The Solver satisfies all Hard Constraints or fails honestly trying. It never silently weakens a rule to produce a fake-feasible allocation.
2. **Determinism.** Same RankedCandidateSet → same AllocatedCandidateSet, always, given Solver version. Internal search state is fully determined by inputs.
3. **Explainability.** Every placement, every rejection, every conflict, every replacement is auditable. The Solver is the most consequential module in the Engine; it must also be the most transparent.

The Solver is **deterministic, stateful within a run, read-only on all upstream contracts, content-free, and LLM-free**. It scales with Blueprint structure (Slots × Constraints), never with Bank size — it never touches the Bank.

---

## 1. Module Overview

### 1.1 Purpose

To transform a `RankedCandidateSet` into an `AllocatedCandidateSet` — a joint mapping of Candidates to Blueprint Slots that satisfies all Blueprint constraints, or an honest partial allocation when full satisfaction is impossible.

### 1.2 Responsibilities

| The Solver IS responsible for | The Solver is NOT responsible for |
|---|---|
| Producing a feasible joint allocation | Authoring or modifying the Blueprint |
| Detecting and resolving Conflicts during search | Re-evaluating Candidate fit (Scoring's job) |
| Applying Hard Penalty augmentation for joint-constraint risk (per Scoring Model §9.2) | Re-ranking Candidates (Ranking's job) |
| Producing partial allocations with explicit shortfalls | Re-defining Allocation vocabulary (Allocation Model's job) |
| Recording full audit trail of every placement decision | Reading Question content |
| Honoring Reviewer overrides as inputs to re-solving | Publishing or producing Drafts |
| Detecting infeasibility and surfacing it loudly | Final selection (Reviewer's authority) |

### 1.3 Ownership

The Solver owns **one transformation**: `RankedCandidateSet → AllocatedCandidateSet`. Within it, the Solver owns:
- Runtime state initialization.
- Constraint discovery and evaluation.
- Placement search (the behavior, not the algorithm — algorithm is implementation).
- Conflict detection, classification, and resolution.
- Feasibility determination.
- The AllocatedCandidateSet output contract.

The Solver does **not** own: the Allocation vocabulary (Allocation Model), the Scoring vocabulary (Scoring Model), per-slot ordering (Candidate Ranking), the Blueprint (AssemblyRequest), Question legality (Candidate Generator), or final selection (Reviewer).

### 1.4 Lifecycle

The Solver is **stateful within a run, stateless across runs**:
- **Invocation:** one RankedCandidateSet in.
- **Processing:** the §3 pipeline. Internal state accumulates and is mutated during search.
- **Termination:** either an AllocatedCandidateSet out, or a structured failure (§11). **All internal state is released at termination.**
- **Re-runs:** identical RankedCandidateSet → identical AllocatedCandidateSet, given Solver version. Internal state is fully reconstructed on each run.

The statefulness boundary (reconciliation with Candidate Ranking's statelessness) is recorded explicitly in §13 and in the Cross-Spec Reconciliation (§18).

### 1.5 Boundaries (summary — full matrix in §15)

- **CAN:** consume RankedCandidateSet (read-only); instantiate Runtime Slots; allocate Candidates; detect/resolve Conflicts; augment Hard Penalties (per Scoring §9.2); emit AllocatedCandidateSet.
- **CANNOT:** read content; query the Bank; re-rank; re-score; modify upstream contracts; publish; produce a Draft.
- **MUST NEVER:** silently weaken constraints; fabricate placements; hide conflicts; use an LLM; modify Scores/Confidences/orderings; allow an invalid state transition.
- **MUST ALWAYS:** be deterministic given inputs; honor Blueprint Fidelity; produce transparent output; surface shortfalls; fail fast/loud.

---

## 2. Solver Philosophy

### 2.1 Why the Solver Exists

The `RankedCandidateSet` answers, per slot, *"in what order should Candidates be considered?"* It does **not** answer *"which joint selection satisfies every constraint?"* — because slot-level ordering cannot reason across slots. The Solver exists to make the joint decision.

Concretely: the top-ranked Candidate for Slot A may be jointly infeasible with the top-ranked Candidate for Slot B (mutual exclusion under L1), or placing it may consume headroom a later Slot needs (tier-4 ceiling), or it may close out a Topic that another Slot requires (coverage dependency). The Solver navigates these joint constraints to find a feasible mapping — or determines honestly that none exists.

### 2.2 Why Ranking Is Insufficient

Candidate Ranking produces per-slot orderings that respect evaluation. But evaluation is local: a Candidate's Score is computed against a single slot, not against the joint state of all slots. The Solver is the first module that reasons about the **joint state**.

The asymmetry:
- Ranking's output is **locally optimal per slot** (the best Candidates first).
- The Solver's output is **jointly feasible across slots** (a mapping that satisfies all constraints, even if some slots get sub-optimal Candidates).

Joint feasibility is a strictly harder problem than per-slot optimization. The Solver exists to solve it.

### 2.3 Why the Allocation Language Exists

The Solver could, in principle, operate on raw data structures with ad-hoc placement logic. The Allocation Model exists to prevent that. By fixing the vocabulary — Slot, Assignment, Reservation, Conflict, Lock, Replacement — the Allocation Model ensures:

- Every Solver implementation speaks the same language (cross-implementation consistency).
- Every placement decision is expressible in auditable terms (transparency).
- Future Solver versions can ship without redefining what allocation means (version independence).

The Solver consumes the Allocation Model's vocabulary exactly. It does not extend it.

### 2.4 The Solver's Single Question

The Solver's work reduces to one question, applied at scale:

> *"Can this Candidate be placed here, given the entire Blueprint and everything already placed, without violating any constraint?"*

The phrase "*given everything already placed*" is the load-bearing qualifier. It is why the Solver is stateful (it tracks what's placed), why it must search (the answer depends on order), and why conflicts arise (placing one thing constrains what else can be placed).

### 2.5 Relationships

| Boundary | Solver's Relationship |
|---|---|
| **Solver ↔ Ranking** | Consumes RankedCandidateSet read-only. Inherits priority for Reservations. Never re-ranks. |
| **Solver ↔ Allocation Model** | Speaks the Allocation vocabulary exactly. Behavior is Solver's; semantics are Allocation Model's. |
| **Solver ↔ Review** | Produces AllocatedCandidateSet for Reviewer. Reviewer overrides are inputs to re-solving. |
| **Solver ↔ Draft Builder** | No direct relationship. Draft Builder consumes the Reviewer's *approved* allocation, not the Solver's output directly. |
| **Solver ↔ Blueprint** | Consumes constraints via AssemblyRequest (carried in RankedCandidateSet). Never modifies. |
| **Solver ↔ Question Bank** | No relationship. Solver never touches the Bank. |

---

## 3. Solver Runtime Pipeline

Ten runtime stages, each with one responsibility. Every stage consumes upstream contracts read-only; internal state accumulates across stages but is released at termination.

### 3.1 Stage Map

| # | Stage | Responsibility |
|---|---|---|
| 1 | **Receive RankedCandidateSet** | Accept and version-check the input |
| 2 | **Initialize Runtime State** | Build empty Runtime Slots; initialize Allocation State |
| 3 | **Validate Blueprint Constraints** | Static feasibility check (constraints self-consistent on paper) |
| 4 | **Candidate Placement** | Attempt placements, speaking the Allocation vocabulary |
| 5 | **Conflict Detection** | Detect Conflicts per Allocation Model §7 |
| 6 | **Conflict Resolution** | Resolve via Replacement/Swap/Rollback per Allocation Model §9 |
| 7 | **Allocation Validation** | Verify the allocation satisfies all Hard Constraints |
| 8 | **Finalize Allocation** | Lock the allocation; mark Rejected Slots |
| 9 | **Audit Finalization** | Assemble the audit trail |
| 10 | *(AllocatedCandidateSet)* | Final output contract |

### 3.2 Stage Contracts

| Stage | Input | Output | Responsibility | Failure Mode |
|---|---|---|---|---|
| Receive | RankedCandidateSet | Validated RankedCandidateSet | Version check | Fatal on version mismatch |
| Initialize | RankedCandidateSet | Runtime State | Instantiate Runtime Slots; empty Allocation State | Fatal on malformed input |
| Validate Blueprint Constraints | Runtime State + AssemblyRequest constraints | Static feasibility verdict | Check constraints are self-consistent (e.g. tier floors don't sum > 100) | Fatal on impossible-on-paper Blueprint |
| Candidate Placement | Runtime State | Tentative placements | Place Candidates per Allocation Model | Continues through conflicts (non-fatal) |
| Conflict Detection | Tentative placements | Detected Conflicts | Per Allocation Model §7 | Non-fatal (conflicts are normal) |
| Conflict Resolution | Conflicts + placements | Updated placements | Per Allocation Model §9 | Non-fatal (resolution is the work) |
| Allocation Validation | Updated placements | Feasibility verdict | Verify Hard Constraints satisfied | Records shortfalls if not |
| Finalize Allocation | Feasibility verdict | Locked Allocation + Rejected Slots | Commit; mark unfilled slots | Non-fatal (partial is valid output) |
| Audit Finalization | Locked Allocation + history | Audit trail | Assemble full transparency record | Fatal if audit incomplete |
| AllocatedCandidateSet Emission | All above | AllocatedCandidateSet | Final contract | n/a |

### 3.3 Two Pipeline Invariants

1. **Upstream-immutability.** No stage modifies the RankedCandidateSet, AssemblyRequest, Scoring Model outputs, or Allocation Model vocabulary. The Solver's relationship to upstream is **read-only consume**.
2. **Monotone finalization.** Stages 1–7 may iterate (placement, conflict, resolution form a loop); stage 8 (Finalize) is terminal. Once the allocation is Locked, no further placement changes are permitted within the run.

### 3.4 The Placement–Conflict–Resolution Loop

Stages 4–6 are not linear; they form a loop. The Solver places a Candidate, detects any conflicts the placement creates, resolves them (possibly via Replacement of an earlier placement), and continues. This loop is the heart of the Solver's behavior. **Its termination criteria, iteration order, and resolution strategy are implementation concerns** — out of scope for this spec, which fixes only the *stages* and their *contracts*.

---

## 4. Constraint Categories

The Solver reasons over multiple constraint categories. The categories are conceptual — they classify constraints by *kind*, not by enforcement mechanism.

### 4.1 The Constraint Category Vocabulary

| Category | What It Constrains | Source | Enforcement |
|---|---|---|---|
| **Hard Constraints** | Inviolable rules. Violation produces a Hard Conflict (Allocation Model §7.2). | Blueprint (e.g. L1 within-set uniqueness) | Block placement. |
| **Soft Constraints** | Advisory rules. Violation produces a Soft Conflict. | Blueprint (e.g. CR-3 cross-set rotation, where permitted) | Warn; record; do not block. |
| **Coverage Constraints** | Mandatory-topic presence (CR-1); section sweep (CR-5). | Blueprint Coverage Rules | Hard for mandatory topics; Soft for section sweep. |
| **Distribution Constraints** | Per-Set sums, Tier floors/ceilings, anchor rule. | Blueprint Distribution Constraints | Hard for sums and tier limits. |
| **Cross-Set Constraints** | CR-3, L3 (same Topic+Difficulty+Type across >5 sets). | Blueprint Cross-Set rules | Mostly Soft (Blueprint v3.0 has 5 sets, so CR-3 is auto-satisfied). |
| **Dependency Constraints** | A placement depends on another (e.g. coverage dependency). | Derived from Coverage | Tracked; unresolved dependencies fail placement. |
| **Reviewer Constraints** | Constraints imposed by Reviewer overrides (force-include/exclude). | Reviewer | Hard (the Reviewer's authority is final). |
| **Future Constraints** | Categories added by future Blueprint versions or Plug-ins (§17.7). | Future | Per their own definitions. |

### 4.2 Ownership

| Aspect | Owner |
|---|---|
| Constraint *content* (what the rules say) | Blueprint (via AssemblyRequest) |
| Constraint *categories* (this taxonomy) | Constraint Solver v1.0 |
| Constraint *enforcement levels* (Hard/Soft) | Blueprint (via AssemblyRequest) |
| Constraint *evaluation* | Constraint Solver |

### 4.3 Priority and Interaction

When constraints interact (e.g. a Distribution Constraint and a Coverage Constraint pull in opposite directions), the Solver applies a fixed priority:

1. **Reviewer Constraints** — highest. The Reviewer's authority is final (Human Authority).
2. **Hard Constraints** — inviolable. Cannot be sacrificed for any other category.
3. **Soft Constraints** — advisory. May yield to Hard Constraints.
4. **Future Constraints** — per their declared priority (must be specified when introduced; v1.0 has none).

**No constraint is silently sacrificed.** When two Hard Constraints conflict (a genuine Blueprint contradiction), the Solver fails loud (§11), it does not pick a winner.

### 4.4 What This Section Does NOT Specify

- ❌ The **algorithm** for checking constraints (implementation).
- ❌ The **order** of constraint evaluation (implementation).
- ❌ The **data structures** for tracking constraint state (implementation).
- ❌ **New categories** beyond v1.0 (requires a Solver version bump per §17.7).

---

## 5. Constraint Evaluation Lifecycle

How a single constraint moves from discovery to final decision.

### 5.1 Lifecycle Stages

```
Constraint Discovery     ── identify which constraints apply to a placement
        │
        ▼
Constraint Evaluation    ── check the constraint against current placement
        │
        ▼
Constraint Satisfaction  ── determine if the constraint is satisfied
        │
        ▼
Conflict Detection       ── if not satisfied, detect the Conflict (Allocation Model §7)
        │
        ▼
Resolution Attempt       ── attempt to resolve via Replacement/Swap/Rollback
        │
        ▼
Validation               ── re-validate the constraint after resolution
        │
        ▼
Final Decision           ── satisfied / unresolved / abandoned
```

### 5.2 Stage Responsibilities

| Stage | Responsibility |
|---|---|
| **Discovery** | Identify which constraints apply to the Candidate-Slot pair being evaluated. (Not all constraints apply to all placements — e.g. cross-set constraints only apply across sets.) |
| **Evaluation** | Apply the constraint's check against the current Allocation State. |
| **Satisfaction** | Determine the outcome: satisfied / violated (Hard) / strained (Soft) / dependency-unmet. |
| **Conflict Detection** | If violated/strained, materialize a Conflict per Allocation Model §7 with full evidence. |
| **Resolution Attempt** | Try to resolve (e.g. via Replacement of an earlier placement). Resolution strategy is implementation; the lifecycle fixes only that an *attempt* occurs. |
| **Validation** | Re-validate after resolution to ensure the resolution didn't create new conflicts. |
| **Final Decision** | The constraint's terminal state for this run: satisfied, unresolved (recorded as shortfall), or abandoned (the Slot is Rejected). |

### 5.3 What the Lifecycle Does NOT Specify

- ❌ The **strategy** for resolution (which Replacement to try first — implementation).
- ❌ The **order** of constraint evaluation (implementation).
- ❌ The **termination** criteria for resolution attempts (implementation, bounded by §11).

---

## 6. Placement Lifecycle

The journey of a single (Candidate, Slot) pair through the Solver.

### 6.1 Lifecycle Stages

```
Candidate Considered    ── the Solver is evaluating this Candidate for this Slot
        │
        ▼
Tentative Placement     ── a Reservation is made (Allocation Model §8)
        │
        ▼
Constraint Evaluation   ── constraints are checked against the tentative placement
        │
        ▼
Confirmed Placement     ── the Reservation is promoted to Assignment (Allocation Model §5.2)
        │
        ▼
Locked Placement        ── the Assignment is committed in the Finalize stage
        │
        ▼ (alternative)
Rejected Placement      ── the Candidate cannot be placed; the Slot may be Rejected
```

### 6.2 Ownership

| Stage | Owner |
|---|---|
| Candidate Considered | Constraint Solver |
| Tentative Placement (Reservation) | Constraint Solver, per Allocation Model §8 |
| Constraint Evaluation | Constraint Solver, per §5 |
| Confirmed Placement (Assignment) | Constraint Solver, per Allocation Model §5.2 |
| Locked Placement | Constraint Solver, at Finalize |
| Rejected Placement | Constraint Solver, with explicit reason |

### 6.3 What the Lifecycle Does NOT Specify

- ❌ The **order** in which Candidates are considered (implementation).
- ❌ The **criteria** for promoting Tentative to Confirmed beyond "constraints satisfied" (implementation has latitude in *which* satisfied placement to promote).
- ❌ The **strategy** for choosing among multiple placeable Candidates (implementation).

---

## 7. Conflict Resolution Model

How the Solver handles Conflicts detected during placement. **Strategy is implementation; the model fixes only the conceptual stages.**

### 7.1 Conflict Resolution Stages

| Stage | Responsibility |
|---|---|
| **Conflict Detection** | Per Allocation Model §7: identify the Conflict, its type (Hard/Soft/Dependency/Mutual Exclusion), scope, participants, and evidence. |
| **Conflict Classification** | Per Allocation Model §7.2: Hard Conflicts block; Soft Conflicts warn; Dependencies track; Mutual Exclusions force choice. |
| **Conflict Prioritization** | When multiple Conflicts compete for resolution attention, prioritize by category (§4.3) and severity. (Strategy is implementation.) |
| **Conflict Recovery** | The resolution attempt: Replacement, Swap, Candidate Exchange, Rollback, or Release — per Allocation Model §9. (Strategy is implementation.) |
| **Conflict Persistence** | Record the Conflict in the audit trail whether resolved or not. |
| **Conflict Transparency** | The Conflict's full evidence, participants, and resolution (or non-resolution) appears in the AllocatedCandidateSet. |
| **Conflict Escalation** | If resolution fails, escalate: mark the Slot at risk, attempt alternative placements, or ultimately Reject the Slot. |

### 7.2 What Conflict Resolution Does NOT Specify

- ❌ The **algorithm** for resolution (implementation).
- ❌ The **heuristic** for choosing which Replacement to try (implementation).
- ❌ The **backtracking strategy** (chronological, conflict-directed, etc. — implementation).
- ❌ The **limits** on resolution attempts (implementation, bounded by §11 and performance budgets).

### 7.3 The Transparency Guarantee

Every Conflict — resolved or unresolved — is recorded. A Reviewer asking "why wasn't Q-000123 placed?" can trace the answer to a specific Conflict, its participants, its evidence, and the Solver's resolution attempt. Opaque conflict resolution is an explicit Anti-Pattern (AP-8).

---

## 8. Feasibility Model

What it means for an allocation to be feasible.

### 8.1 The Feasibility Spectrum

| State | Meaning |
|---|---|
| **Feasible** | Every Slot is Allocated with a Candidate; every Hard Constraint is satisfied; no unresolved Hard Conflicts. |
| **Partially Feasible** | Some Slots are Rejected (cannot be filled); some Hard Conflicts unresolved. The allocation is the Solver's honest best effort. |
| **Infeasible** | The Blueprint cannot be satisfied even in principle given the CandidateSet. The Solver determines this during search and produces a Rejection Report. |
| **Impossible** | The Blueprint is self-contradictory on paper (e.g. tier floors exceed 100). Detected at §3 stage 3 (Validate Blueprint Constraints). Never reaches search. |

### 8.2 Shortfalls

A **shortfall** is an explicit unmet Blueprint requirement. Shortfalls are the Solver's honest reporting mechanism when full satisfaction is impossible:

- A **Rejected Slot** is a shortfall: "this Slot could not be filled without violating a Hard Constraint."
- An **unresolved Conflict** is a shortfall: "this Candidate could not be placed because of this Conflict."
- A **violated Soft Constraint** is a shortfall (warning, not blocking): "this Soft Constraint is strained but the allocation is still feasible."

### 8.3 Partial Allocations Are Valid Outputs

A partial allocation is **not a failure**. It is the Solver's honest best effort, and it carries:

- The placed Assignments (which Slots were successfully filled).
- The Rejected Slots (which could not be filled, with reasons).
- The unresolved Conflicts (which placements were blocked, with reasons).
- A shortfall summary (the gap between the Blueprint's targets and what was achieved).

The Reviewer decides what to do with a partial allocation: accept it, edit it, request re-solving with adjusted inputs, or send it back to Blueprint authoring.

### 8.4 Rejected Slots

A Slot is Rejected when no feasible Candidate exists for it — every eligible Candidate either doesn't fit or creates an unresolvable Hard Conflict. Rejected Slots are recorded with:

- The Slot's target profile.
- The Candidates considered (and why each was blocked).
- The specific Hard Constraints that could not be satisfied.

The Reviewer may force a Candidate into a Rejected Slot (Allocation Model §5.4 — Reviewer overrides), but the Solver never does so silently.

### 8.5 The "Never Fake Feasibility" Rule

Inherited from Allocation Model §12.2: when full satisfaction is impossible, the Solver produces a partial allocation with explicit shortfalls. It **never**:

- Silently drops a Hard Constraint.
- Treats a Soft Conflict as resolved.
- Over-fills a Slot.
- Places a Candidate that violates a Hard Constraint without explicit acknowledgement.

---

## 9. Determinism Model

### 9.1 Why Determinism Matters

The Solver is the most consequential module in the Engine. If the same Blueprint produced different Drafts on different runs, the system would be unreviewable, un-auditable, and un-trustable. Determinism is therefore non-negotiable.

### 9.2 The Determinism Contract

> **Same RankedCandidateSet + same Solver version → same AllocatedCandidateSet. Always.**

This holds regardless of:
- When the Solver runs.
- What else the system is doing.
- How many times the Solver has run before.
- The internal search path (which is fully determined by inputs).

### 9.3 Determinism Pillars

| Pillar | How It's Maintained |
|---|---|
| **Ordering** | All iteration over Candidates, Slots, and Constraints uses fixed, inspectable orderings (e.g. by Question Code, by Slot id). No hash-map iteration, no set membership as ordering. |
| **Versioning** | Every output carries the Solver version, Scoring Model version, and Allocation Model version. A version change is a deliberate spec bump. |
| **State** | Internal state is fully reconstructed on each run from the RankedCandidateSet. No persistent state influences the output. |
| **Replay** | Given the same inputs and versions, the Solver can be re-run to produce byte-identical output. |
| **Audit** | The audit trail is reproducible: given inputs + versions, the trail can be re-derived exactly. |
| **Reproducibility** | Reproducibility is the operational form of determinism: any stakeholder can re-run and verify. |

### 9.4 What Determinism Does NOT Forbid

- ❌ Does not forbid **different Solver implementations** from producing *different* AllocatedCandidateSets for the same input — only *the same implementation+version* must be deterministic. (Two implementations may make different search choices within the Allocation Model's latitude.)
- ❌ Does not forbid **performance variation** (faster/slower runs) — only the output is deterministic.
- ❌ Does not forbid **caching** — caching is input-deterministic.

---

## 10. Transparency

### 10.1 The Transparency Contract

Every Solver decision must explain itself. The Solver is the Engine's most structural module; opacity here is unacceptable.

### 10.2 What Every Decision Explains

| Decision Type | Explanation Required |
|---|---|
| **Why Candidate was placed** | The placement reasoning: inherited Score, ordering position, constraint satisfaction, priority that led to placement. |
| **Why Candidate was rejected** | The specific Conflict(s) or Constraint(s) that blocked placement, with evidence. |
| **Why Conflict occurred** | The participants, the Constraint at issue, the type and scope, the resolution attempt (or non-resolution). |
| **Why Replacement happened** | The previous Candidate, the new Candidate, the reason (Conflict forced backtrack, Reviewer preference, etc.). |
| **Why Slot remained empty** | The shortfall: which Constraints could not be satisfied with which Candidates. |

### 10.3 Audit Trail Components

| Component | Content |
|---|---|
| **Evidence** | The signals, Scores, and Slot state that produced each decision. |
| **Reasoning** | Plain-language explanation of why the decision was made. |
| **Ownership** | Which actor made the decision (Solver, Reviewer-with-override). |
| **Ordering** | The sequence of decisions, for reconstruction. |
| **Version stamps** | Solver version, Scoring Model version, Allocation Model version. |

### 10.4 Layered Transparency

Inheriting Scoring Model §8.4, Candidate Ranking §9.4, Allocation Model §10.4: transparency is **layered**.

- **Always-present:** final placements, placement reasoning, Rejected Slots, unresolved Conflicts, Reviewer overrides.
- **On-demand:** full Reservation History, full Conflict resolution trace, Replacement History, Solver backtracking details.

This keeps the Review Workbench tractable while preserving full auditability.

### 10.5 Audit Trail Integrity

The audit trail is **reproducible**: given the same RankedCandidateSet and the same version stack, the trail can be re-derived exactly. This is the operational form of "Auditability" (Architecture Principle).

---

## 11. Failure Handling

The Solver's failure posture inherits the Engine-wide discipline (Engine Foundation §7): Fail Fast, Fail Loud, Remain Deterministic.

### 11.1 Failure Modes

| Failure | What It Means | Solver Behavior |
|---|---|---|
| **Blueprint impossible** | The Blueprint is self-contradictory on paper (tier floors exceed 100, etc.). Detected at §3 stage 3. | Fatal. Halt with precise contradiction report. Never reach search. |
| **Constraint contradiction** | Two Hard Constraints conflict in a way that cannot be resolved (genuine Blueprint inconsistency). | Fatal. Halt; identify the conflicting constraints and the affected Slots. |
| **No feasible Candidate** | A Slot has no Candidate that can be placed without violating a Hard Constraint. | Non-fatal. Mark the Slot Rejected. Continue with other Slots. (Partial allocation is valid.) |
| **Runtime inconsistency** | The Solver's internal state contradicts itself (should not happen). | Fatal. Halt; treat as a bug. |
| **Version mismatch** | The RankedCandidateSet's expected Solver/Allocation/Scoring version is unsupported. | Fatal. Halt; identify the unsupported version. Never silently downgrade/upgrade. |
| **Corrupted Allocation** | An Allocation Unit is in an invalid state (e.g. Assigned to two Slots). | Fatal. Halt; identify the corruption. |
| **Invalid Runtime State** | A state transition was attempted that violates Allocation Model §5.2. | Fatal. Halt; identify the invalid transition. |
| **Duplicate Assignment** | A Candidate is Assigned to two Slots simultaneously. | Fatal. Internal invariant violation. |
| **Released Lock** | An attempt was made to modify a Locked Allocation within the run. | Fatal. Locks are terminal within the run. |

### 11.2 Fatal vs. Non-Fatal

The distinction:
- **Fatal failures** are structural corruption or input contradictions. They halt the Solver. No AllocatedCandidateSet is produced (or a structured failure replaces it).
- **Non-fatal failures** are infeasibilities — Slots that can't be filled, Conflicts that can't be resolved. The Solver continues; these become shortfalls in a partial AllocatedCandidateSet.

This split is principled: structural corruption must halt (the output would be untrustworthy), but infeasibility is honest information the Reviewer needs.

### 11.3 Every Failure Must

- **Fail Fast:** halt at the first structural corruption.
- **Fail Loud:** structured error with category, location (Slot, Candidate, transition), severity, explanation, recommendation.
- **Remain Deterministic:** same RankedCandidateSet → same failure.
- **Never fake feasibility:** partial allocations with shortfalls are preferred over silent constraint weakening.

---

## 12. AllocatedCandidateSet

### 12.1 Purpose

The AllocatedCandidateSet is the Solver's **output contract**: a feasible (or honestly partial) joint mapping of Candidates to Blueprint Slots, with full audit trail. It is the input to Review.

### 12.2 Why AllocatedCandidateSet Differs from RankedCandidateSet

| | RankedCandidateSet | AllocatedCandidateSet |
|---|---|---|
| **Producer** | Candidate Ranking | Constraint Solver |
| **What it carries** | Per-slot orderings + evaluations | Per-slot placements + audit trail |
| **Structural property** | Locally optimal per slot | Jointly feasible across slots |
| **Multiplicity** | Many Candidates per slot (ordered) | One placement per Slot (or Rejected) |
| **Conflicts** | None (Ranking doesn't reason about conflicts) | Resolved and unresolved, with evidence |
| **Shortfalls** | Carried forward from CandidateSet | Augmented with Solver-detected shortfalls (Rejected Slots) |
| **Audience** | Constraint Solver | Review Workbench |

### 12.3 Conceptual Shape

```
AllocatedCandidateSet
├── identity                  (RankedCandidateSet id, Solver version, Allocation Model version, Scoring Model version)
├── placements[]              (one per Slot)
│   ├── slot_id               (the Blueprint Slot)
│   ├── state                 (Allocated | Rejected)
│   ├── assigned_candidate    (if Allocated: the placed Candidate)
│   ├── placement_reasoning   (Score, ordering position, constraint satisfaction)
│   ├── conflicts_resolved[]  (Conflicts encountered and resolved, with evidence)
│   ├── replacements[]        (Replacements performed on this Slot, with reasons)
│   └── reviewer_overrides[]  (any Reviewer-imposed constraints in force)
├── rejected_slots[]          (Slots that could not be filled, with reasons)
├── unresolved_conflicts[]    (Hard Conflicts that could not be resolved)
├── shortfall_summary         (aggregate gap: targets vs. achieved)
├── audit_trail               (full reproducible decision trace)
├── carried_forward           (CandidateSet shortfalls, unchanged)
└── meta                      (spec_version = "1.0", solver_version, versions)
```

### 12.4 Carried-Forward Fields

The AllocatedCandidateSet **carries forward** the CandidateSet's shortfalls and coverage satisfaction (unchanged). The Solver augments with its own shortfalls (Rejected Slots, unresolved Conflicts) but does not modify the upstream findings.

### 12.5 Ownership and Lifecycle

- **Information content:** owned by this spec (§12.3).
- **Production:** owned by the Solver.
- **Consumption:** by the Review Workbench (later session).
- **Lifecycle:** immutable once emitted. Caching for audit is permitted (input-deterministic).

### 12.6 Boundaries

The AllocatedCandidateSet is **read-only for downstream**. The Reviewer may annotate with overrides; those annotations are layered on top, never modifying the core contract.

### 12.7 What the AllocatedCandidateSet Is NOT

- ❌ Not a **selection**. The Reviewer selects from it.
- ❌ Not a **Draft**. The Draft Builder builds from approved selections.
- ❌ Not a **publication**. Publishing uses the existing Exam Set lifecycle.
- ❌ Not **opaque**. Every placement is explainable.

---

## 13. Solver State

### 13.1 The Statefulness Boundary (Reconciliation)

This is the most important reconciliation in the spec. Candidate Ranking is **stateless** (Candidate Ranking §1.4). The Solver is **stateful within a run** — search requires accumulating placements, tracking conflicts, and backtracking. The resolution:

| Concern | State Model |
|---|---|
| **Internal state** | Mutable within a run; fully reconstructed from inputs on each run; released at termination. |
| **Output contract** | Deterministic given inputs (same RankedCandidateSet → same AllocatedCandidateSet). |
| **Persistence** | No state persists across runs. Caching is input-deterministic and does not affect output. |

The contract guarantee: **statefulness is internal; determinism is contractual**. A stateful algorithm can produce deterministic output when its state is fully determined by its inputs.

### 13.2 State Categories

| State Type | Purpose | Lifetime |
|---|---|---|
| **Runtime State** | The live Allocation State during search (all Slots, occupancy, Reservations, Assignments, current Conflicts). | Born at Initialize; mutated during search; released at termination. |
| **Working State** | Search-specific state (current branch, candidate queue, iteration counters). | Born during search; released at termination. |
| **Final State** | The post-Finalize Allocation State (locked placements, Rejected Slots). | Born at Finalize; carried into the AllocatedCandidateSet. |
| **Checkpoint** | A snapshot of Runtime State for Rollback. | Created during search; consumed by Rollback or released at termination. |
| **Recovery State** | State during recovery from a Conflict (intermediate Replacements, tentative re-placements). | Born during resolution; released when resolution completes. |
| **Rollback State** | A snapshot used to undo a series of placements. | Created on demand; consumed by Rollback; released at termination. |

### 13.3 What State Does NOT Do

- ❌ Does **not escape** the run. Only the Final State's placements appear in the AllocatedCandidateSet (with audit summary).
- ❌ Does **not influence future runs**. Each run starts fresh.
- ❌ Does **not violate determinism**. State is fully input-determined.

### 13.4 Checkpoint and Rollback Semantics

Checkpoints and Rollbacks are part of the Solver's search repertoire (per Allocation Model §9.4). The architecture specifies only:
- Checkpoints are **snapshots** of Runtime State.
- Rollbacks **restore** Runtime State to a checkpoint.
- Both are **transparent** (appear in the audit trail).
- Both are **deterministic** (same search → same checkpoints and rollbacks).

The strategy for when to checkpoint and rollback is an implementation concern.

---

## 14. Performance Philosophy

Performance is a real concern — the Solver is the most compute-intensive module — but this spec fixes only the **philosophy**, not the optimizations.

### 14.1 Scalability

The Solver scales with:
- **Slots** (Blueprint distribution cells).
- **Candidates per Slot** (from RankedCandidateSet).
- **Constraints** (Blueprint rules).

It does **not** scale with:
- **Bank size** (Solver never touches the Bank).
- **Question content** (Solver is metadata-only).

For Blueprint v3.0 (5 Sets × 100 Slots), the Solver's work is bounded regardless of Bank size.

### 14.2 Memory

Internal memory usage is bounded by:
- Runtime State size (Slots × occupancy).
- Checkpoint depth (implementation concern).
- Audit trail size (bounded by Slots × decisions-per-Slot).

Memory is released at termination. The architecture specifies only that memory usage is **transparent to the output contract** — the AllocatedCandidateSet is the same size regardless of internal memory pressure.

### 14.3 Runtime Isolation

The Solver runs in isolation within an Engine run:
- No concurrent access to its Runtime State from other modules.
- No external dependencies (no Bank, no LLM, no network).
- No side effects outside its own state.

This isolation is what makes determinism achievable.

### 14.4 Parallelism Readiness

The architecture is **parallelism-ready** but does not require parallelism:
- Slots within a Set can potentially be solved in parallel (when constraints don't cross-cut).
- Sets within a Blueprint can potentially be solved in parallel (when cross-set constraints are looser).
- The Allocation Group concept (Allocation Model §4.9) provides the seam for partitioning.

**Parallelism strategy is an implementation concern.** The architecture specifies only that any parallel implementation must preserve determinism (same output for same input).

### 14.5 Deterministic Execution

Determinism is the governing constraint on performance choices. Any optimization (caching, parallelism, incremental solving) must preserve the determinism contract (§9). Optimizations that would produce different outputs on different runs are prohibited.

### 14.6 What Performance Philosophy Does NOT Specify

- ❌ Specific **algorithms** (implementation).
- ❌ **Time complexity** targets (implementation).
- ❌ **Memory limits** (implementation).
- ❌ **Parallelism strategy** (implementation, within determinism constraints).

---

## 15. Layer Boundaries

### 15.1 Constraint Solver

- **CAN:**
  - Consume RankedCandidateSet (read-only).
  - Instantiate Runtime Slots.
  - Place Candidates (Reservation → Assignment).
  - Detect, classify, and resolve Conflicts.
  - Augment Hard Penalties per Scoring Model §9.2.
  - Produce Checkpoints and Rollbacks.
  - Emit AllocatedCandidateSet.
- **CANNOT:**
  - Read Question content.
  - Query the Bank.
  - Re-rank or re-score Candidates.
  - Modify the RankedCandidateSet, AssemblyRequest, Scoring Model, or Allocation Model.
  - Publish or produce a Draft.
  - Make final selection (Reviewer's authority).
  - Invent Allocation vocabulary or Constraint categories.
- **MUST NEVER:**
  - Silently weaken constraints to fake feasibility.
  - Silently drop a Candidate implicated in a Conflict.
  - Hide a Conflict or placement decision from the audit trail.
  - Allow an invalid state transition.
  - Allow a Locked Allocation to be modified within the run.
  - Couple Solver logic to SQL or UI.
  - Use an LLM.
  - Modify Scores, Confidences, or orderings.
- **MUST ALWAYS:**
  - Be deterministic in its output contract.
  - Produce fully transparent allocations.
  - Surface shortfalls and unresolved Conflicts explicitly.
  - Honor Maximum Recall (Reject, don't silently drop).
  - Consume upstream contracts read-only.
  - Fail fast, fail loud, remain deterministic on structural failures.

### 15.2 Relationship with Adjacent Modules

| Boundary | Solver's Side | Other Side |
|---|---|---|
| **Solver ↔ Ranking** | Consumes RankedCandidateSet (read-only); inherits priority | Ranking produces it; Solver never modifies |
| **Solver ↔ Allocation Model** | Speaks the vocabulary exactly | Allocation Model fixes semantics; Solver fixes behavior |
| **Solver ↔ Scoring Model** | Consumes Scores read-only; may augment Hard Penalties per §9.2 | Scoring Model fixes evaluation vocabulary |
| **Solver ↔ Review** | Produces AllocatedCandidateSet | Reviewer consumes; may override; overrides are inputs to re-solving |
| **Solver ↔ Draft Builder** | No direct relationship | Draft Builder consumes Reviewer's approved allocation |
| **Solver ↔ Question Bank** | No relationship | Solver never touches the Bank |
| **Solver ↔ Blueprint** | Consumes constraints via AssemblyRequest | Blueprint is immutable |

---

## 16. Anti-Patterns

Explicitly prohibited. Any future change must be evaluated against this list.

| # | Anti-Pattern | Why Prohibited |
|---|---|---|
| AP-1 | **Re-ranking** | Ranking is immutable upstream; Solver consumes orderings read-only. |
| AP-2 | **Re-scoring** | Scoring is immutable upstream; Solver consumes Scores read-only (with the §9.2 augmentation exception). |
| AP-3 | **Changing Blueprint** | Blueprint is immutable; Solver honors it verbatim. |
| AP-4 | **Ignoring Constraints** | Violates Blueprint Fidelity. |
| AP-5 | **Silent Constraint Weakening** | The worst failure mode (§11.3); violates Never Fake Feasibility. |
| AP-6 | **Random Decisions** | Violates Determinism (§9). |
| AP-7 | **Opaque Allocation** | An AllocatedCandidateSet without reasoning is non-conformant. |
| AP-8 | **Reading Question Content** | Violates the content boundary; destroys scalability. |
| AP-9 | **Business Logic Duplication** | Constraints are owned by the Blueprint; Solver evaluates, never redefines. |
| AP-10 | **Human Replacement** | Solver's output is advisory; Reviewer is authority. |
| AP-11 | **Inventing Allocation vocabulary** | Allocation Model is immutable; Solver consumes it. |
| AP-12 | **Persistent state across runs** | Violates determinism (§9). |
| AP-13 | **Internal state escaping** | Runtime State is internal; only final placements appear in output. |
| AP-14 | **Inventing Constraint categories** | Category taxonomy is fixed at v1.0 (§4). |
| AP-15 | **Using an LLM** | Violates determinism and LLM-independence. |
| AP-16 | **Coupling to SQL or UI** | Solver logic is architecture; SQL and UI are implementation. |
| AP-17 | **Anything outside Solver ownership** | Single responsibility (§1.3). |

---

## 17. Future Extensibility

Future capabilities enter as additive extensions, never as redesigns.

### 17.1 Distributed Solver

If the Solver is distributed across nodes for very large Blueprints, the Allocation Group concept (Allocation Model §4.9) provides the seam: each node owns an Allocation Group, with cross-Group coordination handled at the Group level. The vocabulary and contracts are unchanged.

### 17.2 Parallel Solver

Multiple Solver branches exploring the search space in parallel would produce multiple candidate AllocatedCandidateSets; a deterministic merge step picks one. The architecture accommodates this by treating each branch's output as a candidate, with the merge step producing the final output. **Determinism must be preserved** (§9): the merge step's choice is input-determined.

### 17.3 AI-assisted Solver

If an AI assists the Solver (e.g. suggesting promising placements), the AI's suggestions enter as **proposed Reservations** — the Solver still decides whether to promote them. The AI is a Reservation source, not a Solver. This preserves Human Authority (the Reviewer still approves the final allocation) and Determinism (if the AI's suggestions are recorded as inputs, the run is reproducible).

### 17.4 Adaptive Solver

If future Profiles require the Solver to adapt to learner history, the adaptation enters as **additional Constraints** in the AssemblyRequest, which the Solver honors without structural change.

### 17.5 Incremental Solver

An Incremental Solver re-solves only the parts of the allocation affected by a Reviewer override, rather than re-solving from scratch. The architecture accommodates this: the Solver consumes the Reviewer's override as input and produces a new AllocatedCandidateSet. **Determinism still holds** (same inputs → same output).

### 17.6 Real-time Solver

A Real-time Solver produces allocations interactively as the Reviewer works. The architecture accommodates this by treating each Reviewer action as a re-solve trigger. The output contract (AllocatedCandidateSet) is unchanged.

### 17.7 Constraint Plug-ins

Future constraint categories (§4.1) may be introduced as Plug-ins. Each Plug-in declares its category, priority, and enforcement level. The Solver evaluates Plug-in constraints alongside v1.0 categories. **New categories require a Solver version bump** so consumers know the constraint taxonomy has grown.

### 17.8 Implementation Swappability

A new Solver implementation may ship (different algorithms, different performance characteristics) **without bumping this spec**, provided it:
- Consumes all upstream contracts read-only.
- Produces a conformant AllocatedCandidateSet.
- Honors all layer boundaries (§15) and anti-patterns (§16).
- Preserves determinism.

The AllocatedCandidateSet contract is the swappability boundary: any implementation that emits it is a valid Solver.

### 17.9 What Does NOT Change

- **Solver owns behavior; language is upstream** (§0) — the architectural invariant.
- **Blueprint Fidelity** (§2.4) — never silently weaken constraints.
- **Determinism** (§9) — same inputs → same output.
- **Transparency** (§10) — every decision auditable.
- **The content boundary** — Solver never reads content.
- **Human Authority** — Solver's output is advisory.

---

## 18. Cross-Spec Reconciliation (Mandatory)

Per the session's mandatory requirement: explicit reconciliation of architectural seams inherited from prior specs.

### 18.1 Candidate Generation ↔ Constraint Solver

**Tension:** Candidate Generation §7.3 establishes the "per-axis validation ceiling" — the Generator validates each axis independently and explicitly does **not** solve joint constraints (that's IG-5, the Solver's job).

**Reconciliation:** The boundary is clean and well-established across the spec chain:
- **Generator** produces the legal pool (per-axis legality).
- **Solver** produces a feasible joint mapping (cross-axis satisfaction).
- The Generator's CandidateSet carries per-axis Shortfall Reports; the Solver augments with joint Shortfall Reports (Rejected Slots, unresolved Conflicts).

**No overlap.** The Generator's ceiling is per-axis; the Solver's responsibility is joint. This spec honors that boundary by consuming the CandidateSet read-only and never re-doing per-axis validation.

### 18.2 Scoring Model ↔ Constraint Solver

**Tension:** Scoring Model §9.2 carves a narrow exception — the Solver may **augment Hard Penalties** for joint-constraint risk. This appears to give the Solver limited scoring authority, which could conflict with the "Scoring is owned by Ranking" rule.

**Reconciliation:** The exception is narrower than it appears, and it maps cleanly onto the Allocation Model's vocabulary:
- A **Hard Penalty augmentation** by the Solver corresponds to a **Hard Conflict** in Allocation Model §7.2 terms.
- The Solver does **not** re-score the Candidate. It records that placing the Candidate in this Slot would create a joint-constraint violation, and that record manifests as a Hard Conflict (with the Solver as the conflict source).
- The Candidate's Composite Score is **unchanged**; the Penalty is layered on top, transparently, for this (Candidate × Slot) placement only.

**Operational rule:** Solver-applied Hard Penalties are expressed as Hard Conflicts in the AllocatedCandidateSet's audit trail. The Candidate's underlying Score remains as Ranking produced it. This preserves Scoring Model immutability while giving the Solver the joint-constraint language it needs.

### 18.3 Candidate Ranking ↔ Constraint Solver

**Tension:** Candidate Ranking §8.3 establishes the "no-modification rule" — once Scores, Confidences, and Penalties are computed (stages 2–4 of Ranking's pipeline), they are immutable. But the Solver needs to *consume priority* during allocation (Reservation priority per Allocation Model §8.3 is inherited from Rankings). Is consuming priority a form of modification?

**Reconciliation:** No. **Consuming read-only is not modifying.**
- The Solver reads the RankedCandidateSet to determine Reservation priority (which Candidate reserves a Slot first when multiple are eligible).
- The Solver does **not** change the Rankings, the Scores, or the orderings.
- The Solver's placements are recorded with the inherited priority as evidence (placement reasoning includes "ranked Nth for this slot").

**Operational rule:** Reservation priority is *inherited* from Ranking; it is never *computed* by the Solver. If two Candidates tie on priority (a tie the RankedCandidateSet already resolved per its Tie Resolution rules), the Solver uses Ranking's resolution, not its own.

### 18.4 Allocation Model ↔ Constraint Solver

**Tension:** This is the most delicate seam. Allocation Model owns **language** (vocabulary, states, transitions, contracts); Solver owns **behavior** (search, placement, conflict resolution). The risk is the Solver drifting into redefining Allocation vocabulary ("we need a new state for this optimization") or the Allocation Model drifting into specifying behavior ("the Solver should prioritize this way").

**Reconciliation:** The split is precise and enforced:
- **What the Solver may do with the vocabulary:** instantiate Runtime Slots, make Reservations, promote to Assignments, detect Conflicts, perform Replacements/Swaps/Rollbacks, Lock the allocation. All per Allocation Model §5–§9.
- **What the Solver may NOT do with the vocabulary:** invent new states, new Conflict types, new transition rules, or new contracts. Any such need requires an **Allocation Model version bump**, not a Solver-side extension.
- **What the Allocation Model may NOT do:** specify the Solver's algorithms, search order, heuristics, or optimization choices. Those belong to the Solver implementation, within the Allocation Model's latitude.

**Operational rule:** If a future need appears to require a new Allocation concept (e.g. "partial Lock" for incremental solving), the answer is an Allocation Model v2.0 bump, not a unilateral Solver extension. Conversely, if a need appears to require a specific search strategy, the answer is a Solver implementation choice, not an Allocation Model mandate.

### 18.5 Statefulness Asymmetry

**Tension:** Candidate Ranking is **stateless** (Candidate Ranking §1.4). The Solver is **stateful within a run** (this spec §13). The asymmetry is real but not a contradiction.

**Reconciliation:** Statefulness is **internal to the Solver run**; the output contract is **deterministic given inputs** (§9). Internal state is fully reconstructed on each run from the RankedCandidateSet. This is the same pattern that lets any stateful algorithm be deterministic-in-contract when its state is input-determined. Candidate Ranking's statelessness and the Solver's statefulness coexist because they operate at different layers: Ranking is a pure function; the Solver is a stateful algorithm with a pure-function output contract.

### 18.6 Transparency Consistency

**Tension:** Five prior specs (Engine Foundation, Scoring Model, Candidate Ranking, Allocation Model, this spec) each establish transparency requirements. Are they consistent?

**Reconciliation:** Yes — they form a layered transparency stack:
- **Always-present layer:** final placements, placement reasoning, Rejected Slots, unresolved Conflicts, Reviewer overrides, top-level Scores and Confidences.
- **On-demand layer:** full Reservation/Replacement/Conflict history, Solver backtracking, signal-level traces.

Each spec contributes its piece to the trail; the AllocatedCandidateSet assembles them. No spec contradicts another; they compose.

### 18.7 Documentation of Reconciliation Decisions

Every reconciliation above is recorded here so that:
- Future implementers don't re-derive the resolutions.
- Future spec versions evaluate changes against the reconciled seams.
- The architecture remains coherent across the eight documents.

---

## Appendix A — Glossary

| Term | Definition |
|---|---|
| **Constraint Solver** | The runtime that transforms RankedCandidateSet → AllocatedCandidateSet. |
| **AllocatedCandidateSet** | The Solver's output: feasible (or partial) joint mapping with audit trail. |
| **Hard Constraint** | Inviolable rule; violation produces a Hard Conflict. |
| **Soft Constraint** | Advisory rule; violation produces a Soft Conflict. |
| **Feasible Allocation** | Every Slot filled, every Hard Constraint satisfied. |
| **Partial Allocation** | Some Slots Rejected, some Conflicts unresolved; honest best effort. |
| **Shortfall** | Explicit unmet Blueprint requirement. |
| **Rejected Slot** | A Slot that could not be filled without violating a Hard Constraint. |
| **Reservation** | Tentative hold on a Slot during solving (Allocation Model §8). |
| **Assignment** | Confirmed placement of a Candidate in a Slot. |
| **Conflict** | Condition where placement would violate a constraint (Allocation Model §7). |
| **Replacement** | Removing one Candidate and placing another (Allocation Model §9). |
| **Rollback** | Restoring Runtime State to a Checkpoint. |
| **Checkpoint** | A snapshot of Runtime State for Rollback. |
| **Runtime State** | The Solver's live state during search. |
| **Audit Trail** | Reproducible decision trace from RankedCandidateSet to AllocatedCandidateSet. |

---

## Appendix B — Boundary Assertions

The non-negotiable contracts of this specification.

1. **The Solver owns behavior; language is owned upstream.** (Allocation Model owns vocabulary; Solver owns runtime.)
2. **The Solver consumes all upstream contracts read-only.** (RankedCandidateSet, Scoring Model, Allocation Model, AssemblyRequest — never modified.)
3. **The Solver never reads Question content.** Metadata only.
4. **The Solver never queries the Bank.** RankedCandidateSet only.
5. **The Solver never re-ranks or re-scores.** (With the narrow Hard-Penalty-augmentation exception per Scoring Model §9.2, expressed as Hard Conflicts.)
6. **Blueprint Fidelity is inviolable.** Hard Constraints are satisfied or shortfalls are surfaced — never silently weakened.
7. **The output contract is deterministic.** Same RankedCandidateSet + same Solver version → same AllocatedCandidateSet.
8. **Internal state does not escape.** Only final placements and audit summary appear in the output.
9. **Every decision is auditable.** Opaque allocations are non-conformant.
10. **Partial allocations are valid outputs.** Honest partial beats fake-feasible full.
11. **The Solver is deterministic, transparent, auditable, stateful-within-run, and LLM-free.**
12. **The Human is the final authority.** The Solver's output is advisory; Reviewer overrides are honored.

---

## Appendix C — Provenance & Cross-References

- **Engine alignment:** The Solver is the structural-placement runtime anticipated by Engine Foundation v1.0 §3 (the "Constraint Solver" module, deferred). This spec closes IG-5 at the algorithmic level.
- **Integration Spec alignment:** The Solver honors `run_unit = blueprint` (Integration Spec §5.1) — it solves all 5 Sets jointly, with cross-Set Constraints (CR-3, L3) as first-class. Integration Gaps IG-1 (Tier derivation) and IG-2 (missing Bank columns) propagate to the Solver as reduced Confidence in inherited Scores and as potential Rejected Slots — surfaced honestly, never silently absorbed.
- **Reader alignment:** No direct interaction. The Solver is four modules downstream.
- **Candidate Generation alignment:** The Solver consumes the CandidateSet's Slot Eligibility and per-axis Shortfall Reports read-only. It does not re-validate per-axis (the Generator's ceiling is honored — §18.1).
- **Scoring Model alignment:** The Solver consumes Scores read-only. Per Scoring Model §9.2, the Solver may augment Hard Penalties for joint-constraint risk — reconciled in §18.2 as Hard Conflicts in Allocation Model vocabulary. The Solver does not modify Composite Scores or Confidences.
- **Candidate Ranking alignment:** The Solver consumes the RankedCandidateSet read-only, inheriting Reservation priority from Rankings (Allocation Model §8.3). The no-modification rule (Candidate Ranking §8.3) is honored — §18.3.
- **Allocation Model alignment:** The Solver speaks the Allocation vocabulary exactly. Every state, transition, Conflict, Reservation, and Replacement conforms to Allocation Model v1.0. The Solver does not extend the vocabulary — §18.4.
- **Blueprint fidelity:** Every Blueprint v3.0 constraint — per-set sums, tier floors/ceilings, anchor rule, L1–L5 duplicate prevention, CR-1–CR-5 coverage, cross-set rules — is representable as a Solver constraint (§4) and enforced per its declared level. No constraint is silently dropped or relaxed.

---

*End of Sobdai Constraint Solver Architecture — v1.0.*

**Upstream sources (immutable):**
- Assessment Assembly Engine Foundation v1.0
- Blueprint Integration Specification v1.0
- Blueprint Reader Pipeline Architecture v1.0
- Candidate Generation Architecture v1.0
- Scoring Model Specification v1.0
- Candidate Ranking Architecture v1.0
- Allocation Model Specification v1.0

**Next modules to specify (later sessions):**
- Review Workbench Architecture (renders the AllocatedCandidateSet; captures Human overrides)
- Draft Builder Architecture (materializes the approved allocation into a Draft Exam Set via existing CRUD)

**Integration Gap IG-5 status:** Closed at the language level (Allocation Model v1.0) and at the runtime level (this spec). The Solver algorithm itself remains an implementation concern.
