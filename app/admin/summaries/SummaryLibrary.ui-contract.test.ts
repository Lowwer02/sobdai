import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const clientSource = readFileSync(
  join(process.cwd(), 'app/admin/summaries/SummariesClient.tsx'),
  'utf8',
)
const tableSource = readFileSync(
  join(process.cwd(), 'components/admin/SummaryLibraryTable.tsx'),
  'utf8',
)

test('Summary Bank follows the Exam Sets header and filter rhythm', () => {
  assert.match(clientSource, /sm:flex-row sm:items-end sm:justify-between/)
  assert.match(clientSource, /inline-flex min-h-11 items-center gap-2/)
  assert.match(clientSource, /Search summaries by title\.\.\./)
  assert.match(clientSource, /role="group"[\s\S]*aria-label="Filter by status"/)
  assert.match(clientSource, /rounded-full text-sm font-bold border/)
  assert.match(clientSource, /All[\s\S]*Draft[\s\S]*Published/)
})

test('Summary Bank Status is display-only with no lifecycle mutation bindings', () => {
  // Status column in table renders StatusBadge, not a button or interactive mutation control
  assert.match(tableSource, /<StatusBadge status=\{row\.isPublished \? 'published' : 'draft'\} \/>/)
  // StatusBadge does not receive onClick or mutation handlers
  assert.doesNotMatch(tableSource, /<StatusBadge[^>]*onClick/)
  assert.doesNotMatch(tableSource, /<StatusBadge[^>]*onTogglePublish/)
})

test('Summary Bank rows expose explicit Publish and Unpublish actions matching Exam Sets', () => {
  // Draft / unpublished row exposes explicit Publish action with Send icon
  assert.match(tableSource, /row\.isPublished \? \([\s\S]*aria-label=\{`Unpublish \$\{row\.title\}`\}[\s\S]*<RotateCcw/)
  // Published row exposes explicit Unpublish action with RotateCcw icon
  assert.match(tableSource, /aria-label=\{`Publish \$\{row\.title\}`\}[\s\S]*<Send/)
  // Both actions trigger onTogglePublish callback
  assert.match(tableSource, /onClick=\{\(\) => onTogglePublish\(row\.id, row\.isPublished\)\}/)
})

test('Summary Bank table fits desktop width without forced horizontal scrolling wrapper', () => {
  assert.match(tableSource, /table-fixed/)
  assert.doesNotMatch(tableSource, /overflow-x-auto min-h-\[400px\]/)
  assert.match(tableSource, /hidden min-h-\[400px\] md:block/)
})

test('Summary Bank preserves all search, filter, pagination, edit, and delete callbacks', () => {
  assert.match(clientSource, /toggleSummaryPublish/)
  assert.match(clientSource, /deleteSummary/)
  assert.match(tableSource, /onTogglePublish/)
  assert.match(tableSource, /onRequestDelete/)
  assert.match(tableSource, /onPageChange/)
})
