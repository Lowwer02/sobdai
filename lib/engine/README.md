# lib/engine — Assessment Assembly Engine

**Architecture status:** FROZEN across 10 specifications.
**Implementation Planning:** v1.0 APPROVED (`assessment_engine_implementation_planning_v1.md`).
**Engineering Backlog:** `engineering_execution_backlog_v1.md`.

This directory holds the **greenfield** Assessment Assembly Engine: the system that turns a
Blueprint into Draft Exam Sets. It is **additive** to the existing system — it does not replace
manual Exam Set authoring, the publish lifecycle, or the user-facing exam runtime.

---

## Module Layout (per Backlog E-1.1)

```
lib/engine/
├── reader/          Blueprint → AssemblyRequest (Reader Pipeline Architecture v1.0)
├── generator/       AssemblyRequest → CandidateSet (Candidate Generation Architecture v1.0)
├── scoring/         v1.0 Component vocabulary (Scoring Model Specification v1.0)
│                    [implemented by Ranking — language spec, no module of its own]
├── ranking/         CandidateSet → RankedCandidateSet (Candidate Ranking Architecture v1.0)
├── allocation/      Slot lifecycle + Conflict vocabulary (Allocation Model Specification v1.0)
│                    [spoken by Solver — language spec, no module of its own]
├── solver/          RankedCandidateSet → AllocatedCandidateSet (Constraint Solver Architecture v1.0)
├── runtime/         Single public entry point: runEngine() (Runtime API Specification v1.0)
├── draft-builder/   Approved Allocation → Draft Exam Set (Draft Builder Architecture v1.0)
├── review/          Human inspection + override (Review Workbench — SPEC PENDING, E-5.0)
└── shared/          Cross-cutting: contracts, errors, audit, observability, testing
```

---

## Conventions (every module MUST follow)

### 1. Determinism is a contract, not a property.
- Same input + same versions → same output. Verified by property tests in `shared/testing/`.
- No `Date.now()`, `Math.random()`, `process.hrtime()`, or wall-clock in any pure module.
  Timestamps are passed in by the Runtime API (Runtime Context), never read inside.
- Forbidden tie-breakers in Ranking: `Math.random`, Bank queries, LLM judgment, content heuristics.

### 2. No I/O in pure modules.
- Reader/Generator/Ranking/Solver are pure functions of their inputs.
- DB/Bank reads happen in the Generator's filter layer only (and the Generator's filter
  adapters are injected, not imported) — see Candidate Generation spec.
- Server Actions / Supabase clients live in `app/` (the Application Layer), never in `lib/engine/`.

### 3. Encapsulation is enforced.
- `lib/engine/index.ts` is the ONLY barrel. It exports `runEngine` and the public types
  Applications need (Engine Request, Assembly Result, Execution States, Error/Warning models).
- Applications MUST NOT import from `lib/engine/<module>/` directly. The CI encapsulation
  gate (a grep test over `app/`) fails the build on any such import.
- Internal modules do not know the Runtime API exists (orchestration asymmetry, Runtime API §2.5).

### 4. Every decision carries an audit hook.
- Every placement, score, allocation, override, rejection emits an audit record via
  `shared/audit` (added in E-X.2). No silent decisions.
- The Runtime API collects these into the Assembly Result's Audit Trail (Runtime API §9).

### 5. Spec citations in code.
- Every public type/function carries a JSDoc `@spec` reference (document name + section).
- Every PR description cites which spec + section the change implements. This is a Task DoD.

### 6. Honest partial outputs.
- When the Bank cannot fully satisfy a Blueprint, the Engine emits partial results with
  explicit shortfalls. Never fake-feasible.
- Missing metadata (IG-2 axes) propagates as reduced Confidence, never as silent distortion.

---

## Critical Prerequisite: IG-2 (currently blocked)

**E-0 (IG-2 Closure) is PAUSED** pending an Architecture Amendment. The Implementation
Planning assumed the importer already parses all four IG-2 axes; verification found that
only `blueprint_type` and `learning_objective` are parsed, while `question_pattern` and
`section` do not exist in Content Template v2.1. Chief Architect must resolve the mapping
before Phase 0 work resumes.

Work that does NOT depend on IG-2 (Reader contracts, shared infrastructure, test fixtures,
Draft Builder against stubs) proceeds in parallel per Implementation Planning §2.3.

---

## Reference: Spec → Module map

| Module | Spec |
|---|---|
| Foundation | `assessment_assembly_engine_foundation_v1.md` |
| Integration (AssemblyRequest) | `blueprint_integration_specification_v1.md` |
| Reader | `blueprint_reader_pipeline_architecture_v1.md` |
| Generator | `candidate_generation_architecture_v1.md` |
| Scoring Model | `scoring_model_specification_v1.md` |
| Ranking | `candidate_ranking_architecture_v1.md` |
| Allocation Model | `allocation_model_specification_v1.md` |
| Solver | `constraint_solver_architecture_v1.md` |
| Runtime API | `assessment_engine_runtime_api_specification_v1.md` |
| Draft Builder | `draft_builder_architecture_v1.md` |
| Review Workbench | **SPEC PENDING** (`review_workbench_architecture_v1.md`, E-5.0 deliverable) |
