# Sobdai Allocation Model Specification — v1.0

**Status:** Official Architecture Specification (Architecture only — no implementation, no algorithm, no search strategy, no backtracking, no optimization, no heuristics, no formulas, no SQL, no code, no UI)
**Sources of truth (exhaustive, immutable):**
1. `assessment_assembly_engine_foundation_v1.md` — Assessment Assembly Engine Foundation v1.0
2. `blueprint_integration_specification_v1.md` — Blueprint Integration Specification v1.0
3. `blueprint_reader_pipeline_architecture_v1.md` — Blueprint Reader Pipeline Architecture v1.0
4. `candidate_generation_architecture_v1.md` — Candidate Generation Architecture v1.0
5. `scoring_model_specification_v1.md` — Scoring Model Specification v1.0
6. `candidate_ranking_architecture_v1.md` — Candidate Ranking Architecture v1.0
**Version:** 1.0
**Owner:** Chief Assessment Architect, Sobdai

> **What this document is.** This is not a module specification, and it is not the Constraint Solver. It is a **language specification** — the vocabulary that every future Constraint Solver implementation must speak. The relationship is exact:
>
> *"The `AssemblyRequest` is to the Reader what the Scoring Model is to Ranking what the Allocation Model is to the Constraint Solver."*
>
> The `AssemblyRequest` fixes what a Blueprint *means*, independent of how any Reader produces it. The Scoring Model fixes what evaluation *means*, independent of how any Ranking computes it. The Allocation Model fixes what placement *means* — Assignment, Reservation, Conflict, Lock, Replacement — independent of how any Solver finds a feasible allocation.
>
> This specification closes the language seam carried since Integration Gap IG-5: every prior spec said "joint-constraint satisfaction is the Solver's job." The Allocation Model defines the *language* in which that satisfaction is expressed. The Solver itself — its algorithms, search strategy, optimization — belongs to a later session.
>
> **What this document is not.** Not an algorithm. Not a search strategy. Not backtracking. Not optimization. Not heuristics. Not a formula. Not pseudocode. Not the Solver. It defines the **vocabulary, contracts, ownership, lifecycle, and failure posture** of allocation — the *language*, not the *mechanics* of solving.

---

## 0. Executive Summary

The Assessment Engine produces, at this point in the pipeline, a `RankedCandidateSet`: for every Blueprint slot, a deterministic ordering of Candidates with full evaluation. What it does **not** yet have is a vocabulary for the *structural placement* of those Candidates into slots — the act of taking a Candidate and saying "this one goes here, subject to constraints that span multiple slots."

That vocabulary is the Allocation Model. It defines what it means to **assign** a Candidate to a slot, to **reserve** a slot temporarily during solving, to **conflict** when a constraint would be violated, to **replace** one Candidate with another, and to **lock** an allocation once committed. Without this language, every Solver implementation would invent its own terms — fraturing the system's auditability and breaking cross-implementation consistency.

The defining architectural separation at the heart of this model: **Allocation ≠ Selection**. Allocation is *structural placement* — the mapping of Candidates to slots under constraints. It is **not** the final decision about what goes into a Draft. The Constraint Solver produces an `AllocatedCandidateSet` (a feasible mapping); the Human Reviewer approves, edits, or rejects it; the Draft Builder materializes only what the Human approves. Allocation is the Engine's most structural stage, and it is therefore the stage where transparency and auditability matter most — because mistakes here propagate silently into published exams.

Three relationships define the model's place:

- **Allocation ↔ Candidate Ranking.** Allocation consumes the `RankedCandidateSet`. It does not re-rank, re-score, or modify evaluations (Candidate Ranking §8.3 — the no-modification rule). Allocation treats Scores as read-only inputs that *prioritize* the search for a feasible mapping; they do not *determine* it, because a high-Score Candidate may be infeasible to place jointly.
- **Allocation ↔ Constraint Solver.** The Allocation Model is the **language** the Solver speaks. The Solver is the runtime that finds a feasible allocation; the Allocation Model defines what "feasible allocation" *means* — its states, transitions, conflicts, reservations, and contracts. A Solver may not invent allocation concepts outside this vocabulary.
- **Allocation ↔ Human Review.** Every allocation is explainable: why this Candidate is in this slot, what was reserved and released, what conflicts arose and how they were resolved. The Reviewer may override any allocation. The Human remains the final authority.

The model is **deterministic in its output contract** (same RankedCandidateSet → same AllocatedCandidateSet), **transparent by construction** (every placement carries its reasoning), **bounded by Blueprint structure** (allocation work scales with slots × candidates, never Bank size), and **stateful only within a Solver run** (Reservations and intermediate Allocation States are internal; only final allocations escape).

---

## 1. Why Allocation Exists

### 1.1 The Problem Allocation Solves

The `RankedCandidateSet` says, per slot, "consider these Candidates in this order." It does **not** say "this Candidate goes into this slot" — because slot-level ordering cannot account for **joint constraints**: constraints that span multiple slots and that make per-slot-optimal choices jointly infeasible.

Blueprint v3.0 is full of joint constraints:

- *"SUM(all documents) = 100"* per set — filling one document slot reduces the headroom for others.
- *"SUM(tier_1) ≥ 30, SUM(tier_4) ≤ 25"* — Tier is aggregated across all filled slots.
- *"1 document per set gets +5 above tier.max, max 1 anchor"* — the anchor rule is a property of the *whole set*, not any single slot.
- *"Topic + Difficulty + Type เดียวกัน ห้ามซ้ำ"* within a set (Duplicate Prevention L1) — placing a Candidate in one slot may forbid a Candidate in another.
- Cross-Set rules (CR-3, L3): the same Topic+Difficulty+Type combination cannot appear in more than 5 sets.

None of these can be checked at the slot level. They require a **structural placement** — an Allocation — that can be evaluated as a whole.

### 1.2 What Allocation Provides

- **A language for placement.** Assignment, Reservation, Conflict, Lock — terms every Solver speaks identically.
- **Joint-constraint awareness.** Allocation can express "this placement is feasible *as a whole*" — something no per-slot evaluation can.
- **Transparency.** Every placement carries its reasoning, conflicts, reservations, and replacements — fully auditable.
- **Decoupling.** Solver logic is owned at the Solver-spec level; the Allocation Model fixes the vocabulary so that a new Solver implementation can ship without changing what allocation *means*.

### 1.3 What Allocation Does Not Provide

- **Final selection.** Allocation produces a feasible mapping, not a final Draft.
- **Truth.** An allocation is a structural arrangement, not a claim about Question quality.
- **Re-evaluation.** Allocation does not re-score or re-rank.
- **Human replacement.** The Human Reviewer is the final authority.

---

## 2. Allocation Philosophy

### 2.1 Allocation ≠ Selection (Foundational)

| Stage | Question It Answers | Output |
|---|---|---|
| **Allocation** | "Can these Candidates be structurally placed into these slots, jointly satisfying constraints?" | AllocatedCandidateSet (a feasible mapping) |
| **Solver** | "What is one such feasible mapping?" | The computational process that produces an Allocation |
| **Review** | "Is this mapping acceptable?" | Human-approved subset |
| **Draft Builder** | "Materialize the approved mapping into a Draft Exam Set" | Draft |

Allocation is *structural placement*. It does not decide what becomes a Draft — it determines what *can* become one, given constraints.

### 2.2 Allocation ≠ Ranking

A `RankedCandidateSet` orders Candidates per slot. An Allocation **places** them. The distinction:

