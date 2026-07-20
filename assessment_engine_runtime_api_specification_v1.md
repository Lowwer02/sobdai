# Sobdai Assessment Engine Runtime API Specification — v1.0

**Status:** Official Architecture Specification (Architecture only — no implementation, no REST, no GraphQL, no HTTP, no SQL, no code, no UI, no infrastructure, no pseudocode)
**Sources of truth (exhaustive, immutable):**
1. `assessment_assembly_engine_foundation_v1.md` — Assessment Assembly Engine Foundation v1.0
2. `blueprint_integration_specification_v1.md` — Blueprint Integration Specification v1.0
3. `blueprint_reader_pipeline_architecture_v1.md` — Blueprint Reader Pipeline Architecture v1.0
4. `candidate_generation_architecture_v1.md` — Candidate Generation Architecture v1.0
5. `scoring_model_specification_v1.md` — Scoring Model Specification v1.0
6. `candidate_ranking_architecture_v1.md` — Candidate Ranking Architecture v1.0
7. `allocation_model_specification_v1.md` — Allocation Model Specification v1.0
8. `constraint_solver_architecture_v1.md` — Constraint Solver Architecture v1.0
**Version:** 1.0
**Owner:** Chief Assessment Architect, Sobdai

> **What this document is.** This is the **public interface** of the Sobdai Assessment Engine — the single contract every Application must use and every implementation must follow. Eight internal modules (Reader, Generator, Scoring, Ranking, Allocation, Solver) have been specified in detail across eight prior documents. None of them is the public interface. Applications do not call them individually. Applications call **one thing**: the Runtime API.
>
> The Runtime API is the **encapsulation boundary** that turns eight internal module specs into one consumable service. Its job is to hide the Engine's internals behind a stable, versioned, auditable contract — and to ensure the Engine's hard-won properties (determinism, transparency, auditability, human authority, version independence) are preserved all the way to the Application Layer.
>
> **What this document is not.** Not a REST API. Not GraphQL. Not HTTP. Not a specific protocol or transport. Not SQL. Not code. Not infrastructure. The Runtime API is specified **abstractly**: as contracts (input, output, execution, status, errors, warnings, audit, metadata, versioning, traceability). How the contract is *materialized* — as a function call, RPC, message queue, or service endpoint — is an implementation concern. The spec fixes the *contract*, not the *transport*.

---

## 0. Executive Summary

The Assessment Engine is a complex eight-stage pipeline. Each stage has its own contract (`AssemblyRequest`, `CandidateSet`, `RankedCandidateSet`, `AllocatedCandidateSet`), its own vocabulary (Scoring Model, Allocation Model), and its own failure modes. Exposing any of that to Applications would couple Application code to Engine internals — making every Engine change a breaking change for every caller.

The Runtime API exists to **prevent that coupling**. It exposes exactly two contracts: an **Input Contract** (what Applications send) and an **Output Contract** (what Applications receive). Everything between them — Reader, Generator, Scoring, Ranking, Allocation, Solver — is encapsulated. Applications know they send a Blueprint reference (and execution context); they receive an Assembly Result (and audit trail). They never see the intermediate contracts.

The defining architectural property is **Single Entry Point**. There is one way into the Engine; there is one way out. This is what makes the Engine:

- **Stable.** Internal refactors (a new Solver algorithm, a Reader rewrite) don't break Application code.
- **Auditable.** Every Engine run has one input and one output, both fully traceable.
- **Versionable.** Applications negotiate a Runtime version; internal module versions are encapsulated.
- **Safe.** Applications cannot bypass validation, skip modules, or mutate Engine state.

Three relationships define the API's place:

- **Runtime API ↔ Application Layer.** The Application sends an Engine Request; the Runtime API returns an Assembly Result. The Application never touches internal modules. The Application may inspect the result's audit trail, metrics, and warnings — but cannot influence Engine execution mid-run (overrides are a separate, post-Engine concern owned by Review).
- **Runtime API ↔ Internal Modules.** The Runtime API orchestrates the eight-stage pipeline. It validates input, dispatches to each module in order, propagates failures, and assembles the output. Internal modules do not know the Runtime API exists — they consume their own contracts; the Runtime API wires them.
- **Runtime API ↔ Review / Draft Builder.** The Runtime API's job **ends at Assembly Result delivery**. Review and Draft Builder are post-Engine; they consume the Assembly Result (specifically the AllocatedCandidateSet within it) but are not part of the Runtime API. The Runtime API may be re-invoked with Reviewer Overrides (a constrained form of input) to re-run the Solver — but the override workflow itself is owned by Review, not by the Runtime API.

The Runtime API is **deterministic, synchronous-in-contract (though implementations may stream — §14.1), fully transparent, and version-negotiated**. It is the public face of the Assessment Engine.

---

## 1. Why the Runtime API Exists

### 1.1 The Problem It Solves

Without a Runtime API, every Application that wants to use the Engine would have to:

- Know the Reader's input format and call it.
- Forward the Reader's output to the Generator.
- Forward the Generator's output to Ranking.
- Forward Ranking's output to the Solver.
- Handle each module's specific failure modes.
- Track each module's version independently.

This would couple Application code to eight internal contracts. Every Engine evolution — a new Scoring Model version, a Solver rewrite, an Allocation Model extension — would be a breaking change for every Application. The Engine would be impossible to evolve without breaking its consumers.

### 1.2 What the Runtime API Provides

- **Encapsulation.** One input, one output. Internals are hidden.
- **Stability.** The Runtime contract versions independently of internal modules. Internal refactors don't break Applications.
- **Orchestration.** The Runtime API wires the pipeline; Applications don't.
- **Validation.** Input is validated before any module runs.
- **Auditability.** Every run produces a complete audit trail at the Runtime level.
- **Version negotiation.** Applications specify the Runtime version they target; the API honors it or fails loud.

### 1.3 What the Runtime API Does Not Provide

- **Final selection.** The Assembly Result is advisory; Review decides.
- **Draft production.** The Draft Builder consumes the approved allocation; the Runtime API does not build Drafts.
- **Publishing.** Publishing uses the existing Exam Set lifecycle.
- **UI.** The Runtime API is a contract, not a presentation.
- **Transport.** How the contract is materialized is implementation.

