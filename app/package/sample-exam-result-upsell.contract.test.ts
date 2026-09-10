import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

/**
 * sample-exam-result-upsell.contract.test.ts
 *
 * Contract test for SOBDAI — SAMPLE EXAM RESULT UPSELL V1.
 *
 * Covers:
 *  1. Sample + Non-owner -> upsell eligible (modal and card conditionally guarded)
 *  2. Sample + Owner -> upsell absent (guarded by !isPackageOwner)
 *  3. Full exam -> upsell absent (guarded by examSet.is_sample)
 *  4. Existing result/review remains accessible behind/after dismissal
 *  5. CTA uses existing purchase path (/checkout/${packageId})
 *  6. Price is dynamic, not hardcoded; supports discount calculation
 *  7. Missing metadata degrades safely (fallback to 'ดูแพ็กเกจเต็ม')
 *  8. Auth/access/payment authority unchanged (RBAC and order status preserved)
 *  9. Modal completion trigger requires successful finalization/persistence
 * 10. Revisit / reload does not blindly reopen modal
 * 11. Modal dismissal exists ('ดูผลสอบก่อน', 'X', backdrop, Escape)
 * 12. Analytics: tracks custom view/click events without duplicate beginCheckout
 */

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const examPage = read('app/package/[slug]/exam/[examSetId]/page.tsx')
const examRuntime = read('app/package/[slug]/exam/[examSetId]/ExamRuntime.tsx')
const upsellModal = read('components/exams/SampleExamResultUpsellModal.tsx')
const upsellCard = read('components/exams/SampleExamResultUpsellCard.tsx')
const analyticsSource = read('lib/analytics.ts')

