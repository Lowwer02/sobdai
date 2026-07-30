/**
 * lib/engine/shared/assessment-vocabulary.ts
 * ----------------------------------------------------------------------------
 * Canonical, stage-independent Assessment Engine value vocabulary.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *  - Blueprint Integration Specification v1.0 §3 (Canonical Blueprint Format),
 *    §4 (AssemblyRequest Contract), §5 (Critical Reconciliations)
 *  - IG-2 Architecture Amendment D-6 (Question Pattern vocabulary)
 *
 * These types are shared value vocabulary only. They contain no stage outputs,
 * runtime behavior, validation logic, persistence concerns, or application
 * concerns. Reader, Generator, Scoring, Ranking, Solver, and Runtime consume
 * these canonical definitions without redefining their literal values.
 */

/**
 * Assessment Profile declared by an Assessment Blueprint.
 *
 * Version 1 supports `simulation` only. Additional profiles are additive
 * contract changes and must not alter the meaning of the existing profile.
 *
 * @spec Blueprint Integration Specification v1.0 §4.3
 */
export type AssessmentProfile = 'simulation'

/**
 * Tier assigned to a Document in the Blueprint Document Registry.
 *
 * Tier is a Document property inherited by Candidates through their Document;
 * it is never a Question Bank property.
 *
 * @spec Blueprint Integration Specification v1.0 §4.3, §5.2
 */
export type Tier = 1 | 2 | 3 | 4

/**
 * Cognitive Blueprint Type axis used by Blueprint, Bank metadata, Generator,
 * Scoring, and allocation constraints.
 *
 * @spec Blueprint Integration Specification v1.0 §5.4
 */
export type BlueprintType = 'Memory' | 'Concept' | 'Procedure' | 'Scenario'

/**
 * Question Pattern axis used by Blueprint, Bank metadata, Generator, and
 * Scoring.
 *
 * `Matching Concept` is the canonical two-word value. It is distinct from the
 * content-format vocabulary and must not be shortened to `Matching`.
 *
 * @spec Blueprint Integration Specification v1.0 §5.4
 * @spec IG-2 Architecture Amendment D-6
 */
export type QuestionPattern =
  | 'Positive'
  | 'Negative'
  | 'Best Answer'
  | 'Scenario'
  | 'Sequence'
  | 'Matching Concept'

/**
 * Learning Objective identifier used by Blueprint distribution targets, Bank
 * metadata, Generator validation, and Scoring.
 *
 * @spec Blueprint Integration Specification v1.0 §4.3
 */
export type LearningObjective = 'LO1' | 'LO2' | 'LO3' | 'LO4'

/**
 * Difficulty axis shared by Blueprint distribution rules, Question Bank
 * metadata, Candidate generation, Scoring, Ranking, and allocation.
 *
 * @spec Blueprint Integration Specification v1.0 §4.3
 */
export type Difficulty = 'Easy' | 'Medium' | 'Hard'

/**
 * Enforcement level applied to coverage and duplicate-prevention rules.
 *
 * Hard rules are inviolable and must be satisfied or reported as infeasible.
 * Soft rules remain advisory and may produce explicit conflicts or warnings.
 *
 * @spec Blueprint Integration Specification v1.0 §4.3
 */
export type EnforcementLevel = 'hard' | 'soft'

/**
 * Canonical identifier for a Blueprint coverage rule.
 *
 * The identifiers are stable rule identities; rule descriptions and bindings
 * remain part of the Reader-owned AssemblyRequest contract.
 *
 * @spec Blueprint Integration Specification v1.0 §3.3, §4.3
 */
export type CoverageRuleId = 'CR-1' | 'CR-2' | 'CR-3' | 'CR-4' | 'CR-5'

/**
 * Canonical identifier for a duplicate-prevention rule.
 *
 * @spec Blueprint Integration Specification v1.0 §3.3, §4.3
 */
export type DuplicatePreventionId = 'L1' | 'L2' | 'L3' | 'L4' | 'L5'

/**
 * Scope in which a duplicate-prevention rule is enforced.
 *
 * @spec Blueprint Integration Specification v1.0 §4.3
 */
export type DuplicatePreventionScope = 'within_set' | 'across_set'

/**
 * Unit produced by one Assessment Engine execution.
 *
 * Version 1 executes one complete Blueprint as a co-allocated multi-set run.
 *
 * @spec Blueprint Integration Specification v1.0 §5.1
 */
export type RunUnit = 'blueprint'
