import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assertPackageIdsAvailable,
  buildCreateSelection,
  buildEditSelection,
  deriveSummaryKind,
  hydrateCurrentPackageIds,
  normalizePackageIds,
  stripEditPublicationState,
} from './summary-action-logic'

const PACKAGE_ID = '00000000-0000-4000-8000-000000000001'
const SECOND_PACKAGE_ID = '00000000-0000-4000-8000-000000000002'
const THIRD_PACKAGE_ID = '00000000-0000-4000-8000-000000000003'

test('new Create rejects zero selected Packages', () => {
  assert.throws(
    () => buildCreateSelection({ packageIds: [] }),
    /at least one Package/,
  )
})

test('new Create forwards one selected Package through the KP-native selection', () => {
  assert.deepEqual(
    buildCreateSelection({ packageIds: [PACKAGE_ID] }),
    {
      summaryKind: 'kp_native',
      packageId: PACKAGE_ID,
      packageIds: [PACKAGE_ID],
    },
  )
})

test('new Create forwards three selected Packages through one shared selection', () => {
  assert.deepEqual(
    buildCreateSelection({
      packageIds: [PACKAGE_ID, SECOND_PACKAGE_ID, THIRD_PACKAGE_ID],
    }),
    {
      summaryKind: 'kp_native',
      packageId: PACKAGE_ID,
      packageIds: [PACKAGE_ID, SECOND_PACKAGE_ID, THIRD_PACKAGE_ID],
    },
  )
})

test('new Create rejects duplicate Package IDs', () => {
  assert.throws(
    () => buildCreateSelection({ packageIds: [PACKAGE_ID, PACKAGE_ID] }),
    /cannot contain duplicates/,
  )
})

test('server derives Legacy and KP branches only from summary_code', () => {
  assert.equal(deriveSummaryKind(null), 'legacy')
  assert.equal(deriveSummaryKind('SUM-000123'), 'kp_native')
  assert.throws(() => deriveSummaryKind(undefined), /resolved safely/)

  const kpSelection = buildEditSelection(
    { summary_code: 'SUM-000123', package_id: PACKAGE_ID },
    {
      summaryKind: 'legacy',
      packageIds: [PACKAGE_ID, SECOND_PACKAGE_ID],
      package_id: SECOND_PACKAGE_ID,
    },
  )
  assert.equal(kpSelection.summaryKind, 'kp_native')
  assert.deepEqual(kpSelection.packageIds, [PACKAGE_ID, SECOND_PACKAGE_ID])
})

test('KP Edit forwards one Package and never requires a hidden kind from the client', () => {
  const selection = buildEditSelection(
    { summary_code: 'SUM-000123', package_id: PACKAGE_ID },
    { packageIds: [PACKAGE_ID], summaryKind: 'legacy' },
  )

  assert.deepEqual(selection, {
    summaryKind: 'kp_native',
    packageId: PACKAGE_ID,
    packageIds: [PACKAGE_ID],
  })
})

test('KP Edit forwards three Packages as the complete desired set', () => {
  const selection = buildEditSelection(
    { summary_code: 'SUM-000123', package_id: PACKAGE_ID },
    { packageIds: [PACKAGE_ID, SECOND_PACKAGE_ID, THIRD_PACKAGE_ID] },
  )

  assert.deepEqual(selection.packageIds, [PACKAGE_ID, SECOND_PACKAGE_ID, THIRD_PACKAGE_ID])
})

test('KP Edit rejects a missing or empty complete Package set', () => {
  assert.throws(
    () => buildEditSelection(
      { summary_code: 'SUM-000123', package_id: PACKAGE_ID },
      {},
    ),
    /at least one Package/,
  )
  assert.throws(
    () => buildEditSelection(
      { summary_code: 'SUM-000123', package_id: PACKAGE_ID },
      { packageIds: [] },
    ),
    /at least one Package/,
  )
})

test('KP Edit hydrates every current membership, including secondary Packages', () => {
  const selected = hydrateCurrentPackageIds(
    'kp_native',
    PACKAGE_ID,
    [
      { package_id: PACKAGE_ID },
      { package_id: SECOND_PACKAGE_ID },
      { package_id: THIRD_PACKAGE_ID },
    ],
  )

  assert.deepEqual(selected, [PACKAGE_ID, SECOND_PACKAGE_ID, THIRD_PACKAGE_ID])
})

test('adding and removing a secondary Package stays in the complete desired set', () => {
  const added = normalizePackageIds([PACKAGE_ID, SECOND_PACKAGE_ID, THIRD_PACKAGE_ID])
  const removed = normalizePackageIds([PACKAGE_ID, THIRD_PACKAGE_ID])

  assert.deepEqual(added, [PACKAGE_ID, SECOND_PACKAGE_ID, THIRD_PACKAGE_ID])
  assert.deepEqual(removed, [PACKAGE_ID, THIRD_PACKAGE_ID])
})

test('Legacy Edit remains single-Package and has no KP packageIds semantics', () => {
  const selection = buildEditSelection(
    { summary_code: null, package_id: PACKAGE_ID },
    { package_id: PACKAGE_ID },
  )

  assert.deepEqual(selection, {
    summaryKind: 'legacy',
    packageId: PACKAGE_ID,
    packageIds: null,
  })
  assert.throws(
    () => buildEditSelection(
      { summary_code: null, package_id: PACKAGE_ID },
      { package_id: PACKAGE_ID, packageIds: [PACKAGE_ID] },
    ),
    /do not accept a multi-Package selection/,
  )
})

test('server validates every selected Package against the available Package set', () => {
  assert.doesNotThrow(() => assertPackageIdsAvailable(
    [PACKAGE_ID, SECOND_PACKAGE_ID, THIRD_PACKAGE_ID],
    [PACKAGE_ID, SECOND_PACKAGE_ID, THIRD_PACKAGE_ID, 'other-package'],
  ))
  assert.throws(
    () => assertPackageIdsAvailable([PACKAGE_ID, SECOND_PACKAGE_ID], [PACKAGE_ID]),
    /no longer available/,
  )
})

test('Edit payload strips publication state while preserving ordinary fields', () => {
  const input = {
    title: 'Updated Summary',
    content_md: '# Updated',
    packageIds: [PACKAGE_ID, SECOND_PACKAGE_ID],
    is_published: true,
  }

  assert.deepEqual(stripEditPublicationState(input), {
    title: 'Updated Summary',
    content_md: '# Updated',
    packageIds: [PACKAGE_ID, SECOND_PACKAGE_ID],
  })
  assert.equal(input.is_published, true)
})
