# Sobdai Assessment Engine — Engineering Execution Backlog v1.0

**Status:** Master Engineering Backlog (implementation-ready)
**Architecture status:** COMPLETE and FROZEN across 10 specifications. Never redesign.
**Implementation Planning status:** v1.0 APPROVED. Source of phase structure and exit criteria.
**Consumes (as immutable inputs):** 10 architecture specs + Implementation Planning v1.0
**Version:** 1.0
**Owner:** Chief Engineering Manager, Sobdai

> **What this document is.** An executable backlog for developers. Epics, Features, Stories, Tasks, sequencing, DoD, QA gates, risk gates, sprint mapping. Directly importable into GitHub Issues / Linear / Jira / Notion / Azure DevOps.
>
> **What this document is not.** Not architecture. Not code. Not SQL. Not pseudocode. Not a restatement of any spec. Engineers read the named spec when implementing a Task.

---

## ID Convention

| Level | Prefix | Maps to (tracker) |
|---|---|---|
| Epic | `E-0` … `E-7`, `E-X` | Epic |
| Feature | `F-<epic>.<n>` | Feature / Sub-Epic |
| Story | `S-<epic>.<feature>.<n>` | Story / Issue |
| Task | `T-<epic>.<feature>.<story>.<n>` | Task / Subtask |

Cross-references use these IDs. Dependencies cited as `blocked-by:` / `blocks:`.

---

## 1. Engineering Strategy

1. **Phase-gated, vertical-slice-first.** Mirror Implementation Planning Phases 0–7. Each phase ends with a demonstrable capability, not a partial module.
2. **Stub-before-real.** Every downstream module ships a pass-through stub before the real implementation. The Runtime API skeleton orchestrates stubs in Phase 1; real modules replace stubs in place.
3. **Critical-path discipline.** `IG-2 → Reader → Generator → Ranking → Solver → Runtime API → Draft Builder`. Non-critical work runs on parallel tracks but cannot block the critical path.
4. **Determinism is a first-class deliverable.** Every module carries a property test: randomized input ordering → identical output. No silent tie-breakers.
5. **Transparency is non-negotiable.** No placement, score, or allocation ships without an audit-trail entry and a human-readable reason.
6. **Additive-only migrations.** Mirror migration 002 / 026 patterns. No destructive schema change. Every migration is reversible.
7. **Single entry-point enforcement.** Applications may not call internal modules directly. The Runtime API is the only public surface; encapsulation is verified by a lint/test gate.
8. **Honest partial outputs.** When the Bank cannot satisfy a Blueprint, the Engine emits partial results with explicit shortfalls — never fake-feasible.
9. **Substrate reuse over rebuild.** Migration 026, Exam Set CRUD, publish lifecycle, `lib/assessment/` outcome persistence, `validate_exam_set_for_publish` RPC — reused unchanged.
10. **Review Workbench spec is the only open architecture.** It is the first deliverable of Epic 5 and gates all Epic 5 implementation.

---

## 2. Epic Breakdown

| Epic | Title | Phase | Critical Path? | Blocked By | Exit Criteria (summary) |
|---|---|---|---|---|---|
| **E-0** | Bank Schema Extension (IG-2 Closure) | 0 | YES (gates all) | — | Imported Question persists all 4 new axes; admin Picker filters on them; existing imports unchanged |
| **E-1** | Foundation Vertical Slice | 1 | YES | E-0 | Real Blueprint → `AssemblyRequest` → stubbed pipeline → real `exam_sets` draft row |
| **E-2** | Candidate Generator | 2 | YES | E-1 | Real CandidateSet bounded by Blueprint structure (not Bank size) on synthetic 100k Bank |
| **E-3** | Scoring + Ranking | 3 | YES | E-2 | Real RankedCandidateSet with per-(Candidate×slot) Composites, propagated Confidence, visible ties |
| **E-4** | Allocation + Solver | 4 | YES (highest risk) | E-3 | Real AllocatedCandidateSet satisfying all Hard Constraints or honest partial + shortfalls |
| **E-5** | Review Workbench | 5 | YES | E-4, E-5-F-0 (spec) | Human can inspect, override, and approve an allocation that Draft Builder consumes |
| **E-6** | Integration + QA | 6 | YES | E-1…E-5 | Blueprint v3.0 → 5 published-ready Drafts, fully auditable, zero regression |
| **E-7** | Production Readiness | 7 | NO (hardening) | E-6 | Performance budget met on 100k Bank; monitoring live; rollback tested |
| **E-X** | Cross-Cutting Infrastructure | parallel | NO | — | Test fixtures, audit storage, observability primitives usable by all Epics |

### Epic Detail Cards

#### E-0 — Bank Schema Extension (IG-2 Closure)
- **Objective:** Make the Question Bank capable of satisfying Blueprint v3.0 filter axes.
- **Scope:** Migration 027 (additive columns + indexes), importer fix, metadata RPC extension, type updates. No Engine code.
- **Dependencies:** None.
- **Deliverables:** Migration 027; updated importer; extended `get_question_metadata` RPC; updated `lib/types.ts`; admin Question Picker filter UI extension.
- **Exit Criteria:** A Question imported post-deployment carries persisted `blueprint_type`, `learning_objective`, `question_pattern`, `section`; admin Picker filters on all four; existing imports and Question Bank behavior unchanged (additive only).

#### E-1 — Foundation Vertical Slice
- **Objective:** Prove the full pipeline shape against real substrate before any algorithmic work.
- **Scope:** Runtime API skeleton, full Reader, full Draft Builder; Generator/Ranking/Solver as deterministic pass-through stubs.
- **Dependencies:** E-0 (for axis validation only).
- **Deliverables:** Runtime API skeleton (single entry point, Engine Request/Result contracts); Reader pipeline (8 stages); Draft Builder (3 stages); stub CandidateSet/AllocatedCandidateSet producers.
- **Exit Criteria:** A real Blueprint v3.0 is read into an `AssemblyRequest`; a stubbed CandidateSet flows through stub Ranking/Solver; Draft Builder produces a real `exam_sets` row (`status='draft'`); byte-identical Blueprint → byte-identical `AssemblyRequest`.

#### E-2 — Candidate Generator
- **Objective:** Replace the stub Generator with the real Maximum-Recall discovery pipeline.
- **Scope:** Query Planner, 7 ordered Filters, Candidate Discovery, Pool Validation, Pool Expansion, CandidateSet emission, Shortfall Report.
- **Dependencies:** E-1 (consumes `AssemblyRequest`); E-0 (real Pattern/LO filters).
- **Deliverables:** Generator pipeline (6 stages); CandidateSet contract; Shortfall Report; per-filter timing instrumentation.
- **Exit Criteria:** A real `AssemblyRequest` produces a real CandidateSet bounded by Blueprint structure (not Bank size); provenance per Candidate; missing-axis failures (IG-2 absent) surface loud.

