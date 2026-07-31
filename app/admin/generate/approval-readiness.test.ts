import assert from 'node:assert/strict'

import { evaluateApprovalReadiness } from './approval-readiness'

assert.deepEqual(
  evaluateApprovalReadiness({
    blockingErrorCount: 1,
    reviewerConfirmed: true,
  }),
  {
    state: 'blocked',
    canApprove: false,
    explanation:
      'Approval is blocked until all fatal or blocking Engine errors are resolved.',
  },
  'blocking Engine errors must prevent approval even after confirmation'
)

assert.equal(
  evaluateApprovalReadiness({
    blockingErrorCount: 0,
    reviewerConfirmed: false,
  }).state,
  'confirmation_required',
  'an otherwise clean review must still require reviewer confirmation'
)

assert.deepEqual(
  evaluateApprovalReadiness({
    blockingErrorCount: 0,
    reviewerConfirmed: true,
  }),
  {
    state: 'ready',
    canApprove: true,
    explanation:
      'No blocking Engine errors remain and reviewer confirmation is complete.',
  },
  'warnings are intentionally absent from readiness and cannot block approval'
)

console.log('Approval readiness tests passed.')
