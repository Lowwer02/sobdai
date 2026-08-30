export type PersistedPaymentSubmission = {
  order_id: string
  storage_object_path: string
}

/**
 * An uploaded object is deletable only when the database has proved that the
 * object is not the one referenced by the committed submission. Any
 * uncertainty after commit fails closed toward retention.
 */
export function shouldDeleteUploadedPaymentSlip(input: {
  submissionCommitted: boolean
  orderId?: string
  objectPath?: string
  persistedSubmission?: PersistedPaymentSubmission | null
  persistedSubmissionError?: unknown
}) {
  if (!input.submissionCommitted) return true
  if (
    input.persistedSubmissionError
    || !input.persistedSubmission
    || input.persistedSubmission.order_id !== input.orderId
  ) {
    return false
  }

  return input.persistedSubmission.storage_object_path !== input.objectPath
}

/**
 * A failed RPC may have committed. Delete only after a successful reconciliation
 * proves that no submission exists for the retry key.
 */
export function shouldDeleteAfterSubmissionError(input: {
  recoveredSubmission?: unknown | null
  recoveryError?: unknown
}) {
  return !input.recoveryError && !input.recoveredSubmission
}

/**
 * Telegram is operational-only. The caller can log the returned error while
 * preserving the already-committed payment evidence and order state.
 */
export async function attemptPaymentSubmissionNotification(
  notify: () => Promise<unknown>,
) {
  try {
    const result = await notify()
    if (
      typeof result === 'object'
      && result !== null
      && 'sent' in result
      && result.sent === false
    ) {
      return { sent: false as const, error: null }
    }

    return { sent: true as const, error: null }
  } catch (error) {
    return { sent: false as const, error }
  }
}
