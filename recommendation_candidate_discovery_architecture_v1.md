# Recommendation Candidate Discovery — Architecture Specification v1.0

**Status:** FROZEN Architecture Specification
**Owner:** Lead Software Architect
**Date:** 2026-07-25
**Scope:** Recommendation Candidate Discovery for the Sobdai learner-facing recommendation pipeline.

> **Naming clarification (critical).** The codebase already has an **Exam Assembly Candidate Generator** at `lib/engine/generator/` (produces `CandidateSet` of Question Codes for exam assembly from an `AssemblyRequest`). That is a **different system**. This specification defines a **Recommendation Candidate Discovery** — a discovery layer that finds learning content candidates (Questions, Summaries, future Learning Assets) from learner analytics. The word "Candidate" is namespaced: this module uses `RecommendationCandidate`; the exam-assembly module uses `Candidate`. They never collide.

---

## 1. Responsibility

The Recommendation Candidate Discovery (RCD) is a **discovery layer** between Analytics and the Recommendation Engine.

```
                    ┌──────────────────────────┐
   Analytics ──────►│ Recommendation           │──── RecommendationCandidate[] ────► Recommendation Engine
   Policy ─────────►│ Candidate Discovery      │                                      (scores, ranks, emits)
   Content Store ──►│ (this spec)              │
                    └──────────────────────────┘
```

**What it does:**
- Consumes `PersonalAnalytics` (weak/strong subjects, topic performance, attempt history).
- Consumes a **Recommendation Policy** (rules: which signals matter, which content types to search, caps).
- Searches the **Content Store** (Question Bank, Summaries, future Learning Assets) for content that COULD be recommended.
- Produces a `RecommendationCandidate[]` — each candidate carries: identity, type, content reference, discovery reason (traceable to analytics), and metadata.

**What it does NOT do:**
- ❌ Rank or score candidates (that's the Recommendation Engine's job).
- ❌ Decide which candidate wins (no priority, no dedup-by-winner).
- ❌ Emit final Recommendations (no `title`, no `priority`, no UI text).
- ❌ Perform ML or LLM inference (Phase 1 is rule-based discovery only).
- ❌ Write to the database (read-only content discovery).

**Design principle:** "Discover broadly, narrow later." The RCD over-produces candidates (within bounded caps); the Recommendation Engine filters and ranks. This separation lets the Engine swap scoring algorithms without re-implementing discovery.

---

## 2. Position in the Engine

The RCD sits between the existing Analytics layer and the existing Recommendation Engine, replacing the current direct jump.

### Current flow (pre-RCD):
```
fetchMyAnalytics() → recommend(analytics) → RecommendationSet (targets null) → enrichWithTargets (DB) → enriched Recommendations
```

### Future flow (with RCD):
```
fetchMyAnalytics() → RCD.discoverCandidates(analytics, policy, contentStore) → RecommendationCandidate[]
                                                                              ↓
                                              Recommendation Engine: score + rank + enrich
                                                                              ↓
                                                              RecommendationSet
```

**Migration path:** The RCD is introduced as a new layer; the existing `recommend()` function is refactored to consume `RecommendationCandidate[]` instead of `PersonalAnalytics` directly. The enrichment step (`enrichWithTargets`) moves into or alongside the Engine (it attaches DB-resolved targets to ranked candidates). The public API (`fetchMyRecommendations()`) is unchanged — callers don't know the RCD exists.

---

## 3. Input Contract

### 3.1 PersonalAnalytics (existing — consumed as-is)

Import: `@/lib/assessment/analytics`

The RCD reads these fields from `PersonalAnalytics`:

| Field | Type | RCD Use |
|---|---|---|
| `overall.totalAttempts` | `number` | Gate: if 0, produce zero candidates (new user). |
| `overall.averageAccuracy` | `number` | Signal: overall performance level. |
| `weakSubjects` | `ClassifiedSubject[]` | Signal: which subjects need study candidates. |
| `strongSubjects` | `ClassifiedSubject[]` | Signal: which subjects could be reinforced. |
| `topicPerformance` | `TopicPerformance[]` | Signal: per-topic accuracy (derive weak topics by threshold). |
| `subjectPerformance` | `SubjectPerformance[]` | Signal: per-subject accuracy + volume. |
| `history` | `AttemptHistoryItem[]` | Signal: recency, mode (practice/simulation), already-seen content. |
| `trend` | `TrendPoint[]` | Signal: improving/declining trajectory. |

**Fields the RCD does NOT consume** (gaps in current Analytics — future expansion):
- `difficultyPerformance` — does not exist in current Analytics (AnsweredQuestion carries no difficulty). Future: add to Analytics, then RCD can discover difficulty-targeted candidates.
- `knowledgeCoverage` — no coverage concept at the personal-analytics level. Future.

### 3.2 Recommendation Policy (new — to be authored)

A configuration document that defines discovery parameters. Does NOT exist yet — this spec defines its shape.

> **Naming note:** v1 uses "Policy" (a flat configuration object). A future version may evolve this into a richer "Blueprint" document (versioned, multi-section, authored as Markdown). The interface name is chosen to avoid implying that complexity yet.

```typescript
interface RecommendationPolicy {
  /** Policy version (semver). */
  readonly version: string

  /** Weak-topic threshold: topics with accuracy below this are "weak." */
  readonly weakTopicAccuracyThreshold: number  // e.g. 50

  /** Strong-topic threshold: topics with accuracy above this are "strong." */
  readonly strongTopicAccuracyThreshold: number  // e.g. 80

  /** Minimum questions attempted on a topic before it counts as evidence. */
  readonly minQuestionsForEvidence: number  // e.g. 3

  /** Max candidates per discovery signal (bounds over-production). */
  readonly maxCandidatesPerSignal: number  // e.g. 10

  /** Which content types to discover. */
  readonly enabledContentTypes: readonly RecommendationContentType[]

  /** Recency window for "already seen" dedup (hours). */
  readonly seenContentWindowHours: number  // e.g. 48

  /** Which discovery signals are active. */
  readonly signals: readonly DiscoverySignal[]
}
```

### 3.3 Content Store (generic, extensible interface)

The RCD does NOT query Supabase directly. It consumes an injected `ContentStore` interface — a read-only port that abstracts the data source. This makes the RCD testable without a database and allows future content sources (search index, cache, external API).

> **Design change (v1.0 revision):** the original design exposed separate methods (`findSummaries`, `findQuestions`, `findLearningAssets`). This required interface expansion every time a new content type was added. The revised design uses a **single generic `findContent` method** + a **typed `ContentProvider` registry**. New content types register a provider; the `ContentStore` interface itself never changes.

```typescript
interface ContentStore {
  findContent(query: ContentQuery): Promise<readonly ContentRef[]>
  readonly supportedTypes: readonly RecommendationContentType[]
}

interface ContentQuery {
  readonly contentType: RecommendationContentType
  readonly filters: ContentFilters
  readonly limit: number
}

interface ContentFilters {
  readonly subjects?: readonly string[]
  readonly topics?: readonly string[]
  readonly difficulties?: readonly string[]
  readonly excludeCodes?: readonly string[]
}

interface ContentRef {
  readonly contentId: string
  readonly contentType: RecommendationContentType
  readonly title: string | null
  readonly slug: string | null
  readonly packageId: string | null
  readonly subject: string | null
  readonly topic: string | null
  readonly difficulty: string | null
}

interface ContentProvider {
  readonly contentType: RecommendationContentType
  find(query: ContentQuery): Promise<readonly ContentRef[]>
}
```

**Production implementation:** a Supabase-backed `ContentStore` (one file) that holds a `Map<RecommendationContentType, ContentProvider>`, ships with `SummaryProvider` + `QuestionProvider`, and delegates `findContent(query)` to the appropriate provider.

---