#### E-3 — Scoring + Ranking
- **Objective:** Replace stub Scoring/Ranking with the real Scoring Model implementation and per-slot ordering.
- **Scope:** Signal Extraction, 10 v1.0 Component evaluators, Confidence propagation, Penalty application, Ordering, Tie Resolution, RankedCandidateSet emission.
- **Dependencies:** E-2 (consumes CandidateSet).
- **Deliverables:** Scoring Model implementation (v1.0 Component vocabulary); Ranking pipeline (7 stages); RankedCandidateSet contract; per-rank transparency records.
- **Exit Criteria:** A real CandidateSet produces a real RankedCandidateSet with per-(Candidate×slot) Composites, propagated Confidence, Penalties, visible tie groups; deterministic across iteration orderings.

#### E-4 — Allocation + Solver
- **Objective:** Replace the stub Solver with the real constraint-satisfaction runtime.
- **Scope:** Allocation Model vocabulary; Solver 10-stage runtime; 8 Constraint categories; Conflict Resolution; Feasibility Model; AllocatedCandidateSet emission.
- **Dependencies:** E-3 (consumes RankedCandidateSet).
- **Deliverables:** Allocation Model implementation; Solver runtime; AllocatedCandidateSet contract; checkpoint/rollback; Hard Penalty augmentation per Scoring §9.2.
- **Exit Criteria:** A real RankedCandidateSet produces a real AllocatedCandidateSet satisfying all Hard Constraints or honest partial allocation with shortfalls; deterministic; full audit trail.

#### E-5 — Review Workbench
- **Objective:** Human-facing surface for inspecting and overriding allocations.
- **Scope:** Architecture spec (gates everything else in E-5); Reviewer Override capture; approved-allocation emission; RBAC.
- **Dependencies:** E-4 (Assembly Result input); E-1 (Draft Builder downstream).
- **Deliverables:** Review Workbench Architecture spec (v1.0); Review Workbench implementation; Reviewer Override contract; approval workflow.
- **Exit Criteria:** A Human can inspect an AllocatedCandidateSet, override placements, and produce an approved allocation that Draft Builder consumes.

#### E-6 — Integration + QA
- **Objective:** Full pipeline integration, end-to-end testing, regression against existing functionality.
- **Scope:** All modules integrated; end-to-end test fixtures; regression suite; publish-lifecycle handoff.
- **Dependencies:** E-1 through E-5.
- **Deliverables:** Integrated pipeline; end-to-end test harness; regression suite; published-Draft realism test.
- **Exit Criteria:** Blueprint v3.0 → 5 published-ready Draft Exam Sets, fully auditable, with no regression in existing Exam Set / Question Bank / Runtime exam functionality.

#### E-7 — Production Readiness
- **Objective:** Performance validation, monitoring, deployment runbooks.
- **Scope:** Performance budgeting, monitoring dashboards, deployment runbook, rollback drill.
- **Dependencies:** E-6.
- **Deliverables:** Performance validation report; monitoring dashboards; deployment runbook; rollback test record.
- **Exit Criteria:** Engine meets performance budgets on a realistically-sized Bank (100k+ Questions); monitoring in place; rollback tested.

#### E-X — Cross-Cutting Infrastructure (parallel track)
- **Objective:** Provide shared substrates that every Epic consumes.
- **Scope:** Test fixture library (synthetic Blueprints, CandidateSets, RankedCandidateSets); audit-trail storage; observability primitives; determinism test harness.
- **Dependencies:** None.
- **Deliverables:** Fixture library; audit-trail table + writer; observability event emitter; property-based test harness.
- **Exit Criteria:** Every Epic above can import fixtures, write audit records, emit metrics, and run property tests without bespoke infrastructure.

---

## 3–5. Feature / Story / Task Breakdown

### E-0 — Bank Schema Extension

#### F-0.1 — Migration 027 (Additive Columns + Indexes)
- **S-0.1.1 — Author Migration 027**
  - T-0.1.1.1 — Create migration file `supabase/migrations/027_question_blueprint_axes.sql` mirroring migration 002 style.
  - T-0.1.1.2 — Add nullable `blueprint_type` (text), `learning_objective` (text), `question_pattern` (text), `section` (text) columns to `questions`.
  - T-0.1.1.3 — Add btree indexes on each new column (partial, `WHERE col IS NOT NULL`).
  - T-0.1.1.4 — Add `CHECK` constraints for enum-like columns (`blueprint_type ∈ {Memory, Concept, Procedure, Scenario}`; `question_pattern ∈ {Positive, Negative, Best Answer, Scenario, Sequence, Matching}`) deferrable / `NOT VALID` to permit pre-existing NULLs.
  - T-0.1.1.5 — Add down-migration (`DROP COLUMN`) verifying reversibility.
  - T-0.1.1.6 — Apply migration to dev DB; verify via `\d questions`.

#### F-0.2 — Importer Fix (Stop Discarding v2.1 Fields)
- **S-0.2.1 — Extend Importer Insert**
  - T-0.2.1.1 — Locate the discard comment at `app/admin/import/actions.ts:49-52`.
  - T-0.2.1.2 — Extend the insert payload to include the four new columns from already-parsed v2.1 fields.
  - T-0.2.1.3 — Add field-level validation: reject rows whose enum values violate the new `CHECK` constraints (Fail Fast).
  - T-0.2.1.4 — Add unit test: a v2.1 fixture row imports with all four axes persisted.

#### F-0.3 — Metadata RPC Extension
- **S-0.3.1 — Extend `get_question_metadata` RPC**
  - T-0.3.1.1 — Extend the RPC return shape to surface `blueprint_type`, `learning_objective`, `question_pattern`, `section`.
  - T-0.3.1.2 — Add integration test asserting the four fields are returned for a tagged Question.
  - T-0.3.1.3 — Verify backward compatibility: existing callers see additive fields only.

#### F-0.4 — Type Updates
- **S-0.4.1 — Extend `lib/types.ts`**
  - T-0.4.1.1 — Add optional `blueprint_type?`, `learning_objective?`, `question_pattern?`, `section?` to the `Question` interface (mirror Session 6.16 pattern).
  - T-0.4.1.2 — Run `tsc --noEmit`; resolve any downstream type errors.

#### F-0.5 — Admin Question Picker Filter Extension
- **S-0.5.1 — Surface New Axes in Picker**
  - T-0.5.1.1 — Add filter controls for the four axes to the admin Question Picker UI.
  - T-0.5.1.2 — Wire filters to the extended metadata RPC.
  - T-0.5.1.3 — Add e2e smoke test: filter by each axis; verify result correctness.

---

### E-1 — Foundation Vertical Slice

#### F-1.1 — Module Skeleton & Conventions
- **S-1.1.1 — Establish Engine Module Layout**
  - T-1.1.1.1 — Create `lib/engine/` root with subdirs `reader/`, `generator/`, `scoring/`, `ranking/`, `allocation/`, `solver/`, `runtime/`, `draft-builder/`, `review/`, `shared/`.
  - T-1.1.1.2 — Add `lib/engine/shared/contracts.ts` (central type re-exports; no logic).
  - T-1.1.1.3 — Add `lib/engine/shared/errors.ts` (Engine Error anatomy type per Runtime API spec).
  - T-1.1.1.4 — Add ESLint rule / barrel test forbidding imports from `app/` into `lib/engine/` (encapsulation gate).
  - T-1.1.1.5 — Document module conventions in `lib/engine/README.md` (determinism, no I/O in pure modules, audit hooks).

