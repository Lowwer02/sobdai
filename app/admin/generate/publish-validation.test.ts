import assert from 'node:assert/strict'

import type { PublishApprovedAssessmentInput } from './publish-contracts'
import { validatePublishInput } from './publish-validation'

const validInput: PublishApprovedAssessmentInput = {
  approval: {
    decision: 'approved',
    executionId: 'execution-1',
  },
  blueprint: {
    id: 'bma-education-specialist',
    version: '3.0.1',
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

// The Blueprint identity block is required and shape-checked; its authority
// is verified server-side by publish-authority, not here.
assert.equal(
  validatePublishInput({
    ...validInput,
    blueprint: undefined as unknown as PublishApprovedAssessmentInput['blueprint'],
  }),
  'Publish requires the approved Blueprint identity.'
)

assert.equal(
  validatePublishInput({
    ...validInput,
    blueprint: { id: '  ', version: '3.0.1' },
  }),
  'The approved Blueprint identity is invalid.'
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
        questionCodes: ['Q-000001', 'Q-000002', 'Q-000003'],
        expectedQuestionCount: 2,
      },
    ],
  }),
  'Assessment Set 1 contains 3 of exactly 2 required Questions. Partial allocations cannot be published.'
)

// FAIL-CLOSED regression (KSB 6/100): a partial allocation must never publish.
assert.equal(
  validatePublishInput({
    ...validInput,
    sets: [
      {
        setNumber: 1,
        questionCodes: [
          'Q-000001',
          'Q-000002',
          'Q-000003',
          'Q-000004',
          'Q-000005',
          'Q-000006',
        ],
        expectedQuestionCount: 100,
      },
    ],
  }),
  'Assessment Set 1 contains 6 of exactly 100 required Questions. Partial allocations cannot be published.'
)

// One question short must also be rejected.
assert.equal(
  validatePublishInput({
    ...validInput,
    sets: [
      {
        setNumber: 1,
        questionCodes: Array.from({ length: 99 }, (_, index) => `Q-${String(index + 1).padStart(6, '0')}`),
        expectedQuestionCount: 100,
      },
    ],
  }),
  'Assessment Set 1 contains 99 of exactly 100 required Questions. Partial allocations cannot be published.'
)

// Exactly on target publishes.
assert.equal(
  validatePublishInput({
    ...validInput,
    sets: [
      {
        setNumber: 1,
        questionCodes: Array.from({ length: 100 }, (_, index) => `Q-${String(index + 1).padStart(6, '0')}`),
        expectedQuestionCount: 100,
      },
    ],
  }),
  null
)

console.log('Publish validation tests passed.')