---

## 2. Runtime Philosophy

### 2.1 Why the Engine Exposes Only One Interface

Three reasons:

1. **Coupling control.** Eight internal contracts × N Applications = 8N coupling points. One Runtime contract × N Applications = N coupling points. The factor-of-8 reduction in coupling surface is the architectural payoff.
2. **Property preservation.** The Engine's hard-won properties (determinism, transparency, auditability, human authority) must hold all the way to the Application. If Applications could call internal modules directly, they could bypass validation, skip transparency, or break determinism. Single entry point makes the properties enforceable.
3. **Evolution freedom.** Internal modules can be rewritten, swapped, or reordered without breaking Applications — as long as the Runtime contract is honored. This is what makes the Engine evolvable.

### 2.2 Benefits of Encapsulation

| Benefit | How Encapsulation Provides It |
|---|---|
| **Stability** | Internal refactors don't reach Applications. |
| **Auditability** | One input, one output, one audit trail per run. |
| **Version independence** | Applications negotiate Runtime version; internal versions are encapsulated. |
| **Safety** | Applications cannot bypass validation or mutate Engine state. |
| **Testability** | The Engine can be tested as a unit (Runtime in, Runtime out). |
| **Implementation freedom** | The contract is fixed; the implementation (language, transport, algorithm) is free. |

### 2.3 Relationship with the Application Layer

The Application Layer is any consumer of the Engine: an admin tool, a batch job, a future SaaS integration. The contract is the same for all:

- The Application constructs an Engine Request (Blueprint reference + execution context).
- The Application submits it via the Runtime API.
- The Application receives an Assembly Result.
- The Application inspects the result (status, allocations, warnings, audit) and decides what to do next (route to Review, log, discard, etc.).

