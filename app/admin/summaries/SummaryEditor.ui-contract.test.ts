import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const editorSource = readFileSync(
  join(process.cwd(), 'components/admin/SummaryEditor.tsx'),
  'utf8',
)
const actionsSource = readFileSync(
  join(process.cwd(), 'app/admin/summaries/actions.ts'),
  'utf8',
)
const publicationDispatchSource = readFileSync(
  join(process.cwd(), 'app/admin/summaries/summary-publication-dispatch.ts'),
  'utf8',
)

test('KP editor exposes the accessible Use with Packages multi-select', () => {
  assert.match(editorSource, /Use with Packages/)
  assert.match(editorSource, /type="checkbox"/)
  assert.match(editorSource, /aria-label="Use with Packages"/)
  assert.match(editorSource, /formData\.package_ids\.includes\(pkg\.id\)/)
})

test('Edit shows read-only publication status and keeps the checkbox for Create only', () => {
  const editStatusStart = editorSource.indexOf('{isEditing ? (')
  const createStatusStart = editorSource.indexOf(') : (', editStatusStart)

  assert.ok(editStatusStart >= 0)
  assert.ok(createStatusStart > editStatusStart)

  const editStatusSource = editorSource.slice(editStatusStart, createStatusStart)
  const createStatusSource = editorSource.slice(createStatusStart)

  assert.match(editStatusSource, /role="status"/)
  assert.match(editStatusSource, /Publication status/)
  assert.match(editStatusSource, /Published[\s\S]*Draft/)
  assert.match(editStatusSource, /separate Publish \/ Unpublish control/i)
  assert.doesNotMatch(editStatusSource, /type="checkbox"/)
  assert.match(createStatusSource, /name="is_published"/)
})

test('Edit Save strips publication state while dedicated actions remain separate', () => {
  const updateStart = actionsSource.indexOf('export async function updateSummary')
  const toggleStart = actionsSource.indexOf('export async function toggleSummaryPublish')
  assert.ok(updateStart >= 0)
  assert.ok(toggleStart > updateStart)

  const updateSource = actionsSource.slice(updateStart, toggleStart)
  const publicationSource = actionsSource.slice(toggleStart)

  assert.match(updateSource, /stripEditPublicationState\(data\)/)
  assert.doesNotMatch(updateSource, /is_published/)
  assert.doesNotMatch(updateSource, /writer\.(?:publish|unpublish)\(/)
  assert.match(publicationSource, /requirePermission\('content\.publish'\)/)
  assert.match(publicationSource, /dispatchSummaryPublication\(/)
  assert.match(publicationDispatchSource, /writer\.publish\(/)
  assert.match(publicationDispatchSource, /writer\.unpublish\(/)
  assert.match(publicationDispatchSource, /writer\.publishLegacy\(/)
  assert.match(publicationDispatchSource, /writer\.unpublishLegacy\(/)
})

test('Admin editor source does not expose internal membership terminology', () => {
  assert.doesNotMatch(editorSource, /compatibility marker/i)
  assert.doesNotMatch(editorSource, /canonical Package/i)
  assert.doesNotMatch(editorSource, /package_summaries/i)
  assert.doesNotMatch(editorSource, /\bplacement\b/i)
})
