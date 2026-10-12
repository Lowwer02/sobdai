import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const packageDir = dirname(fileURLToPath(import.meta.url))
const root = join(packageDir, '../..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const summaryPage = read('app/package/[slug]/summary/[summarySlug]/page.tsx')
const examPage = read('app/package/[slug]/exam/[examSetId]/page.tsx')
const sessionActions = read('app/assessment/session-actions.ts')
const bookmarkActions = read('app/assessment/bookmark-actions.ts')
const serverProtect = read('lib/auth/server-protect.ts')
const sessionTypes = read('lib/assessment/session-types.ts')

test('customer Summary access uses the narrow Owner/Admin helper', () => {
  assert.match(summaryPage, /import\s+\{\s*hasInternalPackageAccess\s*\}\s+from\s+'@\/lib\/auth\/rbac'/)
  assert.match(summaryPage, /hasInternalPackageAccess\(profile\.role\)/)
  assert.doesNotMatch(summaryPage, /editor[\s\S]*support[\s\S]*includes\(profile\.role\)/)
  assert.match(summaryPage, /ORDER_COMPLETED_STATUSES/)
})

test('customer Exam access narrows only the non-sample gate', () => {
  assert.match(examPage, /import\s+\{\s*hasInternalPackageAccess\s*\}\s+from\s+'@\/lib\/auth\/rbac'/)
  assert.match(examPage, /const\s+needsAccessCheck\s*=\s*!examSet\.is_sample/)
  assert.match(examPage, /hasInternalPackageAccess\(profile\.role\)/)
  assert.match(examPage, /const\s+hasOrder\s*=\s*Boolean\(orderResult\.data\)/)
  assert.doesNotMatch(examPage, /staffRoles\s*=|isStaff\s*=|editor[\s\S]*support[\s\S]*includes\(profile\.role\)/)
})

test('session and bookmark access match the customer Exam gate', () => {
  for (const source of [sessionActions, bookmarkActions]) {
    assert.match(source, /if\s*\(examSet\.is_sample\)\s*return true/)
    assert.match(source, /hasInternalPackageAccess\(profile\.role\)/)
    assert.match(source, /ACCESS_ORDER_STATUSES/)
    assert.doesNotMatch(source, /STAFF_ROLES/)
    assert.doesNotMatch(source, /editor[\s\S]*support[\s\S]*includes\(profile\.role\)/)
  }
})

test('the broader STAFF_ROLES admin boundary remains unchanged', () => {
  assert.match(serverProtect, /STAFF_ROLES[^\n]*=\s*\['owner',\s*'admin',\s*'editor',\s*'support'\]/)
  assert.match(sessionTypes, /STAFF_ROLES\s*=\s*\['admin',\s*'owner',\s*'editor',\s*'support'\]/)
})

test('Summary route discovers metadata before auth and fetches protected content only after access', () => {
  const pageBody = summaryPage.slice(summaryPage.indexOf('export default async function SummaryPage'))
  const discoveryIndex = pageBody.indexOf('getPublicSummaryRouteMetadata(supabase')
  const loginIndex = pageBody.indexOf('if (!user)')
  const entitlementIndex = pageBody.indexOf('if (!hasAccess)')
  const detailIndex = pageBody.indexOf('getPublicSummaryDetail(supabase')

  assert.ok(discoveryIndex >= 0)
  assert.ok(discoveryIndex < loginIndex)
  assert.ok(loginIndex < entitlementIndex)
  assert.ok(entitlementIndex < detailIndex)
  assert.match(pageBody, /if\s*\(!discoveredSummary\)\s*return\s+notFound\(\)/)
  assert.doesNotMatch(pageBody, /content_md|summary_version_id|revision_number/)
})

test('Summary locked and anonymous CTAs preserve their routes and required copy', () => {
  assert.match(summaryPage, /src="\/images\/mascot\/summary-locked\.png"/)
  assert.match(summaryPage, /sizes="\(max-width: 639px\) 176px, 240px"/)
  assert.match(summaryPage, /href=\{`\/login\?redirect=\/package\/\$\{slug\}\/summary\/\$\{summarySlug\}`\}/)
  assert.match(summaryPage, /href=\{`\/checkout\/\$\{pkg\.id\}`\}[\s\S]*?ซื้อแพ็กเกจนี้/)
  assert.match(summaryPage, /href=\{`\/package\/\$\{slug\}`\}[\s\S]*?กลับไปรายละเอียด/)
  assert.match(summaryPage, /เนื้อหาสงวนสิทธิ์เฉพาะผู้ซื้อ/)
  assert.match(summaryPage, /แพ็กเกจ \{pkg\.name\}/)
})
