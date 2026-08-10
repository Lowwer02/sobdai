import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SummaryBankCompatibilityWriterError,
  type SummaryBankCompatibilityCreatePersistenceCommand,
  type SummaryBankCompatibilityEditPersistenceCommand,
} from '../../application/knowledge-platform/summary-bank-compatibility-writer'
import {
  SupabaseSummaryBankCompatibilityPersistence,
  type SummaryBankCompatibilitySupabaseClient,
} from './summary-bank-compatibility-writer'

const ACTOR_ID = '00000000-0000-4000-8000-000000000001'
const PACKAGE_ID = '00000000-0000-4000-8000-000000000002'
const OTHER_PACKAGE_ID = '00000000-0000-4000-8000-000000000005'
const SUMMARY_ID = '00000000-0000-4000-8000-000000000003'
const OTHER_SUMMARY_ID = '00000000-0000-4000-8000-000000000006'
const VERSION_ID = '00000000-0000-4000-8000-000000000004'
const OTHER_VERSION_ID = '00000000-0000-4000-8000-000000000007'

interface RpcError {
  readonly code?: string
  readonly message?: string
  readonly details?: string
  readonly hint?: string
}

interface RpcResponse {
  readonly data: unknown
  readonly error: RpcError | null
  readonly count?: number | null
}

class FakeQuery {
  public constructor(private readonly response: RpcResponse) {}

  public select(_columns: string, _options?: unknown): this {
    return this
  }

  public eq(_column: string, _value: unknown): this {
    return this
  }

  public in(_column: string, _values: readonly unknown[]): this {
    return this
  }

  public order(_column: string, _options?: unknown): this {
    return this
  }

  public range(_from: number, _to: number): this {
    return this
  }

  public maybeSingle(): Promise<RpcResponse> {
    return Promise.resolve(this.response)
  }

  public then<TResult1 = RpcResponse, TResult2 = never>(
    onfulfilled?: ((value: RpcResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.response).then(onfulfilled, onrejected)
  }
}

class FakeSupabaseClient implements SummaryBankCompatibilitySupabaseClient {
  public readonly calls: Array<{
    readonly functionName: string
    readonly args: Record<string, unknown>
  }> = []

  private readonly queryQueues: Map<string, RpcResponse[]>

  public constructor(
    private readonly response: RpcResponse,
    queries: Readonly<Record<string, readonly RpcResponse[]>> = {},
  ) {
    this.queryQueues = new Map(
      Object.entries(queries).map(([table, responses]) => [table, [...responses]]),
    )
  }

  public from(table: string): FakeQuery {
    const queue = this.queryQueues.get(table)
    const response = queue?.shift()
    if (!response) throw new Error(`Unexpected table read in RPC adapter test: ${table}`)
    return new FakeQuery(response)
  }

  public rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): PromiseLike<RpcResponse> {
    this.calls.push({ functionName, args })
    return Promise.resolve(this.response)
  }
}

const CREATE_COMMAND: SummaryBankCompatibilityCreatePersistenceCommand = {
  summaryId: SUMMARY_ID,
  versionId: VERSION_ID,
  summaryCode: 'SUM-000123',
  canonicalSlug: 'a-summary-sum-000123',
  packageId: PACKAGE_ID,
  legacySlug: 'a-summary',
  title: 'A Summary',
  subject: 'law',
  document: 'Document',
  law: 'Law',
  topic: 'Topic',
  contentMd: 'content',
  contentChecksum: 'a'.repeat(64),
  readTimeMinutes: 1,
  readTimePolicyVersion: 'summary-whitespace-200wpm-v1',
  contentSchemaVersion: 'summary-markdown-v1',
  sortOrder: 4,
  displayOrder: 7,
  navigationLabel: null,
  actorId: ACTOR_ID,
  isPublished: true,
  changeNote: 'Initial Summary Bank draft',
}

const EDIT_COMMAND: SummaryBankCompatibilityEditPersistenceCommand = {
  summaryId: SUMMARY_ID,
  packageId: PACKAGE_ID,
  legacySlug: 'a-summary',
  title: 'Edited Summary',
  subject: 'law',
  document: 'Document',
  law: 'Law',
  topic: 'Topic',
  contentMd: 'edited content',
  contentChecksum: 'b'.repeat(64),
  readTimeMinutes: 1,
  readTimePolicyVersion: 'summary-whitespace-200wpm-v1',
  contentSchemaVersion: 'summary-markdown-v1',
  sortOrder: 2,
  displayOrder: 3,
  navigationLabel: null,
  actorId: ACTOR_ID,
  changeNote: 'Summary Bank compatibility edit',
}

