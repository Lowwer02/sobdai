# Sobdai Session E-4C.3 — IG-5 Specification Amendment v1.0

**Status:** AUTHORITATIVE specification reconciliation for Integration Gap IG-5 (Solver input propagation).
**Scope:** Narrowly scoped to the IG-5 Solver-input-propagation sub-problem — carrying a read-only **Constraint Snapshot** derived from the `AssemblyRequest` through the Engine to the Constraint Solver. Does not redesign any module, introduce any stage, or introduce any module.
**Architecture status:** FROZEN across 10 specifications. This amendment reconciles five of them so they become internally consistent; it changes no architectural responsibility.
**Version:** 1.0
**Owner:** Chief Assessment Architect, Sobdai
**Resolves:** The verified IG-5 Specification Conflict blocking Solver Stage 3 (E-4C.3), established by the IG-5 Architecture Reconciliation, ratified by the IG-5 Architecture Ratification (Option A — APPROVED).
**Governance precedent:** Follows the structure of the IG-2 Architecture Amendment v1.0 (`ig2_architecture_amendment_v1.md`).

> **What this document is.** A Specification Amendment. It applies the ratified IG-5 Architecture Decision (Option A) to the frozen specifications. It introduces one new read-only architectural concept — the **Constraint Snapshot** — defines it precisely, and reconciles the Engine Foundation, Integration Specification, Candidate Generation, Candidate Ranking, and Constraint Solver so their statements about how the Solver obtains Blueprint constraints become mutually consistent. It records normative and editorial changes per specification.
>
> **What this document is not.** Not code. Not TypeScript. Not a contract implementation. Not a redesign. Not a new stage. Not a new module. Not a modification of the `AssemblyRequest` itself. Not a modification of any module's responsibilities.

---

## 0. Decision Summary (read this first)

| # | Decision | Effect |
|---|---|---|
| **D-1** | The Constraint Solver continues to consume **only the `RankedCandidateSet`** as its input (Solver §1.3, single-input contract). No second Solver input is introduced. | Normative (affirms existing contract) |
| **D-2** | A **Constraint Snapshot** — a read-only projection of the `AssemblyRequest`'s constraint declarations — is carried through the Engine to the Solver. It is the channel that makes Solver §2.5 ("carried in RankedCandidateSet") and Appendix B #2 (the `AssemblyRequest` as a consumed upstream contract) literally true. | Normative (new carried-forward artifact) |
| **D-3** | The Constraint Snapshot is **NOT** the `AssemblyRequest`, the Blueprint, Runtime State, or Solver State. It is a **read-only projection derived from the `AssemblyRequest`**, carrying only the minimal constraint subset downstream Solver stages require. | Normative (definition + boundary) |
| **D-4** | The Snapshot's **information content** is fixed by this amendment (§1.2). It carries only: `distributionConstraints`; the enforcement levels and bindings of `coverageRules`, `duplicatePrevention`, and `loDistribution`; and `target`/`runUnit`/`documentRegistry` (Tier assignments) as context. It does **not** carry `exclusions` (runtime-only), `identity` (already carried as `assemblyRequestId`), `meta` (versioning), or `distribution` (per-axis targets the Generator already projects into its own metadata/`slot_index`). | Normative (subset discipline) |
| **D-5** | **Ownership:** the Constraint Snapshot originates with the `AssemblyRequest` (Reader-emitted). The Generator attaches it to the CandidateSet; Ranking carries it forward; the Solver consumes it read-only. **No module owns or modifies the Snapshot except its originating `AssemblyRequest`.** | Normative (ownership + immutability) |
| **D-6** | The Snapshot is **propagated unchanged** across the CandidateSet → RankedCandidateSet → AllocatedCandidateSet boundary, mirroring the established carried-forward pattern for `shortfallReport` and `coverageSatisfaction` (Ranking §7.4, Solver §12.4). | Normative (propagation) |
| **D-7** | The Engine Foundation §4.2 pipeline-payload diagram is **reconciled**, not redesigned: the diagram is self-labeled "conceptual," and the Snapshot is a constraint-subset carry-forward honoring Integration Spec §4.4 strict reduction — not a carry-forward of the full `AssemblyRequest`. | Normative (reconciliation) + Editorial |
| **D-8** | Generator §13.1 is **reconciled**: attaching and carrying the Snapshot forward is a read-only pass-through, not a "modification of the `AssemblyRequest`." The CandidateSet's *core* contract (codes, candidates, slot_index) is unchanged; the Snapshot is a parallel carried-forward field. | Normative (reconciliation) |
| **D-9** | **Engineering may implement Solver Stage 3** under this amendment. Stage 3 consumes the Constraint Snapshot via the Runtime State and validates the Blueprint's constraints for joint feasibility. Stage 3's defined responsibility (Solver §3.2, §11.1) is unchanged. | Normative |

