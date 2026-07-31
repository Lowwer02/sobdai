export interface ApprovalReadinessInput {
  readonly blockingErrorCount: number
  readonly reviewerConfirmed: boolean
}

export type ApprovalReadiness =
  | {
      readonly state: 'blocked'
      readonly canApprove: false
      readonly explanation: string
    }
  | {
      readonly state: 'confirmation_required'
      readonly canApprove: false
      readonly explanation: string
    }
  | {
      readonly state: 'ready'
      readonly canApprove: true
      readonly explanation: string
    }

/**
 * Product-owned readiness rule for the editorial approval decision.
 *
 * Engine findings are consumed as review facts. They are never reinterpreted:
 * fatal and blocking errors prevent approval, while warnings remain advisory.
 */
export function evaluateApprovalReadiness({
  blockingErrorCount,
  reviewerConfirmed,
}: ApprovalReadinessInput): ApprovalReadiness {
  if (blockingErrorCount > 0) {
    return {
      state: 'blocked',
      canApprove: false,
      explanation:
        'Approval is blocked until all fatal or blocking Engine errors are resolved.',
    }
  }

  if (!reviewerConfirmed) {
    return {
      state: 'confirmation_required',
      canApprove: false,
      explanation:
        'Reviewer confirmation is required before approval can be recorded.',
    }
  }

  return {
    state: 'ready',
    canApprove: true,
    explanation:
      'No blocking Engine errors remain and reviewer confirmation is complete.',
  }
}
