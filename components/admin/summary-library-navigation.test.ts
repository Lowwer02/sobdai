import assert from 'node:assert/strict'
import test from 'node:test'

import { getSummaryWorkspaceHref } from './summary-library-navigation'

test('builds a stable compatibility workspace deep link from the Summary ID', () => {
  assert.equal(
    getSummaryWorkspaceHref('summary/with spaces'),
    '/admin/summaries/summary%2Fwith%20spaces/edit'
  )
})
