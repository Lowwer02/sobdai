import assert from 'node:assert/strict'

import { adaptReviewResultForPublish } from './publish-adapter'
import type { AssessmentReviewResult } from './review-result'

const result = {
  execution: {
    executionId: 'execution-1',
    blueprintId: 'blueprint-1',
    blueprintVersion: '3.0.0',
  },
  assemblyRequest: {
    target: {
      sets: 2,
      perSet: 2,
    },
  },
  allocatedCandidateSet: {
    placements: [
      {
        state: 'allocated',
        slot: { setNumber: 1 },
        assignedCandidate: { code: 'Q-000001' },
      },
      {
        state: 'rejected',
        slot: { setNumber: 1 },
      },
      {
        state: 'allocated',
        slot: { setNumber: 2 },
        assignedCandidate: { code: 'Q-000002' },
      },
    ],
  },
} as unknown as AssessmentReviewResult

assert.deepEqual(adaptReviewResultForPublish(result), {
  executionId: 'execution-1',
  blueprint: 'blueprint-1@3.0.0',
  sets: [
    {
      setNumber: 1,
      questionCodes: ['Q-000001'],
      expectedQuestionCount: 2,
    },
    {
      setNumber: 2,
      questionCodes: ['Q-000002'],
      expectedQuestionCount: 2,
    },
  ],
})

console.log('Publish adapter tests passed.')