The Application **never** sees `AssemblyRequest` (the Reader's internal output), `CandidateSet`, `RankedCandidateSet`, or any intermediate contract. It sees only the Assembly Result, which carries a *summary view* of those internals.

### 2.4 Relationship with Internal Modules

The Runtime API orchestrates the pipeline:

```
Runtime API receives Engine Request
        │
        ▼ (validates)
        │
   ┌────┴────┐
   │ Reader  │ ── produces AssemblyRequest (internal)
   └────┬────┘
        │
   ┌────┴──────┐
   │ Generator │ ── produces CandidateSet (internal)
   └────┬──────┘
        │
   ┌────┴────┐
   │ Scoring │ (vocabulary applied by Ranking)
   └────┬────┘
        │
   ┌────┴────┐
   │ Ranking │ ── produces RankedCandidateSet (internal)
   └────┬────┘
        │
   ┌────┴──────┐
   │ Allocation│ (vocabulary spoken by Solver)
   └────┬──────┘
        │
   ┌────┴────┐
   │  Solver │ ── produces AllocatedCandidateSet (internal)
   └────┬────┘
        │
        ▼
Runtime API assembles Assembly Result (public output)
```

Internal modules do not know the Runtime API exists. They consume their own contracts and emit their own outputs. The Runtime API wires them — it is the only component that knows the full pipeline shape.

### 2.5 The Orchestration Asymmetry

The Runtime API is the **only** component permitted to:
- Call internal modules directly.
- Propagate failures between modules.
- Assemble the public output from internal contracts.

Internal modules are **not** permitted to:
- Know about the Runtime API.
- Call each other (each consumes only its direct upstream contract).
- Produce public output.

This asymmetry is what makes encapsulation enforceable. If internal modules could call each other or produce public output, the Runtime API would be just one of several entry points — defeating its purpose.

---

## 3. Runtime Lifecycle

The lifecycle of a single Engine run, as seen from the Runtime API.

### 3.1 The Lifecycle Stages

```
Application Request       ── Application submits Engine Request
        │
        ▼
Validation                ── Runtime API validates input (format, version, references)
        │
        ▼
Reader                    ── Blueprint → AssemblyRequest (internal)
        │
        ▼
Generator                 ── AssemblyRequest → CandidateSet (internal)
        │
        ▼
Scoring                   ── (vocabulary applied by Ranking; no separate stage output)
        │
        ▼
Ranking                   ── CandidateSet → RankedCandidateSet (internal)
        │
        ▼
Allocation                ── (vocabulary spoken by Solver; no separate stage output)
        │
        ▼
Constraint Solver         ── RankedCandidateSet → AllocatedCandidateSet (internal)
        │
        ▼
Assembly Result           ── Runtime API assembles public output
        │
        ▼
Returned to Application
```

### 3.2 Stage Contracts (Runtime View)

| Stage | Input | Output | Ownership | Failure Handling |
|---|---|---|---|---|
| Application Request | Engine Request (Blueprint ref + context) | Validated request | Application (constructs), Runtime API (receives) | Invalid → Invalid state (§6) |
| Validation | Engine Request | Validated request or rejection | Runtime API | Failure → Invalid state; no module runs |
| Reader | Blueprint | AssemblyRequest (internal) | Reader | Fatal → Failed state; halt pipeline |
| Generator | AssemblyRequest | CandidateSet (internal) | Generator | Fatal → Failed; Blocking → Completed With Warnings |
| Scoring | (CandidateSet) | (vocabulary applied by Ranking) | (Ranking applies) | Per Scoring Model §11 |
| Ranking | CandidateSet | RankedCandidateSet (internal) | Ranking | Fatal → Failed |
| Allocation | (RankedCandidateSet) | (vocabulary spoken by Solver) | (Solver speaks) | Per Allocation Model §12 |
| Constraint Solver | RankedCandidateSet | AllocatedCandidateSet (internal) | Solver | Fatal → Failed; shortfalls → Completed With Warnings |
| Assembly Result | All internal outputs | Assembly Result (public) | Runtime API | Assembles per status |

### 3.3 Failure Propagation

The Runtime API propagates failures per Engine-wide discipline (Engine Foundation §7):

- **Fatal** in any module → pipeline halts → Assembly Result has `Failed` status, with the failure details in the audit trail.
- **Blocking** in any module → pipeline continues if possible → Assembly Result has `Completed With Warnings` status, with the blocking issues in warnings.
- **Warnings** → pipeline continues → Assembly Result has `Completed` or `Completed With Warnings` status, with warnings surfaced.

The Runtime API **never** silently swallows a failure. Every module's failure is reflected in the Assembly Result's status and audit trail.

### 3.4 Idempotency

The Runtime API is **idempotent given inputs**: the same Engine Request, submitted multiple times, produces the same Assembly Result (per Engine-wide Determinism). Applications may safely retry on transient failures without worrying about inconsistency.

---

## 4. Engine Input Contract

The conceptual elements of what an Application sends. No schemas — vocabulary only.

### 4.1 Assembly Request (External)

**Definition:** The Application's specification of what to assemble. Distinguished from the internal `AssemblyRequest` (Integration Spec §4, one word) which is the Reader's output.

| Property | Content |
|---|---|
| **Blueprint reference** | Which Blueprint to assemble against (id + version). The Application does not send the Blueprint content; it sends a reference. |
| **Profile** | Which Assessment Profile (e.g. `simulation`). v1.0: `simulation` only. |
| **Run unit declaration** | Acknowledgement of the run unit (Blueprint = multi-set; Integration Spec §5.1). |

**Reconciliation note:** The external "Assembly Request" (two words, this section) and the internal "`AssemblyRequest`" (one word, Integration Spec §4) are different artifacts at different layers. Applications specify the external one; the Reader produces the internal one from the Blueprint. Applications never see the internal `AssemblyRequest`. Both terms are retained because both are authoritative; disambiguation is by context (external = Application input; internal = Reader output).

### 4.2 Runtime Context

**Definition:** Information about the run environment that does not affect the Assembly Result's *content* but may affect its *metadata*.

| Property | Content |
|---|---|
| **Requestor identity** | Who submitted the request (for audit). |
| **Submission timestamp** | When the request was submitted (for audit). |
| **Correlation id** | Optional id for cross-system tracing. |

Runtime Context **never** influences the deterministic output — the same Blueprint + Options always produces the same allocations, regardless of who requested it or when. Context is metadata, not input-to-output.

### 4.3 Execution Options

**Definition:** Knobs the Application may set to influence *how* the Engine runs (not *what* it produces).

| Property | Content |
|---|---|
| **Over-fetch factor** | How much Ranking/Solver headroom to allow (bounded). |
| **Performance budget** | Optional time/resource budget (the Engine may produce a partial result if budget is exhausted — surfaced honestly). |
| **Parallelism hint** | Optional hint about preferred parallelism (implementation may ignore). |
| **Audit verbosity** | Always-present vs. on-demand audit detail in the output. |

Execution Options may affect *performance* and *completeness* (e.g. a tight budget may produce a partial allocation) but never *correctness* — the allocations produced are always feasible-or-honestly-partial.

### 4.4 Runtime Metadata

**Definition:** Metadata the Runtime API attaches to the run for traceability.

| Property | Content |
|---|---|
| **Runtime API version** | The version of this spec the Application targets. |
| **Engine version (encapsulated)** | The Engine's internal version (negotiated, not chosen by Application). |
| **Run id** | A unique id for this run, generated by the Runtime API. |

### 4.5 Version Information

**Definition:** The Application's declared compatibility target.

| Property | Content |
|---|---|
| **Targeted Runtime version** | The Runtime API version the Application was built against. |
| **Minimum Runtime version** | Optional floor; the API rejects if its version is below this. |

Version negotiation happens at Validation (§3.2). Mismatch → Invalid state.

### 4.6 Trace Context

**Definition:** Optional distributed-tracing context (correlation ids, parent span ids) for cross-system observability. The Runtime API carries this through to the audit trail for end-to-end traceability.

### 4.7 What the Input Contract Does NOT Carry

- ❌ **Blueprint content.** The Application sends a reference, not the document. The Reader loads it.
- ❌ **Question Bank data.** The Engine reads the Bank internally.
- ❌ **Internal module versions.** Encapsulated.
- ❌ **Selection decisions.** Review's job.
- ❌ **Content.** No Question bodies, choices, explanations.

---

## 5. Engine Output Contract

The conceptual elements of what the Application receives.

### 5.1 Assembly Result

**Definition:** The public output of an Engine run. The single object the Application receives in response to an Engine Request.

| Property | Content |
|---|---|
| **Run id** | Matches the input. |
| **Status** | Execution state (§6). |
| **AllocatedCandidateSet (summary view)** | The placements, Rejected Slots, shortfalls — see §5.5. |
| **Warnings** | Non-blocking issues (§8). |
| **Errors** | Failure details if status is Failed (§7). |
| **Audit Trail** | Full execution trace (§9). |
| **Metrics** | Execution summary (§11). |
| **Runtime Metadata** | Versions, timestamps (§5.8). |
| **Execution Summary** | High-level narrative of what happened. |

### 5.2 CandidateSet (Summary View)

The Application sees a **summary view** of the internal CandidateSet — not the internal contract. The summary includes:

- Total Candidates considered.
- Per-axis shortfall summary (carried from the Generator).
- Coverage satisfaction summary.

The Application does **not** see the full per-Candidate metadata. That's internal.

### 5.3 RankedCandidateSet (Summary View)

A summary view of the internal RankedCandidateSet:

- Per-slot top Candidates (configurable depth; default: top N).
- Aggregate ordering statistics.

The Application does **not** see every Candidate's full Score breakdown. That's for Review.

### 5.4 AllocatedCandidateSet (Summary View)

A summary view of the Solver's output:

- Final placements (Slot → Candidate).
- Rejected Slots (with reasons).
- Unresolved Conflicts.
- Shortfall summary.

The Application sees the **structural outcome** — what was placed where, and what couldn't be placed — without the full per-placement audit detail (which is in the Audit Trail, available on-demand).

### 5.5 The Summary View Principle

The Application's view of every internal contract is a **summary**, not the full contract. The full detail is in the Audit Trail (§9), available to the Application but not forced on it. This keeps the output tractable while preserving transparency.

The Review Workbench (a specialized Application) may request the full detail via Execution Options (§4.3, Audit verbosity). Regular Applications get the summary.

### 5.6 Warnings

Non-blocking issues that don't fail the run but should be reviewed. See §8.

### 5.7 Errors

Failure details when status is Failed. See §7.

### 5.8 Runtime Metadata

| Property | Content |
|---|---|
| **Runtime API version** | The version that produced this result. |
| **Engine version (encapsulated)** | The Engine's internal version. |
| **Internal module versions** | Reader, Generator, Scoring, Ranking, Allocation, Solver versions (for audit). |
| **Timestamps** | Start, end, per-module (in Audit Trail). |

### 5.9 Execution Summary

A high-level narrative of what happened during the run — suitable for logging and human review:

- Blueprint processed.
- Sets produced (or attempted).
- Slots filled / Rejected.
- Shortfalls encountered.
- Warnings emitted.
- Time consumed.

The Execution Summary is the "what happened" overview; the Audit Trail is the "why" detail.

### 5.10 What the Output Contract Does NOT Carry

- ❌ **Internal contracts verbatim.** Summaries only.
- ❌ **Question content.** Metadata only.
- ❌ **A Draft.** The Draft Builder produces that, post-Review.
- ❌ **A publication.** Publishing is downstream.
- ❌ **Hidden state.** Everything material to the outcome is in the audit trail.

---

## 6. Execution States

The states an Engine run can be in.

### 6.1 The State Vocabulary

| State | Meaning |
|---|---|
| **Accepted** | The Engine Request passed Validation and has been queued for execution. |
| **Running** | The pipeline is executing. |
| **Completed** | The pipeline finished successfully; all slots filled; no warnings. |
| **Completed With Warnings** | The pipeline finished; some slots Rejected or some shortfalls; warnings emitted. The result is usable but partial. |
| **Failed** | The pipeline halted due to a Fatal error. No usable result. |
| **Cancelled** | The Application (or system) cancelled the run mid-execution. |
| **Invalid** | The Engine Request failed Validation. No execution occurred. |

### 6.2 Allowed Transitions

```
Accepted ──► Running ──► Completed
                │        ──► Completed With Warnings
                │        ──► Failed
                │
                └──► Cancelled

(Invalid is reached directly from Application Request, before Accepted.)
```

**Transition rules:**

- `Application Request → Accepted`: only on successful Validation.
- `Application Request → Invalid`: only on failed Validation. No execution.
- `Accepted → Running`: when the pipeline starts.
- `Running → Completed`: when the pipeline finishes with no warnings.
- `Running → Completed With Warnings`: when the pipeline finishes with non-fatal issues (shortfalls, Rejected Slots, Soft Conflicts).
- `Running → Failed`: when a Fatal error halts the pipeline.
- `Running → Cancelled`: when an external cancellation signal is received.
- All terminal states (Completed, Completed With Warnings, Failed, Cancelled, Invalid) are **terminal** — no further transitions.

### 6.3 What the State Model Does NOT Specify

- ❌ **Concurrency model** for state transitions (implementation).
- ❌ **Persistence** of state (implementation — the state may be in-memory, in-DB, etc.).
- ❌ **Notification mechanism** for state changes (implementation — polling, streaming, webhooks).

### 6.4 Cancelled Semantics

Cancellation is **cooperative**: the Runtime API receives a cancel signal and instructs the currently-running module to wind down. The module completes its current atomic operation and then halts. The Assembly Result for a Cancelled run carries:

- The state at cancellation (which module was running, what was placed so far).
- A marker that the result is **partial due to cancellation**, not due to infeasibility.

A Cancelled result is **not** a Failed result — it's an intentionally-truncated result.

---

## 7. Error Model

Errors are structured failures. Every error carries: category, location, severity, explanation, recommendation (mirroring the Reader's and Scoring Model's error anatomy for cross-Engine consistency).

### 7.1 Error Categories

| Category | What It Means | Typical Severity | Example |
|---|---|---|---|
| **Validation Error** | The Engine Request failed Validation (bad format, missing required field, invalid reference). | Fatal (at Validation) | "Blueprint reference is missing" |
| **Blueprint Error** | The Blueprint itself is invalid (malformed, self-contradictory). Surfaced from the Reader. | Fatal | "Coverage Rules section missing" (Reader structural error) |
| **Runtime Error** | An internal Runtime API failure (orchestration bug, state corruption). | Fatal | "Module dispatch failed unexpectedly" |
| **Constraint Error** | The Solver determined the Blueprint is infeasible (constraint contradiction). | Fatal or Blocking | "Tier floors exceed 100 — impossible on paper" (Fatal); "Slot X has no feasible Candidate" (Blocking → Completed With Warnings) |
| **System Error** | An infrastructure failure (out of memory, dependency unavailable). | Fatal | "Performance budget exhausted" |
| **Version Error** | Version mismatch (Runtime, Engine, or internal module version unsupported). | Fatal | "Targeted Runtime v2.0 but API is v1.0" |
| **Dependency Error** | An upstream dependency failed (Bank unreachable, Blueprint storage unavailable). | Fatal | "Question Bank unreachable" |

### 7.2 Ownership

| Category | Owned By |
|---|---|
| Validation Error | Runtime API |
| Blueprint Error | Reader (surfaced through Runtime API) |
| Runtime Error | Runtime API |
| Constraint Error | Constraint Solver (surfaced through Runtime API) |
| System Error | Runtime API / infrastructure |
| Version Error | Runtime API |
| Dependency Error | Runtime API (the dependency itself is external) |

### 7.3 Error Anatomy

Every error carries:

| Field | Content |
|---|---|
| **Category** | One of §7.1 |
| **Location** | Where the error occurred (which module, which slot/candidate/transition if applicable) |
| **Severity** | Fatal / Blocking / Warning |
| **Explanation** | Plain-language description |
| **Recommendation** | Concrete suggested fix |
| **Module** | Which internal module produced the error (for audit) |

### 7.4 The "No Silent Failure" Rule

The Runtime API **never** silently swallows an error. Every error is reflected in:

- The Assembly Result's status (Failed or Completed With Warnings).
- The Errors (or Warnings) collection.
- The Audit Trail.

An Application receiving an Assembly Result can always determine whether the run succeeded, partially succeeded, or failed — and why.

---

## 8. Warning Model

Warnings are non-blocking issues. They don't fail the run but should be reviewed.

### 8.1 Warning Types

| Type | What It Signals | Source |
|---|---|---|
| **Shortfall** | A Blueprint target couldn't be fully met (e.g. a Slot was Rejected). | Generator or Solver |
| **Reduced Confidence** | A placement's evaluation is low-confidence (e.g. missing metadata — Integration Gap IG-2). | Scoring / Ranking |
| **Incomplete Metadata** | A Candidate's metadata is incomplete (carried forward from Generator). | Generator |
| **Deprecated Blueprint** | The Blueprint version is deprecated but still supported. | Reader |
| **Coverage Warning** | A coverage rule is strained (e.g. a mandatory topic has only one eligible Candidate). | Generator or Solver |
| **Distribution Warning** | A distribution target is met with thin headroom. | Solver |
| **Future Compatibility Warning** | The result uses features that may change in future versions. | Runtime API |

### 8.2 Warning Severity

Warnings are **non-fatal by definition**. They surface in the Assembly Result's Warnings collection and contribute to `Completed With Warnings` status. The Application decides whether to act on them (e.g. route to Review for human attention).

### 8.3 Warnings vs. Errors

| | Errors | Warnings |
|---|---|---|
| **Severity** | Fatal or Blocking | Non-fatal |
| **Effect on status** | Failed or Completed With Warnings | Completed With Warnings (or Completed if no other issues) |
| **Effect on result usability** | May make result unusable (Fatal) or partial (Blocking) | Result is usable; review recommended |

---

## 9. Audit Model

The audit trail is the **reproducible decision trace** of an Engine run.

### 9.1 Audit Components

| Component | Content |
|---|---|
| **Execution Trace** | The high-level sequence: Request → Validation → Reader → ... → Result, with timestamps. |
| **Module Trace** | Per-module: what each module received, what it produced, how long it took, what warnings/errors it emitted. |
| **Decision Trace** | Per-decision: every placement, every rejection, every conflict resolution — with reasoning. (This is the bulk of the audit trail; composed from each module's transparency contributions.) |
| **Allocation Trace** | The specific allocations: Slot → Candidate mappings, with full per-placement reasoning (Reservation history, Replacements, Conflicts). |
| **Version Trace** | Every version involved: Runtime, Engine, Reader, Generator, Scoring, Ranking, Allocation, Solver, Blueprint. |
| **Reviewer Trace** | If the run included Reviewer Overrides (re-solving), the overrides and their effects. |

### 9.2 Explainability

The audit trail is **explainable to a Human**. Every decision can be rendered in plain language: "Candidate Q-000123 was placed in Slot S1.Easy.Memory.D1 because it ranked 1st for that slot, satisfied all hard constraints, and had no conflicts." A Reviewer reading the audit trail can reconstruct the Engine's reasoning without inspecting code.

### 9.3 Layered Audit

Inheriting the layered transparency pattern (Scoring Model §8.4, Candidate Ranking §9.4, Allocation Model §10.4, Constraint Solver §10.4):

- **Always-present layer:** Execution Trace, Module Trace, final Decision/Allocation summaries, Version Trace, Warnings/Errors.
- **On-demand layer:** Full Decision Trace (every reasoning step), full Allocation Trace (every Reservation/Replacement/Conflict), Reviewer Trace detail.

The Application controls verbosity via Execution Options (§4.3). The Review Workbench typically requests full detail; regular Applications request the summary.

### 9.4 Audit Integrity

The audit trail is **reproducible**: given the same Engine Request and the same version stack, the trail can be re-derived exactly. This is the operational form of "Auditability" and "Traceability" (Architecture Principles).

### 9.5 What the Audit Trail Does NOT Carry

- ❌ **Internal state snapshots** (those are internal to modules; only outcomes appear).
- ❌ **Question content** (metadata only).
- ❌ **Implementation details** (algorithms, data structures — those are not contractual).

---

## 10. Versioning Strategy

### 10.1 The Version Stack

```
Blueprint Version        ── what the human authored
        ↓
Runtime API Version      ── the public contract (this spec)
        ↓
Engine Version           ── the encapsulated engine (internal)
        ↓
Internal Module Versions ── Reader, Generator, Scoring, Ranking, Allocation, Solver
```

### 10.2 Version Ownership

| Version | Owner | Visibility to Application |
|---|---|---|
| **Blueprint Version** | Blueprint authors | Referenced in Engine Request |
| **Runtime API Version** | This spec | Negotiated in Engine Request (target/min) |
| **Engine Version** | Engine team | Encapsulated; surfaced in Runtime Metadata for audit |
| **Internal Module Versions** | Each module's spec | Encapsulated; surfaced in Version Trace for audit |

### 10.3 Compatibility Rules

The Runtime API enforces compatibility at Validation:

| Situation | Runtime API Behavior |
|---|---|
| Application targets a supported Runtime version | Accept; run. |
| Application targets an unsupported Runtime version (too new) | Reject (Invalid); recommend upgrade. |
| Application targets a deprecated Runtime version | Accept with Deprecated Warning; run. |
| Application specifies a minimum version the API doesn't meet | Reject (Invalid); recommend API upgrade. |
| Blueprint version unsupported by Reader | Reject (Invalid) with Version Error. |
| Internal module version mismatch | Runtime API handles internally; if unresolvable, Failed with Version Error. |

### 10.4 Version Independence

The Runtime API is the **version-negotiation boundary**. Internal module versions are encapsulated — Applications don't know or care which Scoring Model version is in use; they care only that the Runtime contract is honored. This lets internal modules evolve without breaking Applications.

### 10.5 Forward and Backward Compatibility

- **Forward compatibility (newer Application, older API):** The API rejects Engine Requests targeting unsupported future versions. The Application must upgrade or target a supported version.
- **Backward compatibility (older Application, newer API):** The API honors deprecated Runtime versions with a warning, giving Applications time to migrate.

The Runtime API **never** silently accepts an incompatible version — mismatches surface as Version Errors or Warnings.

---

## 11. Observability

Observability metadata in the Assembly Result, for monitoring and performance analysis.

### 11.1 Observability Elements

| Element | Content |
|---|---|
| **Execution Time** | Total wall-clock time from Accepted to terminal state. |
| **Module Timing** | Per-module wall-clock time (Reader, Generator, Ranking, Solver). |
| **Execution Summary** | High-level narrative (§5.9). |
| **Performance Metadata** | Resources consumed (memory high-water, CPU time — implementation-defined). |
| **Runtime Statistics** | Counts: Candidates considered, slots filled, slots rejected, conflicts detected/resolved, replacements performed. |
| **Health Information** | Engine health indicators (version support status, deprecation warnings). |

### 11.2 Observability Is Not the Audit Trail

Observability is **quantitative** (timings, counts, resources); the Audit Trail is **qualitative** (decisions, reasoning). Both travel in the Assembly Result but serve different purposes:

- Observability supports performance monitoring and capacity planning.
- Audit Trail supports correctness review and trust calibration.

### 11.3 What Observability Does NOT Include

- ❌ **Personally identifying requestor data** beyond what's in Runtime Context (privacy).
- ❌ **Question content** (metadata only).
- ❌ **Internal algorithmic state** (encapsulated).

---

## 12. Layer Boundaries

### 12.1 Runtime API

- **CAN:**
  - Receive Engine Requests from Applications.
  - Validate input.
  - Orchestrate internal modules (call them in order, propagate outputs/failures).
  - Assemble the Assembly Result.
  - Negotiate versions.
  - Emit warnings, errors, audit trails, observability.
  - Accept cancellation signals.
  - Accept Reviewer Overrides for re-solving (constrained input form).
- **CANNOT:**
  - Expose internal module contracts to Applications (only summary views).
  - Allow Applications to call internal modules directly.
  - Make final selection decisions (Review's job).
  - Produce Drafts (Draft Builder's job).
  - Publish (existing Exam Set lifecycle's job).
  - Read Question content (forwards metadata only).
- **MUST NEVER:**
  - Silently swallow failures.
  - Silently weaken constraints to produce a fake-feasible result.
  - Allow Applications to mutate Engine state mid-run.
  - Allow Applications to bypass Validation.
  - Expose internal module versions as Application-facing requirements (they're audit metadata).
  - Couple to a specific transport (REST, GraphQL, etc.).
- **MUST ALWAYS:**
  - Be the single public entry point.
  - Validate before executing.
  - Produce a complete audit trail.
  - Negotiate versions explicitly.
  - Be deterministic given input.
  - Fail fast, fail loud, remain transparent.

### 12.2 Relationship with Adjacent Layers

| Boundary | Runtime API's Side | Other Side |
|---|---|---|
| **Runtime API ↔ Application Layer** | Exposes Input/Output contracts | Applications construct Requests and consume Results; never call internal modules |
| **Runtime API ↔ Review** | Delivers Assembly Result; accepts Reviewer Overrides for re-solving | Review consumes Result; overrides are constrained inputs to re-solving |
| **Runtime API ↔ Draft Builder** | No direct relationship | Draft Builder consumes Review's approved allocation, not the Runtime API's output directly |
| **Runtime API ↔ Internal Modules** | Orchestrates them; the only caller | Internal modules don't know the Runtime API; they consume their own contracts |

---

## 13. Anti-Patterns

Explicitly prohibited. Any future change must be evaluated against this list.

| # | Anti-Pattern | Why Prohibited |
|---|---|---|
| AP-1 | **Applications calling internal modules directly** | Violates Single Entry Point (§2.1); bypasses encapsulation. |
| AP-2 | **Applications modifying Runtime State** | Violates determinism and isolation. |
| AP-3 | **Skipping Validation** | Violates Fail Fast; unsafe input may reach modules. |
| AP-4 | **Reading Internal State** | Couples Applications to internals; defeats encapsulation. |
| AP-5 | **Bypassing Runtime API** | Any alternative entry point defeats the Single Entry Point principle. |
| AP-6 | **Duplicating Engine Logic** | If Applications reimplement Engine logic, the Engine's properties (determinism, auditability) don't hold. |
| AP-7 | **Ignoring Version Compatibility** | Leads to silent breakage on Engine evolution. |
| AP-8 | **Silent failure swallowing** | Violates Fail Loud; Applications can't trust the result. |
| AP-9 | **Coupling to a transport** | The contract is abstract; REST/GraphQL/etc. are implementation. |
| AP-10 | **Exposing internal contracts verbatim** | Summary views only (§5.5). |
| AP-11 | **Allowing mid-run mutation** | The run is immutable once started; cancellation is the only external influence. |
| AP-12 | **Hiding warnings or errors** | All issues surface in the Assembly Result. |
| AP-13 | **Anything outside Runtime ownership** | Single responsibility (§1.3). |

---

## 14. Future Extensibility

Future capabilities enter as additive extensions, never as redesigns.

### 14.1 Streaming Execution

A Streaming Runtime emits progress events as the pipeline runs (e.g. "Reader complete," "Generator produced N candidates," "Solver placed slot X"). The Application consumes events incrementally rather than waiting for the final Assembly Result.

**Architecture impact:** The Input/Output contracts are unchanged; the *delivery* becomes a stream of partial results culminating in the final result. The Application may opt into streaming via Execution Options.

### 14.2 Incremental Runtime

An Incremental Runtime re-runs only the parts of the pipeline affected by a change (e.g. a Reviewer Override triggers re-solving but not re-generation). The contract is unchanged; the *execution* is incremental for performance.

### 14.3 Distributed Runtime

A Distributed Runtime executes the pipeline across multiple nodes (e.g. one node per Set, per Allocation Model §4.9). The contract is unchanged; the *execution* is distributed. Determinism must be preserved (same input → same output).

### 14.4 Remote Engine

A Remote Engine is reachable over a network (as a service). The contract is materialized as a transport (REST, gRPC, message queue — implementation choice). The Application Layer doesn't know whether the Engine is local or remote.

### 14.5 Engine as a Service

Engine as a Service exposes the Runtime API to multiple tenants over a shared infrastructure. The contract is unchanged; multi-tenancy is an implementation concern (with privacy/isolation guarantees).

### 14.6 Batch Runtime

A Batch Runtime accepts multiple Engine Requests and processes them as a batch (e.g. overnight generation of multiple Blueprints' Drafts). The contract per-request is unchanged; batching is an orchestration extension.

### 14.7 Cloud Runtime

A Cloud Runtime runs in a cloud environment with elastic scaling, managed infrastructure, etc. The contract is unchanged; cloud deployment is an infrastructure concern.

### 14.8 What Does NOT Change

- **Single Entry Point** (§2.1) — the architectural invariant.
- **Encapsulation** (§2.2) — Applications never see internals.
- **Input/Output contracts** (§4, §5) — the public surface.
- **Determinism** — same input → same output, regardless of execution mode.
- **Auditability** — every run produces a complete audit trail.
- **Version negotiation** — explicitly bounded at the Runtime layer.

---

## 15. Cross-Spec Reconciliation (Mandatory)

Per the session's mandatory requirement: explicit reconciliation with all eight prior specs.

### 15.1 Assessment Foundation ↔ Runtime API

**Tension:** The Engine Foundation v1.0 sketched the pipeline and deferred the public interface. Does the Runtime API alter the Foundation's module contracts?

**Reconciliation:** No. The Runtime API **orchestrates** the Foundation's modules; it does not redefine them. Every module contract (Reader output, Generator output, etc.) is honored exactly as the Foundation and subsequent specs defined them. The Runtime API adds an *encapsulation layer* on top — it does not modify the layers beneath.

**Operational rule:** If a future need appears to require changing a module contract, the answer is a **module-spec version bump**, not a Runtime API extension. The Runtime API tracks module versions; it doesn't override them.

### 15.2 Blueprint Integration ↔ Runtime API

**Tension:** The Integration Spec defines the `AssemblyRequest` as the Reader's output. The Runtime API's Input Contract (§4.1) defines an external "Assembly Request" (two words) as Application input. Name collision.

**Reconciliation:** Disambiguated in §4.1. The external Assembly Request (Application input) is a *Blueprint reference + context*; the internal `AssemblyRequest` (Reader output) is the *normalized contract*. The Reader transforms the former into the latter. Applications never see the internal one. Both terms are retained (both authoritative); context disambiguates.

**Operational rule:** When the term "Assembly Request" / "`AssemblyRequest`" appears, check the layer: Application-layer = external (Blueprint ref + context); Reader-layer = internal (normalized contract).

### 15.3 Reader ↔ Runtime API

**Tension:** The Reader (Reader Pipeline Architecture v1.0) is itself a pipeline (Document Reader → ASTs → Validation → Normalization → AssemblyRequest). Does the Runtime API orchestrate the Reader's internal stages?

**Reconciliation:** No. The Runtime API treats the Reader as a **single module** with one input (Blueprint) and one output (AssemblyRequest). The Reader's internal pipeline is its own concern. The Runtime API's Module Trace records "Reader: started, finished, X ms" — not the Reader's internal stage breakdown.

**Operational rule:** Each module's internal structure is opaque to the Runtime API. The Runtime API sees modules as black boxes with contracts.

### 15.4 Candidate Generation ↔ Runtime API

**Tension:** The Generator produces the CandidateSet, which carries shortfalls and coverage satisfaction. How do these propagate to the Assembly Result?

**Reconciliation:** The Runtime API carries the Generator's shortfalls and coverage satisfaction **forward through the pipeline** — they're carried by each subsequent module's output (Candidate Ranking §7.4 "carried forward"; Constraint Solver §12.4 "carried forward") — and into the Assembly Result's Warnings (§8) and AllocatedCandidateSet summary (§5.4).

**Operational rule:** Shortfalls and coverage data accumulate through the pipeline; they're never dropped. The Assembly Result's Warnings collection is the union of all modules' warnings.

### 15.5 Scoring Model ↔ Runtime API

**Tension:** The Scoring Model is a *language spec*, not a module. Where does it live in the Runtime API's pipeline?

**Reconciliation:** The Scoring Model is **applied by Ranking** (Candidate Ranking §4). It is not a separate stage in the Runtime API's pipeline (§3.1 lists "Scoring" but notes it produces no separate output — the vocabulary is applied by Ranking). The Runtime API sees Scoring as part of Ranking.

**Operational rule:** The Runtime API's Module Trace records a single "Ranking" entry that includes Scoring's work. Scoring Model version is recorded in the Version Trace (§9.1).

### 15.6 Candidate Ranking ↔ Runtime API

**Tension:** Ranking produces RankedCandidateSet, which the Solver consumes. The Runtime API's output includes a "RankedCandidateSet (Summary View)" (§5.3). Does the Runtime API expose the full RankedCandidateSet?

**Reconciliation:** No. The Runtime API exposes a **summary view** (top-N per slot, aggregate stats), not the full RankedCandidateSet. The full detail is in the Audit Trail, available on-demand via Execution Options (§4.3). This prevents output bloat for regular Applications while preserving detail for Review.

**Operational rule:** Every internal contract has a summary view in the Assembly Result; full detail is in the Audit Trail.

### 15.7 Allocation Model ↔ Runtime API

**Tension:** Same as Scoring — the Allocation Model is a *language spec*, spoken by the Solver.

**Reconciliation:** The Allocation Model is **spoken by the Solver** (Constraint Solver §0). It is not a separate stage. The Runtime API's pipeline has a single "Solver" entry that includes allocation work.

**Operational rule:** The Runtime API's Module Trace records a single "Solver" entry. Allocation Model version is recorded in the Version Trace.

### 15.8 Constraint Solver ↔ Runtime API

**Tension:** The Solver produces AllocatedCandidateSet, which the Runtime API exposes as a summary. The Solver also supports Reviewer Overrides (Constraint Solver §4.1, "Reviewer Constraints"). Does the Runtime API handle overrides?

**Reconciliation:** Yes, as a **constrained form of input**. The Runtime API accepts Reviewer Overrides (force-include, force-exclude, replace) as part of an Engine Request, and passes them to the Solver as Reviewer Constraints. The Solver re-solves with the overrides in force. The resulting Assembly Result carries a Reviewer Trace (§9.1) documenting the overrides and their effects.

**Critical boundary:** The Runtime API **accepts** overrides but does not **originate** them. Overrides originate in Review (the post-Engine workflow). The Runtime API's job is to carry them into a re-solving run, not to manage the Review workflow.

**Operational rule:** Reviewer Overrides are an optional input field in the Engine Request. When present, the Solver honors them as Hard Constraints (Constraint Solver §4.3). The Assembly Result reflects the override-influenced allocation.

### 15.9 Review and Draft Builder ↔ Runtime API

**Tension:** Review and Draft Builder are post-Engine. Where does the Runtime API's responsibility end?

**Reconciliation:** The Runtime API's responsibility **ends at Assembly Result delivery**. Review consumes the Assembly Result (specifically the AllocatedCandidateSet summary); Review's decisions may produce Reviewer Overrides that trigger a new Engine run via the Runtime API. The Draft Builder consumes Review's approved allocation and produces a Draft via existing Exam Set CRUD — completely outside the Runtime API.

**Operational rule:** The Runtime API does not call Review or Draft Builder. It may be *re-invoked* by Review (with overrides); it does not *invoke* Review.

### 15.10 Documentation of Reconciliation Decisions

Every reconciliation above is recorded here so that:

- Future implementers don't re-derive the resolutions.
- Future spec versions evaluate changes against the reconciled seams.
- The architecture remains coherent across the nine documents.
- The Runtime API's role as **single public interface** is unambiguously established.

---

## Appendix A — Glossary

| Term | Definition |
|---|---|
| **Runtime API** | The single public interface of the Assessment Engine. |
| **Engine Request** | The Application's input to the Runtime API (Blueprint ref + context + options). |
| **Assembly Result** | The Runtime API's output (status + allocations + audit + metadata). |
| **Assembly Request (external)** | Application input: Blueprint reference + context. (Two words.) |
| **`AssemblyRequest` (internal)** | Reader output: normalized contract. (One word. Integration Spec §4.) |
| **Runtime Context** | Metadata about the run environment (requestor, timestamp, correlation). |
| **Execution Options** | Knobs influencing how the Engine runs (over-fetch, budget, verbosity). |
| **Execution State** | Accepted / Running / Completed / Completed With Warnings / Failed / Cancelled / Invalid. |
| **Summary View** | The Application's view of an internal contract — summary, not full detail. |
| **Audit Trail** | Reproducible decision trace from Engine Request to Assembly Result. |
| **Module Trace** | Per-module entry in the audit trail (input, output, timing, warnings). |
| **Reviewer Override** | A constrained input (force-include/exclude/replace) carried into re-solving. |
| **Reviewer Trace** | Audit component documenting overrides and their effects. |
| **Observability** | Quantitative run metadata (timings, counts, resources). |

---

## Appendix B — Boundary Assertions

The non-negotiable contracts of this specification.

1. **The Runtime API is the single public entry point.** Applications never call internal modules.
2. **The Runtime API validates before executing.** Invalid input never reaches modules.
3. **The Runtime API encapsulates internal contracts.** Applications see summary views only.
4. **The Runtime API negotiates versions explicitly.** Mismatches surface as Errors or Warnings.
5. **The Runtime API never silently swallows failures.** Every issue surfaces in status, errors, or warnings.
6. **The Runtime API never silently weakens constraints.** Fake-feasible results are prohibited.
7. **The Runtime API produces a complete audit trail** for every run.
8. **The Runtime API is deterministic given input.** Same Engine Request → same Assembly Result.
9. **The Runtime API's responsibility ends at Assembly Result delivery.** Review and Draft Builder are post-Engine.
10. **The Runtime API may be re-invoked with Reviewer Overrides** but does not manage the Review workflow.
11. **The Runtime API is transport-independent.** The contract is abstract; materialization is implementation.
12. **The Runtime API preserves all Engine properties** (determinism, transparency, auditability, human authority, version independence) all the way to the Application Layer.

---

## Appendix C — Provenance & Cross-References

- **Engine alignment:** The Runtime API is the public interface anticipated by Engine Foundation v1.0 §6 (Admin Workflow). The Foundation deferred the public contract; this spec closes that deferral.
- **Integration Spec alignment:** The external "Assembly Request" (this spec §4.1) is the Application-facing form; the internal `AssemblyRequest` (Integration Spec §4) is the Reader's output. Disambiguated in §15.2.
- **Reader alignment:** The Runtime API treats the Reader as a single module (Blueprint in, AssemblyRequest out). The Reader's internal pipeline (Reader Pipeline Architecture) is opaque to the Runtime API. Reconciled in §15.3.
- **Candidate Generation alignment:** The Runtime API carries the Generator's shortfalls and coverage satisfaction forward through the pipeline into the Assembly Result. Reconciled in §15.4.
- **Scoring Model alignment:** The Scoring Model is applied by Ranking, not a separate Runtime stage. Scoring Model version is in the Version Trace. Reconciled in §15.5.
- **Candidate Ranking alignment:** The Runtime API exposes a summary view of RankedCandidateSet; full detail is in the Audit Trail. Reconciled in §15.6.
- **Allocation Model alignment:** The Allocation Model is spoken by the Solver, not a separate Runtime stage. Allocation Model version is in the Version Trace. Reconciled in §15.7.
- **Constraint Solver alignment:** The Runtime API carries Reviewer Overrides into re-solving runs as constrained input. The Solver's AllocatedCandidateSet is exposed as a summary view. Reconciled in §15.8.
- **Review and Draft Builder alignment:** Post-Engine. The Runtime API ends at Assembly Result delivery; it may be re-invoked by Review but does not invoke Review or Draft Builder. Reconciled in §15.9.

---

*End of Sobdai Assessment Engine Runtime API Specification — v1.0.*

**Upstream sources (immutable):**
- Assessment Assembly Engine Foundation v1.0
- Blueprint Integration Specification v1.0
- Blueprint Reader Pipeline Architecture v1.0
- Candidate Generation Architecture v1.0
- Scoring Model Specification v1.0
- Candidate Ranking Architecture v1.0
- Allocation Model Specification v1.0
- Constraint Solver Architecture v1.0

**Next modules to specify (later sessions):**
- Review Workbench Architecture (consumes Assembly Result; produces Reviewer Overrides)
- Draft Builder Architecture (consumes approved allocation; produces Draft Exam Set via existing CRUD)

**Encapsulation status:** The Assessment Engine is now fully encapsulated behind a single public interface. Internal modules (Reader, Generator, Scoring, Ranking, Allocation, Solver) are contractually hidden from Applications. The Engine's properties (determinism, transparency, auditability, human authority, version independence) are preserved end-to-end.