---

## 1. The Constraint Snapshot — Definition

This section defines the single new concept introduced by this amendment. It is the authoritative definition; all specification edits in §3 conform to it.

### 1.1 What the Constraint Snapshot IS

The **Constraint Snapshot** is a read-only, immutable projection of the `AssemblyRequest`'s constraint declarations, carried through the Engine so that downstream Solver stages have the Blueprint's rule content they are defined to consume.

It exists to close the IG-5 Specification Conflict: Solver §2.5 states the Solver consumes constraints "via AssemblyRequest (carried in RankedCandidateSet)," and Appendix B #2 lists the `AssemblyRequest` among the Solver's read-only consumed upstream contracts, but the `RankedCandidateSet` carried only the `AssemblyRequest`'s *id*. The Constraint Snapshot is the carried-forward artifact that makes both statements true, **without** carrying the entire `AssemblyRequest` (which would violate Integration Spec §4.4 strict reduction and Engine Foundation §4.1 "Codes, not Content" token discipline).

### 1.2 Information content (the minimal constraint subset)

The Constraint Snapshot carries **only** the constraint declarations downstream Solver stages are defined to consume. It is fixed by this amendment (D-4); adding a field is a contract change requiring an amendment bump.

| Component | Source field on `AssemblyRequest` | Why it is carried | Consumed by |
|---|---|---|---|
| **`distributionConstraints`** | `distributionConstraints` (`sumPerSet`, `tierMinMax`, `tier1Floor`, `tier4Ceiling`, `anchor`) | Joint arithmetic invariants (Integration Spec §5.3); Stage 3 impossible-on-paper detection (Solver §3.2, §11.1) and downstream distribution satisfaction. | Solver Stage 3+ |
| **Coverage rules** | `coverageRules` (CR-1…CR-5: `id`, `level`, `binding`) | CR-1 mandatory-topic presence, CR-3 cross-set, CR-5 section sweep. Enforcement level (`hard`/`soft`) and bindings are Solver inputs. | Solver Stage 3+ |
| **Duplicate-prevention rules** | `duplicatePrevention` (L1…L5: `id`, `scope`, `level`, `similarityThresholds?`) | L1 within-set uniqueness, L3 cross-set, L2 section cap. Scope/level/thresholds are Solver inputs. | Solver Stage 3+ |
| **LO distribution** | `loDistribution` (`targets`, `typeMap`) | LO percentage targets and LO↔BlueprintType correspondence. | Solver Stage 3+ |
| **Document Registry (Tier assignments)** | `documentRegistry` (each: `id`, `tier`) | Tier is a document property (Integration Spec §5.2) consumed by tier-floor/ceiling arithmetic. Carried only for Tier lookup. | Solver Stage 3+ |
| **Run context** | `target` (`sets`, `perSet`), `runUnit` | Joint-allocation scope (5 co-allocated sets; Integration Spec §5.1). Minimal context for cross-set constraints. | Solver Stage 3+ |

**Deliberately NOT carried** (strict-reduction discipline, Integration Spec §4.4):
- `identity` — already present downstream as `CandidateSetIdentity.assemblyRequestId`; the Snapshot does not duplicate it.
- `distribution` (per-axis targets) — the Generator already projects these into Candidate metadata and `slot_index` (Generator §3.2, §10.3). Carrying them again would duplicate.
- `exclusions` — runtime-only (Integration Spec §4.3); not a constraint declaration.
- `meta` — versioning is carried on each module's own `meta` block.

### 1.3 What the Constraint Snapshot is NOT

- ❌ **NOT the `AssemblyRequest`.** It is a read-only projection of a subset of it. The `AssemblyRequest` remains the Integration Spec's authoritative contract; the Snapshot does not redefine, extend, or replace it.
- ❌ **NOT the Blueprint.** The Blueprint is the upstream Markdown artifact; neither the `AssemblyRequest` nor the Snapshot is the Blueprint.
- ❌ **NOT Runtime State.** Runtime State (Solver §13) is the Solver's mutable-within-run working state (Slots, occupancy, Reservations). The Snapshot is an immutable read-only input, never mutated.
- ❌ **NOT Solver State.** Solver State is internal search state. The Snapshot is carried *into* the Solver, not produced by it.
- ❌ **NOT a CandidateSet core field.** It is a parallel carried-forward field, layered alongside (not into) the candidates/slot_index/shortfalls.

