import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const packageClient = read('app/package/[slug]/PackageClient.tsx')
const accessTerm = read('lib/package-access-term.ts')
const exams = read('components/ExamNavigation.tsx')
const summaries = read('components/SummaryNavigation.tsx')

test('Package Detail lifetime wording has one resolver and no twelve-month copy', () => {
  assert.match(accessTerm, /PACKAGE_ACCESS_TERM\s*=\s*'ไม่จำกัดระยะเวลา'/)
  assert.match(packageClient, /resolvePackageAccessTerm\(\)/)
  assert.doesNotMatch(packageClient, /12\s*เดือน|12\s*months/i)
})

test('inline and sticky purchase actions share the existing paid, free, and owned paths', () => {
  assert.match(packageClient, /function PackagePurchaseAction\(/)
  assert.match(packageClient, /isPurchased\s*\?\s*'#resources'\s*:\s*`\/checkout\/\$\{pkg\.id\}`/)
  assert.match(packageClient, /isPurchased \? 'เริ่มเรียน' : isFree \? 'รับแพ็กเกจฟรี' : 'ซื้อแพ็กเกจนี้'/)
  assert.match(packageClient, /beginCheckout\(pkg\.id, pkg\.name, currentPrice\)/)
  assert.match(packageClient, /originalPrice > currentPrice && currentPrice >= 0/)
})

test('sticky purchase waits until the inline CTA has passed and hides for footer, keyboard, or overlays', () => {
  assert.match(packageClient, /mobileInlinePurchaseRef/)
  assert.match(packageClient, /desktopInlinePurchaseRef/)
  assert.match(packageClient, /inlineBounds\.bottom <= 0/)
  assert.match(packageClient, /\(max-width: 1023px\)/)
  assert.match(packageClient, /\[data-site-footer="true"\]/)
  assert.match(packageClient, /inputIsFocused/)
  assert.match(packageClient, /keyboardIsOpen/)
  assert.match(packageClient, /overlayIsOpen/)
  assert.match(packageClient, /bottom-\[calc\(4\.75rem\+env\(safe-area-inset-bottom,0px\)\)\]/)
  assert.match(packageClient, /data-package-sticky-purchase="true"/)
})

test('mobile resources put exam sets before summaries while desktop order stays unchanged', () => {
  const summaryCard = packageClient.indexOf('order-2 lg:order-1')
  const examCard = packageClient.indexOf('order-1 lg:order-2')
  assert.ok(summaryCard >= 0 && packageClient.slice(summaryCard, summaryCard + 900).includes('สรุปเนื้อหา'))
  assert.ok(examCard >= 0 && packageClient.slice(examCard, examCard + 900).includes('ชุดข้อสอบ'))
  assert.ok(packageClient.indexOf('id="resources"') < packageClient.indexOf('aria-label="อ่านเพิ่มเติมก่อนสอบ"'))
  assert.ok(packageClient.indexOf('aria-label="อ่านเพิ่มเติมก่อนสอบ"') < packageClient.lastIndexOf('supportConfig.enabled && ('))
})

for (const [name, source] of [['exam sets', exams], ['summaries', summaries]] as const) {
  test(`${name} navigation supports 4-at-a-time loading, closable groups, recovery, and inert collapsed links`, () => {
    assert.match(source, /const MOBILE_INITIAL = 4/)
    assert.match(source, /const MOBILE_STEP = 4/)
    assert.match(source, /Math\.min\(MOBILE_STEP, items\.length - limit\)/)
    assert.match(source, /ดูเพิ่มอีก \{itemsToLoad\} รายการ/)
    assert.match(source, /\(min-width: 1024px\)/)
    assert.match(source, /hasUserCollapsedCategory/)
    assert.match(source, /setExpandedCategory\(null\)/)
    assert.match(source, /aria-hidden=\{!isExpanded\}/)
    assert.match(source, /inert=\{!isExpanded\}/)
  })
}
