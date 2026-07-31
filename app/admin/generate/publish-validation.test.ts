import assert from 'node:assert/strict'

import type { PublishApprovedAssessmentInput } from './publish-contracts'
import { validatePublishInput } from './publish-validation'

const validInput: PublishApprovedAssessmentInput = {
  approval: {
    decision: 'approved',
    executionId: 'execution-1',
  },
  packageId: 'package-1',
  baseName: 'Simulation Assessment',
  description: 'Approved assessment.',
  durationMinutes: 120,
  isSample: false,
  sortOrder: 0,
  displayOrder: 0,
  sets: [
    {
      setNumber: 1,
      questionCodes: ['Q-000001', 'Q-000002'],
      expectedQuestionCount: 2,
    },
  ],
}

assert.equal(validatePublishInput(validInput), null)

assert.equal(
  validatePublishInput(null as unknown as PublishApprovedAssessmentInput),
  'Publish settings are required.'
)

assert.equal(
  validatePublishInput({
    ...validInput,
    approval: {
      decision: 'approved',
      executionId: '',
    },
  }),
  'Publish requires an approved Review result.'
)

assert.equal(
  validatePublishInput({
    ...validInput,
    sets: [
      {
        setNumber: 1,
        questionCodes: ['Q-000001', 'Q-000001'],
        expectedQuestionCount: 2,
      },
    ],
  }),
  'Assessment Set 1 contains duplicate Question Codes.'
)

assert.equal(
  validatePublishInput({
    ...validInput,
    sets: [
      {
        setNumber: 1,
        questionCodes: ['Q-000001', 'Q-000002'],
        expectedQuestionCount: 1,
      },
    ],
  }),
  'Assessment Set 1 exceeds its approved question target.'
)

console.log('Publish validation tests passed.')