#### F-1.2 — Reader Pipeline (Full)
- **S-1.2.1 — Document Reader (Stage 1)**
  - T-1.2.1.1 — Select a Markdown parser library; document the choice in `lib/engine/reader/README.md`.
  - T-1.2.1.2 — Implement Document Reader producing a Markdown AST.
  - T-1.2.1.3 — Attach source line ranges to every Markdown AST node.
  - T-1.2.1.4 — Unit test: byte-identical input → byte-identical Markdown AST.
- **S-1.2.2 — AST Projection (Stages 2–3)**
  - T-1.2.2.1 — Implement Markdown AST → Blueprint AST projection.
  - T-1.2.2.2 — Define Blueprint AST vocabulary types per Reader spec (`BlueprintIdentity`, `DocumentEntry`, `TierAssignment`, `TierDefinition`, `DistributionConstraint`, `DistributionTarget`, `CoverageRule`, `MandatoryTopicBinding`, `LearningObjective`, `PatternDefinition`, `DuplicatePreventionRule`, `SimilarityMetric`).
  - T-1.2.2.3 — Unit test: each Blueprint v3.0 section projects to the correct AST node type.
- **S-1.2.3 — Structural Validation (Stage 4)**
  - T-1.2.3.1 — Implement validators for `structural.*` error categories (missing_section, duplicate_section, malformed_table, invalid_hierarchy, broken_reference, invalid_enum).
  - T-1.2.3.2 — Emit Reader Errors with Category, Location (line range), Severity, Explanation, Recommendation.
  - T-1.2.3.3 — Unit test: each malformed-Blueprint fixture produces the expected structured error.
- **S-1.2.4 — Semantic Validation (Stage 5)**
  - T-1.2.4.1 — Implement validators for `semantic.*` categories (distribution_inconsistency, impossible_constraint, conflicting_rules, duplicated_rule, smell).
  - T-1.2.4.2 — Implement IG-4 detection (Blueprint v3.0 L1 self-inconsistency) as a Blocking error with author-routing recommendation.
  - T-1.2.4.3 — Unit test: a semantically inconsistent fixture raises the expected Blocking error.
- **S-1.2.5 — Normalization & Canonical Blueprint (Stages 6–7)**
  - T-1.2.5.1 — Implement Normalization (canonical enums, document aliasing for IG-1 mitigation).
  - T-1.2.5.2 — Emit Canonical Blueprint per Integration Spec §3 information content.
  - T-1.2.5.3 — Unit test: aliases normalize to canonical Document Registry entries.
- **S-1.2.6 — AssemblyRequest Emitter (Stage 8)**
  - T-1.2.6.1 — Implement Canonical Blueprint → `AssemblyRequest` transformation.
  - T-1.2.6.2 — Verify `meta.spec_version = "1.0"` constant; profile = `simulation`.
  - T-1.2.6.3 — Property test: byte-identical Blueprint → byte-identical `AssemblyRequest` (run 100×, assert identity).
  - T-1.2.6.4 — Token-weight check: `AssemblyRequest` ≤ 10% of source Blueprint tokens.
- **S-1.2.7 — Reader Integration**
  - T-1.2.7.1 — Wire the 8 stages into a single `readBlueprint(doc): AssemblyRequest | ReaderError[]` entry point.
  - T-1.2.7.2 — Add Reader-level integration test using real `Blueprint/simulation_exam_blueprint.md`.
  - T-1.2.7.3 — Verify all 12 documents, 4 tiers, CR-1…CR-5, L1–L5, anchor rule parse correctly.

#### F-1.3 — Stubs for Middle Modules
- **S-1.3.1 — Generator Stub**
  - T-1.3.1.1 — Implement `generateCandidates(req): CandidateSet` returning all Bank Questions of a single document (placeholder for Phase 2).
  - T-1.3.1.2 — Mark stub clearly in code and README.
- **S-1.3.2 — Ranking Stub**
  - T-1.3.2.1 — Implement `rankCandidates(set): RankedCandidateSet` as deterministic pass-through.
- **S-1.3.3 — Solver Stub**
  - T-1.3.3.1 — Implement `solve(rankings): AllocatedCandidateSet` returning top-K per slot (placeholder for Phase 4).

#### F-1.4 — Runtime API Skeleton
- **S-1.4.1 — Engine Request / Assembly Result Contracts**
  - T-1.4.1.1 — Define Engine Request type (Assembly Request + Runtime Context + Execution Options + Runtime Metadata + Version Information + Trace Context).
  - T-1.4.1.2 — Define Assembly Result type (Run id, Status, AllocatedCandidateSet summary, Warnings, Errors, Audit Trail, Metrics, Runtime Metadata, Execution Summary).
  - T-1.4.1.3 — Define Execution State enum (`Accepted`, `Running`, `Completed`, `Completed With Warnings`, `Failed`, `Cancelled`, `Invalid`).
  - T-1.4.1.4 — Define Error Categories and Error Anatomy types.
  - T-1.4.1.5 — Define Warning Types enum.
- **S-1.4.2 — Orchestrator Skeleton**
  - T-1.4.2.1 — Implement `runEngine(req): AssemblyResult` invoking Reader → stub Generator → stub Ranking → stub Solver.
  - T-1.4.2.2 — Wire Audit Trail collector (Execution Trace, Module Trace, Decision Trace, Allocation Trace, Version Trace).
  - T-1.4.2.3 — Wire Observability emitter (per-module timing, error rates).
  - T-1.4.2.4 — Version negotiation: reject unsupported Runtime/Engine versions with `Version Error`.
  - T-1.4.2.5 — Idempotency: same Engine Request → same Assembly Result (property test).
- **S-1.4.3 — Encapsulation Enforcement**
  - T-1.4.3.1 — Export only `runEngine` (and types) from `lib/engine/index.ts`.
  - T-1.4.3.2 — Add CI test: grep `app/` for direct imports of internal modules; fail if found.

#### F-1.5 — Draft Builder (Full)
- **S-1.5.1 — Draft Contract**
  - T-1.5.1.1 — Define Draft Contract types (Identity, Metadata, Questions, Ordering, Sections, Shortfall Recording, Blueprint Reference, Assembly Reference, Audit Reference, Version Information).
  - T-1.5.1.2 — Map Draft Contract fields onto existing `exam_sets` / `exam_set_questions` columns (verify against migrations 001/019/024/026).
- **S-1.5.2 — Draft Creation**
  - T-1.5.2.1 — Implement Approved Allocation → Draft Contract transformation.
  - T-1.5.2.2 — Resolve Question Codes → `questions.id` (read-only).
  - T-1.5.2.3 — Materialize N Drafts (one per Set; Blueprint v3.0 → 5).
