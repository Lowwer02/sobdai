import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getAdminReviewState,
  getAnalyzerTriagePresentation,
  normalizeAdminReviewFilter,
  normalizeAnalyzerTriageFilter,
  STALE_REVIEW_ACTION_MESSAGE,
} from './admin-review'

test('authorized reviewers default to the actionable queue and URL values stay bounded', () => {
  assert.equal(normalizeAdminReviewFilter(undefined, true), 'needs_review')
  assert.equal(normalizeAdminReviewFilter('rejected', true), 'rejected')
  assert.equal(normalizeAdminReviewFilter('unknown', true), 'needs_review')
  assert.equal(normalizeAdminReviewFilter('needs_review', false), 'all')
  assert.equal(normalizeAnalyzerTriageFilter('SUSPICIOUS', true), 'SUSPICIOUS')
  assert.equal(normalizeAnalyzerTriageFilter('unknown', true), 'all')
})

test('analyzer triage is visibly advisory and uses non-authoritative labels', () => {
  const strong = getAnalyzerTriagePresentation('STRONG_MATCH')
  const suspicious = getAnalyzerTriagePresentation('SUSPICIOUS')
  const analyzerError = getAnalyzerTriagePresentation('ANALYZER_ERROR')

  assert.equal(strong.label, 'Offline match')
  assert.match(strong.description, /ไม่ใช่การยืนยันจากธนาคารหรือผู้ให้บริการ/)
  assert.doesNotMatch(strong.label, /Verified|ยืนยันแล้ว/i)
  assert.match(suspicious.description, /ไม่ปฏิเสธหรือเปลี่ยนสถานะ/)
  assert.match(analyzerError.description, /กรุณาตรวจหลักฐานด้วยตนเอง/)
})

test('review state keeps suspicious/error advisory and paid/cancelled orders out of approval queue', () => {
  const base = {
    paymentProvider: 'promptpay_manual',
    latestSubmissionStatus: 'submitted',
    submissionCount: 1,
  }

  assert.equal(getAdminReviewState({ ...base, orderStatus: 'pending', analyzerState: 'SUSPICIOUS' }), 'needs_review')
  assert.equal(getAdminReviewState({ ...base, orderStatus: 'pending', analyzerState: 'ANALYZER_ERROR' }), 'needs_review')
  assert.equal(getAdminReviewState({ ...base, orderStatus: 'pending', analyzerState: 'AUTO_CHECKING' }), 'checking')
  assert.equal(getAdminReviewState({ ...base, orderStatus: 'paid', analyzerState: 'STRONG_MATCH' }), 'paid')
  assert.equal(getAdminReviewState({ ...base, orderStatus: 'cancelled', analyzerState: 'STRONG_MATCH' }), 'cancelled')
  assert.equal(getAdminReviewState({ ...base, orderStatus: 'pending', latestSubmissionStatus: null, submissionCount: 0, analyzerState: null }), 'no_evidence')
})

test('stale review failures have a neutral refresh path', () => {
  assert.match(STALE_REVIEW_ACTION_MESSAGE, /อาจถูกตรวจสอบหรือเปลี่ยนสถานะ/)
  assert.match(STALE_REVIEW_ACTION_MESSAGE, /รีเฟรชเพื่อดูสถานะล่าสุด/)
})
