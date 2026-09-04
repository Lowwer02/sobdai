/**
 * UI contracts for Daily Phase 1.7 monetization.
 *
 * These assertions use the repository's source-contract style: they freeze
 * placement/lifecycle and failure-isolation rules without requiring a browser
 * or a live Supabase/AdSense account.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const componentDir = dirname(fileURLToPath(import.meta.url))
const appRoot = join(componentDir, '..', '..')
const runtime = readFileSync(join(componentDir, 'DailyRuntime.tsx'), 'utf8')
const page = readFileSync(join(appRoot, 'app', 'daily', 'page.tsx'), 'utf8')
const picks = readFileSync(join(appRoot, 'components', 'affiliate', 'DailyAffiliatePicks.tsx'), 'utf8')
const adSense = readFileSync(join(appRoot, 'components', 'adsense', 'AdSenseUnit.tsx'), 'utf8')
const analytics = readFileSync(join(appRoot, 'lib', 'analytics.ts'), 'utf8')

test('Daily has one responsive horizontal AdSense placement outside the quiz surface', () => {
  assert.equal(runtime.match(/<AdSenseUnit\b/g)?.length ?? 0, 1)
  assert.match(
    runtime,
    /<div data-testid="daily-adsense-placement">[\s\S]*?<AdSenseUnit[\s\S]*?format="horizontal"[\s\S]*?\/>[\s\S]*?<\/div>/,
  )

  const placementStart = runtime.indexOf('data-testid="daily-adsense-placement"')
  const gridStart = runtime.indexOf('<div className="grid', placementStart)
  assert.ok(placementStart >= 0 && gridStart > placementStart)
  const placementRegion = runtime.slice(placementStart, gridStart)
  assert.doesNotMatch(placementRegion, /quiz-card|choice-btn|onClick/)
})

test('question state changes cannot refresh or remount the Daily ad slot', () => {
  assert.equal(runtime.match(/data-testid="daily-adsense-placement"/g)?.length ?? 0, 1)
  assert.doesNotMatch(runtime, /<AdSenseUnit[^>]+key=/)
  assert.doesNotMatch(runtime, /adsbygoogle|refresh\s*\(/i)
  assert.match(adSense, /useEffect\(\(\) => \{/)
  assert.match(adSense, /\}, \[\]\)/)
  assert.match(adSense, /data-ad-format=\{format\}/)
})

test('AdSense is config-gated and has no custom click tracking', () => {
  assert.match(page, /getAdsenseDailyConfig\(\)/)
  assert.match(runtime, /\{dailyAd && \(/)
  assert.match(page, /dailyAd=\{getAdsenseDailyConfig\(\)\}/)
  assert.doesNotMatch(runtime, /track[A-Za-z]*Ad|onClick=.*adsense/i)
  assert.doesNotMatch(adSense, /onClick|trackAffiliateClick|trackAd/i)
})

test('Affiliate Picks are an optional server slot rendered only after completion', () => {
  assert.match(page, /<DailyAffiliatePicks collectionId=\{affiliateCollectionId\} \/>/)
  assert.match(picks, /if \(!collectionId\) return null/)
  assert.match(picks, /if \(products\.length === 0\) return null/)
  assert.match(picks, /catch \(error\)/)
  assert.match(picks, /contentType="daily"/)
  assert.match(picks, /clickPlacement="daily_complete"/)

  const completionGate = runtime.indexOf('!isComplete ?')
  const affiliateGate = runtime.lastIndexOf('{children}')
  assert.ok(completionGate >= 0 && affiliateGate > completionGate)
  assert.match(picks, /data-testid="daily-completion-affiliate"/)
})

test('Guest save/auth conversion remains ahead of completion Affiliate Picks', () => {
  const guestSave = runtime.indexOf('เก็บผลวันนี้ไว้')
  const affiliate = runtime.lastIndexOf('{children}')
  assert.ok(guestSave >= 0 && affiliate > guestSave)
  assert.match(runtime, /สมัครเพื่อเก็บผลและเริ่มสะสมวันต่อเนื่อง/)
})

test('Daily Affiliate clicks reuse the existing consent-gated affiliate event', () => {
  assert.match(picks, /<AffiliateRail/)
  assert.match(analytics, /event: 'affiliate_click'/)
  assert.match(analytics, /AffiliateContentType/)
  assert.match(analytics, /AffiliateClickPlacement/)
  assert.match(picks, /clickPlacement="daily_complete"/)
  assert.doesNotMatch(analytics, /adsense|adsbygoogle/i)
})
