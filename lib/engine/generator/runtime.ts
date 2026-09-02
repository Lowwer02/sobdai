/**
 * lib/engine/generator/runtime.ts
 * ----------------------------------------------------------------------------
 * Production Runtime entry point for the Candidate Generator.
 *
 * `runGenerator()` owns orchestration only. Filtering, discovery, validation,
 * expansion, constraint projection, and CandidateSet emission remain delegated
 * to their existing production owners.
 */

import type { AssemblyRequest } from '../reader/contracts'
import { noopSink } from '../shared/observability'
import type { BankMetadataRow, BankReadAdapter } from '../shared/question-bank'
import { emitCandidateSet } from './candidate-set-emitter'
import { projectConstraintSnapshot } from './constraint-snapshot'
import type {
  CandidateGenerationResult,
  CandidateSetIdentity,
  FatalDiagnostic,
} from './contracts'
import {
  discoverCandidates,
  validatePool,
  type DiscoveryContext,
} from './discovery'
import {
  classifyPatternAvailability,
  deriveStructuralPatternPool,
  InMemoryBankAdapter,
  runFilters,
} from './metadata-filters'
import {
  expandPool,
  type ExpansionOptions,
} from './pool-expansion'
import { planQuery } from './query-planner'

/**
 * Immutable input to one production Generator execution.
 *
 * The initial Bank adapter and optional supplemental expansion window are
 * caller-supplied snapshots. Runtime identity is composed from the existing
 * CandidateSet identity contract rather than redefined here.
 *
 * @spec Candidate Generation Architecture v1.0 §2–§10
 */
export interface GeneratorRuntimeInput {
  /** Reader-owned AssemblyRequest consumed read-only. */
  readonly assemblyRequest: AssemblyRequest

  /** Read-only production Question Bank metadata ingress. */
  readonly bank: BankReadAdapter

  /** Runtime-pinned identity attached unchanged to the CandidateSet. */
  readonly identity: CandidateSetIdentity

  /**
   * Additional Bank rows available to controlled Pool Expansion.
   *
   * Empty or omitted when the initial Bank snapshot already represents the
   * complete permitted search window.
   */
  readonly supplementalRows?: readonly BankMetadataRow[]

  /** Existing Pool Expansion options forwarded without reinterpretation. */
  readonly expansionOptions?: ExpansionOptions
}

/**
 * Executes the complete production Generator pipeline.
 *
 * Fixed flow:
 * Query Planning → Metadata Filtering → Candidate Discovery → Pool Validation
 * → Pool Expansion → CandidateSet Emission.
 *
 * The function adds no filtering, discovery, validation, expansion, or
 * emission behavior. Fatal component outcomes are forwarded through the
 * existing CandidateGenerationResult contract.
 *
 * @spec Candidate Generation Architecture v1.0 §2.2 and §10
 */
export function runGenerator(
  input: GeneratorRuntimeInput
): CandidateGenerationResult {
  const bankRows = readBankMetadata(input.bank)
  if (!bankRows.ok) return bankRows.failure

  try {
    const request = input.assemblyRequest
    const plan = planQuery(request)
    const context: DiscoveryContext = {
      plan,
      documentRegistry: request.documentRegistry,
    }
    const sink = input.expansionOptions?.sink ?? noopSink

    const filterResult = runFilters(
      new InMemoryBankAdapter(bankRows.rows),
      plan,
      sink
    )
    if (!filterResult.ok) {
      return {
        ok: false,
        fatalDiagnostics: filterResult.fatalDiagnostics,
      }
    }

    const discoveryResult = discoverCandidates({
      rows: filterResult.rows,
      ctx: context,
    })
    if (!discoveryResult.ok) {
      return {
        ok: false,
        fatalDiagnostics: discoveryResult.fatalDiagnostics,
      }
    }

    const validationResult = validatePool(discoveryResult.pool)
    const expansionResult = expandPool({
      validation: validationResult,
      supplementalRows: input.supplementalRows ?? [],
      ctx: context,
      options: input.expansionOptions,
    })

    const initialStructuralRows = deriveStructuralPatternPool(bankRows.rows, plan)
    const expansionActivated =
      expansionResult.expansionReport.phasesRun.includes('search_window')
    const supplementalStructuralRows =
      expansionActivated && input.supplementalRows && input.supplementalRows.length > 0
        ? deriveStructuralPatternPool(input.supplementalRows, plan)
        : []
    const combinedStructuralPool = [
      ...initialStructuralRows,
      ...supplementalStructuralRows,
    ]
    const patternAvailability =
      combinedStructuralPool.length > 0
        ? classifyPatternAvailability(combinedStructuralPool)
        : undefined

    const candidateSet = emitCandidateSet({
      expansion: expansionResult,
      exclusionsLog: filterResult.rejectionLog,
      identity: input.identity,
      constraintSnapshot: projectConstraintSnapshot(request),
      patternAvailability,
    })

    return {
      ok: true,
      candidateSet,
    }
  } catch (error: unknown) {
    return internalFailure(error)
  }
}

type BankReadResult =
  | {
      readonly ok: true
      readonly rows: readonly BankMetadataRow[]
    }
  | {
      readonly ok: false
      readonly failure: CandidateGenerationResult
    }

function readBankMetadata(bank: BankReadAdapter): BankReadResult {
  try {
    return {
      ok: true,
      rows: bank.readMetadata(),
    }
  } catch (error: unknown) {
    return {
      ok: false,
      failure: {
        ok: false,
        fatalDiagnostics: [
          fatalDiagnostic(
            'bank_unreachable',
            `Question Bank metadata read failed: ${errorMessage(error)}.`,
            'Restore Question Bank availability and retry the Generator execution.'
          ),
        ],
      },
    }
  }
}

function internalFailure(error: unknown): CandidateGenerationResult {
  return {
    ok: false,
    fatalDiagnostics: [
      fatalDiagnostic(
        'internal_error',
        `Generator Runtime failed unexpectedly: ${errorMessage(error)}.`,
        'Inspect the Generator diagnostic and correct the invalid runtime input or internal failure.'
      ),
    ],
  }
}

function fatalDiagnostic(
  category: FatalDiagnostic['category'],
  explanation: string,
  recommendation: string
): FatalDiagnostic {
  return {
    category,
    severity: 'Fatal',
    explanation,
    recommendation,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
