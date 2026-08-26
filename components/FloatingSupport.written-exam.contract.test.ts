import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const floatingSupport = readFileSync(join(process.cwd(), 'components/FloatingSupport.tsx'), 'utf8')
const rootLayout = readFileSync(join(process.cwd(), 'app/layout.tsx'), 'utf8')
const packagePage = readFileSync(join(process.cwd(), 'app/package/[slug]/PackageClient.tsx'), 'utf8')
const reader = readFileSync(join(process.cwd(), 'app/package/[slug]/written-exam/[materialSlug]/WrittenExamReader.tsx'), 'utf8')

test('Written Exam learner routes use the centralized floating-support exclusion', () => {
  assert.match(floatingSupport, /EXCLUDED_PATH_PATTERNS/)
  assert.match(floatingSupport, /\^\\\/package\\\/\[\^\/\]\+\\\/written-exam\\\//)
  assert.match(floatingSupport, /\^\\\/package\\\/\[\^\/\]\+\\\/exam\\\//)
  assert.match(floatingSupport, /\^\\\/assessment\\\//)
  assert.match(floatingSupport, /if \(!supportConfig\.enabled \|\| isExcludedPath\(pathname\)\)/)
})

test('Donate remains available globally and on the Package page, but not in the reader component', () => {
  assert.match(rootLayout, /<FloatingSupport supportConfig=\{homepageSettings\.support\} \/>/)
  assert.match(packagePage, /supportConfig\.enabled/)
  assert.match(packagePage, /<SupportCard/)
  assert.doesNotMatch(reader, /FloatingSupport|SupportModal|SupportCard|floating-support-button/)
})
