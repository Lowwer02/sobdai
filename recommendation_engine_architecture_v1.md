# Recommendation Engine — Architecture Specification v1.0

**Status:** Architecture Specification (design only — awaiting freeze)
**Owner:** Lead Software Architect
**Date:** 2026-07-25
**Scope:** Recommendation Engine (E-3) — the scoring, ranking, and recommendation-assembly layer that consumes RecommendationCandidate[] from E-2 (Candidate Discovery) and produces a RecommendationSet for the UI.

---

## Codebase Audit Summary

Before designing, the following was verified against the actual codebase:

| Finding | Detail |
|---|---|
| **E-2 output** | `discoverCandidates()` returns `DiscoveryResult` = `{ok:true; list: CandidateList}` or `{ok:false; error}`. `CandidateList` carries `RecommendationCandidate[]` (immutable, readonly). |
| **E-2 has zero UI callers** | `discoverCandidates` is built but not yet consumed outside `lib/recommendation/`. The live UI path uses the Epic 4 `recommend()` directly. |
| **Epic 4 types (live)** | `Recommendation` (mutable, UI-oriented: category, priority, title, reason, target). `RecommendationSet`. `RecommendationTarget` (kind: summary/exam_set/package/none). |
| **Epic 4 constants (hardcoded)** | WEAK_ACCURACY=50, STRONG=80, MIN_EVIDENCE=3, MAX_WEAK_TOPIC_RECS=3, RECENT_SIM_HOURS=48, MAX_STRONG_RECS=1. |
| **Name collision** | `Recommendation` interface exists only in `lib/assessment/recommendation.ts`. `RecommendationCandidate` exists only in `lib/recommendation/contracts.ts`. No symbol-level collision. Conceptual overlap is real but managed via distinct namespaces. |
| **Enrichment gap** | `enrichWithTargets` resolves Summary targets only; `retry_simulation` targets stay null (acknowledged gap). |
| **UI consumer** | Only `app/assessment/analytics/page.tsx` consumes `RecommendationSet`. Hardwired to `target.kind === 'summary'` for link generation. |
| **Mutability mismatch** | E-2 types are fully `readonly`. Epic 4 `Recommendation`/`RecommendationTarget` are mutable. E-3 will use readonly discipline (matches E-2, is the architecture direction). |

---

## 1. Responsibility

The Recommendation Engine is a **pure business engine** that transforms a flat list of discovered candidates into a ranked, deduplicated, business-rule-filtered RecommendationSet.

```
   RecommendationCandidate[]  ──────►  ┌─────────────────────────┐  ──────►  RecommendationSet
   (from E-2 Discovery)                │ Recommendation Engine    │           (for UI / caller)
   RecommendationPolicy ─────────────►│ (E-3 — this spec)        │
   (optional) UserContext ────────────►│                          │
                                       └─────────────────────────┘
```

**What it does:**
- Evaluates each `RecommendationCandidate` against scoring rules.
- Assigns a numeric score and priority to each evaluated candidate.
- Ranks candidates by score.
- Deduplicates (same content discovered via different signals → pick the best).
- Applies business rules (caps per category, minimum evidence, freshness).
- Assembles the final `RecommendationSet` with display-ready `Recommendation` objects.

