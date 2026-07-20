# Sobdai Assessment Engine — Implementation Planning v1.0

**Status:** Master Implementation Roadmap (not an architecture specification)
**Architecture status:** COMPLETE and FROZEN across 10 specifications. Never redesign.
**Implemented state (verified):** Migration 026 (exam-set foundation) written; Exam Set CRUD + publish lifecycle live (Sessions 6.16–6.17); user-facing assessment scoring/outcome persistence live (Session 6.15, `lib/assessment/`). **Zero Engine module code exists.** This is a greenfield build of the Engine itself.
**Version:** 1.0
**Owner:** Chief Software Architect, Sobdai

> **What this document is.** A build order for engineers. It says what to build, in what sequence, with what dependencies, against what acceptance criteria, and what risks apply. It treats the 10 architecture documents as immutable inputs — it never restates, summarizes, or redefines them.
>
> **What this document is not.** Not architecture. Not code. Not SQL. Not pseudocode. Not a restatement of any module spec. Engineers are expected to read the relevant spec when implementing a module; this roadmap names the spec, not its contents.

---

## 0. Implementation Overview

The Assessment Engine is built in **7 phases, 11 modules, 1 critical prerequisite**. The architecture is frozen; the engineering work is sequence, dependencies, and verification.

| Dimension | Value |
|---|---|
| **Architecture documents consumed** | 10 (frozen) |
| **Modules to implement** | 9 (Reader, Generator, Scoring, Ranking, Allocation, Solver, Runtime API, Draft Builder, Review Workbench — last is the only unspecified-but-required module) |
| **Critical prerequisite** | Integration Gap IG-2 (Bank schema) — gates all Engine execution |
| **Existing substrate reused** | Migration 026, Exam Set CRUD + publish (Sessions 6.16–6.17), `lib/assessment/` outcome persistence (Session 6.15) |
| **Critical path** | IG-2 → Reader → Generator → Ranking → Solver → Runtime API → Draft Builder → Integration |
| **Total estimate shape** | Driven by Solver complexity (highest-uncertainty module) and IG-2 migration scope |

The implementation is **vertical-slice-first**: each phase ends with a demonstrable capability, even if later modules are stubbed. Phase 1 (IG-2 + Reader) alone produces a working `AssemblyRequest` from a real Blueprint — independently valuable.

---

## 1. Implementation Phases

### Phase 0 — Prerequisite: Database Readiness (IG-2)

**Goal:** Make the Bank capable of satisfying Blueprint v3.0's filter axes.

**Modules:** None (schema + importer change).
**Critical because:** Every downstream module consumes Bank metadata that does not yet exist. Without IG-2, the Generator cannot filter, the Ranker cannot score on Pattern/LO, the Solver cannot satisfy distribution constraints. Engine execution is impossible.
**Exit criterion:** A Question imported via the existing importer carries persisted `blueprint_type`, `learning_objective`, `question_pattern`, `section` — verifiable by `SELECT` after import.

### Phase 1 — Foundation: Runtime API Skeleton + Reader + Draft Builder (vertical slice)

**Goal:** End-to-end vertical slice — Blueprint in, Draft Exam Set out — with stubs for the middle.

**Modules:** Runtime API (skeleton), Reader (full), Draft Builder (full). Generator/Ranking/Solver stubbed (pass-through or trivial).
**Critical because:** Proves the full pipeline shape against real substrate (real `exam_sets` writes) before any algorithmic work. De-risks the persistence boundary early.
**Exit criterion:** A real Blueprint v3.0 document is read into an `AssemblyRequest`; a stubbed CandidateSet (e.g. all Bank Questions of a single document) flows through stub Ranking/Solver; the Draft Builder produces a real `exam_sets` row with `status='draft'`.

### Phase 2 — Generator

**Goal:** Replace the stub Candidate Generator with the real thing.

**Modules:** Candidate Generator (full).
**Critical because:** First module to touch the Bank at scale; validates filter ordering, Candidate/Pool/CandidateSet contracts, and the Maximum-Recall / Blueprint-bounded guarantees.
**Exit criterion:** A real `AssemblyRequest` produces a real CandidateSet whose size is bounded by Blueprint structure (not Bank size), with provenance per Candidate and a Shortfall Report.