function persistence(response: RpcResponse) {
  const client = new FakeSupabaseClient(response)
  return {
    client,
    persistence: new SupabaseSummaryBankCompatibilityPersistence(client),
  }
}

function persistenceWithQueries(
  response: RpcResponse,
  queries: Readonly<Record<string, readonly RpcResponse[]>>,
) {
  const client = new FakeSupabaseClient(response, queries)
  return {
    client,
    persistence: new SupabaseSummaryBankCompatibilityPersistence(client),
  }
}

function createResponse(
  overrides: Readonly<Record<string, unknown>> = {},
): RpcResponse {
  return {
    data: {
      outcome: 'created',
      summary_id: SUMMARY_ID,
      summary_version_id: VERSION_ID,
      package_id: PACKAGE_ID,
      legacy_slug: 'a-summary',
      is_published: true,
      idempotent_retry: false,
      ...overrides,
    },
    error: null,
  }
}

function editResponse(
  overrides: Readonly<Record<string, unknown>> = {},
): RpcResponse {
  return {
    data: {
      success: true,
      outcome: 'updated',
      summary_id: SUMMARY_ID,
      summary_version_id: VERSION_ID,
      package_id: PACKAGE_ID,
      legacy_slug: 'a-summary',
      revision_created: true,
      package_reassigned: false,
      ...overrides,
    },
    error: null,
  }
}

function publishResponse(
  overrides: Readonly<Record<string, unknown>> = {},
): RpcResponse {
  return {
    data: {
      summary_id: SUMMARY_ID,
      summary_version_id: VERSION_ID,
      package_id: PACKAGE_ID,
      idempotent_retry: false,
      republished: false,
      ...overrides,
    },
    error: null,
  }
}

function unpublishResponse(
  overrides: Readonly<Record<string, unknown>> = {},
): RpcResponse {
  return {
    data: {
      summary_id: SUMMARY_ID,
      summary_version_id: VERSION_ID,
      package_id: PACKAGE_ID,
      idempotent_retry: false,
      ...overrides,
    },
    error: null,
  }
}

function deleteResponse(
  outcome: 'deleted' | 'archived' = 'archived',
  overrides: Readonly<Record<string, unknown>> = {},
): RpcResponse {
  return {
    data: {
      summary_id: SUMMARY_ID,
      outcome,
      idempotent_retry: false,
      ...overrides,
    },
    error: null,
  }
}

const PUBLISHED_REVISION = {
  id: VERSION_ID,
  summary_id: SUMMARY_ID,
  status: 'published',
}

const OPEN_DRAFT_REVISION = {
  id: VERSION_ID,
  summary_id: SUMMARY_ID,
  status: 'draft',
}

const MARKED_PLACEMENT = {
  package_id: PACKAGE_ID,
  is_summary_bank_compatibility: true,
  legacy_slug: 'a-summary',
  status: 'draft',
}

const SOURCE_SNAPSHOT = {
  reference_document_id: OTHER_SUMMARY_ID,
  reference_document_version_id: OTHER_VERSION_ID,
  role: 'primary',
  coverage_note: 'Section 1',
  sort_order: 0,
}

function draftPublicationQueries(
  overrides: Readonly<Record<string, unknown>> = {},
) {
  return {
    summaries: [{
      data: {
        id: SUMMARY_ID,
        current_published_version_id: null,
        is_published: false,
      },
      error: null,
    } satisfies RpcResponse],
    package_summaries: [{
      data: [MARKED_PLACEMENT],
      count: 1,
      error: null,
    } satisfies RpcResponse],
    summary_versions: [{
      data: [{ ...OPEN_DRAFT_REVISION, ...overrides }],
      count: 1,
      error: null,
    } satisfies RpcResponse],
    summary_version_reference_documents: [{
      data: [SOURCE_SNAPSHOT],
      count: 1,
      error: null,
    } satisfies RpcResponse],
  }
}

function republishQueries() {
  return {
    summaries: [{
      data: {
        id: SUMMARY_ID,
        current_published_version_id: VERSION_ID,
        is_published: false,
      },
      error: null,
    } satisfies RpcResponse],
    package_summaries: [{
      data: [{ ...MARKED_PLACEMENT, status: 'hidden' }],
      count: 1,
      error: null,
    } satisfies RpcResponse],
    summary_versions: [
      { data: PUBLISHED_REVISION, error: null },
      { data: [], count: 0, error: null },
    ],
    summary_version_reference_documents: [{
      data: [SOURCE_SNAPSHOT],
      count: 1,
      error: null,
    } satisfies RpcResponse],
  }
}