- **S-1.5.3 — Draft Validation**
  - T-1.5.3.1 — Implement Consistency, Reference, Version, Integrity, Completeness validators.
  - T-1.5.3.2 — On validation failure: rollback + emit `Runtime Error`.
- **S-1.5.4 — Draft Persistence**
  - T-1.5.4.1 — Decide write path: server action (`createExamSetAction`) vs. direct service-role client (`createAdminClient`). Document choice in `lib/engine/draft-builder/README.md`.
  - T-1.5.4.2 — Implement atomic per-Set write; coordinated-atomic per-Blueprint (all N or rollback all).
  - T-1.5.4.3 — Implement idempotency key `(Assembly Result id, Set index)`; reject duplicates.
  - T-1.5.4.4 — On audit-write failure: rollback Draft write (spec §9.1).
  - T-1.5.4.5 — Integration test: produced Draft passes `validate_exam_set_for_publish`.
  - T-1.5.4.6 — Integration test: existing admin UI can edit the produced Draft uniformly.

#### F-1.6 — Phase 1 Vertical-Slice Integration Test
- **S-1.6.1 — End-to-End Smoke**
  - T-1.6.1.1 — Test: real Blueprint → `AssemblyRequest` → stubbed pipeline → Draft Builder → real `exam_sets` row (`status='draft'`).
  - T-1.6.1.2 — Test: retry produces identical Draft (idempotency).
  - T-1.6.1.3 — Test: existing Exam Set CRUD unaffected.

---

### E-2 — Candidate Generator

#### F-2.1 — Query Planner
- **S-2.1.1 — Build Query Plan**
  - T-2.1.1.1 — Implement Query Plan construction from `AssemblyRequest` (per-slot filter composition).
  - T-2.1.1.2 — Define Slot shape `{set, difficulty, pattern, document}`.
  - T-2.1.1.3 — Unit test: every Blueprint slot produces exactly one Query Plan entry.

#### F-2.2 — Metadata Filters (Ordered)
- **S-2.2.1 — Implement 7 Filters in Fixed Order**
  - T-2.2.1.1 — Exclusion Filter (runtime-excluded Codes).
  - T-2.2.1.2 — Status Filter (only `status='ready'` or equivalent).
  - T-2.2.1.3 — Document Filter.
  - T-2.2.1.4 — Coverage Filter (CR-1…CR-5 binding).
  - T-2.2.1.5 — Difficulty Filter.
  - T-2.2.1.6 — Pattern Filter (requires IG-2 `question_pattern`).
  - T-2.2.1.7 — LO Filter (requires IG-2 `learning_objective`).
- **S-2.2.2 — Filter Selectivity Instrumentation**
  - T-2.2.2.1 — Emit per-filter row-count reduction and timing.
  - T-2.2.2.2 — Unit test: filter order is the fixed order (regression guard).

#### F-2.3 — Candidate Discovery & Pool Validation
- **S-2.3.1 — Candidate Construction**
  - T-2.3.1.1 — Construct Candidate with 5 facets (Identity, Metadata, Provenance, Completeness, Confidence).
  - T-2.3.1.2 — Derive Tier per Candidate via Document Registry lookup (not stored).
  - T-2.3.1.3 — Provenance records the filter chain that admitted each Candidate.
- **S-2.3.2 — Pool Validation**
  - T-2.3.2.1 — Validate every Candidate against slot eligibility.
  - T-2.3.2.2 — Missing IG-2 axis → Fatal `generation.missing_contract_field` with loud surfacing.

#### F-2.4 — Pool Expansion & Caps
- **S-2.4.1 — Implement Expansion Caps**
  - T-2.4.1.1 — Per-bucket cap (≤ 2× target).
  - T-2.4.1.2 — Total CandidateSet cap.
  - T-2.4.1.3 — Bank-exhaustion stop condition.

#### F-2.5 — CandidateSet Emission & Shortfall Report
- **S-2.5.1 — Emit CandidateSet**
  - T-2.5.1.1 — Populate contract fields (identity with Bank state hash, candidates, slot_index, shortfall_report, coverage_satisfaction, warnings, meta, exclusions_log).
  - T-2.5.1.2 — `meta.spec_version = "1.0"`, `generator_version` set.
- **S-2.5.2 — Shortfall Report**
  - T-2.5.2.1 — Record per-slot shortfall when pool < target.
  - T-2.5.2.2 — Carry forward to downstream contracts unchanged.

#### F-2.6 — Generator Property & Scale Tests
- **S-2.6.1 — Maximum Recall & Bounded Size**
  - T-2.6.1.1 — Test: no valid Candidate excluded (Maximum Recall) on synthetic Bank.
  - T-2.6.1.2 — Test: CandidateSet size bounded by Blueprint structure on synthetic 100k Bank.
  - T-2.6.1.3 — Test: deterministic given Bank state (snapshot Bank → identical CandidateSet).

---

### E-3 — Scoring + Ranking

#### F-3.1 — Signal Extraction
- **S-3.1.1 — Raw Signal Model**
  - T-3.1.1.1 — Implement Raw Signal type (value, source, extraction confidence: `known`/`incomplete`/`missing`/`conflicting`).
  - T-3.1.1.2 — Implement extractors per Component input.

#### F-3.2 — Scoring Model v1.0 Component Evaluators
- **S-3.2.1 — Implement 10 Components**
  - T-3.2.1.1 — Coverage Fit.
  - T-3.2.1.2 — Difficulty Fit.
  - T-3.2.1.3 — Distribution Fit.
  - T-3.2.1.4 — Pattern Fit (requires IG-2).
  - T-3.2.1.5 — LO Fit (requires IG-2).
  - T-3.2.1.6 — Freshness.
  - T-3.2.1.7 — Usage.
  - T-3.2.1.8 — Diversity.
  - T-3.2.1.9 — Constraint Readiness.
  - T-3.2.1.10 — Blueprint Alignment.
- **S-3.2.2 — Component Contract**
  - T-3.2.2.1 — Every Component emits a Normalized Score + Score Breakdown.
  - T-3.2.2.2 — "Never invent values" rule enforced (missing evidence → no fabricated score).

#### F-3.3 — Composite, Confidence & Penalty
- **S-3.3.1 — Composite Score**
  - T-3.3.1.1 — Implement Composite aggregation per spec.
  - T-3.3.1.2 — Composite carries full Breakdown.
- **S-3.3.2 — Confidence Propagation**
  - T-3.3.2.1 — Implement Confidence vocabulary (Evidence/Known/Unknown/Incomplete/Missing/Conflicting/Low/High).
  - T-3.3.2.2 — Missing axis reduces Confidence (never inflates). Unit test.
- **S-3.3.3 — Penalty Application**
  - T-3.3.3.1 — Implement Soft / Hard / Disqualification per Scoring Model ownership rules.
  - T-3.3.3.2 — Scoring never halts on missing data (only on computation failure or version mismatch → Fatal).

