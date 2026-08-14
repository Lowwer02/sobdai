import assert from 'node:assert/strict'
import test from 'node:test'

import {
  dispatchSummaryPublication,
  resolveSummaryPublicationState,
  type SummaryPublicationDispatchWriter,
} from './summary-publication-dispatch'

const ACTOR_ID = '00000000-0000-4000-8000-000000000001'
const SUMMARY_ID = '00000000-0000-4000-8000-000000000002'
const PACKAGE_ID = '00000000-0000-4000-8000-000000000003'
const VERSION_ID = '00000000-0000-4000-8000-000000000004'

function recordingWriter(calls: string[]): SummaryPublicationDispatchWriter {
  return {
    async publish(command) {
      calls.push(`kp.publish:${command.summaryId}`)
      return {
        summaryId: command.summaryId,
        summaryVersionId: VERSION_ID,
        packageId: PACKAGE_ID,
        idempotentRetry: false,
        republished: false,
      }
    },
    async unpublish(command) {
      calls.push(`kp.unpublish:${command.summaryId}`)
      return {
        summaryId: command.summaryId,
        summaryVersionId: VERSION_ID,
        packageId: PACKAGE_ID,
        idempotentRetry: false,
      }
    },
    async publishLegacy(command) {
      calls.push(`legacy.publish:${command.summaryId}`)
      return {
        summaryId: command.summaryId,
        summaryVersionId: null,
        packageId: PACKAGE_ID,
        isPublished: true,
        idempotentRetry: false,
      }
    },
    async unpublishLegacy(command) {
      calls.push(`legacy.unpublish:${command.summaryId}`)
      return {
        summaryId: command.summaryId,
        summaryVersionId: null,
        packageId: PACKAGE_ID,
        isPublished: false,
        idempotentRetry: false,
      }
    },
  }
}

test('Legacy Publish dispatches to the dedicated Legacy writer only', async () => {
  const calls: string[] = []
  const result = await dispatchSummaryPublication({
    summary: { id: SUMMARY_ID, summary_code: null, summaryKind: 'kp_native' },
    actorId: ACTOR_ID,
    isPublished: true,
    writer: recordingWriter(calls),
  })

  assert.deepEqual(result, { outcome: 'published', idempotentRetry: false })
  assert.deepEqual(calls, [`legacy.publish:${SUMMARY_ID}`])
})

test('Legacy Unpublish dispatches to the dedicated Legacy writer only', async () => {
  const calls: string[] = []
  const result = await dispatchSummaryPublication({
    summary: { id: SUMMARY_ID, summary_code: null, summaryKind: 'kp_native' },
    actorId: ACTOR_ID,
    isPublished: false,
    writer: recordingWriter(calls),
  })

  assert.deepEqual(result, { outcome: 'unpublished', idempotentRetry: false })
  assert.deepEqual(calls, [`legacy.unpublish:${SUMMARY_ID}`])
})

test('KP Publish dispatches to the existing KP writer only', async () => {
  const calls: string[] = []
  const result = await dispatchSummaryPublication({
    summary: { id: SUMMARY_ID, summary_code: 'SUM-000123', summaryKind: 'legacy' },
    actorId: ACTOR_ID,
    isPublished: true,
    writer: recordingWriter(calls),
  })

  assert.deepEqual(result, { outcome: 'published', idempotentRetry: false })
  assert.deepEqual(calls, [`kp.publish:${SUMMARY_ID}`])
})

test('KP Unpublish dispatches to the existing KP writer only', async () => {
  const calls: string[] = []
  const result = await dispatchSummaryPublication({
    summary: { id: SUMMARY_ID, summary_code: 'SUM-000123', summaryKind: 'legacy' },
    actorId: ACTOR_ID,
    isPublished: false,
    writer: recordingWriter(calls),
  })

  assert.deepEqual(result, { outcome: 'unpublished', idempotentRetry: false })
  assert.deepEqual(calls, [`kp.unpublish:${SUMMARY_ID}`])
})

test('publication dispatch ignores a client kind and fails closed for missing or invalid state', async () => {
  const calls: string[] = []
  const writer = recordingWriter(calls)

  await assert.rejects(
    () => dispatchSummaryPublication({
      summary: null,
      actorId: ACTOR_ID,
      isPublished: true,
      writer,
    }),
    /Summary input is invalid/,
  )
  await assert.rejects(
    () => dispatchSummaryPublication({
      summary: { id: SUMMARY_ID, summary_code: undefined },
      actorId: ACTOR_ID,
      isPublished: true,
      writer,
    }),
    /resolved safely/,
  )
  assert.deepEqual(calls, [])
})

test('server Summary publication state resolution fails closed for missing rows', () => {
  assert.throws(
    () => resolveSummaryPublicationState(null),
    /Summary input is invalid/,
  )
  assert.throws(
    () => resolveSummaryPublicationState({ id: SUMMARY_ID, summary_code: undefined }),
    /resolved safely/,
  )
})
