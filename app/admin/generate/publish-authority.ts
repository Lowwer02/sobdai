/**
 * app/admin/generate/publish-authority.ts
 * ----------------------------------------------------------------------------
 * Server-authoritative Blueprint target resolution for the Assessment Publish
 * boundary (quantified-allocation audit fix P1).
 *
 * The publish server action MUST NOT trust the client-declared
 * `expectedQuestionCount`. This module resolves the approved result's
 * Blueprint identity against the server-held Assessment Blueprint registry
 * (./config.ts) and derives the authoritative per-Set question target from the
 * REGISTERED Blueprint source through the Engine's real Reader (public API
 * only — the same parser the generation transport uses; no second parser).
 *
 * The Engine run below is a Reader-only projection: the Question Bank adapter
 * is empty because only the Reader's AssemblyRequest (`target.perSet`) is
 * consumed. Later stages failing on the empty bank is expected and irrelevant
 * to this derivation.
 *
 * This module performs NO database access. publish-actions.ts invokes it (and
 * validateAuthoritativeQuestionCounts / validateDestinationPackageBinding)
 * before any Supabase read or Exam Set write.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { runEngine } from '../../../lib/engine'
import type { EngineRequest } from '../../../lib/engine'
import { ADMIN_ASSESSMENT_BLUEPRINTS } from './config'

/** Blueprint identity as declared by the approved result being published. */
export interface PublishBlueprintIdentity {
  readonly id: string
  readonly version: string
}

/** One server-known Assessment Blueprint registry entry. */
type RegistryEntry = (typeof ADMIN_ASSESSMENT_BLUEPRINTS)[number]

/**
 * The authoritative publish target derived from server-held contracts.
 * `perSet` is the Blueprint's `target.perSet`; `packageCode` binds the
 * Blueprint to its destination Package.
 */
export type AuthoritativePublishTarget =
  | {
      readonly ok: true
      readonly perSet: number
      readonly packageCode: string
    }
  | { readonly ok: false; readonly error: string }

/**
 * Resolve the publish target for an approved result's Blueprint identity.
 *
 * The identity is verified against the registry with NO substitution: an
 * unknown id or a non-registered version is rejected ("latest" never applies).
 */
export async function resolveAuthoritativePublishTarget(
  identity: PublishBlueprintIdentity
): Promise<AuthoritativePublishTarget> {
  const entry = ADMIN_ASSESSMENT_BLUEPRINTS.find(
    (candidate) => candidate.id === identity.id
  )
  if (entry === undefined) {
    return {
      ok: false,
      error: `Blueprint '${identity.id}' is not a registered Assessment Blueprint. Publishing is only permitted for registered Blueprints.`,
    }
  }
  if (entry.version !== identity.version) {
    return {
      ok: false,
      error: `Blueprint '${identity.id}' version '${identity.version}' is not registered; the registered version is '${entry.version}'. Version substitution is not permitted.`,
    }
  }

  const perSet = await deriveAuthoritativePerSet(entry)
  if (perSet === null) {
    return {
      ok: false,
      error: `The registered Blueprint '${entry.id}@${entry.version}' could not be resolved to an authoritative per-Set question target.`,
    }
  }
  return { ok: true, perSet, packageCode: entry.packageCode }
}

/**
 * Enforce the authoritative per-Set count for every approved Set BEFORE any
 * database write. The client-declared `expectedQuestionCount` is accepted only
 * when it equals the server-derived target; a forged pair such as
 * (6 codes, expected 6) for a 100-Question Blueprint is rejected here even
 * though it is internally consistent.
 */
export function validateAuthoritativeQuestionCounts(
  sets: readonly {
    readonly setNumber: number
    readonly questionCodes: readonly string[]
    readonly expectedQuestionCount: number
  }[],
  authoritativePerSet: number
): string | null {
  for (const set of sets) {
    if (set.expectedQuestionCount !== authoritativePerSet) {
      return `Assessment Set ${set.setNumber} declares ${set.expectedQuestionCount} expected Questions, but the registered Blueprint requires exactly ${authoritativePerSet}. Client-declared targets cannot override the Blueprint.`
    }
    if (set.questionCodes.length !== authoritativePerSet) {
      return `Assessment Set ${set.setNumber} contains ${set.questionCodes.length} of exactly ${authoritativePerSet} Questions required by the registered Blueprint. Partial allocations cannot be published.`
    }
  }
  return null
}

/**
 * Bind the destination Package to the Blueprint's registered package code.
 * The destination is rejected when it belongs to any other package.
 */
export function validateDestinationPackageBinding(
  destinationPackageCode: string | null | undefined,
  blueprintPackageCode: string
): string | null {
  if (destinationPackageCode !== blueprintPackageCode) {
    return `The destination Package is not bound to Blueprint package '${blueprintPackageCode}'.`
  }
  return null
}

// ─── Reader projection ──────────────────────────────────────────────────────

/**
 * Derive `target.perSet` from the registered source via the Engine's public
 * API. Returns null when the Reader does not emit a usable positive-integer
 * target (fail-closed).
 */
async function deriveAuthoritativePerSet(
  entry: RegistryEntry
): Promise<number | null> {
  try {
    const source = await readFile(
      path.join(process.cwd(), entry.sourcePath),
      'utf8'
    )
    const response = runEngine(
      readerProjectionRequest(entry),
      readerProjectionDeps(source)
    )
    const perSet = response.assemblyRequest?.target.perSet ?? null
    if (typeof perSet !== 'number' || !Number.isInteger(perSet) || perSet < 1) {
      return null
    }
    return perSet
  } catch {
    return null
  }
}

/**
 * Minimal Engine request for the Reader projection. The request names the
 * registry entry's exact identity so the Reader consumes the registered
 * source; targetSetCount 1 keeps the discarded downstream work minimal.
 */
function readerProjectionRequest(entry: RegistryEntry): EngineRequest {
  return {
    blueprint: { id: entry.id, version: entry.version },
    profile: 'simulation',
    runUnit: 'blueprint',
    runtimeCompatibility: { targetVersion: '1.0', minimumVersion: '1.0' },
    options: {
      overFetchFactor: 1,
      performanceBudgetMs: null,
      parallelismHint: null,
      auditVerbosity: 'summary',
      targetSetCount: 1,
    },
    context: {
      requestedBy: 'assessment-publish-authority',
      submittedAtIso: '2026-01-01T00:00:00.000Z',
      correlationId: 'assessment-publish-authority',
      traceId: null,
      parentSpanId: null,
    },
  }
}

/** Empty-bank, no-op dependencies: only the Reader stage's output is read. */
function readerProjectionDeps(source: string) {
  return {
    readBlueprintSource: () => source,
    questionBank: { readMetadata: () => [] as const },
    observability: { emit: () => undefined },
    createExecutionId: () => 'assessment-publish-authority',
    nowIso: () => '2026-01-01T00:00:00.000Z',
    monotonicTimeMs: () => 0,
    isCancellationRequested: () => false,
  }
}