#### F-3.4 — Ranking Pipeline
- **S-3.4.1 — Ordering & Tie Resolution**
  - T-3.4.1.1 — Implement fixed ordering key `⟨effective_value, confidence, penalty_status, tie_breaker_key⟩`.
  - T-3.4.1.2 — Permitted tie-breakers only (stable identity, deterministic metadata, scoring-derived sub-facets).
  - T-3.4.1.3 — Forbidden tie-breakers enforced by lint/test (no random, no Bank queries, no LLM, no content heuristics).
  - T-3.4.1.4 — Tie groups emitted with `tie_group_id`; Tie overflow = Fatal.
- **S-3.4.2 — Ordering Reason**
  - T-3.4.2.1 — Every position carries a human-readable `ordering_reason`.

#### F-3.5 — RankedCandidateSet Emission
- **S-3.5.1 — Contract**
  - T-3.5.1.1 — Populate identity (CandidateSet id, Scoring Model version, Ranking version).
  - T-3.5.1.2 — Populate slots with `ranked_candidates[]` + `slot_summary`.
  - T-3.5.1.3 — Carry forward shortfall_report, coverage_satisfaction, warnings.
  - T-3.5.1.4 — `meta.spec_version = "1.0"`, `ranking_version`, `scoring_model_version` set.

#### F-3.6 — Ranking Property Tests
- **S-3.6.1 — Determinism & Order-Independence**
  - T-3.6.1.1 — Test: same CandidateSet → same RankedCandidateSet.
  - T-3.6.1.2 — Test: CandidateSet iteration order randomized → identical RankedCandidateSet.
  - T-3.6.1.3 — Test: every Component produces a Breakdown.
  - T-3.6.1.4 — Test: version mismatch → Fatal.

---

### E-4 — Allocation + Solver

#### F-4.1 — Allocation Model Implementation
- **S-4.1.1 — Slot Lifecycle & States**
  - T-4.1.1.1 — Implement Slot states (`Open`/`Reserved`/`Allocated`/`Locked`/`Released`/`Rejected`/`Completed`).
  - T-4.1.1.2 — Implement allowed state transitions per Allocation Model spec.
  - T-4.1.1.3 — Unit test: illegal transitions rejected.
- **S-4.1.2 — Conflict Model**
  - T-4.1.2.1 — Implement Hard / Soft / Dependency / Mutual Exclusion Conflict types.
  - T-4.1.2.2 — Implement conflict scopes (within-set / cross-set / within-run).
- **S-4.1.3 — Reservation, Replacement, Swap, Rollback**
  - T-4.1.3.1 — Implement Reservation (internal; never escapes).
  - T-4.1.3.2 — Implement Replacement / Swap / Candidate Exchange.
  - T-4.1.3.3 — Implement Rollback / Recovery / State Restoration.
- **S-4.1.4 — Reviewer Override Ingestion**
  - T-4.1.4.1 — Accept Force-include / Force-exclude / Replace / Un-reject as constrained inputs.

#### F-4.2 — Solver Runtime (10 Stages)
- **S-4.2.1 — Stages 1–3 (Receive, Init, Validate)**
  - T-4.2.1.1 — Stage 1: Receive RankedCandidateSet (read-only).
  - T-4.2.1.2 — Stage 2: Initialize Runtime State (stateful within run).
  - T-4.2.1.3 — Stage 3: Validate Blueprint Constraints (Feasibility gate).
- **S-4.2.2 — Stages 4–6 (Place, Detect, Resolve)**
  - T-4.2.2.1 — Stage 4: Candidate Placement (algorithm choice documented in `lib/engine/solver/README.md`; greedy + backtracking recommended baseline).
  - T-4.2.2.2 — Stage 5: Conflict Detection (all 4 Conflict types).
  - T-4.2.2.3 — Stage 6: Conflict Resolution (priority order: Reviewer > Hard > Soft > Future).
- **S-4.2.3 — Stages 7–10 (Validate, Finalize, Audit, Emit)**
  - T-4.2.3.1 — Stage 7: Allocation Validation (Hard Constraints satisfied or honest partial).
  - T-4.2.3.2 — Stage 8: Finalize Allocation (Allocated → Locked; infeasible → Rejected).
  - T-4.2.3.3 — Stage 9: Audit Finalization (Decision Trace + Allocation Trace).
  - T-4.2.3.4 — Stage 10: Emit AllocatedCandidateSet.

#### F-4.3 — Constraint Categories
- **S-4.3.1 — Implement 8 Categories**
  - T-4.3.1.1 — Hard Constraints (tier floor/ceiling, anchor rule, per-set sum).
  - T-4.3.1.2 — Soft Constraints.
  - T-4.3.1.3 — Coverage Constraints (CR-1…CR-5).
  - T-4.3.1.4 — Distribution Constraints (Document × Difficulty × BlueprintType × Pattern).
  - T-4.3.1.5 — Cross-Set Constraints (CR-3).
  - T-4.3.1.6 — Dependency Constraints.
  - T-4.3.1.7 — Reviewer Constraints (highest priority).
  - T-4.3.1.8 — Future Constraints (plug-in seam; stub for v1.0).
- **S-4.3.2 — Hard Penalty Augmentation**
  - T-4.3.2.1 — Implement Scoring §9.2 exception: Solver may augment Hard Penalties, expressed as Hard Conflicts. Unit test.

#### F-4.4 — Feasibility, Checkpoint, Determinism
- **S-4.4.1 — Feasibility Model**
  - T-4.4.1.1 — Implement Feasible / Partially Feasible / Infeasible / Impossible states.
  - T-4.4.1.2 — Honest partial allocations: emit Rejected Slots + shortfalls (never fake-feasible).
- **S-4.4.2 — Checkpoint & Rollback**
  - T-4.4.2.1 — Implement checkpoints at Allocation Group seams.
  - T-4.4.2.2 — Implement rollback to last checkpoint on infeasibility.
- **S-4.4.3 — Determinism**
  - T-4.4.3.1 — Same RankedCandidateSet + same Solver version → same AllocatedCandidateSet (property test).
  - T-4.4.3.2 — Idempotent on retry.

#### F-4.5 — AllocatedCandidateSet Emission
- **S-4.5.1 — Contract**
  - T-4.5.1.1 — Populate identity (RankedCandidateSet id, Solver/Allocation/Scoring versions).
  - T-4.5.1.2 — Populate placements with `placement_reasoning`, `conflicts_resolved[]`, `replacements[]`, `reviewer_overrides[]`.
  - T-4.5.1.3 — Populate rejected_slots, unresolved_conflicts, shortfall_summary, audit_trail, carried_forward.

#### F-4.6 — Solver Performance Budget
- **S-4.6.1 — Performance Envelope**
  - T-4.6.1.1 — Define per-Blueprint time budget (target: sub-minute on 100k Bank per Implementation Planning §10).
  - T-4.6.1.2 — Implement honest early-termination with partial allocation when budget exceeded.
  - T-4.6.1.3 — Scale test: 5 Sets × 100 Slots × multi-axis on synthetic 100k Bank.