### 1.4 Ownership

| Concern | Owner |
|---|---|
| **Information content** | This amendment (§1.2). |
| **Origin** | The `AssemblyRequest` (Reader-emitted, Integration Spec §4). The Snapshot is *derived* from it by projection, never authored independently. |
| **Attachment to CandidateSet** | The Generator (Stage 6 emission). Read-only pass-through. |
| **Carry-forward** | Ranking (unchanged pass-through to RankedCandidateSet); Solver (unchanged into the Runtime State). |
| **Modification authority** | **None.** No module owns or modifies the Snapshot except its originating `AssemblyRequest`. Every consumer treats it read-only. |

### 1.5 Lifecycle

- **Birth:** derived from the `AssemblyRequest` at Generator Stage 6 (CandidateSet emission). The Generator, which already consumes the `AssemblyRequest` (Generator §3 QueryPlan), projects the constraint subset into the Snapshot.
- **Stability:** immutable once attached. Propagated unchanged across every subsequent boundary.
- **Consumption:** read-only by the Solver (Stage 2 surfaces it into the Runtime State; Stage 3+ consume it).
- **Death:** released at Solver termination, alongside all other Runtime State (Solver §1.4, §13).
- **Caching:** permitted for audit (input-deterministic; mirrors Solver §12.5 / Scoring Model §9.3).

### 1.6 Propagation

```
AssemblyRequest  (Reader-emitted; authoritative; Integration Spec §4)
       │
       │  Generator Stage 6 projects the constraint subset (§1.2)
       ▼
Constraint Snapshot  ── attached to ──►  CandidateSet
       │                                  (Generator §10.3)
       │  Ranking carries forward unchanged (Ranking §7.4 pattern)
       ▼
Constraint Snapshot  ── carried on ──►  RankedCandidateSet
       │                                  (Ranking §7.3)
       │  Solver Stage 2 surfaces into Runtime State (read-only)
       ▼
Constraint Snapshot  ── consumed by ──►  Solver Stage 3+ (validate, place, resolve)
```

The propagation mirrors the established carried-forward pattern for `shortfallReport` and `coverageSatisfaction` (Ranking §7.4: "carries forward … unchanged"; Solver §12.4: "carries forward … unchanged"). The Constraint Snapshot is the same class of read-only upstream cargo.

### 1.7 Immutability

The Constraint Snapshot is **deeply immutable**:
- Read-only at every boundary (no consumer may modify it).
- Propagated unchanged (no transformation, no enrichment, no reduction between CandidateSet and Solver).
- Version-stable (its content is a pure function of the `AssemblyRequest`; same `AssemblyRequest` → same Snapshot).
- Honors determinism: same `AssemblyRequest` → same Snapshot → contributes to Solver §9.2 ("same `RankedCandidateSet` + same Solver version → same `AllocatedCandidateSet`").

### 1.8 Downstream visibility

The Snapshot is visible **only** to Engine-internal modules on the carry-forward path (Generator, Ranking, Solver) and, for audit, in the AllocatedCandidateSet's transparency layer (Solver §10). It does **not** escape the Engine:
- It is not surfaced to the Review Workbench as an editable object (the Reviewer sees placements and may override; the Reviewer does not edit constraints — that is Blueprint authoring).
- It is not part of the Draft Exam Set.
- It is content-free (Solver §15.1: "never reads Question content"); it carries rule declarations, never Question bodies.

---

## 2. The IG-5 Specification Conflict Being Closed

### 2.1 The conflict (as established by the Architecture Reconciliation)

Two sets of frozen specifications made mutually exclusive claims about whether the `AssemblyRequest`'s constraint content reaches the Solver:

**Position 1 (requires propagation):**
- Solver §2.5: "Consumes constraints via AssemblyRequest (**carried in RankedCandidateSet**)."
- Solver Appendix B #2 ("non-negotiable"): "The Solver consumes all upstream contracts read-only. (RankedCandidateSet, Scoring Model, Allocation Model, **AssemblyRequest** — never modified.)"
- Integration Spec §5.3: "the `AssemblyRequest` must carry these constraints verbatim … so the Engine has what it needs."
- Ranking AP-3: "Ranking consumes the AssemblyRequest's intent via the CandidateSet."

