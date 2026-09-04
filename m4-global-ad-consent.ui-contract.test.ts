/**
 * M4 Global Advertising Consent Foundation — source contracts.
 *
 * These focused checks freeze the separation between Sobdai's optional
 * analytics preference and Google's advertising-consent authority. They do
 * not render or call a third-party CMP, and they do not touch the database.
 *
 * Run with:
 *   node --test m4-global-ad-consent.ui-contract.test.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

const bridge = read('lib/google-privacy-messaging.ts')
const consent = read('lib/consent.ts')
const analytics = read('lib/analytics.ts')
const analyticsLoader = read('components/consent/ConsentAnalyticsLoader.tsx')
const banner = read('components/consent/CookieBanner.tsx')
const modal = read('components/consent/CookiePreferencesModal.tsx')
const settings = read('components/consent/CookieSettingsButton.tsx')
const footer = read('components/Footer.tsx')
const adsenseUnit = read('components/adsense/AdSenseUnit.tsx')
const adsense = read('lib/adsense.ts')
const daily = read('app/daily/page.tsx')
const news = read('app/news/[slug]/page.tsx')
const article = read('components/articles/ArticleDetail.tsx')
const affiliate = read('components/affiliate/AffiliateRail.tsx')
const cookies = read('content/legal/cookies.md')
const privacy = read('content/legal/privacy.md')

test('analytics consent remains distinct from advertising consent', () => {
  assert.match(consent, /analytics:\s*boolean/)
  assert.match(consent, /marketing:\s*false/)
  assert.match(analytics, /readConsentFromDocumentCookie\(\)/)
  assert.match(analytics, /!consent\.analytics/)
  assert.doesNotMatch(analytics, /googlefc|adsense|advertisingConsent|adConsent(?:State|Status|Preference|Cookie|Value)/i)
  assert.doesNotMatch(analyticsLoader, /googlefc|adsense|advertisingConsent|adConsent(?:State|Status|Preference|Cookie|Value)/i)
  assert.doesNotMatch(modal, /marketingEnabled|marketing-toggle|คุกกี้การตลาด/)
})

test('the advertising bridge delegates only to Google Privacy & messaging', () => {
  assert.match(bridge, /callbackQueue/)
  assert.match(bridge, /CONSENT_API_READY/)
  assert.match(bridge, /showRevocationMessage/)
  assert.doesNotMatch(
    bridge,
    /__tcfapi|__gpp|tcString|consentString|gdprApplies|localStorage|sessionStorage|geolocation|navigator\.language/i
  )
  assert.doesNotMatch(modal, /__tcfapi|__gpp|tcString|consentString|gdprApplies/i)
})

test('privacy management has one clear entry point and a Google-managed ad path', () => {
  assert.match(settings, /ตั้งค่าความเป็นส่วนตัว/)
  assert.match(banner, /ตั้งค่าความเป็นส่วนตัว/)
  assert.match(modal, /ตั้งค่าความเป็นส่วนตัว/)
  assert.match(modal, /subscribeToGooglePrivacyMessaging/)
  assert.match(modal, /queueGooglePrivacyChoicesOnce/)
  assert.match(modal, /googlePrivacyChoiceInProgress/)
  assert.match(modal, /disabled={!googlePrivacyMessagingReady \|\| googlePrivacyChoiceInProgress}/)
  assert.match(modal, /data-testid="google-advertising-privacy-settings"/)
  assert.match(modal, /เมื่อ Sobdai แสดงโฆษณาจาก Google/)
  assert.match(modal, /การตั้งค่าด้านโฆษณาและความเป็นส่วนตัวจะจัดการผ่าน/)
  assert.match(modal, /Google Privacy & messaging แยกจากคุกกี้วิเคราะห์ของ Sobdai/)
  assert.match(modal, /จัดการโดย Google/)
  assert.match(modal, /ตัวเลือกนี้จะพร้อมใช้งานบนหน้าที่รองรับการตั้งค่าโฆษณาของ Google/)
  assert.doesNotMatch(modal, /sobdai_consent/)
  assert.match(footer, /<CookieSettingsButton\s*\/>/)
})

test('CMP failure is non-blocking and does not alter the existing AdSense boundary', () => {
  assert.match(bridge, /return false/)
  assert.match(bridge, /return \(\) => \{\}/)
  assert.match(adsenseUnit, /requestNonPersonalizedAds\s*=\s*1/)
  assert.doesNotMatch(adsenseUnit, /useConsent|hasAnalyticsConsent|ConsentProvider/)
  assert.match(adsense, /Google Privacy & messaging owns advertising choices/)
})

test('AdSense remains content-gated and Daily remains independently off by default', () => {
  assert.match(news, /article\.adsense_enabled\s*\?\s*getAdsenseDetailConfig\(\)\s*:\s*null/)
  assert.match(article, /article\.adsense_enabled\s*\?\s*getAdsenseDetailConfig\(\)\s*:\s*null/)
  assert.match(daily, /getAdsenseDailyConfig\(\)/)
  assert.match(adsense, /parseAdsenseDailyEnabled/)
  assert.match(adsense, /value === 'true'/)
})

test('affiliate presentation and disclosure remain separate from AdSense consent', () => {
  assert.match(affiliate, /AFFILIATE_DISCLOSURE_TEXT/)
  assert.match(cookies, /SOBDAI PICKS/)
  assert.match(cookies, /ไม่ใช่โฆษณา AdSense/)
  assert.match(privacy, /SOBDAI PICKS/)
  assert.match(privacy, /แยกจาก Google AdSense/)
})

test('legal content describes Google storage/choices without claiming universal ads or cookies', () => {
  for (const [name, source] of [['cookies', cookies], ['privacy', privacy]] as const) {
    assert.match(source, /Google Privacy & messaging/, `${name} names Google Privacy & messaging`)
    assert.match(source, /ตัวเลือก.*แยก.*(?:วิเคราะห์|ความยินยอมวิเคราะห์)/, `${name} separates analytics and ads`)
    assert.match(source, /คุกกี้.*(?:พื้นที่จัดเก็บในเครื่อง|เทคโนโลยีที่คล้ายกัน)/, `${name} describes storage conditionally`)
    assert.doesNotMatch(source, /ปัจจุบัน Sobdai ไม่ได้มีการใช้งานคุกกี้การตลาด/)
  }
  assert.match(cookies, /Daily AdSense ยังปิดใช้งานอยู่/)
  assert.match(privacy, /Daily AdSense ยังปิดใช้งานอยู่/)
  assert.match(cookies, /หากคุณปฏิเสธคุกกี้วิเคราะห์ Sobdai จะไม่ใช้เทคโนโลยีวิเคราะห์ทางเลือก/)
  assert.match(cookies, /ตัวเลือกโฆษณาจะจัดการแยกผ่าน Google Privacy & messaging/)
  assert.doesNotMatch(cookies, /sobdai_consent/)
  assert.doesNotMatch(cookies, /ปฏิเสธคุกกี้ที่ไม่จำเป็น.*เฉพาะคุกกี้ที่จำเป็น/)
})
