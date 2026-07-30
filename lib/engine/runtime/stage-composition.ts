/**
 * lib/engine/runtime/stage-composition.ts
 * ----------------------------------------------------------------------------
 * Canonical metadata describing the Assessment Engine Runtime pipeline.
 *
 * This module owns stage identity, order, dependencies, transitions, and
 * contract-flow metadata only. It contains no callbacks, stage invocation,
 * orchestration, validation, state updates, or business logic.
 */

import type { EngineModule } from '../shared/errors'

/**
 * Sole authoritative Runtime stage order.
 *
 * The tuple is constrained by the shared Engine module vocabulary and excludes
 * Runtime API and post-Engine modules.
 *
 * @spec Assessment Engine Runtime API Specification v1.0 §3.3
 */
export const RUNTIME_STAGE_ORDER = [
  'Reader',
  'Generator',
  'Scoring',
  'Ranking',
  'Solver',
] as const satisfies readonly EngineModule[]

/**
 * Immutable canonical order of Runtime stages.
 *
 * Tuple positions are part of the composition contract and must change only
 * through a versioned Runtime architecture change.
 *
 * @spec Assessment Engine Runtime API Specification v1.0 §3.3
 */
export type RuntimeStageOrder = typeof RUNTIME_STAGE_ORDER

/**
 * Canonical Engine stage participating in one Runtime pipeline.
 *
 * Stage identity derives from the sole authoritative stage-order tuple so the
 * vocabulary and ordering cannot drift.
 *
 * @spec Assessment Engine Runtime API Specification v1.0 §3.3
 */
export type RuntimeStage = RuntimeStageOrder[number]

type RuntimeContractName =
  | 'EngineRequest'
  | 'AssemblyRequest'
  | 'CandidateSet'
  | 'CompositeScore'
  | 'RankedCandidateSet'
  | 'AllocatedCandidateSet'

/**
 * Immutable metadata describing one Runtime stage and its contract boundary.
 *
 * Contract names identify existing owner contracts; they do not reproduce
 * their fields or create parallel stage models.
 *
 * @spec Assessment Engine Runtime API Specification v1.0 §3.3
 */
export interface RuntimeStageDescriptor {
  /** Canonical stage identity. */
  readonly stage: RuntimeStage

  /** Existing contracts consumed by the stage. */
  readonly consumes: readonly RuntimeContractName[]

  /** Existing contracts emitted by the stage. */
  readonly produces: readonly RuntimeContractName[]
}

/**
 * Immutable directed dependency between two Runtime stages.
 *
 * `artifact` names the existing stage-owned contract that establishes the
 * dependency.
 *
 * @spec Assessment Engine Runtime API Specification v1.0 §3.3
 */
export interface StageDependency {
  /** Stage that requires an upstream artifact. */
  readonly stage: RuntimeStage

  /** Upstream stage that owns the required artifact. */
  readonly dependsOn: RuntimeStage

  /** Existing contract carried across the dependency boundary. */
  readonly artifact: RuntimeContractName
}

/**
 * Immutable directed edge in the Runtime stage transition graph.
 *
 * The edge describes composition only. It does not contain a condition,
 * callback, status mutation, or execution rule.
 *
 * @spec Assessment Engine Runtime API Specification v1.0 §3.3
 */
export interface StageTransition {
  /** Stage from which the transition originates. */
  readonly from: RuntimeStage

  /** Stage to which the transition leads. */
  readonly to: RuntimeStage
}

/**
 * Complete immutable composition definition for the Runtime pipeline.
 *
 * @spec Assessment Engine Runtime API Specification v1.0 §3
 */
export interface PipelineDefinition {
  /** Single authoritative stage order. */
  readonly stageOrder: RuntimeStageOrder

  /** Stage metadata keyed by canonical stage identity. */
  readonly stages: Readonly<Record<RuntimeStage, RuntimeStageDescriptor>>

  /** Directed stage dependency graph. */
  readonly dependencies: readonly StageDependency[]

  /** Directed stage transition graph. */
  readonly transitions: readonly StageTransition[]
}

/**
 * Versioned immutable identity and definition of the Runtime pipeline.
 *
 * @spec Assessment Engine Runtime API Specification v1.0 §3 and §10
 */
export interface RuntimePipeline {
  /** Stable pipeline identifier. */
  readonly id: 'assessment-engine'

  /** Composition metadata version. */
  readonly version: '1.0'

  /** First stage in the pipeline. */
  readonly entryStage: RuntimeStage

  /** Final stage in the pipeline. */
  readonly terminalStage: RuntimeStage

  /** Canonical pipeline composition metadata. */
  readonly definition: PipelineDefinition
}

const RUNTIME_STAGE_DESCRIPTORS: Readonly<
  Record<RuntimeStage, RuntimeStageDescriptor>
> = {
  Reader: {
    stage: 'Reader',
    consumes: ['EngineRequest'],
    produces: ['AssemblyRequest'],
  },
  Generator: {
    stage: 'Generator',
    consumes: ['AssemblyRequest'],
    produces: ['CandidateSet'],
  },
  Scoring: {
    stage: 'Scoring',
    consumes: ['CandidateSet'],
    produces: ['CompositeScore'],
  },
  Ranking: {
    stage: 'Ranking',
    consumes: ['CandidateSet', 'CompositeScore'],
    produces: ['RankedCandidateSet'],
  },
  Solver: {
    stage: 'Solver',
    consumes: ['RankedCandidateSet'],
    produces: ['AllocatedCandidateSet'],
  },
}

const RUNTIME_STAGE_DEPENDENCIES: readonly StageDependency[] = [
  {
    stage: 'Generator',
    dependsOn: 'Reader',
    artifact: 'AssemblyRequest',
  },
  {
    stage: 'Scoring',
    dependsOn: 'Generator',
    artifact: 'CandidateSet',
  },
  {
    stage: 'Ranking',
    dependsOn: 'Generator',
    artifact: 'CandidateSet',
  },
  {
    stage: 'Ranking',
    dependsOn: 'Scoring',
    artifact: 'CompositeScore',
  },
  {
    stage: 'Solver',
    dependsOn: 'Ranking',
    artifact: 'RankedCandidateSet',
  },
]

const RUNTIME_STAGE_TRANSITIONS: readonly StageTransition[] = [
  { from: 'Reader', to: 'Generator' },
  { from: 'Generator', to: 'Scoring' },
  { from: 'Scoring', to: 'Ranking' },
  { from: 'Ranking', to: 'Solver' },
]

/**
 * Canonical immutable stage composition definition.
 *
 * @spec Assessment Engine Runtime API Specification v1.0 §3
 */
export const RUNTIME_PIPELINE_DEFINITION: PipelineDefinition = {
  stageOrder: RUNTIME_STAGE_ORDER,
  stages: RUNTIME_STAGE_DESCRIPTORS,
  dependencies: RUNTIME_STAGE_DEPENDENCIES,
  transitions: RUNTIME_STAGE_TRANSITIONS,
}

/**
 * Canonical versioned Assessment Engine Runtime pipeline metadata.
 *
 * @spec Assessment Engine Runtime API Specification v1.0 §3 and §10
 */
export const ASSESSMENT_ENGINE_RUNTIME_PIPELINE: RuntimePipeline = {
  id: 'assessment-engine',
  version: '1.0',
  entryStage: 'Reader',
  terminalStage: 'Solver',
  definition: RUNTIME_PIPELINE_DEFINITION,
}