**Position 2 (does not propagate):**
- Generator §10.3 CandidateSet shape: carries `identity (AssemblyRequest id)` only — not the constraint body.
- Ranking §7.3 RankedCandidateSet shape: wraps CandidateSet; no constraint body.
- Solver Runtime State: constructed from RankedCandidateSet alone; no constraint body reachable.

**Classification (Architecture Reconciliation):** Specification Conflict.

### 2.2 The ratified resolution (Option A)

The IG-5 Architecture Ratification (Option A — APPROVED) determined that Position 1 is the authoritative interpretation, because it is asserted as a non-negotiable Boundary Assertion (Solver Appendix B) and required by the Integration Spec (§5.3). The resolution is to make Position 2's contracts honor Position 1 by carrying the **Constraint Snapshot** (a constraint *subset*, not the full `AssemblyRequest`) through the established carry-forward channel.

This amendment applies that resolution. It is **not** a redesign: it changes no responsibility, no stage, no module, and no single-input contract. It reconciles the contracts so they become internally consistent.

---

## 3. Affected Specifications

### 3.1 Assessment Assembly Engine Foundation v1.0

**Reason for amendment.** Foundation §4.2 "The Pipeline Payload" depicts the `AssemblyRequest` flowing into the Generator and a reduced CandidateSet flowing out, with no carry-forward of constraint content. Foundation §4.1 establishes "Codes, not Content" and token-efficiency. The Constraint Snapshot (a *constraint subset*, not content, not the full `AssemblyRequest`) must be reconciled against this posture. The Foundation is the root source of truth and must remain internally consistent with the downstream carry-forward.

**Normative changes.** None. The Foundation defines no Solver-internal input contract in detail; it delegates Engine internals to later documents ("Engine Foundation v1.1, future" per Integration Spec §5.3). No Foundation module, contract, or responsibility changes.