**What it does NOT do:**
- ❌ Query the database (Discovery already found the content; Engine works with what it has).
- ❌ Discover new candidates (E-2's job).
- ❌ Compute analytics (E-2 consumed analytics to produce candidates).
- ❌ Render UI / React (Engine produces data; the UI renders it).
- ❌ Import Supabase (Engine receives candidates, not DB connections).
- ❌ Perform LLM/ML inference in v1.0 (Phase 1 is rule-based; the architecture supports future AI, but v1.0 is deterministic rules).

**Design principle:** "Score, rank, decide." The Engine is the ONLY layer that makes recommendation decisions. Discovery provides options; the Engine chooses.

---

## 2. Position in the Assessment Engine

```
Question Bank → Exam Set → Assessment Runtime → Assessment Outcome
    → Assessment Analytics → Recommendation Candidate Discovery (E-2)
        → Recommendation Engine (E-3 — this spec)
            → RecommendationSet → UI
```

The Engine sits between E-2 (Discovery) and the UI. It replaces the current direct `recommend(analytics)` call with a richer pipeline:

### Current flow (pre-E-3):
```
fetchMyAnalytics() → recommend(analytics) → RecommendationSet → enrichWithTargets(DB) → UI
```

### Future flow (with E-3):
```
fetchMyAnalytics()
    → discoverCandidates(analytics, policy, contentStore)   [E-2]
    → RecommendationCandidate[]
    → Engine.rank(candidates, policy)                       [E-3]
    → RecommendationSet
    → UI
```

**Migration path:** E-3 is introduced as a new module (`lib/recommendation/engine.ts`). The existing `recommend()` function in `lib/assessment/recommendation.ts` becomes a **legacy adapter** (or is eventually retired). The server action `fetchMyRecommendations()` is updated to call `discoverCandidates` → `engine.rank` instead of `recommend` directly. The UI contract (`RecommendationSet`) is preserved during migration; the UI does not change until a future decision to migrate to richer Recommendation fields.

---

## 3. Input Contract

### 3.1 RecommendationCandidate[] (from E-2)

Import: `@/lib/recommendation/contracts`

Each candidate carries:
- `id` (deterministic hash of type|contentId|signal)
- `type` (summary | question | exam_set | package)
- `content` (ContentReference: contentId, title, slug, packageId)
- `signal` (DiscoverySignal: weak_subject, weak_topic, strong_subject, ...)
- `reason` (human-readable audit string)
- `evidence` (CandidateEvidence: subject, topic, accuracy, attemptCount)
- `metadata` (CandidateMetadata: subject, topic, difficulty)

The Engine treats these as **read-only inputs** — it never mutates them.

### 3.2 RecommendationPolicy (from E-2, reused)

Import: `@/lib/recommendation/contracts`

The same Policy E-2 used for discovery thresholds. The Engine reads additional fields for scoring context (e.g., `weakTopicAccuracyThreshold` to weight weak-topic candidates higher when accuracy is lower).

### 3.3 UserContext (optional extension point)

```typescript
/**
 * Optional user context for scoring enrichment. All fields nullable/optional
 * so v1.0 can call the Engine with `null` and the pipeline works without it.
 *
 * Future phases populate this with richer signals (previous recommendations
 * shown, click-through history, learning streaks). The Engine's pipeline
 * checks for null and degrades gracefully.
 */
interface UserContext {
  /** Recommendation IDs previously shown to this user (for diversity/freshness). */
  readonly previouslyShownIds?: readonly string[]
  /** Timestamp of the user's last learning activity (ISO). */
  readonly lastActiveAt?: string | null
}
```

The Engine accepts `UserContext | null`. When null, scoring skips context-aware adjustments. This is an **extension point**, not a dependency — v1.0 works without it.

---

## 4. Output Contract

### 4.1 ScoredRecommendation (internal — before assembly)

```typescript
/**
 * A candidate after scoring. Internal to the Engine pipeline; the final
 * output (RecommendationSet) uses the assembled Recommendation shape.
 */
interface ScoredCandidate {
  readonly candidate: RecommendationCandidate
  readonly score: number          // 0..100, higher = more relevant
  readonly priority: number       // 1 = highest; sequential after ranking
  readonly scoringBreakdown: ScoringBreakdown
}

/**
 * Why a candidate received its score. Each factor contributes a sub-score.
 * The breakdown is carried for audit/debugging — a Reviewer can trace
 * why one candidate outranked another.
 */
interface ScoringBreakdown {
  readonly signalWeight: number       // contribution from the discovery signal
  readonly evidenceWeight: number     // contribution from evidence strength
  readonly freshnessWeight: number    // contribution from recency (if UserContext present)
  readonly diversityWeight: number    // contribution from diversity penalty/bonus
  readonly total: number              // sum of the above (== score)
}
```

### 4.2 Recommendation (output — assembled for UI)

The Engine produces a `RecommendationSet` compatible with the existing UI contract, PLUS richer fields for future use:

```typescript
/**
 * A final recommendation — the Engine's output unit.
 *
 * Backward-compatible with the existing Recommendation interface in
 * lib/assessment/recommendation.ts (same fields: category, priority,
 * title, reason, target). Adds: score, scoringBreakdown, candidateId
 * for traceability back to the discovery layer.
 */
interface EngineRecommendation {
  /** Stable id (derived from the winning candidate's id). */
  readonly id: string
  /** What kind of recommendation this is (maps signal → category). */
  readonly category: RecommendationCategory
  /** Ranking position (1 = highest). Sequential after dedup + caps. */
  readonly priority: number
  /** Numeric score (0..100). Higher = more relevant. */
  readonly score: number
  /** Human-readable title (Thai, for UI display). */
  readonly title: string
  /** Human-readable reason (Thai, for UI display). */
  readonly reason: string
  /** The content target to link to (may be null if enrichment is deferred). */
  readonly target: RecommendationTarget | null
  /** Analytics evidence traceable to the candidate. */
  readonly evidence: CandidateEvidence
  /** The candidate's subject (for grouping in UI). */
  readonly subject: string | null
  /** The candidate's topic (for grouping in UI). */
  readonly topic: string | null
  /** Scoring breakdown for audit/debugging. */
  readonly scoringBreakdown: ScoringBreakdown
  /** Trace back to the discovery candidate that produced this recommendation. */
  readonly candidateId: string
}

interface RecommendationCategory =
  | 'study_weak_subject'
  | 'review_weak_topic'
  | 'reinforce_strong_subject'
  | 'reinforce_strong_topic'
  | 'retry_simulation'
  | 'continue_practice'

interface RecommendationTarget {
  readonly kind: 'summary' | 'exam_set' | 'package' | 'none'
  readonly id: string | null
  readonly slug: string | null
  readonly packageSlug: string | null
  readonly label: string | null
}

interface RecommendationSet {
  readonly recommendations: readonly EngineRecommendation[]
  readonly isEmpty: boolean
  readonly stats: RecommendationSetStats
}

interface RecommendationSetStats {
  readonly totalRecommendations: number
  readonly byCategory: ReadonlyMap<RecommendationCategory, number>
  readonly averageScore: number
  readonly dedupedCount: number     // how many candidates were collapsed
}
```

---

## 5. Internal Pipeline

```
┌──────────────────────────────────────────────────────────────────────┐
│                     Recommendation Engine                            │
│                                                                      │
│  INPUT: RecommendationCandidate[] + Policy + (optional) UserContext  │
│                                                                      │
│  1. Evaluation                                                      │
│     ScoringStrategy orchestrates ScoringFactor[]:                   │
│       For each candidate:                                           │
│         For each factor (Signal, Evidence, Freshness, Diversity):   │
│           factor.compute(candidate, context) → sub-score            │
│         Sum weighted sub-scores → ScoringBreakdown                  │
│     → ScoredCandidate[] (score assigned; NO priority yet)           │
│                                                                      │
│  2. Ranking                                                         │
│     Sort ScoredCandidate[] by score descending.                     │
│     Ties broken by signal name (alphabetical) → contentId.          │
│     → RankedCandidate[] (ORDERED by score; priority NOT assigned)   │
│                                                                      │
│  3. Deduplication                                                   │
│     Group by contentId (same content via different signals).        │
│     Keep the highest-scoring candidate per contentId.               │
│     Record deduped count for stats.                                 │
│     → DeduplicatedCandidate[] (still ordered; no priority)          │
│                                                                      │
│  4. Business Rules                                                  │
│     Apply caps per category (e.g., max 3 weak-topic recs).          │
│     Apply minimum-evidence filter (drop candidates with             │
│     insufficient evidence).                                         │
│     Apply freshness filter (avoid re-recommending recently shown).  │
│     → FilteredCandidate[] (final set; still ordered by score)       │
│                                                                      │
│  5. Assembly                                                        │
│     Convert each FilteredCandidate to an EngineRecommendation:      │
│       Map signal → category.                                        │
│       Build Thai title + reason from candidate data.                │
│       Attach target (from candidate.content; may be null).          │
│       Carry scoring breakdown + evidence + candidateId.             │
│       ASSIGN sequential priority (1, 2, 3, ...) — presentation      │
│         concern, applied here at the FINAL output boundary.         │
│     Build stats (byCategory, averageScore, dedupedCount).           │
│     → RecommendationSet                                             │
│                                                                      │
│  OUTPUT: RecommendationSet (immutable, with final priority)         │
└──────────────────────────────────────────────────────────────────────┘
```

**Key change (refinement 2):** Priority is NOT assigned during Ranking.
Ranking determines ordering by score only. Sequential UI priority (1, 2, 3, ...)
is a **presentation concern** assigned during Assembly — the final output
boundary — AFTER dedup, business rules, and filtering. This means priority
reflects the final display order, not the raw score order, and the pipeline's
intermediate stages (ranking, dedup, rules) operate purely on scores without
any presentation concern leaking in.

---

## 6. Recommendation Object Model

```
EngineRecommendation (immutable)
├── id: string                       (from winning candidate's id)
├── category: RecommendationCategory (mapped from signal)
├── priority: number                 (ranking position, 1=highest)
├── score: number                    (0..100)
├── title: string                    (Thai, for UI)
├── reason: string                   (Thai, for UI)
├── target: RecommendationTarget     (content link; may be null)
│   ├── kind: 'summary'|'exam_set'|'package'|'none'
│   ├── id, slug, packageSlug, label (nullable)
├── evidence: CandidateEvidence      (from candidate)
│   ├── subject, topic, accuracy, attemptCount
├── subject: string | null           (for UI grouping)
├── topic: string | null
├── scoringBreakdown: ScoringBreakdown
│   ├── signalWeight, evidenceWeight, freshnessWeight, diversityWeight, total
└── candidateId: string              (trace to E-2 discovery)
```

---

## 7. Scoring Strategy Architecture

### 7.1 Scoring is pluggable at TWO levels

The Engine has **two layers of pluggability**:

1. **ScoringStrategy** — the top-level interface. v1.0 ships `RuleBasedScoringStrategy`. Future phases swap in `AIScoringStrategy` or `MLScoringStrategy`.
2. **ScoringFactor** — the building blocks INSIDE `RuleBasedScoringStrategy`. Each factor computes one dimension of the score. The strategy orchestrates factors; it doesn't implement scoring logic itself.

```typescript
// ── Top-level strategy (swappable: rule-based → AI → ML) ──────────────

interface ScoringStrategy {
  readonly name: string
  score(candidate: RecommendationCandidate, context: ScoringContext): ScoringBreakdown
}

interface ScoringContext {
  readonly policy: RecommendationPolicy
  readonly userContext: UserContext | null
  /** All candidates being scored (for diversity calculation). */
  readonly allCandidates: readonly RecommendationCandidate[]
}

// ── ScoringFactor (the building blocks inside RuleBasedScoringStrategy) ──

/**
 * One dimension of a candidate's score. Each factor is a standalone,
 * independently testable component. The RuleBasedScoringStrategy
 * orchestrates a list of these — it does NOT implement scoring logic itself.
 *
 * Adding a new scoring dimension = implement ScoringFactor + add to the
 * strategy's factor list. No existing factor or pipeline code changes.
 */
interface ScoringFactor {
  readonly name: string
  readonly weight: number  // 0..1, relative contribution to total score
  compute(candidate: RecommendationCandidate, context: ScoringContext): number  // 0..100 sub-score
}

// ── RuleBasedScoringStrategy (orchestrator, not implementor) ───────────

/**
 * v1.0 default strategy. Composes multiple ScoringFactors and orchestrates
 * them: for each candidate, calls each factor's compute(), weights the
 * sub-scores, and sums them into a ScoringBreakdown.
 *
 * The strategy itself contains ZERO scoring logic — it's a pure orchestrator.
 * All scoring intelligence lives in the individual factor implementations.
 */
class RuleBasedScoringStrategy implements ScoringStrategy {
  readonly name = 'rule-based-v1'
  private readonly factors: readonly ScoringFactor[]

  constructor(factors?: ScoringFactor[]) {
    // Default v1.0 factors if none provided.
    this.factors = factors ?? [
      new SignalFactor(),       // weight: 0.40
      new EvidenceFactor(),     // weight: 0.30
      new FreshnessFactor(),    // weight: 0.15
      new DiversityFactor(),    // weight: 0.15
    ]
  }

  score(candidate: RecommendationCandidate, context: ScoringContext): ScoringBreakdown {
    // Orchestrate: call each factor, weight the result, sum.
    const subScores: Record<string, number> = {}
    let total = 0
    for (const factor of this.factors) {
      const raw = factor.compute(candidate, context)  // 0..100
      const weighted = raw * factor.weight             // 0..(100*weight)
      subScores[factor.name] = weighted
      total += weighted
    }
    return {
      signalWeight: subScores['signal'] ?? 0,
      evidenceWeight: subScores['evidence'] ?? 0,
      freshnessWeight: subScores['freshness'] ?? 0,
      diversityWeight: subScores['diversity'] ?? 0,
      total: Math.min(100, total),  // cap at 100
    }
  }
}
```

### 7.2 v1.0 Scoring Factors

| Factor | Weight | Class | Derivation |
|---|---|---|---|
| **Signal** | 0.40 | `SignalFactor` | `weak_subject`/`weak_topic` → highest (urgency); `strong_*` → moderate; `retry_simulation`/`continue_practice` → moderate. |
| **Evidence** | 0.30 | `EvidenceFactor` | Higher when `accuracy` is lower (more urgent gap) AND `attemptCount` is higher (more reliable signal). |
| **Freshness** | 0.15 | `FreshnessFactor` | Bonus if content hasn't been seen recently (requires UserContext). 0 if UserContext is null. |
| **Diversity** | 0.15 | `DiversityFactor` | Penalty if the same subject/topic appears many times in the candidate set (prevents mono-subject recommendations). |

Each factor produces a sub-score 0..100. The strategy weights and sums them, capping at 100. Factors are independently testable — each has its own unit tests.

### 7.3 Why the strategy/factor split matters

- **Adding a scoring dimension** (e.g., "SpacedRepetitionFactor") = implement `ScoringFactor` + add to the strategy's constructor. The strategy's `score()` method doesn't change; the pipeline doesn't change.
- **Swapping the entire strategy** (rule-based → AI) = implement `ScoringStrategy` at the top level. The factors are bypassed (AI computes scores differently); the pipeline is unchanged.
- **Testing** = each factor is a pure function tested in isolation; the strategy is tested as a composition (verify it calls factors and sums correctly); the pipeline is tested end-to-end.

### 7.4 Why the strategy is swappable

The Engine's `rank()` function calls `strategy.score()` for each candidate. The strategy is injected:

```typescript
function rank(
  candidates: readonly RecommendationCandidate[],
  policy: RecommendationPolicy,
  strategy: ScoringStrategy,      // ← injected
  userContext?: UserContext | null
): RecommendationSet
```

Future AI integration = implement `AIScoringStrategy` that calls an LLM with the candidate's metadata + evidence and returns a score. The pipeline (evaluate → rank → dedup → rules → assemble) is unchanged.

---

## 8. Ranking Architecture

After scoring, candidates are sorted by `score` descending. Ties are broken by:
1. Signal name (alphabetical — no business priority, structural determinism only).
2. Content ID (stable, unique).

This produces a fully deterministic order: same candidates → same ranking.

**Priority is NOT assigned here.** Ranking determines ordering only — it produces a score-sorted sequence. Sequential UI priority (1, 2, 3, ...) is a **presentation concern** assigned during Assembly (§11), the final output boundary, AFTER deduplication and business-rule filtering. This separation ensures:
- Intermediate stages (ranking, dedup, rules) operate purely on scores — no presentation concerns leak in.
- Priority reflects the FINAL display order after all filtering, not the raw score order.
- The ranking stage is reusable in contexts that don't need priority (e.g., analytics dashboards).

---

## 9. Deduplication Strategy

**Rule:** If the same `contentId` appears via multiple signals (e.g., a Summary discovered via both `weak_subject` and `weak_topic`), keep only the one with the highest score.

**Implementation:**
```
Group candidates by content.contentId
For each group: pick the candidate with the highest score
Record (originalCount - uniqueCount) as dedupedCount for stats
```

Deduplication happens AFTER scoring (so the "best signal" wins based on score, not on signal type). This is the ONE place the Engine "chooses a winner" — and it chooses by score, not by hardcoded priority.

---

## 10. Business Rule Layer

Business rules are applied as a **filter stage** after ranking + dedup. Each rule can DROP candidates or ADJUST their priority. Rules are pluggable (array of `BusinessRule` functions):

```typescript
interface BusinessRule {
  readonly name: string
  apply(candidates: readonly ScoredCandidate[], policy: RecommendationPolicy): readonly ScoredCandidate[]
}
```

### v1.0 Rules

| Rule | Logic |
|---|---|
| **CategoryCap** | Max N recommendations per category (e.g., max 3 `review_weak_topic`). Configurable via a future Policy extension. |
| **MinimumEvidence** | Drop candidates where `evidence.attemptCount < policy.minQuestionsForEvidence`. |
| **TotalCap** | Hard cap on total recommendations (e.g., max 10). Configurable. |
| **DiversityFloor** | Ensure at least 1 recommendation from each active signal type (if candidates exist). Prevents all-recs-weak-subject monotony. |

Adding a rule = implement `BusinessRule` + add to the rules array. No existing rule or pipeline code changes.

---

## 11. Recommendation Assembly

The final stage converts each surviving `ScoredCandidate` into an `EngineRecommendation`. This is where **priority is assigned** — it's a presentation concern, not a ranking concern.

| Field | Source |
|---|---|
| `id` | Candidate's `id` (already deterministic) |
| `category` | Mapped from `candidate.signal` via a signal→category map |
| `priority` | **Assigned HERE** — sequential (1, 2, 3, ...) in the final score-sorted order AFTER dedup + business rules. This is the ONLY place priority exists; ranking (§8) produces ordering only. |
| `score` | From `ScoredCandidate.score` |
| `title` | Built from candidate type + evidence (Thai localization) |
| `reason` | Built from candidate signal + evidence (Thai localization) |
| `target` | Built from `candidate.content` (kind/contentId/slug/packageId) |
| `evidence` | Copied from `candidate.evidence` |
| `subject`/`topic` | From `candidate.metadata` |
| `scoringBreakdown` | From `ScoredCandidate.scoringBreakdown` |
| `candidateId` | `candidate.id` (trace back to discovery) |

**Why priority is assigned here, not in ranking (refinement 2):**
Ranking determines the score-ordering of candidates. But the FINAL display
order depends on dedup (which removes some candidates) and business rules
(which filter more). Assigning priority during ranking would produce gaps
(1, 2, 5, 7, ...) after filtering. By assigning priority during Assembly —
the final output boundary — we get clean sequential numbers (1, 2, 3, ...)
that reflect the actual display order. Ranking stays pure: it orders by
score, nothing more.

**Signal → Category mapping:**

| DiscoverySignal | RecommendationCategory |
|---|---|
| `weak_subject` | `study_weak_subject` |
| `weak_topic` | `review_weak_topic` |
| `strong_subject` | `reinforce_strong_subject` |
| `strong_topic` | `reinforce_strong_topic` |
| `retry_simulation` | `retry_simulation` |
| `continue_practice` | `continue_practice` |
| `coverage_gap` | `review_weak_topic` (mapped; coverage gaps are topic-level) |

---

## 12. Extension Points

### 12.1 Scoring Strategy Swap (rule-based → AI → ML)

```typescript
// v1.0
const strategy = new RuleBasedScoringStrategy()

// Future (no pipeline change)
const strategy = new AIScoringStrategy({ llmProvider })
// or
const strategy = new MLScoringStrategy({ modelEndpoint })
```

The `rank()` function receives the strategy as a parameter. Swapping it changes scoring intelligence, not pipeline structure.

### 12.2 New Scoring Factors

Add a factor to `RuleBasedScoringStrategy` by implementing a `ScoringFactor`:

```typescript
interface ScoringFactor {
  readonly name: string
  readonly weight: number
  compute(candidate: RecommendationCandidate, context: ScoringContext): number
}
```

v1.0 ships 4 factors (Signal, Evidence, Freshness, Diversity). Adding "TimeOfDayRelevance" or "SpacedRepetitionUrgency" = implement the interface + register. No existing factor changes.

### 12.3 New Business Rules

Implement `BusinessRule` + add to the rules array. The pipeline calls each rule in sequence.

### 12.4 New Content Types

When E-2 discovers new content types (flashcard, video), the Engine handles them automatically — `signal → category` mapping is per-signal, not per-type. The `target.kind` carries the content type; the UI decides how to render it.

### 12.5 UserContext Enrichment

Future phases populate `UserContext` with richer data (click-through rates, learning streaks, spaced-repetition state). The scoring factors that read UserContext automatically benefit; factors that don't need it are unchanged.

---

## 13. Sequence Diagram

```
 Server Action            Engine              ScoringStrategy       BusinessRules
      │                      │                      │                     │
      │  rank(candidates,    │                      │                     │
      │    policy, strategy, │                      │                     │
      │    userContext)      │                      │                     │
      │─────────────────────►│                      │                     │
      │                      │                      │                     │
      │                      │  1. Evaluate         │                     │
      │                      │  for each candidate: │                     │
      │                      │  strategy.score(cand, ctx)                 │
      │                      │─────────────────────►│                     │
      │                      │◄── ScoringBreakdown──│                     │
      │                      │                      │                     │
      │                      │  2. Rank (sort desc) │                     │
      │                      │  3. Dedup (by contentId, keep best score)  │
      │                      │                      │                     │
      │                      │  4. Business Rules ──┼────────────────────►│
      │                      │  (caps, evidence,    │   apply(candidates, │
      │                      │   freshness, total)  │   policy)           │
      │                      │◄── FilteredCands ────┼─────────────────────│
      │                      │                      │                     │
      │                      │  5. Assemble         │                     │
      │                      │  (signal→category,   │                     │
      │                      │   build title/reason,│                     │
      │                      │   attach target)     │                     │
      │                      │                      │                     │
      │◄── RecommendationSet │                      │                     │
```

---

## 14. Design Decisions

### D1: Engine is Pure — No Database, No Supabase, No Discovery
**Decision:** The Engine receives `RecommendationCandidate[]` and produces `RecommendationSet`. Zero DB imports.
**Reason:** Clean separation (Architecture Spec: "Engine must not know Summary Database, Question Database, or Supabase"). Makes the Engine fully testable with synthetic candidates. Enrichment (target resolution) happens BEFORE the Engine (at the Discovery layer or a separate enrichment step), not inside it.

### D2: Scoring Strategy is Injected and Swappable
**Decision:** `rank()` accepts a `ScoringStrategy` parameter. v1.0 ships `RuleBasedScoringStrategy`.
**Reason:** The user requirement: "Engine must support Rule-based → Hybrid → AI-assisted → ML without changing architecture." Injecting the strategy means swapping scoring intelligence is a one-line change at the call site. The pipeline (evaluate → rank → dedup → rules → assemble) never changes.

### D3: Scoring Factors are Pluggable
**Decision:** `RuleBasedScoringStrategy` internally uses an array of `ScoringFactor` implementations.
**Reason:** "Engine must be able to add new Scoring Stages without modifying Engine Core." Each factor is a standalone implementation; adding one = implement + register.

### D4: Deduplication Chooses by Score, Not by Hardcoded Priority
**Decision:** When the same content appears via multiple signals, the candidate with the highest SCORE wins.
**Reason:** This is the Engine's core decision-making responsibility. Score-based dedup means the scoring strategy controls which signal wins — not a hardcoded `weak_subject > weak_topic` ordering. If the strategy changes (AI scoring), the dedup winner changes accordingly.

### D5: Business Rules are a Pipeline Stage, Not Scattered Logic
**Decision:** All business constraints (caps, evidence thresholds, total limits, diversity) are `BusinessRule` implementations applied as a sequential filter stage.
**Reason:** Centralized rules are auditable, testable, and removable. A rule can be toggled by removing it from the array — no code surgery.

### D6: Output is Backward-Compatible with Existing UI
**Decision:** `EngineRecommendation` carries the same fields the existing UI expects (`category`, `priority`, `title`, `reason`, `target`), PLUS richer fields (`score`, `scoringBreakdown`, `candidateId`).
**Reason:** The UI (`analytics/page.tsx`) can consume the Engine's output without changes. Migration is additive — the UI ignores the new fields until it's ready to use them.

### D7: UserContext is Optional, Not a Dependency
**Decision:** `UserContext` is `UserContext | null`. v1.0 passes null.
**Reason:** The user requirement: "Design UserContext as an Extension Point, not a Dependency." The Engine works at full capacity for v1.0 without it; future phases enrich scoring by populating it.

### D8: Immutable Output Discipline
**Decision:** All Engine output types are `readonly`. This matches E-2's discipline and differs from the Epic 4 `Recommendation` (which is mutable).
**Reason:** Immutable types prevent accidental mutation in downstream consumers. The migration from mutable Epic 4 types to immutable Engine types is a one-time change at the server-action boundary.

---

## 15. Risks and Cautions

| Risk | Impact | Mitigation |
|---|---|---|
| **Two parallel recommendation systems** | The Epic 4 `recommend()` and the E-3 Engine both exist; calling the wrong one produces different results | Document clearly; the server action is the single integration point. After E-3 is live, retire `recommend()`. |
| **Scoring weights need tuning** | v1.0 weights (40/30/15/15) are initial guesses; real-world performance may need adjustment | Weights are constants in `RuleBasedScoringStrategy` — externalize to the Policy in a future version. For now, changing them is a one-file edit. |
| **Enrichment gap persists** | The Engine produces `target` from candidate `content` fields, but `packageSlug` (needed for URLs) isn't in the candidate — it requires a DB lookup | The server action resolves `packageSlug` AFTER the Engine runs (a thin enrichment step outside the Engine). The Engine's `target.packageSlug` starts null; the action fills it. |
| **UI migration risk** | The existing UI is hardwired to `kind === 'summary'` targets | The Engine produces targets for all content types; the UI renders linkless cards for non-summary targets until it's updated. No breakage — graceful degradation. |
| **AI scoring latency** | Future `AIScoringStrategy` will add latency to each `rank()` call | The strategy interface returns a sync `ScoringBreakdown`; AI strategies that need async should pre-compute scores before calling `rank()`, or the interface evolves to async in a future version. |
| **Candidate volume** | If Discovery over-produces (many candidates), the Engine's scoring loop runs on all of them | Discovery's `maxCandidatesPerSignal` cap bounds this. Typical: 5 signals × 10 = 50 candidates — trivially fast for rule-based scoring. |

---

## Appendix A — File Layout (proposed)

```
lib/recommendation/
├── contracts.ts              (existing — E-2 types, reused)
├── discovery.ts              (existing — E-2)
├── signals.ts                (existing — E-2)
├── policy.ts                 (existing — E-2)
├── content-store.ts          (existing — E-2)
├── providers/                (existing — E-2)
│
├── engine.ts                 rank() — the Engine's single public entry point
├── engine-contracts.ts       EngineRecommendation, RecommendationSet, ScoringStrategy, etc.
├── scoring/
│   ├── scoring-strategy.ts   ScoringStrategy + ScoringFactor interfaces
│   ├── rule-based.ts         RuleBasedScoringStrategy (v1.0 default)
│   └── factors.ts            SignalFactor, EvidenceFactor, FreshnessFactor, DiversityFactor
├── rules/
│   ├── business-rule.ts      BusinessRule interface
│   ├── category-cap.ts       CategoryCapRule
│   ├── minimum-evidence.ts   MinimumEvidenceRule
│   ├── total-cap.ts          TotalCapRule
│   └── diversity-floor.ts    DiversityFloorRule
└── assembly.ts               Signal→Category mapping + title/reason builders
```

---

## Appendix B — Signal → Category Mapping (canonical)

| E-2 DiscoverySignal | E-3 RecommendationCategory | Thai Title Template |
|---|---|---|
| `weak_subject` | `study_weak_subject` | "ทบทวนวิชา {subject}" |
| `weak_topic` | `review_weak_topic` | "ฝึกทำข้อสอบ {topic}" |
| `strong_subject` | `reinforce_strong_subject` | "เสริมความแข็งแกร่ง {subject}" |
| `strong_topic` | `reinforce_strong_topic` | "รักษาระดับ {topic}" |
| `retry_simulation` | `retry_simulation` | "ลองทำจำลองอีกครั้ง" |
| `continue_practice` | `continue_practice` | "ฝึกต่อ" |
| `coverage_gap` | `review_weak_topic` | "เติมช่องว่าง {topic}" |

---

*End of Recommendation Engine — Architecture Specification v1.0.*

**Status:** Awaiting Architecture Review and Freeze. No implementation until frozen.