// ── 1. Eligibility Gates: Sample + Non-owner only ────────────────────────────
test('1: sample + non-owner is upsell eligible in ExamRuntime', () => {
  // Modal trigger condition
  assert.match(
    examRuntime,
    /if\s*\(\s*examSet\.is_sample\s*&&\s*!isPackageOwner\s*\)\s*\{\s*setIsUpsellModalOpen\(true\)/,
    'Modal must only open when examSet.is_sample is true and isPackageOwner is false'
  )

  // Card render condition on Result Overview
  assert.match(
    examRuntime,
    /examSet\.is_sample\s*&&\s*!isPackageOwner\s*&&\s*Boolean\(persistedAttemptId\)/,
    'Upsell card must only render when examSet.is_sample is true, isPackageOwner is false, and attempt is persisted'
  )
})

test('2: sample + owner -> upsell absent (modal and card excluded)', () => {
  // Neither modal nor card may be shown if isPackageOwner is true
  assert.match(examRuntime, /!isPackageOwner/, 'isPackageOwner guard must prevent display for owners')
  assert.doesNotMatch(
    examRuntime,
    /setIsUpsellModalOpen\(true\)\s*;?\s*if\s*\(!isPackageOwner\)/,
    'Modal must not be opened before checking isPackageOwner'
  )
})

test('3: full exam -> upsell absent (modal and card excluded)', () => {
  // Both guards require examSet.is_sample to be true
  assert.match(examRuntime, /examSet\.is_sample\s*&&/, 'Guard must check examSet.is_sample')
})

// ── 4. Result Accessibility ──────────────────────────────────────────────────
test('4: existing result overview and question review remain accessible', () => {
  // Outcome calculation and result view intact
  assert.match(examRuntime, /computeOutcome\(\{/)
  assert.match(examRuntime, /setOutcome\(result\)/)
  assert.match(examRuntime, /setStatus\('REVIEW'\)/)
  assert.match(examRuntime, /setCurrentIndex\(-1\)/)

  // Question review button exists
  assert.match(examRuntime, /ดูเฉลยอย่างละเอียด/)
  assert.match(examRuntime, /onClick=\{\(\)\s*=>\s*setCurrentIndex\(0\)\}/)

  // Result metrics intact
  assert.match(examRuntime, /\{accuracy\}%/)
  assert.match(examRuntime, /\{score\}/)
  assert.match(examRuntime, /formatTime\(timeUsed\)/)
})

// ── 5. CTA Purchase Path ─────────────────────────────────────────────────────
test('5: CTA uses existing purchase path /checkout/${packageId}', () => {
  // Modal CTA
  assert.match(upsellModal, /\/checkout\/\$\{packageId\}/)
  // Card CTA
  assert.match(upsellCard, /\/checkout\/\$\{packageId\}/)
  // No second checkout path invented
  assert.doesNotMatch(upsellModal, /\/buy|\/payment\/order|\/order\/new/)
  assert.doesNotMatch(upsellCard, /\/buy|\/payment\/order|\/order\/new/)
})

// ── 6. Dynamic Pricing Authority ─────────────────────────────────────────────
test('6: price is dynamic from pkg.current_price, never hardcoded', () => {
  // Server-side page selects current_price and original_price
  assert.match(
    examPage,
    /select\('[^']*current_price[^']*original_price[^']*'\)/,
    'Page query must select current_price and original_price'
  )

  // Modal and Card format dynamic price via toLocaleString()
  assert.match(upsellModal, /numCurrentPrice\.toLocaleString\(\)/)
  assert.match(upsellCard, /numCurrentPrice\.toLocaleString\(\)/)

  // Neither component hardcodes 69, 99, 129
  assert.doesNotMatch(upsellModal, /฿69\b|฿99\b|฿129\b/)
  assert.doesNotMatch(upsellCard, /฿69\b|฿99\b|฿129\b/)
})

// ── 7. Safe Metadata Degradation ─────────────────────────────────────────────
test('7: missing or zero price degrades safely to ดูแพ็กเกจเต็ม', () => {
  // Modal safe fallback
  assert.match(upsellModal, /'ดูแพ็กเกจเต็ม'/)
  assert.doesNotMatch(upsellModal, /฿0\b|฿NaN|฿undefined/)

  // Card safe fallback
  assert.match(upsellCard, /'ดูแพ็กเกจเต็ม'/)
  assert.doesNotMatch(upsellCard, /฿0\b|฿NaN|฿undefined/)
})

// ── 8. Access & Payment Authority Invariant ──────────────────────────────────
test('8: auth, access and payment authority unchanged on exam page', () => {
  assert.match(examPage, /const\s+needsAccessCheck\s*=\s*!examSet\.is_sample/)
  assert.match(examPage, /hasInternalPackageAccess\(profile\.role\)/)
  assert.match(examPage, /const\s+hasOrder\s*=\s*Boolean\(orderResult\.data\)/)
  assert.match(examPage, /ORDER_COMPLETED_STATUSES/)
  assert.match(examPage, /const\s+isPackageOwner\s*=\s*hasInternalAccess\s*\|\|\s*hasOrder/)
})

// ── 9. Completion Trigger Follows Successful Finalization ────────────────────
test('9: modal triggers ONLY after successful outcome finalization/persistence', () => {
  // Must be inside persistOutcome.then((persisted) => if (persisted.success && persisted.id))
  assert.match(
    examRuntime,
    /persistOutcome\(result\)[\s\S]*?if\s*\(\s*persisted\.success\s*&&\s*persisted\.id\s*\)[\s\S]*?setIsUpsellModalOpen\(true\)/,
    'Modal must only trigger after persistOutcome succeeds with a valid attempt id'
  )

  // Must NOT be placed at the synchronous start of handleForceSubmit
  const forceSubmitIdx = examRuntime.indexOf('const handleForceSubmit = () => {')
  const persistIdx = examRuntime.indexOf('persistOutcome(result)')
  const modalSetIdx = examRuntime.indexOf('setIsUpsellModalOpen(true)')

  assert.ok(
    modalSetIdx > persistIdx && persistIdx > forceSubmitIdx,
    'setIsUpsellModalOpen(true) must be inside the persistOutcome callback'
  )
})

// ── 10. Revisit / Reload Invariant ───────────────────────────────────────────
test('10: initial state is closed and reload does not blindly reopen', () => {
  // Initial state is false
  assert.match(examRuntime, /const\s*\[isUpsellModalOpen,\s*setIsUpsellModalOpen\]\s*=\s*useState\(false\)/)
  // Page load starts in IN_PROGRESS mode, not REVIEW
  assert.match(examRuntime, /useState<'IN_PROGRESS'\s*\|\s*'CONFIRM_SUBMIT'\s*\|\s*'REVIEW'>\('IN_PROGRESS'\)/)
})

// ── 11. Modal Dismissal ──────────────────────────────────────────────────────
test('11: modal has dismissal via ดูผลสอบก่อน, close button, backdrop and Escape', () => {
  // Secondary action copy
  assert.match(upsellModal, /ดูผลสอบก่อน/)
  assert.match(upsellModal, /onClick=\{onClose\}/)
  // Escape key handler
  assert.match(upsellModal, /e\.key === 'Escape'/)
  // Dialog ARIA attributes
  assert.match(upsellModal, /role="dialog"/)
  assert.match(upsellModal, /aria-modal="true"/)
})

// ── 12. Analytics Events ─────────────────────────────────────────────────────
test('12: analytics tracks view and click without duplicate beginCheckout', () => {
  // Helper exports in analytics.ts
  assert.match(analyticsSource, /export function trackSampleResultUpsellView/)
  assert.match(analyticsSource, /export function trackSampleResultUpsellClick/)

  // Modal emits view and click
  assert.match(upsellModal, /trackSampleResultUpsellView\(packageId,\s*examSetId\)/)
  assert.match(upsellModal, /trackSampleResultUpsellClick\(packageId,\s*examSetId\)/)

  // Upsell CTA must NOT emit duplicate beginCheckout
  assert.doesNotMatch(upsellModal, /beginCheckout/, 'Modal CTA must not duplicate beginCheckout')
  assert.doesNotMatch(upsellCard, /beginCheckout/, 'Card CTA must not duplicate beginCheckout')
})