---

### E-5 — Review Workbench

#### F-5.0 — Review Workbench Architecture Spec (PRECONDITION — gates all E-5)
- **S-5.0.1 — Author Spec**
  - T-5.0.1.1 — Schedule Architecture session to produce `review_workbench_architecture_v1.md` (mirrors structure of other specs: components, contracts, integration points).
  - T-5.0.1.2 — Define Reviewer Override contract (Force-include / Force-exclude / Replace / Un-reject).
  - T-5.0.1.3 — Define Approved Allocation contract (input to Draft Builder).
  - T-5.0.1.4 — Define RBAC requirements (who can Review; who can Approve).
  - T-5.0.1.5 — Freeze spec; reference from this backlog.

#### F-5.1 — Review Workbench Implementation
- **S-5.1.1 — Allocation Inspector UI**
  - T-5.1.1.1 — Build inspector view of AllocatedCandidateSet (placements, rejected slots, shortfalls, audit trail).
  - T-5.1.1.2 — Per-placement drill-down: Composite, Confidence, Penalties, ordering_reason, conflicts_resolved.
- **S-5.1.2 — Override Capture**
  - T-5.1.2.1 — Implement Force-include / Force-exclude / Replace / Un-reject UI actions.
  - T-5.1.2.2 — Persist Reviewer Overrides + reviewer_id + timestamp in audit trail.
  - T-5.1.2.3 — Wire overrides to Runtime API re-solve entry point.
- **S-5.1.3 — Approval Workflow**
  - T-5.1.3.1 — Approve action produces Approved Allocation.
  - T-5.1.3.2 — Approval gates Draft Builder (no Draft without approval).
  - T-5.1.3.3 — RBAC: only approver-role users may approve.
- **S-5.1.4 — Review Acceptance Test**
  - T-5.1.4.1 — E2E: Human inspects, overrides, approves; Draft Builder produces a Draft from the approved allocation.

---

### E-6 — Integration + QA

#### F-6.1 — Pipeline Integration
- **S-6.1.1 — Wire Real Modules**
  - T-6.1.1.1 — Replace all stubs with real modules in Runtime API orchestrator.
  - T-6.1.1.2 — Verify audit trail chains end-to-end (Blueprint → Draft).

#### F-6.2 — End-to-End System Tests
- **S-6.2.1 — Blueprint v3.0 → 5 Drafts**
  - T-6.2.1.1 — Test: full pipeline produces 5 Drafts (or honest shortfalls).
  - T-6.2.1.2 — Test: each Draft has 100 Questions (or shortfalls recorded).
  - T-6.2.1.3 — Test: distribution per Blueprint correct (Document × Difficulty × Type × Pattern).
  - T-6.2.1.4 — Test: full audit trail from Blueprint to persisted `exam_set_questions` row.
- **S-6.2.2 — Realism Test**
  - T-6.2.2.1 — Published Draft is takeable in `app/package/[slug]/exam/[examSetId]`.
  - T-6.2.2.2 — Outcome persistence (`lib/assessment/`) works unaffected.

#### F-6.3 — Regression Suite
- **S-6.3.1 — Regression Coverage**
  - T-6.3.1.1 — Existing Exam Set CRUD + publish lifecycle.
  - T-6.3.1.2 — Existing admin Question Picker / Inspector.
  - T-6.3.1.3 — Existing importer (IG-2 change is additive).
  - T-6.3.1.4 — Existing user-facing exam runtime + outcome persistence.
  - T-6.3.1.5 — Public exam-set read paths (`app/package/[slug]/exam/[examSetId]`).

#### F-6.4 — Cross-Module Integration Tests
- **S-6.4.1 — Pairwise Contracts**
  - T-6.4.1.1 — Reader → Generator (`AssemblyRequest` consumed correctly).
  - T-6.4.1.2 — Generator → Ranking (CandidateSet shape; shortfalls carried).
  - T-6.4.1.3 — Ranking → Solver (RankedCandidateSet read-only; priority inherited).
  - T-6.4.1.4 — Solver → Runtime API (AllocatedCandidateSet assembled into Assembly Result).
  - T-6.4.1.5 — Runtime API → Review → Draft Builder (post-Engine handoff).
  - T-6.4.1.6 — Draft Builder → existing publish lifecycle (Draft passes or fails loudly `validate_exam_set_for_publish`).

---

### E-7 — Production Readiness

#### F-7.1 — Performance Validation
- **S-7.1.1 — Budget Verification**
  - T-7.1.1.1 — Run Engine on realistically-sized Bank (100k+ Questions); record per-module timing.
  - T-7.1.1.2 — Verify sub-minute full v3.0 Blueprint budget (or document honest shortfall + mitigation).
  - T-7.1.1.3 — Profile Generator filter order; Solver hot paths.

#### F-7.2 — Monitoring
- **S-7.2.1 — Dashboards & Alerts**
  - T-7.2.1.1 — Per-module timing dashboard.
  - T-7.2.1.2 — Error-rate-by-category dashboard.
  - T-7.2.1.3 — Audit-trail integrity check (periodic re-derivation; determinism property).
  - T-7.2.1.4 — Draft Builder idempotency (duplicate-Draft rejection rate).
  - T-7.2.1.5 — Generator per-filter timing.

#### F-7.3 — Deployment & Rollback
- **S-7.3.1 — Runbook & Drill**
  - T-7.3.1.1 — Author deployment runbook (phased rollout per Implementation Planning §7.1).
  - T-7.3.1.2 — Rollback drill: drop IG-2 columns; disable Engine invocation; archive Engine-produced Exam Set.
  - T-7.3.1.3 — Document rollback per layer (migration / deployment / Draft / published Exam Set).

---

### E-X — Cross-Cutting Infrastructure (parallel track; starts immediately)

#### F-X.1 — Test Fixture Library
- **S-X.1.1 — Synthetic Inputs**
  - T-X.1.1.1 — Synthetic Blueprints (well-formed, malformed-structural, malformed-semantic, IG-4-inconsistent).
  - T-X.1.1.2 — Synthetic CandidateSets (varied sizes; deterministic generation).
  - T-X.1.1.3 — Synthetic RankedCandidateSets (with tie groups; with shortfalls).
  - T-X.1.1.4 — Synthetic 100k Bank (scripted generation for scale tests).

#### F-X.2 — Audit-Trail Storage (Decision Point)
- **S-X.2.1 — Audit Table (RECOMMENDED)**
  - T-X.2.1.1 — *Decision required:* choose among (a) dedicated `draft_audit_trail` table, (b) JSON column on `exam_sets`, (c) external log via `logAuditEvent`. **Recommendation: (a)** — queryable, no invasive change to `exam_sets`.
  - T-X.2.1.2 — Migration 028: create `draft_audit_trail` keyed by `exam_sets.id` with JSONB payload + indexes.
  - T-X.2.1.3 — Implement audit writer in `lib/engine/shared/audit.ts`.
  - T-X.2.1.4 — Audit-write failure rolls back the Draft write (spec §9.1).