async function assertInvalid(
  operation: () => Promise<unknown>,
  expectedCode: 'invalid_allocator_result' | 'invalid_response' = 'invalid_response',
) {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof SummaryBankCompatibilityWriterError)
    assert.equal(error.code, expectedCode)
    return true
  })
}

test('allocator accepts exactly one valid code', async () => {
  const { client, persistence: adapter } = persistence({
    data: ['SUM-000123'],
    error: null,
  })

  assert.equal(await adapter.allocateSummaryCode(), 'SUM-000123')
  assert.equal(client.calls[0]?.functionName, 'allocate_summary_codes')
  assert.deepEqual(client.calls[0]?.args, { n: 1 })
})

for (const [label, data] of [
  ['null data', null],
  ['unexpected object', {}],
  ['zero rows', []],
  ['multiple rows', ['SUM-000123', 'SUM-000124']],
  ['malformed code', ['NOT-A-SUMMARY-CODE']],
] as const) {
  test(`allocator rejects ${label}`, async () => {
    const { persistence: adapter } = persistence({ data, error: null })
    await assertInvalid(() => adapter.allocateSummaryCode(), 'invalid_allocator_result')
  })
}

test('create accepts the exact migration-071 result contract', async () => {
  const { persistence: adapter } = persistence(createResponse())
  const result = await adapter.create(CREATE_COMMAND)

  assert.deepEqual(result, {
    summaryId: SUMMARY_ID,
    summaryVersionId: VERSION_ID,
    packageId: PACKAGE_ID,
    legacySlug: 'a-summary',
    isPublished: true,
    idempotentRetry: false,
  })
})

for (const [label, value] of [
  ['missing idempotent_retry', undefined],
  ['null idempotent_retry', null],
] as const) {
  test(`create rejects ${label}`, async () => {
    const { persistence: adapter } = persistence(createResponse({ idempotent_retry: value }))
    await assertInvalid(() => adapter.create(CREATE_COMMAND))
  })
}

test('create rejects an unexpected outcome', async () => {
  const { persistence: adapter } = persistence(createResponse({ outcome: 'updated' }))
  await assertInvalid(() => adapter.create(CREATE_COMMAND))
})

for (const [field, value] of [
  ['summary_id', OTHER_SUMMARY_ID],
  ['summary_version_id', OTHER_VERSION_ID],
  ['package_id', OTHER_PACKAGE_ID],
  ['legacy_slug', 'other-summary'],
  ['is_published', false],
] as const) {
  test(`create rejects a mismatched ${field}`, async () => {
    const { persistence: adapter } = persistence(createResponse({ [field]: value }))
    await assertInvalid(() => adapter.create(CREATE_COMMAND))
  })
}

test('edit accepts the exact migration-072 result contract', async () => {
  const { persistence: adapter } = persistence(editResponse())
  const result = await adapter.update(EDIT_COMMAND)

  assert.deepEqual(result, {
    summaryId: SUMMARY_ID,
    summaryVersionId: VERSION_ID,
    packageId: PACKAGE_ID,
    legacySlug: 'a-summary',
    revisionCreated: true,
    packageReassigned: false,
  })
})

test('edit rejects an unexpected outcome', async () => {
  const { persistence: adapter } = persistence(editResponse({ outcome: 'created' }))
  await assertInvalid(() => adapter.update(EDIT_COMMAND))
})

for (const [label, value] of [
  ['missing success', undefined],
  ['false success', false],
] as const) {
  test(`edit rejects ${label}`, async () => {
    const { persistence: adapter } = persistence(editResponse({ success: value }))
    await assertInvalid(() => adapter.update(EDIT_COMMAND))
  })
}

for (const [field, value] of [
  ['summary_id', OTHER_SUMMARY_ID],
  ['package_id', OTHER_PACKAGE_ID],
  ['legacy_slug', 'other-summary'],
] as const) {
  test(`edit rejects a mismatched ${field}`, async () => {
    const { persistence: adapter } = persistence(editResponse({ [field]: value }))
    await assertInvalid(() => adapter.update(EDIT_COMMAND))
  })
}

test('edit rejects a malformed required boolean', async () => {
  const { persistence: adapter } = persistence(
    editResponse({ revision_created: 'true' }),
  )
  await assertInvalid(() => adapter.update(EDIT_COMMAND))
})

test('edit rejects a malformed returned revision identifier', async () => {
  const { persistence: adapter } = persistence(
    editResponse({ summary_version_id: 'not-a-uuid' }),
  )
  await assertInvalid(() => adapter.update(EDIT_COMMAND))
})