## 4. Output Contract

```typescript
type RecommendationContentType = 'summary' | 'question' | 'exam_set' | 'package'
// Future (additive): | 'flashcard' | 'video' | 'article' | 'learning_note' | 'practice_set'

type DiscoverySignal =
  | 'weak_subject' | 'weak_topic' | 'strong_subject' | 'strong_topic'
  | 'retry_simulation' | 'continue_practice' | 'coverage_gap'

interface RecommendationCandidate {
  readonly id: string
  readonly type: RecommendationContentType
  readonly content: ContentReference
  readonly signal: DiscoverySignal
  readonly reason: string
  readonly evidence: CandidateEvidence
  readonly metadata: CandidateMetadata
}

interface ContentReference {
  readonly kind: RecommendationContentType
  readonly contentId: string
  readonly title: string | null
  readonly slug: string | null
  readonly packageId: string | null
}

interface CandidateEvidence {
  readonly subject: string | null
  readonly topic: string | null
  readonly accuracy: number | null
  readonly attemptCount: number | null
}

interface CandidateMetadata {
  readonly subject: string | null
  readonly topic: string | null
  readonly difficulty: string | null
}

interface CandidateList {
  readonly candidates: readonly RecommendationCandidate[]
  readonly isEmpty: boolean
  readonly stats: CandidateListStats
}

interface CandidateListStats {
  readonly totalCandidates: number
  readonly bySignal: ReadonlyMap<DiscoverySignal, number>
  readonly byType: ReadonlyMap<RecommendationContentType, number>
}

type DiscoveryResult =
  | { readonly ok: true; readonly list: CandidateList }
  | { readonly ok: false; readonly error: string }
```

---

## 5. Internal Workflow

```
1. Gate Check        — if totalAttempts === 0 → return empty
2. Signal Extraction — derive DiscoverySignals from Analytics
3. Already-Seen      — extract contentIds from recent history (within window)
4. Content Discovery — per signal, per enabledContentType: findContent(query)
5. Assembly          — merge, deterministic sort, build stats
6. Output            — return immutable CandidateList
```

| Signal | Derivation Rule | Content Types Searched |
|---|---|---|
| `weak_subject` | `weakSubjects[]` from Analytics | Summary, Question |
| `weak_topic` | `topicPerformance` where `accuracy < threshold && total >= minEvidence` | Summary, Question |
| `strong_subject` | `strongSubjects[]` from Analytics | Summary |
| `retry_simulation` | No simulation in last `seenContentWindowHours` | Exam Set |
| `continue_practice` | Last practice attempt incomplete | Exam Set |
| `coverage_gap` | (Future) Blueprint-required area not attempted | Summary, Question |

---

## 6–10. Design Decisions, Extension Points, Risks

(Full detail in approved specification — frozen.)

### Design Decisions Summary:
- D1: Separation of Discovery and Ranking
- D2: Injected ContentStore (not direct Supabase)
- D3: Generic ContentStore with Provider Registry (one `findContent` method)
- D4: Over-production with Bounded Caps
- D5: Deterministic Candidate IDs (hash of type + contentId + signal)
- D6: Recommendation Policy as Separate Input
- D7: No Difficulty Analytics in v1.0 (known gap)
- D8: Async ContentStore

### Extension Points:
- New content types = implement ContentProvider + register (3 additive steps, zero interface change)
- New analytics dimensions = add DiscoverySignal values (additive)

---

## Appendix B — File Layout

```
lib/recommendation/
├── contracts.ts              Types
├── discovery.ts              discoverCandidates orchestrator
├── content-store.ts          Supabase-backed ContentStore + provider registry
├── providers/
│   ├── summary-provider.ts   SummaryProvider
│   └── question-provider.ts  QuestionProvider
├── policy.ts                 Default RecommendationPolicy
└── signals.ts                Signal extraction
```

---

*End of Recommendation Candidate Discovery — Architecture Specification v1.0. FROZEN.*