**Editorial changes.**
- §4.2 reconciliation note: the pipeline-payload diagram is self-labeled "Names are conceptual; this is architecture, not implementation." Add an explicit note that the CandidateSet may carry a read-only **Constraint Snapshot** (a projection of the `AssemblyRequest`'s constraint subset, per IG-5 Specification Amendment v1.0) alongside `codes[]` / `metadata{}` / `provenance`, for downstream joint-constraint satisfaction (IG-5). This is consistent with "Codes, not Content": the Snapshot carries rule declarations, never Question bodies; and with token efficiency: it is bounded by Blueprint rule structure (O(rules)), never by Bank size.
- §4.1 clarification: "Codes, not Content" governs Question *content* (bodies, choices, explanations); it does not forbid carrying the Blueprint's own *rule declarations*, which are the Engine's input contract, not Question content.

**No-change statement.** The Foundation's module list (§3.2), module responsibilities (§5), data-flow rule ("Codes, not Content"), token-efficiency posture, failure modes, and all principles are unchanged. The pipeline structure (Reader → Generator → Ranking → Review → Draft Builder, with the Solver as the deferred IG-5 closer) is unchanged.

**Backward compatibility.** Fully backward-compatible. The Snapshot is additive carried-forward cargo; it introduces no new Foundation contract and breaks no existing Foundation statement. Any consumer that ignored a CandidateSet's constraint content continues to function; the Snapshot is consumed only by the Solver.

---

### 3.2 Blueprint Integration Specification v1.0

**Reason for amendment.** Integration Spec §5.3 requires the constraint content to reach "the Engine … so the Engine has what it needs," and §5.6 requires the Engine to "fail safe and loud" on unsatisfiable rules. The Constraint Snapshot is the artifact that satisfies this requirement. The Integration Spec is the authority on the `AssemblyRequest` contract; this amendment must not redefine the `AssemblyRequest`.

**Normative changes.** None to the `AssemblyRequest` contract itself. The `AssemblyRequest` (§4.3 field contracts) is the authoritative, unmodified source of the Snapshot. The Snapshot is a *projection* of it, not a redefinition.

**Editorial changes.**
- §5.3 alignment note: record that the channel by which "the Engine has what it needs" is now specified — via the Constraint Snapshot carried through the CandidateSet/RankedCandidateSet to the Solver (IG-5 Specification Amendment v1.0). This closes the "Engine Foundation v1.1, future" deferral at the contract-propagation level.
- §4.4 reaffirmation: the strict-reduction principle governs the Snapshot. The Snapshot carries only the minimal constraint subset (Amendment §1.2); it deliberately omits `identity`, `distribution`, `exclusions`, `meta`. This is the operational enforcement of §4.4 against the carry-forward.

**No-change statement.** The `AssemblyRequest` contract (§4.2, §4.3), the Canonical Blueprint transformation (§6), the reconciliation sections (§5.1–§5.6), the Integration Gaps IG-1 through IG-5 as *definitional* gaps (§9), and all precedence rules (§1.3) are unchanged. IG-5's *definition* as a constraint-satisfaction problem is unchanged; this amendment closes only its *input-propagation* sub-problem.

**Backward compatibility.** Fully backward-compatible. The `AssemblyRequest` is byte-identical before and after. The Snapshot is derived from it by projection; any `AssemblyRequest` that satisfied §4.3 continues to satisfy it.

---

### 3.3 Candidate Generation Architecture v1.0

**Reason for amendment.** The Generator owns the CandidateSet (§10.3) and is the module that consumes the `AssemblyRequest` (§3 QueryPlan). It is therefore the origin point where the Constraint Snapshot is attached. Generator §13.1 lists "Modify the `AssemblyRequest`" under CANNOT and §10.5 states downstream annotations are "layered on top, never modifying the CandidateSet's core contract" — these must be reconciled so attaching the read-only Snapshot is not mistaken for a modification.

**Normative changes.**
- §10.3 (CandidateSet conceptual shape): add `constraintSnapshot` as a carried-forward field. The CandidateSet gains one parallel read-only field alongside `identity`, `candidates`, `slot_index`, `shortfall_report`, `coverage_satisfaction`, `warnings`, `meta`, `exclusions_log`.
- §10.2 / §6 (CandidateSet emission, Stage 6): the Generator projects the Constraint Snapshot (Amendment §1.2 subset) from the `AssemblyRequest` it already consumes, and attaches it read-only to the emitted CandidateSet. This is a pure projection — the Generator does not invent, infer, or modify rule content (honors Generator §13.1 "MUST NEVER: infer missing metadata").

**Editorial changes.**
- §13.1 reconciliation (binding, per Ratification risk R2): explicitly state that attaching and carrying the Constraint Snapshot is a **read-only pass-through**, not a "modification of the `AssemblyRequest`." The Snapshot is derived by projection; the `AssemblyRequest` is untouched. The CandidateSet's *core* contract (`candidates`, `slot_index`, etc.) is unchanged; the Snapshot is a parallel carried-forward field, not a modification of Candidate records.
- §10.5 clarification: "layered on top, never modifying the CandidateSet's core contract" applies to downstream *annotations on Candidates* (scores, assignment state). The Constraint Snapshot is not a Candidate annotation; it is a separate carried-forward field, and it too is never modified.

**No-change statement.** The Generator's seven filters (§4.3), the QueryPlan (§3), Pool Validation's per-axis boundary (§7.3 — "Validation is per-axis. It does not solve joint constraints"), the failure catalogue (§11.2, including "Solver detects the actual infeasibility"), Maximum Recall, determinism, and all responsibilities are unchanged. The Generator still does **not** solve joint constraints (IG-5 remains the Solver's job). The Generator's relationship to the Bank is unchanged.

**Backward compatibility.** Fully backward-compatible. The Snapshot is an additive field; existing CandidateSet consumers that do not read it are unaffected. The Generator's emission of `candidates`, `slot_index`, `shortfall_report`, `coverage_satisfaction` is byte-identical.

---

### 3.4 Candidate Ranking Architecture v1.0

**Reason for amendment.** Ranking owns the RankedCandidateSet (§7.3) — the named carrier in Solver §2.5 ("carried in RankedCandidateSet"). Ranking must carry the Constraint Snapshot forward unchanged, mirroring its existing carry-forward of `shortfallReport` and `coverageSatisfaction` (§7.4). Ranking AP-3 ("Ranking consumes the AssemblyRequest's intent via the CandidateSet") becomes literally true.

**Normative changes.**
- §7.3 (RankedCandidateSet shape): add `constraintSnapshot` as a carried-forward field, carried unchanged from the CandidateSet. This mirrors the existing §7.4 carried-forward fields.
- §7.4 (Carried-Forward Fields): extend the carried-forward set to include the Constraint Snapshot, alongside `shortfall_report` and `coverage_satisfaction`. Ranking does not modify it.

**Editorial changes.**
- AP-3 alignment: AP-3 ("Ranking consumes the AssemblyRequest's intent via the CandidateSet; it never edits it") is now operationally honored — the Snapshot is the carried-forward "intent" AP-3 references. Ranking treats it read-only (it does not edit), consistent with AP-3.

**No-change statement.** Ranking's seven stages (§2.1), ordering rules (§5), tie resolution (§6), transparency (§9), failure handling (§10), statelessness (§1.4), the no-modification rule for Scores/Confidences/Penalties (§8.3, AP-10/AP-11/AP-12), and all responsibilities are unchanged. Ranking does **not** evaluate constraints (AP-2: joint-constraint satisfaction is the Solver's job); it merely carries the Snapshot forward.

**Backward compatibility.** Fully backward-compatible. The Snapshot is additive carried-forward cargo, identical in kind to the existing carried-forward fields. Existing RankedCandidateSet consumers that do not read it are unaffected.

---

### 3.5 Constraint Solver Architecture v1.0

**Reason for amendment.** The Solver is the consumer the Snapshot exists to serve. Solver §2.5 and Appendix B #2 assert the `AssemblyRequest` (via the RankedCandidateSet) as a consumed upstream contract; this amendment makes those assertions true. Stage 3 (§3.2, §11.1) is defined to validate "Runtime State + AssemblyRequest constraints" — the Snapshot is how that input arrives.

**Normative changes.**
- §2.5: the relationship "Solver ↔ Blueprint | Consumes constraints via AssemblyRequest (carried in RankedCandidateSet)" is now operationally true: the Solver consumes the Constraint Snapshot carried on the RankedCandidateSet. The wording is unchanged; the Snapshot is the mechanism by which the parenthetical "carried in RankedCandidateSet" is realized.
- Appendix B #2: "The Solver consumes all upstream contracts read-only (RankedCandidateSet, Scoring Model, Allocation Model, AssemblyRequest — never modified)" is now operationally true: the Solver consumes the `AssemblyRequest`'s constraint content via the read-only Constraint Snapshot. The Solver never modifies it.
- §3.2 Stage 3 input: the "AssemblyRequest constraints" input is delivered as the Constraint Snapshot surfaced into the Runtime State at Stage 2.
- §13 (Solver State): the Runtime State gains a read-only reference to the Constraint Snapshot (surfaced at Stage 2 initialization from the RankedCandidateSet). The Snapshot is **not** mutable Solver State; it is an immutable read-only input held alongside the mutable Runtime State.

**Editorial changes.**
- Stage 2 (Initialize Runtime State, §3.2): clarify that initialization surfaces the Constraint Snapshot from the consumed RankedCandidateSet into the Runtime State (read-only), so Stage 3+ can consume it. This is consistent with Stage 2's existing role of building the state later stages consume.
- §1.3 reaffirmation: the Solver still owns "one transformation: `RankedCandidateSet → AllocatedCandidateSet`." The Snapshot is carried *on* the RankedCandidateSet; it is not a second input. The single-input contract is preserved.

**No-change statement.** The Stage Map (§3.1, ten stages), Stage Contracts (§3.2), Constraint Categories (§4), the Constraint Evaluation Lifecycle (§5), Placement/Conflict/Resolution models (§6, §7), the Feasibility Model (§8), Determinism (§9), Transparency (§10), Failure Handling (§11, including §11.1 "Blueprint impossible — Detected at §3 stage 3"), the AllocatedCandidateSet contract (§12), Solver State model (§13), Layer Boundaries (§15), and all Anti-Patterns (§16) are unchanged. Stage 3's defined responsibility — static/joint feasibility validation, impossible-on-paper detection — is **unchanged**. The Solver still consumes only the RankedCandidateSet.

**Backward compatibility.** Fully backward-compatible at the contract-intent level: the Solver's stated contracts (§1.3, §2.5, §3.2, Appendix B) are *honored*, not changed. The Snapshot makes previously-aspirational assertions operationally true. No Solver stage, responsibility, or output contract changes.

---

## 4. Amendment Details — Constraint Snapshot Contract Summary

This section consolidates the Snapshot's contract for reference. It is the single source of truth for the concept; the per-specification edits in §3 conform to it.

| Attribute | Value |
|---|---|
| **Identity** | Constraint Snapshot (a read-only projection of the `AssemblyRequest`). |
| **Is** | Read-only, immutable, derived projection of the `AssemblyRequest`'s constraint subset (§1.2). |
| **Is NOT** | The `AssemblyRequest`; the Blueprint; Runtime State; Solver State; a Candidate annotation. |
| **Origin** | Derived from the `AssemblyRequest` (Reader-emitted, Integration Spec §4) by projection at Generator Stage 6. |
| **Ownership** | Originates with the `AssemblyRequest`. No module owns or modifies the Snapshot except its originating `AssemblyRequest`. |
| **Attachment** | Generator attaches to CandidateSet (§10.3) as a carried-forward field. |
| **Propagation** | CandidateSet → RankedCandidateSet (Ranking §7.4, unchanged) → Solver Runtime State (Stage 2, read-only). Propagated unchanged. |
| **Immutability** | Deeply immutable; read-only at every boundary; version-stable (pure function of the `AssemblyRequest`). |
| **Information content** | Fixed by §1.2: `distributionConstraints`; coverage rules (id/level/binding); duplicate-prevention rules (id/scope/level/thresholds); LO distribution (targets/typeMap); document Registry Tier assignments; run context (`target`, `runUnit`). |
| **Deliberately omitted** | `identity` (carried as `assemblyRequestId`); `distribution` (projected into Candidate metadata/slot_index); `exclusions` (runtime-only); `meta` (versioning on each module). |
| **Downstream visibility** | Engine-internal (Generator, Ranking, Solver) + audit (AllocatedCandidateSet transparency). Not surfaced as editable to Review; not in the Draft. Content-free (rule declarations only). |
| **Determinism** | Same `AssemblyRequest` → same Snapshot. Contributes to Solver §9.2. |
| **Lifecycle** | Birth at Generator Stage 6; immutable; released at Solver termination; caching permitted (input-deterministic). |

---

## 5. Compatibility Analysis

### 5.1 Architectural responsibility preservation

| Subsystem | Responsibility before amendment | Responsibility after amendment | Redesigned? |
|---|---|---|---|
| **Engine Foundation** | Pipeline + "Codes, not Content" + token efficiency | Unchanged. Snapshot is rule-declaration cargo, not content; O(rules), not O(Bank). | No |
| **Integration Spec** | Authority on `AssemblyRequest`; requires constraints to reach Engine (§5.3) | Unchanged. Snapshot *satisfies* §5.3; `AssemblyRequest` unmodified. | No |
| **Candidate Generator** | Filter/discover/validate/expand; emit CandidateSet; per-axis only; never solve joint | Unchanged. Adds one read-only projection (Snapshot attachment); still never solves joint constraints. | No |
| **Candidate Ranking** | Score/order; emit RankedCandidateSet; carry forward shortfalls/coverage | Unchanged. Carries forward the Snapshot alongside existing carried-forward fields. | No |
| **Constraint Solver** | Single-input (`RankedCandidateSet → AllocatedCandidateSet`); Stage 3 validates constraints | Unchanged. Snapshot arrives *on* the RankedCandidateSet; Stage 3's responsibility unchanged. | No |

No subsystem is redesigned. No responsibility moves. No stage is added or removed. No module is introduced.

### 5.2 Contract change classification

- **Normative changes** (affect contract information content):
  - CandidateSet gains `constraintSnapshot` (Generator §10.3).
  - RankedCandidateSet gains `constraintSnapshot` as a carried-forward field (Ranking §7.3, §7.4).
  - Solver Runtime State gains a read-only reference to the Snapshot (Solver §13, surfaced at Stage 2).
- **Editorial changes** (affect descriptions/reconciliations, not behavior):
  - Foundation §4.1/§4.2 reconciliation note (Snapshot is conceptual carry-forward; "Codes, not Content" governs Question content, not rule declarations).
  - Integration Spec §5.3/§4.4 alignment note (channel now specified; strict reduction reaffirmed).
  - Generator §13.1 reconciliation (carry-forward is read-only pass-through, not modification).
  - Solver §2.5/Appendix B #2/§3.2/§13 reaffirmation (assertions now operationally true).
- **No change** to: the `AssemblyRequest` contract, Blueprint v3.0, the Reader Pipeline, Scoring Model, Allocation Model, the Solver's stages/responsibilities/output contract, the Runtime API, the Draft Builder.

### 5.3 Determinism, immutability, and Fail-Loud preservation

- **Determinism (Solver §9.2):** the Snapshot is a pure function of the `AssemblyRequest`; it introduces no non-determinism. Same inputs → same outputs is preserved.
- **Immutability:** the Snapshot is deeply immutable and read-only at every boundary. It honors Generator §10.4, Ranking §7.6, Solver §12.5 immutability postures.
- **Fail Loud (Solver §11):** Stage 3 can now perform its defined impossible-on-paper/joint-feasibility detection (§3.2, §11.1) and halt Fatal with a precise contradiction report. Previously this was blocked; now it is unblocked with no weakening of the Fail-Loud posture.
- **Maximum Recall:** unaffected. The Snapshot is constraint metadata; it does not exclude Candidates.

### 5.4 Backward compatibility summary

The amendment is **fully additive and backward-compatible**:
- The `AssemblyRequest` is byte-identical.
- The Snapshot is carried-forward cargo, identical in kind to existing carried-forward fields (`shortfallReport`, `coverageSatisfaction`).
- Every existing contract statement that did not reference the Snapshot remains true.
- The previously-aspirational assertions (Solver §2.5, Appendix B #2, Ranking AP-3, Integration §5.3) become operationally true without their wording changing.

---

## 6. What is NOT Changed

- **The `AssemblyRequest`** — unmodified. The Integration Spec (§4) remains its sole authority. The Snapshot is a projection of it, never a redefinition.
- **Blueprint v3.0** — unmodified; remains the authoritative vocabulary source.
- **The Reader Pipeline** — unmodified. The Reader still emits the `AssemblyRequest`; it does not emit the Snapshot (the Generator derives the Snapshot by projection).
- **The Generator's responsibilities** — filtering, discovery, per-axis validation, expansion, Maximum Recall. The Generator still does **not** solve joint constraints (IG-5 remains the Solver's job).
- **Ranking's responsibilities** — scoring, ordering, tie resolution, transparency. Ranking still does **not** evaluate constraints (AP-2).
- **The Solver's responsibilities and stages** — the ten-stage pipeline, Stage 3's defined responsibility, the single-input contract, the AllocatedCandidateSet output contract, the Feasibility Model, Failure Handling, Layer Boundaries, Anti-Patterns.
- **The Stage Map** — no stage added, removed, renamed, or reordered.
- **The module list** — no module introduced or removed.
- **IG-1, IG-2, IG-3, IG-4** — unaffected. This amendment closes only the IG-5 *input-propagation* sub-problem.
- **Scoring Model, Allocation Model, Runtime API, Draft Builder** — unaffected.
- **Implementation, code, TypeScript contracts, SQL, migrations** — explicitly excluded; this is a specification amendment only.

---

## 7. Final Ratification Status

| Item | Status |
|---|---|
| **Architecture decision (Option A)** | APPROVED (IG-5 Architecture Ratification). |
| **Specification reconciliation** | COMPLETE (this amendment). |
| **Constraint Snapshot concept** | DEFINED (§1) — ownership, lifecycle, propagation, immutability, downstream visibility; explicitly NOT the `AssemblyRequest`/Blueprint/Runtime State/Solver State. |
| **Engine Foundation** | Reconciled (editorial); not redesigned. |
| **Integration Specification** | Satisfied (§5.3 honored); `AssemblyRequest` unmodified. |
| **Candidate Generation** | Amended (Snapshot attached at Stage 6, read-only); responsibilities unchanged. |
| **Candidate Ranking** | Amended (Snapshot carried forward); responsibilities unchanged. |
| **Constraint Solver** | Reconciled (§2.5, Appendix B #2, §3.2 now operationally true); stages/responsibilities unchanged. |
| **Single-input Solver contract** | PRESERVED. |
| **Stages/modules added or removed** | NONE. |
| **IG-5 input-propagation conflict** | CLOSED. |

**Engineering effect:** Solver Stage 3 (E-4C.3) is unblocked. Under this amendment, Stage 2 surfaces the Constraint Snapshot (carried on the RankedCandidateSet) into the Runtime State; Stage 3 consumes it to perform its defined static/joint-feasibility validation and impossible-on-paper detection (Solver §3.2, §11.1). Stage 3's responsibility is unchanged; only its input channel is now specified and consistent across the frozen specifications.

**Architecture status:** All Engine specifications remain FROZEN. This amendment reconciles five of them so they are internally consistent; it redesigns nothing, changes no responsibility, introduces no stage, and introduces no module.

---

*End of Sobdai Session E-4C.3 — IG-5 Specification Amendment v1.0.*

**Status:** AUTHORITATIVE. Reconciles the IG-5 Specification Conflict (input-propagation sub-problem) per the ratified Option A decision. Supersedes the conflicting implications of CandidateSet/RankedCandidateSet information content (Generator §10.3, Ranking §7.3) only in the narrow respect recorded above: the CandidateSet and RankedCandidateSet now carry a read-only Constraint Snapshot derived from the `AssemblyRequest`.
**Engineering Effect:** Solver Stage 3 (E-4C.3) authorized to proceed under the reconciled contract.
**Architecture Status:** All 10 Engine specifications remain FROZEN. This amendment records a reconciliation (Constraint Snapshot carry-forward) and affirms existing Boundary Assertions; it redesigns nothing.