#### F-X.3 — Observability Primitives
- **S-X.3.1 — Event Emitter**
  - T-X.3.1.1 — Implement `lib/engine/shared/observability.ts` (per-module timing, counters, error categorization).
  - T-X.3.1.2 — Pluggable sink (dev: console; prod: monitoring backend).

#### F-X.4 — Property-Based Test Harness
- **S-X.4.1 — Determinism Harness**
  - T-X.4.1.1 — Implement input-order randomization harness in `lib/engine/shared/testing/`.
  - T-X.4.1.2 — Reusable assertion: randomized input ordering → identical output.

---

## 6. Engineering Order

### 6.1 Critical Path (strict sequence)

```
E-0 (IG-2) → E-1 (Foundation) → E-2 (Generator) → E-3 (Ranking)
   → E-4 (Solver) → E-5 (Review, F-5.0 spec first) → E-6 (Integration) → E-7 (Prod Readiness)
```

### 6.2 Parallel Tracks

| Track | Starts | Parallel With |
|---|---|---|
| **E-X Cross-Cutting** (fixtures, audit storage, observability, test harness) | Day 1 | Everything |
| **F-5.0 Review Workbench Architecture Spec** | E-4 start | E-4 (must complete before E-5 impl) |
| **F-1.5 Draft Builder** | E-1 start | Phases 2–4 (against stub Assembly Results) |
| **Reader implementation** | E-0 start | E-0 (with stubbed Bank metadata) |
| **Test fixtures (F-X.1)** | Day 1 | Everything |
| **Audit storage (F-X.2)** | Any phase | Everything |

### 6.3 Recommended Sequence with Handoffs

1. **Day 1:** Start E-X (parallel). Start E-0.
2. **E-0 done →** Start E-1 (Reader can start during E-0 against stubbed Bank).
3. **E-1 done →** Start E-2. Start F-5.0 (spec session). Start F-1.5 polish if needed.
4. **E-2 done →** Start E-3.
5. **E-3 done →** Start E-4 (highest-risk; longest pole). Ensure F-5.0 completes during E-4.
6. **E-4 done + F-5.0 done →** Start E-5 implementation.
7. **E-5 done →** Start E-6.
8. **E-6 done →** Start E-7.

### 6.4 Critical-Path Risks to Watch

- **E-4 (Solver)** — longest pole; schedule slip most likely here. Mitigation: property tests early; honest partial allocations from day 1; performance budget tracked sprint-by-sprint.
- **F-5.0 (Review spec)** — if delayed, E-5 implementation blocks. Mitigation: schedule the Architecture session at E-4 start, not E-4 end.

---

## 7. Definition of Done

### 7.1 Task DoD
- Code merged to feature branch via PR with at least one reviewer.
- Unit test(s) added; existing tests pass.
- Lint / type-check clean (`tsc --noEmit`, ESLint).
- Spec reference cited in PR description (which spec, which section).
- Encapsulation gate green (no `app/` → internal-module imports added).
- Audit hook called if task produces a placement / score / allocation / override.

### 7.2 Story DoD
- All child Tasks DoD.
- Acceptance criteria (per Story) demonstrably met; linked test recorded.
- No TODO / FIXME in shipped code.
- Documentation updated (`lib/engine/<module>/README.md`).

### 7.3 Feature DoD
- All child Stories DoD.
- Feature-level integration test green.
- Contract emitted conforms to spec (field-by-field validation).
- Property test(s) for determinism / idempotency green (where applicable).

### 7.4 Epic DoD
- All child Features DoD.
- Epic Exit Criteria (per §2 Epic cards) demonstrably met.
- QA Gates (§8) green.
- Risk Gates (§9) reviewed; blocking risks resolved or explicitly accepted.
- No regression in existing substrate (regression suite green).

---

## 8. QA Gates

Each gate is **mandatory** before its Epic is considered complete.

### Gate-Q-E0 — Schema Additivity
- [ ] Migration 027 up + down applied cleanly on dev DB.
- [ ] Existing imports pass unchanged.
- [ ] New axes persisted on new imports (verified by `SELECT`).
- [ ] Admin Picker filters on all 4 axes (e2e).

### Gate-Q-E1 — Vertical Slice
- [ ] Real Blueprint → `AssemblyRequest` (byte-identical on rerun).
- [ ] Stubbed pipeline → Draft Builder → real `exam_sets` row (`status='draft'`).
- [ ] Draft passes `validate_exam_set_for_publish`.
- [ ] Encapsulation gate green (no `app/` direct internal imports).

### Gate-Q-E2 — Generator
- [ ] CandidateSet bounded by Blueprint structure on synthetic 100k Bank.
- [ ] Maximum Recall verified (no valid Candidate excluded).
- [ ] Deterministic given Bank state.
- [ ] Missing IG-2 axes surface loud (not silent).

### Gate-Q-E3 — Ranking
- [ ] Same CandidateSet → same RankedCandidateSet.
- [ ] Iteration-order randomization → identical output (property test, ≥100 runs).
- [ ] Tie groups visible; no forbidden tie-breakers.
- [ ] Every Component produces a Breakdown; Confidence never silently inflated.

### Gate-Q-E4 — Solver
- [ ] Hard Constraints satisfied or honest partial allocation with shortfalls.
- [ ] Deterministic given RankedCandidateSet + Solver version.
- [ ] Idempotent on retry.
- [ ] Performance budget met or honest early-termination documented.
- [ ] Hard Penalty augmentation (Scoring §9.2) expressed as Hard Conflicts.

### Gate-Q-E5 — Review
- [ ] Human can inspect, override (all 4 types), approve.
- [ ] Approved Allocation consumed by Draft Builder.
- [ ] RBAC enforced (only approvers approve).
- [ ] Reviewer Overrides persisted in audit trail.

### Gate-Q-E6 — Integration
- [ ] Blueprint v3.0 → 5 Drafts (or honest shortfalls).
- [ ] Full audit trail from Blueprint to `exam_set_questions`.
- [ ] Published Draft takeable; outcome persistence unaffected.
- [ ] Regression suite 100% green.

### Gate-Q-E7 — Production Readiness
- [ ] Sub-minute budget on 100k Bank met or documented.
- [ ] Monitoring dashboards live; alerts configured.
- [ ] Rollback drill executed and recorded.

---

## 9. Risk Gates

### 9.1 Blocking Tasks (must complete to proceed)

| Blocker | Gates | Owner Signal |
|---|---|---|
| **IG-2 closure (E-0)** | E-2 real filters, E-3 Pattern/LO Components, E-4 distribution Constraints | Migration applied; importer fixed |
| **F-5.0 Review Workbench Spec** | E-5 implementation | Spec frozen and referenced |
| **Reader (E-1 F-1.2)** | E-2 Generator | `AssemblyRequest` emitted |
| **Generator (E-2)** | E-3 Ranking | CandidateSet emitted |
| **Ranking (E-3)** | E-4 Solver | RankedCandidateSet emitted |
| **Solver (E-4)** | E-6 Integration | AllocatedCandidateSet emitted |
| **Audit storage decision (F-X.2)** | F-1.5 Draft Builder audit write | Option chosen; migration applied |

