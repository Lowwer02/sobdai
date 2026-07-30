/**
 * lib/engine/shared/question-bank.ts
 * ----------------------------------------------------------------------------
 * Canonical production boundary for Question Bank metadata consumed by the
 * Assessment Engine.
 *
 * This module contains metadata contracts only. It has no persistence,
 * infrastructure, validation, filtering, discovery, or runtime behavior.
 */

import type {
  BlueprintType,
  Difficulty,
  LearningObjective,
  QuestionPattern,
} from './assessment-vocabulary'

/**
 * Authoritative metadata shape returned by the Question Bank read boundary.
 *
 * The row contains only fields used by the deterministic Engine pipeline.
 * Question content, choices, explanations, and storage-specific fields are
 * intentionally outside this contract.
 */
export interface BankMetadataRow {
  /** Immutable business identifier for the Question. */
  questionCode: string

  /** Subject classification, or `null` when the Bank has no value. */
  subject: string | null

  /** Document identifier used to resolve Blueprint eligibility and Tier. */
  document: string

  /** Topic classification, or `null` when the Bank has no value. */
  topic: string | null

  /** Law classification, or `null` when the Bank has no value. */
  law: string | null

  /** Canonical difficulty assigned to the Question. */
  difficulty: Difficulty

  /** Bank publication or workflow status. */
  status: string

  /**
   * Cognitive Blueprint Type axis.
   *
   * The property remains optional and nullable to preserve the existing Bank
   * metadata contract while the axis may be absent from older rows.
   */
  blueprintType?: BlueprintType | null

  /**
   * Learning Objective axis.
   *
   * The property remains optional and nullable to preserve the existing Bank
   * metadata contract while the axis may be absent from older rows.
   */
  learningObjective?: LearningObjective | null

  /**
   * Question Pattern axis.
   *
   * The property remains optional and nullable to preserve the existing Bank
   * metadata contract while the axis may be absent from older rows.
   */
  questionPattern?: QuestionPattern | null

  /**
   * Section classification.
   *
   * The property remains optional and nullable to preserve the existing Bank
   * metadata contract while the axis may be absent from older rows.
   */
  section?: string | null
}

/**
 * Production ingress boundary through which the Engine reads Question Bank
 * metadata.
 *
 * Infrastructure adapters implement this interface outside the Engine. The
 * returned collection and its rows are read-only for the duration of an Engine
 * execution.
 */
export interface BankReadAdapter {
  /**
   * Reads the metadata snapshot supplied to Candidate Generator filtering.
   *
   * @returns The read-only Question Bank metadata rows for one execution.
   */
  readMetadata(): readonly BankMetadataRow[]
}