### Phase 3 — Scoring + Ranking

**Goal:** Replace the stub Scoring/Ranking with the real Scoring Model implementation and per-slot ordering.

**Modules:** Scoring Model (implemented by Ranking), Candidate Ranking (full).
**Critical because:** First module to evaluate Candidates; validates Component vocabulary, Confidence propagation, and the RankedCandidateSet contract.
**Exit criterion:** A real CandidateSet produces a real RankedCandidateSet with per-(Candidate×slot) Composites, propagated Confidence, Penalties, and per-rank transparency.

### Phase 4 — Allocation + Solver

**Goal:** Replace the stub Solver with the real constraint-satisfaction runtime.

**Modules:** Allocation Model (implemented by Solver), Constraint Solver (full).
**Critical because:** Highest-uncertainty module. Joint-constraint satisfaction (Blueprint v3.0's tier floors/ceilings, anchor rule, L1–L5) is the hardest engineering problem in the Engine. This is where the critical path may slip.
**Exit criterion:** A real RankedCandidateSet produces a real AllocatedCandidateSet that satisfies all Hard Constraints (or reports honest partial allocations with shortfalls).

### Phase 5 — Review Workbench

**Goal:** Human-facing surface for inspecting and overriding allocations.

**Modules:** Review Workbench (architecture not yet specified — see §4.9).
**Critical because:** Without Review, the Engine cannot move from AllocatedCandidateSet to approved allocation; Draft Builder has no input.
**Exit criterion:** A Human can inspect an AllocatedCandidateSet, override placements, and produce an approved allocation that the Draft Builder consumes.

### Phase 6 — Integration + QA

**Goal:** Full pipeline integration, end-to-end testing, regression against existing functionality.

**Modules:** All, integrated.
**Critical because:** Properties established per-module (determinism, transparency, idempotency) must hold end-to-end.
**Exit criterion:** Blueprint v3.0 → 5 published-ready Draft Exam Sets, fully auditable, with no regression in existing Exam Set / Question Bank / Runtime exam functionality.

### Phase 7 — Production Readiness

**Goal:** Performance validation, monitoring, deployment runbooks.

**Modules:** None new (hardening).
**Exit criterion:** Engine meets performance budgets on a realistically-sized Bank (100k+ Questions); monitoring in place; rollback tested.

---

## 2. Implementation Dependencies

### 2.1 Dependency Graph

```
                    [IG-2: Bank Schema]
                          │
                          ▼
                     [Reader] ◄── depends on: real Bank metadata (for axis validation only)
                          │
                          ▼
                    [Generator] ◄── depends on: Bank read access, AssemblyRequest
                          │
                          ▼
            ┌── [Scoring Model] ◄── vocabulary, applied by Ranking
            │           │
            │           ▼
            │      [Ranking] ◄── depends on: CandidateSet, Scoring Model
            │           │
            │           ▼
            └── [Allocation Model] ◄── vocabulary, spoken by Solver
                        │
                        ▼
                   [Solver] ◄── depends on: RankedCandidateSet, Allocation Model
                        │
                        ▼
                 [Runtime API] ◄── depends on: all of the above (orchestrates)
                        │
                        ▼
                  [Review] ◄── depends on: Runtime API's Assembly Result
                        │
                        ▼
                 [Draft Builder] ◄── depends on: Review's approved allocation,
                        │                       existing exam_sets schema
                        ▼
                 [Publish lifecycle] (existing — Sessions 6.16–6.17)
```

### 2.2 Critical Path

**IG-2 → Reader → Generator → Ranking → Solver → Runtime API → Draft Builder**

The Solver is the longest-pole risk; Phase 4 is where schedule slip is most likely.

### 2.3 Parallelizable Work

| Work | Parallel with |
|---|---|
| Reader implementation | IG-2 (with stubbed Bank) |
| Draft Builder implementation | Phases 2–4 (against stub Assembly Results) |
| Review Workbench architecture spec + implementation | Phases 2–4 |
| Audit-trail storage (§5.4 of Draft Builder spec) | Any phase |
| Test fixtures (synthetic Blueprints, CandidateSets) | Any phase |

### 2.4 Blocking Dependencies

| Blocked by | Blocks |
|---|---|
| IG-2 | Generator (real filters), Ranking (Pattern/LO components), Solver (distribution constraints) |
| Reader | Generator (consumes AssemblyRequest) |
| Generator | Ranking (consumes CandidateSet) |
| Ranking | Solver (consumes RankedCandidateSet) |
| Solver | Runtime API full integration (Runtime API skeleton can ship earlier with stubs) |
| Review | Draft Builder (consumes approved allocation) |

---

## 3. Module Breakdown

For each module: purpose (named, not restated), dependencies, deliverables, acceptance criteria. Engineers read the named spec for semantics.

### 3.1 Bank Schema Extension (IG-2 closure)

| | |
|---|---|
| **Spec** | Integration Spec v1.0 §9 (IG-2) |
| **Purpose** | Persist the axes Blueprint v3.0 filters on |
| **Dependencies** | None |
| **Deliverables** | (a) Migration adding `blueprint_type`, `learning_objective`, `question_pattern`, `section` columns to `questions`; (b) Importer change to stop discarding parsed v2.1 fields; (c) Metadata RPC extension (e.g. `get_question_metadata`) to surface the new axes for filtering; (d) Backfill strategy for existing Questions (manual or deferred — flagged, not silently dropped) |
| **Acceptance** | A Question imported after deployment carries persisted values for all four axes; the existing admin Question Picker can filter on them; existing imports and Question Bank behavior unchanged (additive only) |

### 3.2 Reader

| | |
|---|---|
| **Spec** | Blueprint Reader Pipeline Architecture v1.0 |
| **Purpose** | Transform a Blueprint document into an `AssemblyRequest` |
| **Dependencies** | Blueprint document storage location (TBD — currently `Blueprint/simulation_exam_blueprint.md`); IG-2 only for axis validation, not for parsing |
| **Deliverables** | Document Reader, Markdown AST, Blueprint AST, Structural Validation, Semantic Validation, Normalization, Canonical Blueprint, AssemblyRequest emitter; full error anatomy (Fail Fast/Loud/Deterministic) |
| **Acceptance** | Blueprint v3.0 produces a deterministic `AssemblyRequest` carrying every axis (Coverage, Difficulty, Tier, Pattern, LO, Duplicate Prevention); re-running on byte-identical Blueprint produces byte-identical `AssemblyRequest`; malformed Blueprint produces structured errors with source locations |

### 3.3 Candidate Generator

| | |
|---|---|
| **Spec** | Candidate Generation Architecture v1.0 |
| **Purpose** | Discover all legal Question Codes for the Blueprint |
| **Dependencies** | IG-2 (for Pattern/LO filters); AssemblyRequest; read access to Bank metadata |
| **Deliverables** | Query Planner, Metadata Filters (ordered by selectivity), Candidate Discovery, Pool Validation, Pool Expansion, CandidateSet contract; Shortfall Report |
| **Acceptance** | CandidateSet size scales with Blueprint structure (not Bank size — verify on synthetic 100k Bank); every Candidate carries provenance; Missing-column failures (IG-2 axes absent) surface loud, not silent |

### 3.4 Scoring Model (implemented by Ranking)

| | |
|---|---|
| **Spec** | Scoring Model Specification v1.0 |
| **Purpose** | The evaluation language; implemented within Ranking |
| **Dependencies** | CandidateSet; the v1.0 Component vocabulary |
| **Deliverables** | Signal extraction; Component evaluators for the v1.0 vocabulary (Coverage Fit, Difficulty Fit, Distribution Fit, Pattern Fit, LO Fit, Freshness, Usage, Diversity, Constraint Readiness, Blueprint Alignment); Confidence propagation; Penalty application |
| **Acceptance** | Every Composite carries a Breakdown; Confidence propagates honestly (missing axes reduce Confidence, never silently inflate); Penalty types per spec |

### 3.5 Candidate Ranking

| | |
|---|---|
| **Spec** | Candidate Ranking Architecture v1.0 |
| **Purpose** | Produce per-slot orderings with full evaluation |
| **Dependencies** | CandidateSet; Scoring Model implementation |
| **Deliverables** | Scoring integration, Ordering, Tie Resolution (deterministic secondary keys, visible tie groups), RankedCandidateSet contract; full per-rank transparency |
| **Acceptance** | Same CandidateSet → same RankedCandidateSet; every position carries an ordering reason; tie groups visible (no hidden tie-breakers); CandidateSet iteration order does not affect output |

### 3.6 Allocation Model (implemented by Solver)

| | |
|---|---|
| **Spec** | Allocation Model Specification v1.0 |
| **Purpose** | The placement vocabulary; spoken by Solver |
| **Dependencies** | RankedCandidateSet |
| **Deliverables** | Slot lifecycle (Open/Reserved/Allocated/Locked/Released/Rejected/Completed); Conflict model (Hard/Soft/Dependency/Mutual Exclusion); Reservation model; Replacement/Swap/Rollback semantics |
| **Acceptance** | All state transitions conform to spec; Reservations internal (don't escape); Conflicts classified per spec; Reviewer overrides supported as constrained inputs |

### 3.7 Constraint Solver

| | |
|---|---|
| **Spec** | Constraint Solver Architecture v1.0 |
| **Purpose** | Produce a feasible joint allocation |
| **Dependencies** | RankedCandidateSet; Allocation Model implementation |
| **Deliverables** | Runtime pipeline (10 stages per spec); Constraint categories (Hard/Soft/Coverage/Distribution/Cross-Set/Dependency/Reviewer/Future); Conflict Resolution; Feasibility Model; Determinism guarantees; AllocatedCandidateSet contract |
| **Acceptance** | All Hard Constraints satisfied or honest partial allocation with shortfalls; deterministic given input; full audit trail; Hard Penalty augmentation (per Scoring §9.2) expressed as Hard Conflicts; performance budget honored or honest early-termination |

### 3.8 Runtime API

| | |
|---|---|
| **Spec** | Assessment Engine Runtime API Specification v1.0 |
| **Purpose** | Single public interface; orchestration |
| **Dependencies** | All Engine modules |
| **Deliverables** | Input Contract (Engine Request), Output Contract (Assembly Result), Execution States, Error/Warning Models, Audit Model, Versioning, Observability |
| **Acceptance** | Applications cannot call internal modules directly (enforced encapsulation); same Engine Request → same Assembly Result; full audit trail; version negotiation explicit |

### 3.9 Draft Builder

| | |
|---|---|
| **Spec** | Draft Builder Architecture v1.0 |
| **Purpose** | Materialize approved allocation into Draft Exam Set |
| **Dependencies** | Review's approved allocation; existing `exam_sets` schema (Sessions 6.16–6.17) |
| **Deliverables** | Draft Creation, Validation, Persistence (to real tables via existing CRUD path or service client); Audit metadata storage (location per spec §5.4 — implementation choice); Idempotency; Atomicity |
| **Acceptance** | Approved allocation produces N `exam_sets` rows (`status='draft'`), correct `exam_set_questions` junction rows; persisted Draft is faithful to allocation (no drift); idempotent on retry; rollback clean on failure; existing admin UI can edit the produced Draft uniformly |

### 3.10 Review Workbench (architecture not yet specified)

| | |
|---|---|
| **Spec** | TO BE SPECIFIED (later session) |
| **Purpose** | Human inspection and override of allocations |
| **Dependencies** | Assembly Result (Runtime API output); Draft Builder (downstream consumer) |
| **Deliverables** | TBD pending architecture spec |
| **Acceptance** | A Human can inspect an AllocatedCandidateSet, override placements, and produce an approved allocation that the Draft Builder consumes |
| **Note** | This module is **referenced** by all prior specs (as the post-Engine Human-driven step) but its architecture has not been specified. It must be specified before Phase 5 implementation. Until then, Phase 5 cannot start. |

---

## 4. Database Readiness

### 4.1 Existing Schema (verified, reusable as-is)

| Component | Source | Reuse |
|---|---|---|
| `questions` (core + metadata) | Migrations 001, 002, 003, 019 | Read-only for Generator |
| `questions.question_code` | Migration 026 | Read-only; identity |
| `exam_sets` (full lifecycle) | Migrations 001, 019, 024, 026 | Write target for Draft Builder |
| `exam_set_questions` junction | Migration 001 | Write target for Draft Builder |
| `validate_exam_set_for_publish` RPC | Migration 026 | Reused by existing publish lifecycle |
| `get_question_metadata` RPC | Migration 022 | Extended for IG-2 axes |
| `allocate_question_codes` RPC | Migration 026 | Reused (Importer only) |

### 4.2 Required Schema (IG-2 — the gap)

| Column | Required by | Notes |
|---|---|---|
| `questions.blueprint_type` | Ranking (Pattern Fit), Solver (distribution) | One of Memory/Concept/Procedure/Scenario |
| `questions.learning_objective` | Ranking (LO Fit) | LO1–LO4 |
| `questions.question_pattern` | Ranking (Pattern Fit) | Positive/Negative/Best Answer/Scenario/Sequence/Matching |
| `questions.section` | Solver (CR-5 Section Sweep), Ranking | มาตรา reference (e.g. ม.6–8) |

All four are **purely additive** — nullable text columns with indexes, mirroring migration 002's pattern. No destructive change.

### 4.3 IG-2 Closure Plan

1. **Migration:** Add the four columns + indexes (mirror migration 002 style).
2. **Importer change:** Stop discarding the v2.1 fields the parser already extracts. The comment at `app/admin/import/actions.ts:49-52` literally says "intentionally NOT included here to avoid insert errors" — that's the line to fix.
3. **Metadata RPC:** Extend `get_question_metadata` to surface the new axes (for the Generator's filters and the admin Question Picker UI).
4. **Backfill:** Existing Questions have NULL for these axes. Backfill strategy: manual (admin re-tags) or deferred (Engine treats NULL as "incomplete metadata," propagates reduced Confidence per Scoring §11). The latter is the default — no blocking backfill required.
5. **Type update:** `lib/types.ts` `Question` interface gains the new optional fields (mirroring Session 6.16's pattern).

### 4.4 Other Gaps (lower priority)

| Gap | Spec | Disposition |
|---|---|---|
| IG-1 (Tier derivation needs reliable `document`) | Integration Spec §9 | Mitigate via Document-name aliasing in Canonical Blueprint, or normalize `document` values later |
| IG-3 (keyword axis for Jaccard similarity) | Integration Spec §9 | Defer; L1–L5 can initially run on `tags`/`category` as a proxy |
| IG-4 (Blueprint v3.0 L1 self-inconsistency) | Integration Spec §9 | Surface as Blocking error in Reader; author resolves |
| IG-5 | Closed at language (Allocation Model) and runtime (Solver) levels | — |

---

## 5. Implementation Priority

### P0 — Blocking

| Item | Why |
|---|---|
| **IG-2 closure** | All Engine execution depends on it |
| **Reader** | Produces the input contract; everything downstream depends on it |
| **Generator** | First runtime module; validates Bank interaction patterns |
| **Ranking (incl. Scoring)** | Required for Solver to have meaningful input |
| **Solver (incl. Allocation)** | Required for any non-trivial allocation |
| **Runtime API** | Required for any Application to invoke the Engine |
| **Draft Builder** | Required for Engine output to reach persistence |
| **Review Workbench spec + impl** | Required for Human authority; currently unspecified |

### P1 — Important for v1.0 but with workaround

| Item | Why |
|---|---|
| Full Scoring Model component coverage (all 10 components) | v1.0 can ship with a subset; missing components reduce Confidence, don't block |
| Full audit-trail storage (§5.4 of Draft Builder) | v1.0 can use a basic audit log; rich query comes later |
| Performance optimization (Solver heuristics, caching) | v1.0 can be unoptimized if correct |

### P2 — Valuable, post-v1.0

| Item | Why |
|---|---|
| IG-1 mitigation (document normalization) | Improves Tier accuracy; workaround exists |
| IG-3 closure (keyword axis) | Enables full Duplicate Prevention; workaround exists |
| Streaming Runtime | Improves UX for long-running Engine invocations |
| Parallelism in Solver | Improves throughput; not required for v1.0 |

### P3 — Future

| Item | Why |
|---|---|
| Incremental / Real-time / Distributed Solver variants | Future scalability |
| AI-assisted stages | Future capability |
| New Profiles | Future capability |

---

## 6. Testing Strategy

### 6.1 Unit Tests (per module)

| Module | Key unit tests |
|---|---|
| Reader | Byte-identical `AssemblyRequest` on byte-identical input; malformed-Blueprint error anatomy |
| Generator | Filter ordering produces stable results; Maximum Recall (no valid Candidate excluded); CandidateSet size bounded by Blueprint structure (test on synthetic 100k Bank) |
| Scoring | Every Component produces a Breakdown; missing axis reduces Confidence (not inflates); Penalty types correct |
| Ranking | Determinism (same input → same output); tie groups visible; CandidateSet iteration order does not affect output |
| Solver | Hard Constraints satisfied or honest partial; Hard Penalty augmentation expressed as Hard Conflict; idempotent on retry |
| Draft Builder | Fidelity (Draft matches allocation); atomicity (rollback on partial failure); idempotency |

### 6.2 Integration Tests (between modules)

- Reader → Generator: `AssemblyRequest` consumed correctly; axis coverage validated.
- Generator → Ranking: CandidateSet shape honored; shortfalls carried forward.
- Ranking → Solver: RankedCandidateSet read-only; priority inherited, not recomputed.
- Solver → Runtime API: AllocatedCandidateSet assembled into Assembly Result.
- Runtime API → Review → Draft Builder: Full post-Engine handoff.
- Draft Builder → existing publish lifecycle: Draft passes (or fails loudly) `validate_exam_set_for_publish`.

### 6.3 System Tests (end-to-end)

- **Blueprint v3.0 → 5 Draft Exam Sets**: full pipeline; verify each Draft has 100 Questions (or honest shortfalls), correct distribution per Blueprint, full audit trail from Blueprint to Draft.
- **Realism**: published Drafts are takeable in the existing exam runtime (`app/package/[slug]/exam/[examSetId]`); result persistence (Session 6.15's `lib/assessment/`) works unaffected.

### 6.4 Regression Tests

Critical: the Engine is additive, but it touches shared substrate. Regression coverage required for:

- Existing Exam Set CRUD + publish lifecycle (Sessions 6.16–6.17).
- Existing admin Question Picker / Inspector (Session 6.17).
- Existing importer (Session 6.16 — must still work; IG-2 change is additive).
- Existing user-facing exam runtime + outcome persistence (Session 6.15).
- Public exam-set read paths (`app/package/[slug]/exam/[examSetId]`).

### 6.5 Acceptance Tests

Per §11 (Success Criteria).

### 6.6 Property-Based Tests (recommended)

The Engine's determinism property is testable by randomizing input orderings and asserting output identity. Especially valuable for Ranking and Solver.

---

## 7. Migration Strategy

### 7.1 Architecture → Production: Phased Rollout

| Step | Action | Reversibility |
|---|---|---|
| 1 | Apply IG-2 migration (additive columns) | Reverse via `DROP COLUMN` (safe; nullable) |
| 2 | Deploy Reader + Generator (read-only; no persistence changes) | Reverse by disabling Engine invocation; existing system unaffected |
| 3 | Deploy Ranking + Solver (still no persistence) | Same as above |
| 4 | Deploy Runtime API + Draft Builder (now writes Drafts) | Reverse by not invoking; existing Exam Set functionality unchanged |
| 5 | Deploy Review Workbench (Human-driven; explicitly gated) | Reverse by hiding the UI |
| 6 | First production Blueprint run → 5 Drafts → Human review → publish | Each Draft is independently rejectable |

### 7.2 Coexistence with Existing System

The Engine is **additive** to the existing system:

- Existing manual Exam Set creation (admin UI) continues to work.
- Existing Exam Set publish lifecycle is reused unchanged.
- Existing user-facing exam runtime is unaffected (Drafts are `status='draft'`, invisible to learners).
- The Engine provides an **alternative path** to producing Drafts; it does not replace manual authoring.

### 7.3 Rollback

| Layer | Rollback |
|---|---|
| IG-2 migration | Drop the columns (nullable; safe) |
| Engine deployment | Disable Engine invocation; existing system unaffected |
| Individual Draft | Delete the `exam_sets` row (cascade removes junction rows per schema) |
| Published Exam Set from Engine | Use existing archive (`setExamSetStatusAction(id, 'archived')`) |

---

## 8. Deployment Readiness

### 8.1 Checklist

- [ ] IG-2 migration applied; importer updated; existing imports unchanged.
- [ ] Reader produces deterministic `AssemblyRequest` from Blueprint v3.0.
- [ ] Generator produces CandidateSet bounded by Blueprint structure on a 100k+ Bank.
- [ ] Ranking produces deterministic RankedCandidateSet with full transparency.
- [ ] Solver produces feasible or honestly-partial AllocatedCandidateSet.
- [ ] Runtime API enforces single entry point; Applications cannot bypass.
- [ ] Draft Builder produces faithful, atomic, idempotent Drafts.
- [ ] Review Workbench allows Human override.
- [ ] Full audit trail from Blueprint to Draft.
- [ ] Performance budget validated on realistic Bank size.
- [ ] No regression in existing Exam Set / Question Bank / runtime exam functionality.
- [ ] Monitoring in place (per-module timing, error rates, audit integrity).

### 8.2 Risks (see §10)

### 8.3 Rollback (see §7.3)

### 8.4 Monitoring

| Signal | Source |
|---|---|
| Per-module timing | Runtime API observability metadata |
| Error rates by category | Runtime API Error Model |
| Audit trail integrity | Periodic re-derivation check (determinism property) |
| Draft Builder idempotency | Duplicate-Draft rejection rate |
| Bank filter performance | Generator per-filter timing |

---

## 9. Implementation Risks

### 9.1 Technical

| Risk | Impact | Mitigation |
|---|---|---|
| **Solver infeasibility on real Blueprints** | Engine cannot satisfy Blueprint v3.0's constraints; produces many Rejected Slots | Implement honest partial allocations; surface shortfalls loudly; allow Blueprint editing |
| **Performance on large Banks** | Generator or Solver exceeds time budget | Verify on synthetic 100k Bank early (Phase 2); optimize filter order; consider parallelism |
| **Determinism drift across deployments** | Same Blueprint produces different Drafts | Property-based testing; pin versions; encapsulate internal module versions |
| **Reader robustness on Blueprint variants** | v3.0 parses but v3.1 doesn't | Version detection (Reader v1.x); structural validation with source-location errors |

### 9.2 Business

| Risk | Impact | Mitigation |
|---|---|---|
| **Blueprint v3.0 self-inconsistency (IG-4)** | Reader rejects Blueprint; Engine blocked at intake | Surface as Blocking error; route to Blueprint author for resolution |
| **Bank metadata quality** | Existing Questions lack IG-2 axes; Engine produces low-Confidence results | Reduced Confidence surfaces to Reviewer; manual backfill prioritized |
| **Reviewer trust** | Humans don't trust Engine output | Full transparency (per-rank reasoning); start with advisory mode |

### 9.3 Performance

Covered in §9.1 (Solver, Generator). Primary risk: Solver runtime on 5 Sets × 100 Slots × multi-axis constraints.

### 9.4 Data

| Risk | Impact | Mitigation |
|---|---|---|
| **Draft materialization corruption** | Wrong Questions persisted | Draft Builder validation (§6 of spec); atomicity (rollback on mismatch) |
| **Audit trail gaps** | Traceability lost | Audit-write failure rolls back the Draft write (spec §9.1) |

### 9.5 Versioning

| Risk | Impact | Mitigation |
|---|---|---|
| **Breaking schema change after deployment** | Existing Drafts orphaned | Additive-only migrations; IG-2 pattern (nullable columns) |
| **Engine version drift across environments** | Different environments produce different output | Pin versions in deployment; Runtime API version negotiation |

### 9.6 Migration

| Risk | Impact | Mitigation |
|---|---|---|
| **Existing functionality regression** | Admin or learner features break | Regression suite (§6.4); phased rollout (§7.1) |
| **Existing data incompatibility** | Pre-IG-2 Questions produce NULL axes | Reduced Confidence (default behavior); backfill deferred |

---

## 10. Success Criteria

### Assessment Engine v1.0 is complete when:

1. **End-to-end capability:** A real Blueprint v3.0 document produces 5 Draft Exam Sets via the full pipeline (Reader → Generator → Ranking → Solver → Runtime API → Review → Draft Builder).
2. **Fidelity:** Each Draft faithfully reflects its approved allocation — no drift, correct ordering, shortfalls recorded.
3. **Determinism:** Same Blueprint + same Bank state + same versions → same Drafts. Property-tested.
4. **Transparency:** Any placed Question can be traced from Blueprint slot through every module to the persisted `exam_set_questions` row.
5. **Human authority:** No Draft is produced without Review approval; no Draft is published without explicit Human action via existing lifecycle.
6. **Honest partial allocations:** When the Bank cannot fully satisfy a Blueprint, the Engine produces partial Drafts with explicit shortfalls (not fake-feasible).
7. **Substrate integration:** Drafts enter the existing publish lifecycle; published Drafts are takeable in the existing runtime; outcome persistence (Session 6.15) works unaffected.
8. **No regression:** Existing Exam Set CRUD, Question Bank admin, importer, and user-facing exam runtime work unchanged.
9. **Performance:** Engine runs within an agreed time budget on a realistically-sized Bank (target: 100k Questions, sub-minute for full v3.0 Blueprint).
10. **Observability:** Per-module timing, error rates, and audit integrity are monitored.

---

## 11. Future Roadmap

### v1.1 — Refinement

- Performance optimization (Solver heuristics, Generator caching).
- Full Scoring Model component coverage.
- Rich audit-trail query/UI.
- IG-1 and IG-3 closure (document normalization, keyword axis).

### v2.0 — Extension

- New Blueprint source formats (JSON, YAML, visual editor) — additive adapters.
- New Profiles (Diagnostic, Weekly Challenge) — additive rule sets.
- Streaming Runtime API.
- Parallel / Distributed Solver.
- Incremental Solver (re-solve only affected parts on override).

### Future (no redesign)

- AI-assisted stages (signal sources only, per architecture spec).
- Engine as a Service (multi-tenant).
- Batch / Cloud Runtime variants.
- Psychometric Components (additive via Scoring Model version bump).

**Architectural guarantee:** All future enhancements are additive per the 10 architecture specs. No future enhancement requires redesigning a frozen module.

---

## Appendix A — Reference Index

For each module, the authoritative spec (engineers read these, not this roadmap):

| Module | Spec Document |
|---|---|
| (Foundation) | `assessment_assembly_engine_foundation_v1.md` |
| Input contract | `blueprint_integration_specification_v1.md` |
| Reader | `blueprint_reader_pipeline_architecture_v1.md` |
| Generator | `candidate_generation_architecture_v1.md` |
| Scoring | `scoring_model_specification_v1.md` |
| Ranking | `candidate_ranking_architecture_v1.md` |
| Allocation | `allocation_model_specification_v1.md` |
| Solver | `constraint_solver_architecture_v1.md` |
| Runtime API | `assessment_engine_runtime_api_specification_v1.md` |
| Draft Builder | `draft_builder_architecture_v1.md` |
| Review Workbench | **TO BE SPECIFIED** (required before Phase 5) |

## Appendix B — Existing Substrate (reused, not rebuilt)

| Component | Source session | Reuse mode |
|---|---|---|
| Migration 026 (exam-set foundation) | 6.16 | Read-only substrate |
| Exam Set CRUD + publish actions | 6.16 | Draft Builder may route through |
| Exam Set admin UI (form, picker, lifecycle buttons) | 6.17 | Operates on Engine-produced Drafts uniformly |
| Importer (question_code allocation) | 6.16 | Extended for IG-2 (stop discarding) |
| Outcome persistence (`lib/assessment/`) | 6.15 | Unaffected; user-facing exam scoring |
| `validate_exam_set_for_publish` RPC | 6.16 | Existing publish lifecycle; reused |

---

*End of Sobdai Assessment Engine Implementation Planning — v1.0.*

**Architecture status:** FROZEN across 10 specifications.
**Implementation status:** Starts here. Phase 0 (IG-2) is the first action item.
**Critical prerequisite:** IG-2 closure gates all Engine execution. The importer already parses the required fields and discards them — closure is primarily a "stop discarding" task plus an additive migration.