test('publish resolves a single draft and preserves its source snapshots', async () => {
  const { client, persistence: adapter } = persistenceWithQueries(
    publishResponse(),
    draftPublicationQueries(),
  )

  const result = await adapter.publish({
    summaryId: SUMMARY_ID,
    actorId: ACTOR_ID,
  })

  assert.deepEqual(result, {
    summaryId: SUMMARY_ID,
    summaryVersionId: VERSION_ID,
    packageId: PACKAGE_ID,
    idempotentRetry: false,
    republished: false,
  })
  assert.equal(client.calls[0]?.functionName, 'kp_persist_publish_compatibility_revision')
  assert.deepEqual(client.calls[0]?.args.p_source_snapshots, [SOURCE_SNAPSHOT])
})

test('publish reuses the current published revision after compatibility unpublish', async () => {
  const { client, persistence: adapter } = persistenceWithQueries(
    publishResponse({ republished: true }),
    republishQueries(),
  )

  const result = await adapter.publish({
    summaryId: SUMMARY_ID,
    actorId: ACTOR_ID,
  })

  assert.equal(result.summaryVersionId, VERSION_ID)
  assert.equal(result.republished, true)
  assert.equal(client.calls[0]?.args.p_version_id, VERSION_ID)
  assert.deepEqual(client.calls[0]?.args.p_source_snapshots, [SOURCE_SNAPSHOT])
})

test('publish fails closed when multiple open revision candidates exist', async () => {
  const queries = draftPublicationQueries()
  queries.summary_versions[0] = {
    data: [OPEN_DRAFT_REVISION, { ...OPEN_DRAFT_REVISION, id: OTHER_VERSION_ID }],
    count: 2,
    error: null,
  }
  const { client, persistence: adapter } = persistenceWithQueries(
    publishResponse(),
    queries,
  )

  await assertInvalid(() => adapter.publish({ summaryId: SUMMARY_ID, actorId: ACTOR_ID }))
  assert.equal(client.calls.length, 0)
})

test('publish rejects malformed RPC results and identity mismatches', async () => {
  const malformed = persistenceWithQueries(
    publishResponse({ republished: undefined }),
    draftPublicationQueries(),
  )
  await assertInvalid(() => malformed.persistence.publish({ summaryId: SUMMARY_ID, actorId: ACTOR_ID }))

  const mismatched = persistenceWithQueries(
    publishResponse({ summary_id: OTHER_SUMMARY_ID }),
    draftPublicationQueries(),
  )
  await assertInvalid(() => mismatched.persistence.publish({ summaryId: SUMMARY_ID, actorId: ACTOR_ID }))
})

test('unpublish accepts the migration-069 result contract', async () => {
  const { persistence: adapter } = persistence(unpublishResponse())
  const result = await adapter.unpublish({ summaryId: SUMMARY_ID, actorId: ACTOR_ID })

  assert.deepEqual(result, {
    summaryId: SUMMARY_ID,
    summaryVersionId: VERSION_ID,
    packageId: PACKAGE_ID,
    idempotentRetry: false,
  })
})

test('unpublish rejects malformed results and mismatched Summary identity', async () => {
  const malformed = persistence(unpublishResponse({ idempotent_retry: null }))
  await assertInvalid(() => malformed.persistence.unpublish({ summaryId: SUMMARY_ID, actorId: ACTOR_ID }))

  const mismatched = persistence(unpublishResponse({ summary_id: OTHER_SUMMARY_ID }))
  await assertInvalid(() => mismatched.persistence.unpublish({ summaryId: SUMMARY_ID, actorId: ACTOR_ID }))
})

for (const outcome of ['deleted', 'archived'] as const) {
  test(`delete accepts the ${outcome} outcome`, async () => {
    const { persistence: adapter } = persistence(deleteResponse(outcome))
    const result = await adapter.delete({ summaryId: SUMMARY_ID, actorId: ACTOR_ID })
    assert.equal(result.summaryId, SUMMARY_ID)
    assert.equal(result.outcome, outcome)
  })
}

test('delete rejects unknown, malformed, and mismatched results', async () => {
  const unknown = persistence(deleteResponse('archived', { outcome: 'removed' }))
  await assertInvalid(() => unknown.persistence.delete({ summaryId: SUMMARY_ID, actorId: ACTOR_ID }))

  const malformed = persistence(deleteResponse('archived', { idempotent_retry: null }))
  await assertInvalid(() => malformed.persistence.delete({ summaryId: SUMMARY_ID, actorId: ACTOR_ID }))

  const mismatched = persistence(deleteResponse('archived', { summary_id: OTHER_SUMMARY_ID }))
  await assertInvalid(() => mismatched.persistence.delete({ summaryId: SUMMARY_ID, actorId: ACTOR_ID }))
})
