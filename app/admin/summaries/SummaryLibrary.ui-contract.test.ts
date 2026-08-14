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
  assert.match(clientSource, /h-10 w-full max-w-\[220px\]/)
  assert.match(clientSource, /hidden flex-wrap items-center gap-2 md:flex/)
  assert.match(clientSource, /border-t border-\[rgba\(255,255,255,0\.05\)\] pt-3/)
})

test('Summary Bank rows use the Exam Sets table shell without changing actions', () => {
  assert.match(tableSource, /sticky right-0 z-20 w-36[\s\S]*Actions/)
  assert.match(tableSource, /group-hover:bg-\[#1E170F\]/)
  assert.match(tableSource, /block max-w-\[360px\] truncate/)
  assert.match(tableSource, /rounded-lg border border-\[rgba\(255,255,255,0\.06\)\] bg-\[#0F0B07\]/)
  assert.match(clientSource, /toggleSummaryPublish/)
  assert.match(clientSource, /deleteSummary/)
  assert.match(tableSource, /onTogglePublish/)
  assert.match(tableSource, /onRequestDelete/)
})