- Ranking says: "for slot X, consider Candidate A before Candidate B."
- Allocation says: "Candidate A is placed in slot X, and because of that, Candidate B cannot be placed in slot Y (mutual exclusion), so Candidate C is placed in slot Y instead."

Ranking provides priority; Allocation provides structure. Allocation consumes Ranking's output read-only (Candidate Ranking §8.3) — Scores and orderings inform the Solver's search, but Allocation does not modify them.

### 2.3 Allocation ≠ Publishing

An Allocation is **not** a published exam. It is a structural proposal, fully auditable, awaiting Human approval. The path from Allocation to published Exam Set runs through Review → Draft Builder → existing Exam Set publish lifecycle (Engine Foundation §6.2). Allocation never publishes; it never even produces a Draft directly.

### 2.4 The Human Remains the Final Authority

No allocation — however optimal the Solver considers it — is final until the Human Reviewer approves it. The Reviewer may:
- Approve the allocation as-is.
- Reject specific placements (forcing re-allocation or accepting gaps).
- Force-include Candidates the Solver didn't place.
- Force-exclude Candidates the Solver did place.

The Allocation Model supports all of these by making every placement overridable and every conflict visible.

### 2.5 Feasibility Over Optimality

The Allocation Model's first commitment is **feasibility** — producing a mapping that satisfies all hard constraints. Optimality (the "best" feasible mapping by some criterion) is a secondary concern, owned by the Solver's optimization choices (out of scope here). A feasible-but-suboptimal allocation is **always preferable** to an infeasible-but-optimal-looking one. This principle governs failure handling (§12): when full satisfaction is impossible, the model produces a *partial* allocation with explicit shortfalls, never a fake-feasible allocation achieved by silently weakening constraints.

---

## 3. Allocation Lifecycle

The lifecycle is the spine of the model. Each stage has a single owner and a single responsibility. The lifecycle describes the *journey of a Candidate-Slot pair* from consideration to final placement.

```
Ranked Candidate      ── a Candidate under consideration for a slot
        │
        ▼
Assignment Candidate  ── a Candidate the Solver is attempting to place
        │
        ▼
Reserved Slot         ── a slot temporarily held for a Candidate during solving
        │
        ▼
Allocated Slot        ── a slot with a confirmed Candidate placement
        │
        ▼
Locked Allocation     ── an allocation committed as the Solver's output
        │
        ▼
Released Allocation   ── an allocation undone (by the Solver during backtracking,
        │                or by the Reviewer during review)
        ▼
Approved Allocation   ── an allocation the Human Reviewer has accepted
```

### 3.1 Stage Ownership

| Stage | Owner | Responsibility |
|---|---|---|
| Ranked Candidate | Candidate Ranking (produces the RankedCandidateSet) | Provide the ordered input |
| Assignment Candidate | Constraint Solver | Attempt structural placement |
| Reserved Slot | Constraint Solver | Hold a slot temporarily during solving |
| Allocated Slot | Constraint Solver | Confirm a placement |
| Locked Allocation | Constraint Solver | Commit the Solver's output |
| Released Allocation | Constraint Solver (during solving) or Reviewer (during review) | Undo a placement |
| Approved Allocation | Human Reviewer | Accept the final placement |

### 3.2 Critical Ownership Boundaries

- **Candidate Ranking does not allocate.** (Candidate Ranking §12 AP-1, AP-2 — Ranking selects nothing and solves nothing.) Ranking produces the RankedCandidateSet; Allocation consumes it.
- **The Review Workbench does not allocate.** It displays allocations and captures Human overrides (force-include, force-exclude, replace). Overrides are *inputs* to re-allocation, not allocations themselves.
- **The Draft Builder does not allocate.** It materializes an approved allocation into a Draft Exam Set via existing CRUD.
- **Only the Constraint Solver allocates.** This is the single-responsibility guarantee.

### 3.3 Lifecycle Within a Run

The lifecycle is **synchronous within a Solver run**: RankedCandidateSet in → AllocatedCandidateSet out (or a structured failure, §12). Internal states (Reservations, intermediate Allocations) are **mutable within the run** but **do not escape it**. The output contract — the AllocatedCandidateSet — is deterministic given the input (Principle: Determinism).

### 3.4 The Statefulness Boundary

This is the most important reconciliation in the model. Candidate Ranking is **stateless** (Candidate Ranking §1.4 — no state persists between runs). Allocation is **stateful within a Solver run** (Reservations, Allocation States, Replacements all require intermediate state). The resolution:

| Concern | State Model |
|---|---|
| **Reservation** | Internal to the Solver run; never escapes. Only final allocations appear in the AllocatedCandidateSet. |
| **Allocation State** (Open, Reserved, Allocated, Locked, Released — §5) | Internal during solving; the AllocatedCandidateSet records only the final state per placement. |
| **Replacement History** | Internal during solving; the AllocatedCandidateSet records the final placement plus a summary of replacements (for transparency). |
| **Conflict History** | Internal during solving; the AllocatedCandidateSet records only *unresolved* conflicts that prevent placement. |

**The contract-level guarantee:** the AllocatedCandidateSet is a pure function of the RankedCandidateSet (given the same Solver implementation and version). Internal statefulness does not compromise output determinism, because the state is reconstructed identically on each run.

---

## 4. Core Concepts (Vocabulary)

The vocabulary every Solver implementation must speak. These are *concept definitions*, not data structures — implementations choose shapes, but the semantic content is fixed here.

### 4.1 Slot

**Definition:** A position in the Blueprint that can hold one Question. Concretely, a Blueprint distribution cell (e.g. `{set: 1, difficulty: Easy, pattern: Memory, document: D1}`).

