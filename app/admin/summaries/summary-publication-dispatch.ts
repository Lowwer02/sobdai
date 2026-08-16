import type { SummaryBankCompatibilityWriter } from '@/lib/application/knowledge-platform'
import {
  asSummaryActionRecord,
  deriveSummaryKind,
  requiredSummaryIdentifier,
} from './summary-action-logic'

export type SummaryPublicationDispatchWriter = Pick<
  SummaryBankCompatibilityWriter,
  'publish' | 'unpublish' | 'publishLegacy' | 'unpublishLegacy'
>

export type SummaryPublicationDispatchOutcome =
  | 'published'
  | 'republished'
  | 'unpublished'

export interface SummaryPublicationDispatchResult {
  readonly outcome: SummaryPublicationDispatchOutcome
  readonly idempotentRetry: boolean
}

export interface ResolvedSummaryPublicationState {
  readonly id: string
  readonly summary_code: unknown
}

/** Parse only the server-resolved Summary identity used for publication. */
export function resolveSummaryPublicationState(
  value: unknown,
): ResolvedSummaryPublicationState {
  const record = asSummaryActionRecord(value)
  const id = requiredSummaryIdentifier(record.id, 'summary.id')
  deriveSummaryKind(record.summary_code)
  return { id, summary_code: record.summary_code }
}

/**
 * Dispatch publication from the server-resolved Summary discriminator. Any
 * client-provided kind-like fields are intentionally ignored.
 */
export async function dispatchSummaryPublication({
  summary,
  actorId,
  isPublished,
  writer,
}: {
  readonly summary: unknown
  readonly actorId: string
  readonly isPublished: boolean
  readonly writer: SummaryPublicationDispatchWriter
}): Promise<SummaryPublicationDispatchResult> {
  const resolvedSummary = resolveSummaryPublicationState(summary)
  const summaryId = resolvedSummary.id
  const summaryKind = deriveSummaryKind(resolvedSummary.summary_code)

  if (summaryKind === 'legacy') {
    if (isPublished) {
      const result = await writer.publishLegacy({ actorId, summaryId })
      return {
        outcome: 'published',
        idempotentRetry: result.idempotentRetry,
      }
    }

    const result = await writer.unpublishLegacy({ actorId, summaryId })
    return {
      outcome: 'unpublished',
      idempotentRetry: result.idempotentRetry,
    }
  }

  if (isPublished) {
    const result = await writer.publish({ actorId, summaryId })
    return {
      outcome: result.republished ? 'republished' : 'published',
      idempotentRetry: result.idempotentRetry,
    }
  }

  const result = await writer.unpublish({ actorId, summaryId })
  return {
    outcome: 'unpublished',
    idempotentRetry: result.idempotentRetry,
  }
}