### 9.2 Critical Dependencies

| Dependency | Type | Mitigation |
|---|---|---|
| Solver algorithm choice | Implementation (spec leaves open) | Document in `lib/engine/solver/README.md`; baseline = greedy + backtracking; swap allowed without contract change |
| Markdown parser library | Implementation (spec leaves open) | Document choice; isolate behind Document Reader interface |
| Runtime API transport | Implementation (spec leaves open) | v1.0 = in-process function call (Server Action); future transports additive |
| Blueprint v3.0 source location | Substrate | Currently `Blueprint/simulation_exam_blueprint.md`; Reader accepts a path/document input |
| IG-1 (Bank `document` normalization) | Workaround exists | Mitigated in Reader Normalization (document aliasing); P2 closure deferred |
| IG-3 (Bank `keyword_set`) | Workaround exists | L1–L5 initially runs on `tags`/`category` proxy; P2 closure deferred |

### 9.3 Rollback Points

| Layer | Rollback Action | Reversibility |
|---|---|---|
| E-0 migration | `DROP COLUMN` (nullable; safe) | Fully reversible |
| Engine deployment (E-1 onward) | Disable Engine invocation; existing system unaffected | Additive; fully reversible |
| Individual Draft | Delete `exam_sets` row (cascade removes junction rows) | Per-Draft reversible |
| Published Engine Exam Set | `setExamSetStatusAction(id, 'archived')` | Existing lifecycle |
| Audit storage (F-X.2 option a) | Drop `draft_audit_trail` table | Additive; fully reversible |

---

## 10. Sprint Recommendation

Assumes 2-week sprints, single engineering team, critical-path-bound. Parallel tracks (E-X, F-5.0 spec, F-1.5 Draft Builder) staffed from a second stream where available.

### Sprint 1 — IG-2 + Foundation Kickoff
- **E-0** (full): Migration 027, importer fix, RPC extension, types, Picker UI.
- **E-X start**: F-X.1 fixtures (synthetic Blueprints + 100k Bank script), F-X.4 test harness.
- **E-1 start**: F-1.1 module skeleton, F-1.2 Reader Stage 1–3.
- **Exit:** Gate-Q-E0 green. Reader Stage 1–3 unit-tested.

### Sprint 2 — Reader Complete + Runtime Skeleton
- **E-1 continue**: F-1.2 Reader Stage 4–8; F-1.3 stubs; F-1.4 Runtime API skeleton.
- **E-X continue**: F-X.2 audit storage decision + migration; F-X.3 observability primitives.
- **Exit:** Reader produces real `AssemblyRequest` from Blueprint v3.0; Runtime API orchestrates stubs.

### Sprint 3 — Draft Builder + Phase 1 Exit
- **E-1 finish**: F-1.5 Draft Builder (full); F-1.6 vertical-slice integration test.
- **Exit:** Gate-Q-E1 green. Vertical slice demonstrable end-to-end.

### Sprint 4 — Candidate Generator
- **E-2** (full): F-2.1 – F-2.6.
- **Parallel:** F-5.0 Review Workbench Architecture spec session (must complete this sprint).
- **Exit:** Gate-Q-E2 green. Real CandidateSet on synthetic 100k Bank.

### Sprint 5 — Scoring + Ranking
- **E-3** (full): F-3.1 – F-3.6.
- **Exit:** Gate-Q-E3 green. Real RankedCandidateSet with property tests passing.

### Sprint 6 — Allocation Model + Solver Stages 1–6
- **E-4 part 1**: F-4.1 Allocation Model; F-4.2 Stages 1–6; F-4.3 Constraints.
- **Exit:** Solver places candidates with conflict detection/resolution on fixtures.

### Sprint 7 — Solver Stages 7–10 + Performance
- **E-4 part 2**: F-4.2 Stages 7–10; F-4.4 Feasibility/Checkpoint/Determinism; F-4.5 emission; F-4.6 performance.
- **Exit:** Gate-Q-E4 green. Honest partial allocations; performance budget checked.

### Sprint 8 — Review Workbench
- **E-5** (full): F-5.1 (F-5.0 spec completed in Sprint 4).
- **Exit:** Gate-Q-E5 green. Human override + approval end-to-end.

### Sprint 9 — Integration + Regression
- **E-6** (full): F-6.1 – F-6.4.
- **Exit:** Gate-Q-E6 green. Blueprint v3.0 → 5 Drafts; regression suite green.

### Sprint 10 — Production Readiness + Buffer
- **E-7** (full): F-7.1 – F-7.3.
- **Buffer:** Solver slip absorption (most likely), spec-feedback rework.
- **Exit:** Gate-Q-E7 green. v1.0 shippable.

### Sprint Map Summary

| Sprint | Critical Path | Parallel |
|---|---|---|
| 1 | E-0 | E-X, E-1 (skeleton + Reader 1–3) |
| 2 | E-1 (Reader + Runtime skeleton) | E-X (audit, observability) |
| 3 | E-1 (Draft Builder) → Phase 1 exit | — |
| 4 | E-2 | F-5.0 spec |
| 5 | E-3 | — |
| 6 | E-4 (Allocation + Solver 1–6) | — |
| 7 | E-4 (Solver 7–10 + perf) | — |
| 8 | E-5 | — |
| 9 | E-6 | — |
| 10 | E-7 + buffer | — |

---

## Appendix A — Spec Reference Index (for Task PR descriptions)

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
| Review Workbench | **TO BE SPECIFIED** (`review_workbench_architecture_v1.md`, F-5.0 deliverable) |
| Implementation Planning | `assessment_engine_implementation_planning_v1.md` |

## Appendix B — Tracker Import Hints

- **GitHub Issues:** Epic = label `epic/E-n`; Feature = label `feature/E-n.F-n`; Story = Issue; Task = Issue checklist / sub-Issue.
- **Linear:** Epic = Epic; Feature = Sub-Epic (or Project); Story = Issue; Task = Sub-Issue.
- **Jira:** Epic = Epic; Feature = Story (with sub-tasks); Story = Sub-Task; Task = under Sub-Task (or flatten Task → Sub-Task of Feature).
- **Notion:** Epic = Database page; Feature = sub-page; Story = card; Task = card to-do.
- **Azure DevOps:** Epic = Epic; Feature = Feature; Story = User Story; Task = Task.

---

*End of Sobdai Engineering Execution Backlog — v1.0.*

**Architecture status:** FROZEN across 10 specifications.
**Implementation Planning status:** v1.0 APPROVED.
**Engineering Execution status:** Backlog ready. Sprint 1 begins with E-0 (IG-2 closure) + E-X (cross-cutting) + E-1 skeleton.
**Critical prerequisite:** IG-2 closure (E-0) gates all Engine execution.