**Properties:**
- Has a **capacity** (typically 1 Question per slot; some Blueprints may model multi-capacity slots — out of scope for v1.0).
- Has a **target** (the slot exists because the Blueprint's distribution requires a Question of this profile).
- Has a **state** (Open, Reserved, Allocated, etc. — §5).

**Ownership:** Defined by the Blueprint (via the AssemblyRequest); instantiated as runtime slots by the Allocation Model.

### 4.2 Assignment

**Definition:** The act of binding a Candidate to a Slot. An Assignment says "this Candidate occupies this slot."

**Properties:**
- Is **explicit** — never implicit.
- Carries **reasoning** (why this Candidate was assigned: Score, ordering position, constraint satisfaction).
- Is **reversible** — via Release (§4.8) or Replacement (§4.6).
- Is **distinct from Reservation** — an Assignment is a confirmed placement; a Reservation is a tentative hold.

**Ownership:** Constraint Solver.

### 4.3 Reservation

**Definition:** A temporary hold on a Slot for a Candidate, during solving. A Reservation says "the Solver is tentatively considering this Candidate for this slot."

**Properties:**
- Has a **lifetime** (born during solving, ended by promotion to Assignment or by Release).
- Has a **priority** (when multiple Candidates could reserve the same slot).
- Is **internal to the Solver run** — does not escape to the AllocatedCandidateSet.
- Is **visible in the audit trail** of the final allocation (for transparency).

**Ownership:** Constraint Solver.

### 4.4 Occupancy

**Definition:** The current state of a Slot — which Candidate (if any) holds it, in what capacity (Reserved or Assigned).

**Properties:**
- Occupancy is the **runtime view** of a Slot at any moment during solving.
- An Open Slot has no occupancy; a Reserved Slot has a tentative occupant; an Allocated Slot has a confirmed occupant.
- Occupancy changes as the Solver works; the final occupancy per Slot is what the AllocatedCandidateSet records.

**Ownership:** Constraint Solver (runtime state).

### 4.5 Conflict

**Definition:** A condition where placing a Candidate in a Slot would violate a constraint. Conflicts are what make allocation non-trivial — without them, the Solver would simply place the top-ranked Candidate in each slot.

**Properties:**
- Has a **type** (Hard, Soft, Dependency, Mutual Exclusion — §7).
- Has a **scope** (within-set, cross-set, within-run).
- Has **participants** (the Candidate(s) and Slot(s) involved).
- Is **recorded** in the audit trail, whether resolved or not.

**Ownership:** Detected by the Constraint Solver; classified by the Allocation Model's vocabulary.

### 4.6 Replacement

**Definition:** The act of removing an Assigned or Reserved Candidate from a Slot and placing a different Candidate there. Replacements happen during solving (the Solver backtracks) and during review (the Reviewer overrides).

**Properties:**
- Is **explicit** — never silent.
- Records the **previous Candidate** and the **new Candidate**.
- Records the **reason** (constraint violation forced backtrack; Reviewer preference; etc.).
- Composes into **Replacement History** (§10) for auditability.

**Ownership:** Constraint Solver (during solving); Reviewer (during review, as an override).

### 4.7 Swap

**Definition:** A specific form of Replacement where two Candidates exchange Slots. A Swap says "Candidate A moves from Slot X to Slot Y, and Candidate B moves from Slot Y to Slot X."

**Properties:**
- Is a **paired Replacement** — two Replacements performed atomically.
- Useful when both Candidates are already placed and exchanging them resolves a Conflict.
- Carries the same reasoning and audit trail as a Replacement.

**Ownership:** Constraint Solver.

### 4.8 Allocation Unit

**Definition:** The atomic unit of allocation: one (Candidate, Slot) pair in a specific state. An Allocation Unit is the smallest thing that can be Assigned, Reserved, Released, or Replaced.

**Properties:**
- Has a unique identity within the run (so it can be tracked through state changes).
- Carries its current state (§5).
- Carries its history (Reservations, Replacements, Conflicts — for the audit trail).

**Ownership:** Constraint Solver.

### 4.9 Allocation Group

**Definition:** A collection of Allocation Units that must be reasoned about jointly. The most important Allocation Group is the **Set** (Blueprint v3.0 produces 5 interdependent Sets per run — Integration Spec §5.1: `run_unit = blueprint`). Cross-Set rules (CR-3, L3) make Sets an Allocation Group.

**Properties:**
- Groups Allocation Units for **joint constraint evaluation**.
- The Set is the primary Allocation Group; the Blueprint (all Sets) is the maximal group.
- Enables cross-Slot and cross-Set reasoning without flattening structure.

**Ownership:** Defined by the Blueprint structure; reasoned about by the Solver.

### 4.10 Allocation State

**Definition:** The complete snapshot of all Allocation Units at a moment in time. The Allocation State answers "what is placed where, right now, during solving?"

**Properties:**
- Includes all Slots, their occupancy, all Reservations, all Assignments, and all current Conflicts.
- Is **internal to the Solver run** — snapshots may be taken for backtracking but do not escape.
- The **final** Allocation State (post-solving) is what produces the AllocatedCandidateSet output.

**Ownership:** Constraint Solver (runtime state).

---

## 5. Allocation States

The lifecycle states an Allocation Unit (or Slot) can be in. Transitions are governed by the rules below — no algorithm, just the *allowed* transitions and their preconditions.

### 5.1 The State Vocabulary

| State | Meaning | Owner of Transition |
|---|---|---|
| **Open** | The Slot has no Candidate (Assigned or Reserved). It is available. | Initial state |
| **Reserved** | The Slot is tentatively held for a Candidate during solving. Not yet committed. | Solver |
| **Allocated** | The Slot has a confirmed Candidate placement (post-solving). | Solver |
| **Locked** | The Allocation is committed as the Solver's output. Cannot be changed within the run. | Solver (terminal Solver state) |
| **Released** | The Allocation has been undone — the Slot is back to Open (or the Candidate is removed). | Solver (during backtracking) or Reviewer (during review) |
| **Rejected** | The Slot cannot be filled (no feasible Candidate). The shortfall is explicit. | Solver (terminal) |
| **Completed** | The Allocation has been Approved by the Human Reviewer. | Reviewer (terminal) |

### 5.2 Allowed Transitions

```
Open ──reserve──► Reserved ──allocate──► Allocated ──lock──► Locked ──approve──► Completed
 │                     │                      │                   │
 │                     │                      ├──release──► Open (backtrack)
 │                     ├──release──► Open
 │
 ├──reject──► Rejected (terminal; shortfall recorded)
 │
 └── (Reviewer may force transitions during review: see §5.4)
```

**Transition rules (architectural, not algorithmic):**

- `Open → Reserved`: only by the Solver, during solving.
- `Reserved → Allocated`: only by the Solver, when a tentative placement is confirmed.
- `Reserved → Open` (release): only by the Solver, during backtracking.
- `Allocated → Locked`: only by the Solver, at solving termination.
- `Allocated → Open` (release): only by the Solver, during backtracking.
- `Locked → Released`: only by the Reviewer, as an override (the Solver has terminated).
- `Locked → Completed`: only by the Reviewer, on approval.
- `Open → Rejected`: only by the Solver, at termination, when no feasible Candidate exists.
- `Rejected → Open`: only by the Reviewer, who may force a placement the Solver couldn't find.

### 5.3 What the Model Does NOT Specify

- ❌ The **order** in which the Solver visits Slots (search strategy).
- ❌ The **algorithm** for choosing which Candidate to reserve (heuristic, optimization).
- ❌ The **backtracking strategy** (chronological, conflict-directed, etc.).
- ❌ The **termination criteria** beyond the architectural ones above.

These belong to the Constraint Solver Architecture (later session).

### 5.4 Reviewer Overrides

During Review, the Reviewer has authority to force transitions the Solver alone could not make:

- **Force-include:** Reviewer places a Candidate the Solver didn't (`Open → Allocated` for that Candidate, possibly creating a Conflict the Solver must re-resolve).
- **Force-exclude:** Reviewer removes a Candidate the Solver placed (`Allocated → Released`).
- **Replace:** Reviewer swaps a placed Candidate for a different one (a Replacement).
- **Un-reject:** Reviewer forces a Candidate into a Slot the Solver marked Rejected (`Rejected → Open → Allocated`).

All Reviewer overrides are **explicit, auditable, and may create conflicts** that must be surfaced (not silently resolved). A Reviewer override that violates a Hard Constraint (§7.2) is permitted only with an explicit acknowledgement — the Reviewer is the final authority, but the Engine never silently accepts an infeasible override.

---

## 6. Slot Model

The Slot is the central object of allocation. Several perspectives on Slot exist; this section defines each and their relationships.

### 6.1 Blueprint Slot

**Definition:** A slot as specified by the Blueprint — a distribution cell with a target profile (e.g. "Set 1, Easy, Memory, Document D1, 1 Question").

**Properties:**
- Defined by the `AssemblyRequest`'s distribution targets.
- Carries the **target profile** (the axes the placed Candidate should match).
- Carries the **Blueprint's constraints** that apply to this slot (coverage rules, mandatory-topic bindings).
- Is **immutable** — the Blueprint Slot does not change during allocation.

**Ownership:** Blueprint (via AssemblyRequest).

### 6.2 Runtime Slot

**Definition:** A slot as instantiated during a Solver run — the Blueprint Slot plus its current Allocation State.

**Properties:**
- Wraps a Blueprint Slot with mutable state (Open, Reserved, Allocated, etc.).
- Tracks **occupancy** (which Candidate, if any, currently holds it).
- Tracks **history** (Reservations, Replacements, Conflicts).
- Is **internal to the Solver run**.

**Ownership:** Constraint Solver (runtime).

### 6.3 Candidate Slot

**Definition:** The perspective on a Slot from a Candidate's point of view — "this Candidate could occupy this slot." Candidate Slot eligibility was established upstream (Candidate Generation §5.2, "Slot Eligibility" in provenance).

**Properties:**
- Represents the **eligibility relationship** between a Candidate and a Blueprint Slot.
- A Candidate may be eligible for multiple Candidate Slots (and thus multiple Blueprint Slots).
- Candidate Slot eligibility is **read-only** during allocation — it's an input from the CandidateSet.

**Ownership:** Established by Candidate Generation; consumed read-only by Allocation.

### 6.4 Assignment Slot

**Definition:** The perspective on a Slot once a Candidate has been Assigned to it — the slot with its confirmed occupant and the reasoning for the placement.

**Properties:**
- Represents the **placement outcome** — the final state of a successfully allocated Slot.
- Carries the **assigned Candidate**, the **reasoning** (Score breakdown, ordering reason, constraint satisfaction), and any **unresolved caveats** (e.g. Reviewer should double-check).
- Is what the AllocatedCandidateSet records per slot.

**Ownership:** Constraint Solver (output).

### 6.5 Relationships Among Slot Perspectives

```
Blueprint Slot (immutable, from AssemblyRequest)
        │
        │ instantiated as
        ▼
Runtime Slot (mutable, during solving)
        │
        │ eligibility from
        ├───► Candidate Slot (read-only, from CandidateSet)
        │
        │ placement into
        ▼
Assignment Slot (output, in AllocatedCandidateSet)
```

The four perspectives are **the same Slot viewed at different stages and by different owners**. Keeping them distinct prevents the common bug of mutating Blueprint Slots (which should be immutable) or treating Candidate eligibility as placement authority (it isn't).

---

## 7. Conflict Model

Conflicts are what make allocation non-trivial. The Conflict Model defines what a Conflict *is*, what types exist, and how they are *represented* — not how they are *resolved* (which is the Solver's job).

### 7.1 Conflict

**Definition:** A condition where placing a Candidate in a Slot would violate a constraint. A Conflict is a **relational** concept — it involves a Candidate, a Slot, and a constraint that would be violated.

**Properties:**
- Has **participants** (the Candidate being placed, the Slot, and any other already-placed Candidates implicated).
- Has a **constraint reference** (which Blueprint constraint is at issue: e.g. L1, tier-1 floor, anchor rule).
- Has a **type** (§7.2).
- Has a **scope** (within-set, cross-set, within-run).
- Has a **severity** (Hard Conflicts block; Soft Conflicts warn — §7.2).
- Is **recorded** whether resolved or not (transparency).

### 7.2 Conflict Types

| Type | Meaning | Allocation Effect |
|---|---|---|
| **Hard Conflict** | Placing the Candidate would violate a Hard constraint (e.g. L1 duplicate within a set, exceeding tier-4 ceiling). | Blocks the placement. The Candidate cannot be Allocated to this Slot unless the Conflict is resolved (by Releasing another placement, or by Reviewer override with acknowledgement). |
| **Soft Conflict** | Placing the Candidate would strain a Soft constraint (e.g. approaching the L3 cross-set rotation limit). | Does not block. The Candidate may be Allocated, but the Soft Conflict is recorded and surfaces to the Reviewer as a warning. |
| **Dependency** | Placing the Candidate depends on another placement (e.g. a Coverage Rule that requires Topic T to appear, which depends on a Candidate carrying Topic T being placed somewhere in the set). | The dependent placement is tracked; if the dependency cannot be satisfied, the dependent placement fails. |
| **Mutual Exclusion** | Two Candidates cannot both be placed (e.g. two Candidates with the same Topic+Difficulty+Type within a set, per L1). Placing one excludes the other. | The Solver must choose; the excluded Candidate is recorded as Conflict-blocked. |

### 7.3 Conflict Scope

- **Within-set:** the Conflict involves only Slots in one Set (e.g. L1 duplicate within Set 1).
- **Cross-set:** the Conflict spans multiple Sets (e.g. CR-3: same Topic+Difficulty+Type cannot appear in >5 Sets).
- **Within-run:** the Conflict spans the entire run (e.g. a global exclusion).

Cross-set and within-run Conflicts are why Allocation Group reasoning (§4.9) is necessary — they cannot be detected at the slot level.

### 7.4 Conflict Representation (Transparency)

Every Conflict, whether resolved or not, is represented with:

| Element | Content |
|---|---|
| **Participants** | The Candidate(s) and Slot(s) involved |
| **Constraint** | The Blueprint constraint at issue (named, not vague) |
| **Type** | Hard / Soft / Dependency / Mutual Exclusion |
| **Scope** | Within-set / Cross-set / Within-run |
| **Resolution** | How (or whether) the Conflict was resolved; if unresolved, why |
| **Evidence** | The signals and Slot state that produced the Conflict |

Unresolved Conflicts become **shortfalls** in the AllocatedCandidateSet (§12.4) — the Reviewer sees them and decides how to handle them.

### 7.5 What the Conflict Model Does NOT Do

- ❌ Does not **resolve** Conflicts (that's the Solver's algorithmic job).
- ❌ Does not **silently drop** Candidates implicated in Conflicts (Maximum Recall — the Candidate is flagged, not discarded).
- ❌ Does not **invent** Conflict types outside §7.2 (vocabulary is fixed at v1.0).
- ❌ Does not **upgrade** Soft Conflicts to Hard or vice versa (the Blueprint's enforcement levels are authoritative — Integration Spec §4.3).

---

## 8. Reservation Model

Reservations are the Solver's mechanism for tentative placement during search. The Reservation Model defines what a Reservation *is* — not the strategy for when to make or release them (which is the Solver's algorithmic concern).

### 8.1 Reservation

**Definition:** A temporary hold on a Slot for a Candidate, during solving. A Reservation says "the Solver is tentatively considering this Candidate for this slot; do not allocate this slot to another Candidate while this Reservation holds."

**Properties:**
- Has a **holder** (the reserved Candidate).
- Has a **target Slot** (the reserved Slot).
- Has a **lifetime** (born on reservation; ended on promotion to Assignment or on Release).
- Has a **priority** (when multiple Reservations could conflict — e.g. two Candidates reserved for the same Slot — priority determines which holds).
- Is **internal to the Solver run** — Reservations do not appear in the AllocatedCandidateSet, only their outcomes (Assignments or Releases) do.

### 8.2 Temporary Allocation

A Reservation is a **temporary allocation** — it has the structural form of an Assignment (Candidate bound to Slot) but not the commitment. This distinction matters because:

- The Solver may Reserve many Candidates in parallel branches of a search.
- Only one Reservation per Slot can be promoted to Assignment.
- The audit trail records *which* Reservations were made and released — for transparency.

### 8.3 Priority

When multiple Candidates could be Reserved for the same Slot (or when a Reservation would Conflict with another), priority governs which holds. Priority is **derived from the RankedCandidateSet** — higher-ranked Candidates reserve with higher priority. This is the seam where Ranking's output informs Allocation's structure: priority is *inherited* from Ranking, not *computed* by Allocation.

### 8.4 Reservation Lifetime

A Reservation's lifetime is bounded by the Solver run:

- **Birth:** the Solver makes a Reservation during search.
- **Promotion:** the Reservation is confirmed as an Assignment.
- **Release:** the Reservation is undone (the Solver backtracks, or a Conflict forces release).
- **Termination:** at Solver run end, all Reservations have been either Promoted or Released. No Reservation survives the run.

### 8.5 Reservation Ownership

| Aspect | Owner |
|---|---|
| Reservation *mechanism* (what a Reservation is) | Allocation Model (this spec) |
| Reservation *strategy* (when to make/release) | Constraint Solver (later session) |
| Reservation *state* (runtime tracking) | Constraint Solver |
| Reservation *audit record* (in the output) | Allocation Model (recorded for transparency) |

### 8.6 Release

**Definition:** The act of ending a Reservation or Assignment, returning the Slot to Open (or removing the Candidate).

**Properties:**
- Is **explicit** — never silent.
- Records **what was released** and **why** (backtracking, Conflict, Reviewer override).
- Is the only way a Slot returns from Reserved/Allocated to Open within a Solver run.

### 8.7 What the Reservation Model Does NOT Specify

- ❌ The **strategy** for when to Reserve (Solver algorithm).
- ❌ The **data structure** for tracking Reservations (implementation).
- ❌ The **concurrency model** for parallel Reservations (Solver implementation).

---

## 9. Replacement Model

Replacements happen during solving (the Solver backtracks and re-plans) and during review (the Reviewer overrides). The Replacement Model defines what Replacement *means* and how it is *recorded* — not the strategy for when to perform them.

### 9.1 Replacement

**Definition:** Removing an Assigned or Reserved Candidate from a Slot and placing a different Candidate there (or leaving the Slot Open). See §4.6.

**Properties:**
- Records **previous Candidate**, **new Candidate** (or none), **Slot**, **reason**.
- Is **atomic** — the Slot never appears in an inconsistent state (it moves directly from one occupant to the next).
- Composes into **Replacement History** for the Slot.

### 9.2 Swap

**Definition:** A paired Replacement — two Candidates exchange Slots atomically. See §4.7.

**Properties:**
- Useful when both Candidates are already placed and exchanging them resolves a Conflict.
- Is a single atomic operation (both Replacements succeed or both fail).
- Carries reasoning for both sides of the exchange.

### 9.3 Candidate Exchange

**Definition:** A generalization of Swap where the exchanged Candidates may come from different Allocation Groups (e.g. cross-Set exchanges). Candidate Exchange is the most general form of multi-Candidate rearrangement.

**Properties:**
- Generalizes Swap to N Candidates across M Slots.
- Each constituent Replacement carries its own reasoning.
- Atomicity is at the exchange level (all or none).

### 9.4 Rollback

**Definition:** Restoring the Allocation State to a previous snapshot. Rollback is the Solver's mechanism for undoing a series of placements when a branch of search proves infeasible.

**Properties:**
- Restores Slot states, Reservations, and Assignments to a recorded snapshot.
- Is **transparent in the audit trail** (rolled-back placements appear in history with their outcome).
- Is **internal to the Solver run** — the AllocatedCandidateSet records only the final state, but the audit trail preserves the rollback history.

### 9.5 Recovery

**Definition:** The Solver's process of finding a feasible Allocation after a Conflict or Rollback. Recovery may involve Replacements, Swaps, Candidate Exchanges, or re-reservation of different Candidates.

**Properties:**
- Recovery is the Solver's algorithmic concern — this spec does not specify *how* recovery proceeds.
- The Allocation Model specifies only that recovery is **transparent** (every recovery step is recorded) and **deterministic** (same inputs → same recovery path).

### 9.6 State Restoration

**Definition:** The act of restoring a specific Allocation State — either as a Rollback target or as a Reviewer's "undo" action.

**Properties:**
- Restores all Slots, Reservations, and Assignments to the recorded state.
- Is **explicit** — never implicit.
- Carries reasoning (why the restoration occurred).

### 9.7 What the Replacement Model Does NOT Specify

- ❌ The **strategy** for when to Replace vs. Backtrack vs. continue (Solver algorithm).
- ❌ The **optimization** of Replacement choices (Solver heuristic).
- ❌ The **data structures** for tracking Replacement History (implementation).

---

## 10. Allocation Transparency

### 10.1 The Transparency Contract

Every allocation — every Assignment, every Replacement, every Conflict resolution — must be **fully explainable**. The model forbids opaque allocation: a Reviewer must be able to trace any placement to its reasoning, and any conflict to its resolution or non-resolution.

### 10.2 What Every Allocation Explains

| Element | Content |
|---|---|
| **Why Candidate occupies Slot** | The reasoning: Score (inherited from Ranking), constraint satisfaction, priority that led to placement. |
| **Reservation History** | Which Candidates were Reserved for this Slot, in what order, and which were Released (and why). |
| **Replacement History** | If the final Candidate replaced another, the previous Candidate and the reason for Replacement. |
| **Conflict History** | Which Conflicts arose involving this Slot/Candidate, and how (or whether) each was resolved. |
| **Ownership** | Which module/user made each placement decision (Solver, Reviewer-with-override). |
| **Audit Trail** | Full reproducible trace from RankedCandidateSet → Allocation decisions → Final placement. |
| **Explainability** | A rendering in terms a Human Reviewer can act on. |

### 10.3 Why Transparency Is Non-Negotiable

Three reasons (mirroring Scoring Model §8.2 and Candidate Ranking §9.5):

1. **Human Authority.** A Reviewer cannot evaluate an allocation they cannot understand. Opaque allocation silently displaces the Human.
2. **Auditability.** A published exam's composition must trace back to the allocation decisions that produced it. When a stakeholder asks "why is Q-000123 in Set 3?", the answer must be fully reconstructable.
3. **Trust calibration.** Allocation is the Engine's most structural stage. Mistakes here propagate silently into published exams. Transparency is the only safeguard.

### 10.4 Layered Transparency

Inheriting Scoring Model §8.4 and Candidate Ranking §9.4: transparency is **layered**, not verbose by default.

- **Always-present:** final placement, placement reasoning, unresolved Conflicts, Reviewer overrides.
- **On-demand:** full Reservation History, full Replacement History, full Conflict resolution trace, Solver backtracking details.

This keeps the Review Workbench tractable while preserving full auditability.

### 10.5 Audit Trail Integrity

The audit trail is **reproducible**: given the same RankedCandidateSet, the same Allocation Model version, and the same Solver version, the trail can be re-derived exactly. This is the operational form of "Maximum Traceability" (Architecture Principle).

---

## 11. Data Contracts

The conceptual contracts of the Allocation Model. These are **vocabulary, not schemas** — implementations choose shapes, but the conceptual elements are fixed here.

### 11.1 Allocation

| Aspect | Definition |
|---|---|
| **What it is** | The structural placement of a Candidate into a Slot |
| **Owns** | One (Candidate, Slot) placement, with state and reasoning |
| **Carries** | State, Assignment reasoning, Reservation/Replacement/Conflict history, Ownership |
| **Does not carry** | Selection authority (the Reviewer has that) |

### 11.2 Assignment

| Aspect | Definition |
|---|---|
| **What it is** | A confirmed binding of a Candidate to a Slot |
| **Owns** | One confirmed placement |
| **Carries** | Candidate, Slot, reasoning, timestamp |
| **Does not carry** | Tentativeness (that's Reservation) |

### 11.3 Allocation State

| Aspect | Definition |
|---|---|
| **What it is** | The complete snapshot of all Allocation Units at a moment |
| **Owns** | Runtime state during solving |
| **Carries** | All Slots, occupancy, Reservations, Assignments, current Conflicts |
| **Does not carry** | Output authority (only the *final* state produces the AllocatedCandidateSet) |

### 11.4 Conflict

| Aspect | Definition |
|---|---|
| **What it is** | A condition where placement would violate a constraint |
| **Owns** | One constraint-violation condition |
| **Carries** | Participants, constraint reference, type, scope, resolution status, evidence |
| **Does not carry** | Resolution strategy (that's the Solver) |

### 11.5 Reservation

| Aspect | Definition |
|---|---|
| **What it is** | A temporary hold on a Slot for a Candidate during solving |
| **Owns** | One tentative placement |
| **Carries** | Holder, target Slot, priority, lifetime, outcome (Promoted/Released) |
| **Does not carry** | Commitment (that's Assignment) |

### 11.6 Replacement

| Aspect | Definition |
|---|---|
| **What it is** | Removing one Candidate from a Slot and placing another |
| **Owns** | One Slot-state transition |
| **Carries** | Previous Candidate, new Candidate, Slot, reason, owner (Solver/Reviewer) |
| **Does not carry** | Search strategy |

### 11.7 Allocation Trace

| Aspect | Definition |
|---|---|
| **What it is** | The complete audit trail of an Allocation from RankedCandidateSet to final placement |
| **Owns** | Reproducible explainability |
| **Carries** | All Reservations, Assignments, Replacements, Swaps, Conflicts, Releases, in order |
| **Does not carry** | Solver implementation details (those are not contractual) |

### 11.8 Relationships Among Contracts

```
RankedCandidateSet
        │
        ▼
Allocation Unit ◄──┬── Reservation (tentative)
                   ├── Assignment (confirmed)
                   ├── Conflict (block/warn)
                   ├── Replacement (transition)
                   └── Release (undo)
        │
        ▼
Allocation State (runtime snapshot)
        │
        ▼ (final, post-Solver)
AllocatedCandidateSet
        │
        ▼ (post-Review)
Approved Allocation ──► Draft Builder
```

Every Allocation Unit traces to the RankedCandidateSet; every output traces to the Allocation Units that produced it.

---

## 12. Failure Handling

Allocation's failure posture inherits the Engine-wide discipline (Engine Foundation §7): Fail Fast, Fail Loud, Remain Deterministic. Allocation adds a specific rule: **never silently weaken constraints to produce a fake-feasible allocation.**

### 12.1 Failure Modes

| Failure | What It Means | Allocation Behavior |
|---|---|---|
| **Duplicate Allocation** | A Candidate is Assigned to two Slots simultaneously | Internal invariant violation. Fatal. Halt; identify the duplicate. |
| **Impossible Assignment** | No feasible Candidate exists for a Slot (every Candidate either doesn't fit or creates an unresolvable Hard Conflict) | Mark the Slot `Rejected`. Record the shortfall explicitly. Do not silently substitute an infeasible Candidate. |
| **Missing Slot** | A Blueprint Slot referenced by the RankedCandidateSet doesn't exist in the AssemblyRequest | Fatal. Halt; identify the missing Slot. (Indicates upstream bug.) |
| **Conflicting Reservation** | Two Reservations hold the same Slot with equal priority | Resolve by deterministic tie-break (lower Candidate Code wins, per Candidate Ranking §6.3). Record the resolution. |
| **Released Lock** | An attempt is made to modify a Locked Allocation during the Solver run | Fatal. Locks are terminal within the run; only Reviewer overrides can change them post-Lock. |
| **Invalid Transition** | An Allocation Unit attempts a state transition not allowed by §5.2 | Fatal. Halt; identify the invalid transition. |
| **Version Mismatch** | The RankedCandidateSet's expected Allocation Model version is unsupported | Fatal. Halt; identify the unsupported version. Never silently downgrade/upgrade. |
| **Reviewer Override Creates Hard Conflict** | A Reviewer force-includes a Candidate that violates a Hard Constraint | Permitted only with explicit acknowledgement. The Conflict is recorded and surfaced loudly; the Reviewer's acknowledgement is part of the audit trail. |

### 12.2 The "Never Fake Feasibility" Rule

The single most important allocation-failure rule. When full satisfaction is impossible (e.g. not enough Candidates to fill all Slots without violating Hard Constraints), the Allocation Model **does not**:

- Silently drop a Hard Constraint to make the numbers work.
- Treat a Soft Conflict as resolved to free up a Candidate.
- Over-fill a Slot beyond its capacity.
- Place a Candidate that violates a Hard Constraint without explicit acknowledgement.

Instead, it produces a **partial allocation** with explicit shortfalls (Rejected Slots, unresolved Conflicts) and surfaces them to the Reviewer. This is the architectural answer to Blueprint infeasibility: the Engine is honest about what it cannot do, and the Human decides how to handle it (edit the Blueprint, add Questions to the Bank, accept the gap).

### 12.3 Allocation Halts On...

Allocation is more halt-prone than Scoring (which never halts on missing data — Scoring Model §11.3) because allocation deals with **structural invariants** whose violation would corrupt the output:

- Internal invariant violations (Duplicate Allocation, Invalid Transition, Released Lock): Fatal.
- Version mismatches: Fatal.
- Missing Slots: Fatal.

Allocation **does not halt** on:
- Impossible Assignments (the Slot is marked Rejected; the run continues with other Slots).
- Soft Conflicts (recorded; the run continues).
- Unresolved Conflicts (recorded as shortfalls; the run continues).

The distinction: structural corruption halts; infeasibility is recorded and surfaced.

### 12.4 Partial Allocations

A partial allocation is one where some Slots are Rejected (cannot be filled) or some Conflicts are unresolved. Partial allocations are **valid outputs**, not failures — they represent the Engine's honest best effort. The AllocatedCandidateSet carries:

- The placed Assignments.
- The Rejected Slots (with reasons).
- The unresolved Conflicts (with participants and constraints).
- A summary shortfall report.

The Reviewer decides whether to accept the partial allocation, edit it, or send it back for re-solving with adjusted inputs.

### 12.5 Every Failure Must

- **Fail Fast:** halt at the first structural corruption.
- **Fail Loud:** structured error with category, location (Slot, Candidate, transition), severity, explanation, recommendation.
- **Remain Deterministic:** same RankedCandidateSet → same failure.
- **Never fake feasibility:** the worst allocation failure mode is silently weakening constraints to claim success.

---

## 13. Token Efficiency

### 13.1 The Flow

```
RankedCandidateSet     (Blueprint-bounded — per-slot orderings + evaluations)
        │
        ▼
Allocation Model       (runtime vocabulary + state — internal to Solver)
        │
        ▼
AllocatedCandidateSet (Blueprint-bounded — one placement per Slot + audit summary)
```

### 13.2 Token Growth and Reduction

| Transformation | Size Change | Why |
|---|---|---|
| RankedCandidateSet → Allocation State (internal) | Growth (bounded) | Reservation tracking, Conflict detection, Replacement history all add metadata during solving. Bounded by Slots × Candidates × history depth. |
| Allocation State → AllocatedCandidateSet | **Large reduction** | The output carries one placement per Slot plus a *summary* audit trail. Internal search state (explored branches, rejected Reservations) is collapsed into the final outcome + summary. |

**Net effect:** the AllocatedCandidateSet is smaller than the RankedCandidateSet in Candidate-multiplicity (many Candidates collapse to one placement per Slot) but carries richer per-placement metadata (audit summary). Size remains **bounded by Blueprint structure** — never by Bank size, and not by the size of the Solver's internal search.

### 13.3 Allocation Metadata

The AllocatedCandidateSet's metadata per placement includes:

- The assigned Candidate.
- Placement reasoning (inherited Score, ordering reason, constraint satisfaction).
- Conflict summary (resolved and unresolved Conflicts involving this placement).
- Replacement summary (if this Candidate replaced another).
- Reviewer overrides (if any).

This metadata is **bounded by Slots** (one summary per placed Slot), not by search depth. Even if the Solver explored millions of states internally, the output's metadata is O(Slots).

### 13.4 Scalability

The Allocation Model scales with:

- **Slots** (Blueprint distribution cells).
- **Candidates per Slot** (from the RankedCandidateSet).
- **Constraint count** (Blueprint rules).

It does **not** scale with:

- **Bank size** (Allocation never touches the Bank).
- **Solver search depth** (internal state is not in the output).

For Blueprint v3.0 (5 Sets × 100 Slots × ~5 Candidates per Slot on average), the AllocatedCandidateSet is bounded by ~500 placements with per-placement metadata — small and tractable, regardless of how hard the Solver worked internally.

### 13.5 Memory

Internal Solver memory (Allocation State snapshots, Reservation tracking, search trees) is an **implementation concern**, not an architectural one. The Allocation Model specifies only that:

- Internal state is **bounded by the Solver run** (released at termination).
- Internal state does **not escape** to the AllocatedCandidateSet.
- Memory usage is **transparent to the output contract** — the AllocatedCandidateSet is the same size regardless of internal memory pressure.

### 13.6 What Token Efficiency Does NOT Mean

- ❌ Does not mean **dropping the audit trail** (transparency is non-negotiable).
- ❌ Does not mean **hiding conflicts** (unresolved Conflicts must surface).
- ❌ Does not mean **collapsing the Allocation Model's vocabulary** (the language is fixed).

---

## 14. Layer Boundaries

### 14.1 Allocation Model (as consumed and spoken by the Constraint Solver)

- **CAN:**
  - Consume the RankedCandidateSet (read-only).
  - Instantiate Runtime Slots from Blueprint Slots.
  - Track Allocation State internally during solving.
  - Detect and classify Conflicts.
  - Make and release Reservations.
  - Perform Replacements, Swaps, Candidate Exchanges.
  - Produce Assignments.
  - Emit an AllocatedCandidateSet.
- **CANNOT:**
  - Read Question content.
  - Query the Bank.
  - Re-rank or re-score Candidates.
  - Modify the RankedCandidateSet.
  - Modify the AssemblyRequest or Blueprint.
  - Publish or produce a Draft.
  - Invent Allocation concepts outside the v1.0 vocabulary.
- **MUST NEVER:**
  - Silently weaken constraints to fake feasibility.
  - Silently drop a Candidate implicated in a Conflict.
  - Hide a Conflict or Reservation from the audit trail.
  - Allow an invalid state transition.
  - Allow a Locked Allocation to be modified within the run.
  - Couple allocation logic to SQL or UI.
  - Allow Allocation to mean "selection" or "publishing."
- **MUST ALWAYS:**
  - Be deterministic in its output contract (same RankedCandidateSet → same AllocatedCandidateSet, given Solver version).
  - Produce fully transparent allocations (placement reasoning + audit trail).
  - Surface shortfalls and unresolved Conflicts explicitly.
  - Honor Maximum Recall (mark Rejected, don't silently drop).
  - Fail fast, fail loud, remain deterministic on structural failures.

### 14.2 Relationship with Adjacent Modules

| Boundary | Allocation's Side | Other Side |
|---|---|---|
| **Allocation ↔ Candidate Ranking** | Consumes RankedCandidateSet (read-only); inherits priority from rankings | Ranking produces it; Allocation never modifies Scores or orderings |
| **Allocation ↔ Constraint Solver** | The Solver is the runtime that speaks the Allocation Model | Allocation Model fixes the vocabulary; Solver fixes the algorithms |
| **Allocation ↔ Review Workbench** | Emits AllocatedCandidateSet | Reviewer consumes; may override (force-include/exclude/replace); overrides are inputs to re-allocation |
| **Allocation ↔ Draft Builder** | No direct relationship | Draft Builder consumes the Reviewer's approved allocation, not the AllocatedCandidateSet directly |
| **Allocation ↔ Human Reviewer** | Allocation is advisory; Reviewer is authority | Reviewer may accept, edit, or reject any allocation; the Engine never overrides the Reviewer |

---

## 15. Anti-Patterns

Explicitly prohibited. Any future change must be evaluated against this list.

| # | Anti-Pattern | Why Prohibited |
|---|---|---|
| AP-1 | **Ranking allocating** | Violates single-responsibility (Candidate Ranking §12). Ranking orders; Allocation places. |
| AP-2 | **Solver redefining Slot** | Slots are defined by the Blueprint (AssemblyRequest); the Solver instantiates, never redefines. |
| AP-3 | **Review modifying Allocation silently** | Reviewer overrides must be explicit and auditable. |
| AP-4 | **Hidden Reservation** | Reservations must appear in the audit trail (even though they don't escape to the output). |
| AP-5 | **Hidden Conflict** | Conflicts must be visible — resolved ones in history, unresolved ones as shortfalls. |
| AP-6 | **Magic Assignment** | An Assignment without reasoning is non-conformant (§10). |
| AP-7 | **Implicit Replacement** | Replacements must be explicit (previous, new, reason). |
| AP-8 | **Opaque Allocation** | An Allocation without an audit trail is non-conformant. |
| AP-9 | **Silent constraint weakening** | The worst failure mode (§12.2); violates Feasibility Over Optimality. |
| AP-10 | **Treating Soft Conflict as resolved** | Soft Conflicts surface as warnings; they are not silently resolved. |
| AP-11 | **Internal state escaping** | Allocation State, Reservations, search trees are internal; only the final allocation escapes. |
| AP-12 | **Locking then modifying within the run** | Locks are terminal within the Solver run; only Reviewer overrides can change them. |
| AP-13 | **Cross-implementation vocabulary drift** | The v1.0 vocabulary is fixed; new concepts require an Allocation Model version bump. |
| AP-14 | **Allocation reading content** | Violates the content boundary (Scoring Model §12.2). |
| AP-15 | **Allocation querying the Bank** | Allocation consumes only the RankedCandidateSet. |
| AP-16 | **Allocation producing a Draft** | Draft production is the Draft Builder's job; Allocation produces an AllocatedCandidateSet only. |

---

## 16. Future Extensibility

The Allocation Model is designed to grow without rupture. Future capabilities enter as additive extensions, never as redesigns.

### 16.1 Collaborative Review

Multiple Reviewers working on the same Allocation concurrently would require:
- A **concurrency model** for Reviewer overrides (out of scope for v1.0; v1.0 assumes single-Reviewer).
- **Conflict detection between Reviewer actions** (e.g. two Reviewers force-include mutually exclusive Candidates).

The Allocation Model's vocabulary (Override, Conflict, Replacement) absorbs collaborative review without structural change — the concurrency model is additive.

### 16.2 Multi-user Allocation

If multiple Solvers or Allocators work in parallel (e.g. one per Set), the Allocation Group concept (§4.9) provides the seam: each Allocator owns an Allocation Group, and cross-Group conflicts are detected at the Group level. The vocabulary is unchanged; the execution model extends.

### 16.3 AI-assisted Allocation

If an AI assists the Solver (e.g. suggesting promising placements), the AI's suggestions enter as **proposed Reservations** — the Solver still decides whether to promote them. The Allocation Model is unchanged; the AI is a Reservation source, not an Allocator. This preserves Human Authority (the Reviewer still approves the final allocation).

### 16.4 Distributed Allocation

If Allocation is distributed across nodes (for very large Blueprints), the Allocation Group concept (§4.9) again provides the seam: each node owns an Allocation Group, and cross-Group coordination is handled at the Group level. The vocabulary and contracts are unchanged.

### 16.5 Parallel Solver

Multiple Solver branches exploring the search space in parallel would produce multiple candidate Allocations; a merge step picks one. The Allocation Model accommodates this by treating each branch's output as a candidate AllocatedCandidateSet, with the merge step producing the final one. The vocabulary is unchanged.

### 16.6 Adaptive Allocation

If future Profiles require Allocation to adapt to learner history (e.g. avoiding Questions the learner has seen), the adaptation enters as **additional constraints** in the AssemblyRequest, which the Allocation Model honors without structural change.

### 16.7 Versioning the Allocation Model

The Allocation Model is versioned (currently v1.0). A version bump is required when:
- The vocabulary changes (new Allocation concepts, new Conflict types, new states).
- The state-transition rules change.
- The transparency contract changes.

A version bump does **not** affect:
- The RankedCandidateSet (different contract, different owner).
- The Scoring Model (different contract, different owner).
- The Engine Foundation (immutable).

The Solver detects the Allocation Model version and either implements it or fails loud — never silently downgrades/upgrades.

### 16.8 What Does NOT Change

- **Allocation ≠ Selection** (§2.1) — the architectural invariant.
- **Only the Solver allocates** (§3.2) — the ownership invariant.
- **The content boundary** (Scoring Model §12.2) — the scalability invariant.
- **Transparency is non-negotiable** (§10) — the auditability invariant.
- **Never fake feasibility** (§12.2) — the honesty invariant.
- **Internal state does not escape** (§3.4) — the contract-determinism invariant.

---

## Appendix A — Glossary

| Term | Definition |
|---|---|
| **Slot** | A position in the Blueprint that can hold one Question. |
| **Blueprint Slot** | A slot as specified by the Blueprint (immutable). |
| **Runtime Slot** | A slot as instantiated during solving (mutable, internal). |
| **Candidate Slot** | The eligibility relationship between a Candidate and a Slot. |
| **Assignment Slot** | A slot with a confirmed placement (output). |
| **Assignment** | A confirmed binding of a Candidate to a Slot. |
| **Reservation** | A temporary hold on a Slot for a Candidate, during solving. |
| **Occupancy** | The current state of a Slot (which Candidate, if any, holds it). |
| **Conflict** | A condition where placement would violate a constraint. |
| **Hard Conflict** | Blocks placement. |
| **Soft Conflict** | Warns but does not block. |
| **Dependency** | A placement that depends on another. |
| **Mutual Exclusion** | Two Candidates that cannot both be placed. |
| **Replacement** | Removing one Candidate and placing another in a Slot. |
| **Swap** | A paired Replacement (two Candidates exchange Slots). |
| **Candidate Exchange** | A generalized N-Candidate, M-Slot rearrangement. |
| **Rollback** | Restoring Allocation State to a previous snapshot. |
| **Recovery** | The Solver's process of finding a feasible Allocation after a Conflict. |
| **Allocation Unit** | One (Candidate, Slot) pair in a specific state. |
| **Allocation Group** | A collection of Allocation Units reasoned about jointly (e.g. a Set). |
| **Allocation State** | The complete runtime snapshot of all Allocation Units. |
| **Lock** | A committed Allocation (terminal within the Solver run). |
| **Release** | The act of ending a Reservation or Assignment. |
| **AllocatedCandidateSet** | The Solver's output contract: one placement per Slot + audit summary. |
| **Shortfall** | An explicit unmet Blueprint requirement (e.g. a Rejected Slot). |

---

## Appendix B — Boundary Assertions

The non-negotiable contracts of this specification.

1. **Allocation is structural placement, not selection.** A feasible mapping, not a final Draft.
2. **Only the Constraint Solver allocates.** No other module places Candidates into Slots.
3. **Allocation consumes the RankedCandidateSet read-only.** It never re-ranks or re-scores.
4. **Allocation never reads Question content.** Metadata only.
5. **Allocation never queries the Bank.** RankedCandidateSet only.
6. **Internal state does not escape.** Reservations, Allocation States, and search trees are internal; only the final allocation appears in the AllocatedCandidateSet.
7. **The output contract is deterministic.** Same RankedCandidateSet → same AllocatedCandidateSet, given Solver version.
8. **Every placement is explainable.** Opaque allocations are non-conformant.
9. **Every Conflict is visible.** Resolved Conflicts in history; unresolved Conflicts as shortfalls.
10. **Allocation never fakes feasibility.** Partial allocations with explicit shortfalls are preferred over fake-feasible allocations.
11. **Allocation is deterministic, transparent, auditable, and LLM-free.**
12. **The Human is the final authority.** Every allocation is overridable; the Engine never overrides the Reviewer.

---

## Appendix C — Provenance & Cross-References

- **Engine alignment:** Allocation is the structural-placement stage anticipated by Engine Foundation v1.0 §5.5 (Draft Builder consumes the approved allocation). The Foundation deferred the allocation language; this spec closes that deferral and closes Integration Gap IG-5 (joint-constraint satisfaction) at the *language* level — the Solver algorithm is still a future session.
- **Integration Spec alignment:** Allocation honors `run_unit = blueprint` (Integration Spec §5.1) via the Allocation Group concept (§4.9): cross-Set constraints (CR-3, L3) are first-class. Allocation carries the `AssemblyRequest`'s constraints verbatim (Integration Spec §4.3) — it never silently relaxes them.
- **Reader alignment:** No direct interaction. Allocation is three modules downstream of the Reader.
- **Candidate Generation alignment:** Allocation consumes the CandidateSet's Slot Eligibility (Candidate Generation §5.2) read-only, via the Candidate Slot perspective (§6.3).
- **Scoring Model alignment:** Allocation inherits Scores and Confidences from the RankedCandidateSet read-only. Per Scoring Model §9.2, the Solver may augment Hard Penalties for joint-constraint risk — the Allocation Model's **Conflict** concept (§7) is the vocabulary in which that augmentation is expressed (a Solver-applied Hard Conflict corresponds to a Hard Penalty).
- **Candidate Ranking alignment:** Allocation consumes the RankedCandidateSet read-only, inheriting priority (Reservation priority, §8.3) from Rankings. Allocation never modifies Scores, Confidences, or orderings (Candidate Ranking §8.3 — the no-modification rule).
- **Blueprint fidelity:** Every Blueprint v3.0 joint constraint — per-set sums, tier floors/ceilings, the anchor rule, L1 within-set uniqueness, CR-3/L3 cross-set rotation — is representable in the Conflict Model (§7). No constraint is silently dropped or relaxed.

---

*End of Sobdai Allocation Model Specification — v1.0.*

**Upstream sources (immutable):**
- Assessment Assembly Engine Foundation v1.0
- Blueprint Integration Specification v1.0
- Blueprint Reader Pipeline Architecture v1.0
- Candidate Generation Architecture v1.0
- Scoring Model Specification v1.0
- Candidate Ranking Architecture v1.0

**Next modules to specify (later sessions):**
- Constraint Solver Architecture (implements this Allocation Model; closes IG-5 at the algorithm level)
- Review Workbench Architecture (renders the AllocatedCandidateSet; captures Human overrides)
- Draft Builder Architecture (materializes approved allocation into a Draft Exam Set via existing CRUD)
