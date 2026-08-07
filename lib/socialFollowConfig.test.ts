/**
 * lib/socialFollowConfig.test.ts
 * ----------------------------------------------------------------------------
 * Unit tests for Social Follow configuration foundation.
 *
 * RUN: npx tsx lib/socialFollowConfig.test.ts
 */

import assert from 'node:assert/strict'
import {
  SOCIAL_FOLLOW_DEFAULTS,
  normalizeSocialFollowConfig,
  normalizeSocialHttpUrl,
  resolveSocialFollowChannels,
  type SocialFollowPlacementKey,
  type SocialChannelSource,
} from './socialFollowConfig'

// ─── 1. Default Contract Tests ──────────────────────────────────────────────

function testDefaultContract(): void {
  // Verify global enabled is false
  assert.equal(SOCIAL_FOLLOW_DEFAULTS.enabled, false)

  // Verify all 5 canonical placements exist
  const canonicalKeys: SocialFollowPlacementKey[] = [
    'news_detail_end',
    'news_list_banner',
    'exam_result',
    'dashboard',
    'mobile_floating',
  ]

  const actualKeys = Object.keys(SOCIAL_FOLLOW_DEFAULTS.placements)
  assert.equal(actualKeys.length, 5)

  for (const key of canonicalKeys) {
    const placement = SOCIAL_FOLLOW_DEFAULTS.placements[key]
    assert.ok(placement, `Placement ${key} must exist in defaults`)
    assert.equal(placement.enabled, false, `Placement ${key} enabled must be false`)
    assert.ok(Array.isArray(placement.platforms), `Placement ${key} platforms must be an array`)
    assert.ok(placement.button_labels, `Placement ${key} must have button_labels`)
  }

  // Verify news_detail_end specifics
  const newsDetail = SOCIAL_FOLLOW_DEFAULTS.placements.news_detail_end
  assert.equal(newsDetail.heading, 'ไม่อยากพลาดข่าวเปิดสอบใหม่?')
  assert.equal(newsDetail.button_labels.facebook, 'ติดตาม Facebook')
  assert.equal(newsDetail.button_labels.line, 'เพิ่มเพื่อน LINE OA')
  assert.equal(newsDetail.button_labels.tiktok, 'ติดตาม TikTok')

  // Verify singular button_label does not exist on placement config
  assert.equal((newsDetail as any).button_label, undefined)
}

// ─── 2. Normalizer Tests ────────────────────────────────────────────────────

function testNormalizer(): void {
  // Test primitives and malformed inputs never throw and return all 5 placements
  const badInputs = [undefined, null, 'string', 123, true, false, [], {}]
  for (const raw of badInputs) {
    const res = normalizeSocialFollowConfig(raw)
    assert.equal(res.enabled, false)
    assert.equal(Object.keys(res.placements).length, 5)
  }

  // Verify global enabled accepts only real boolean
  assert.equal(normalizeSocialFollowConfig({ enabled: true }).enabled, true)
  assert.equal(normalizeSocialFollowConfig({ enabled: 'true' }).enabled, false)
  assert.equal(normalizeSocialFollowConfig({ enabled: 1 }).enabled, false)

  // Verify placement enabled accepts only real boolean
  const pEnabledRes = normalizeSocialFollowConfig({
    placements: { news_detail_end: { enabled: true } },
  })
  assert.equal(pEnabledRes.placements.news_detail_end.enabled, true)

  const pInvalidEnabledRes = normalizeSocialFollowConfig({
    placements: { news_detail_end: { enabled: 'true' } },
  })
  assert.equal(pInvalidEnabledRes.placements.news_detail_end.enabled, false)

  // Verify heading & description trimming, empty fallback, and truncation
  const textRes = normalizeSocialFollowConfig({
    placements: {
      news_detail_end: {
        heading: '  Padded Heading  ',
        description: '  Padded Description  ',
      },
      news_list_banner: {
        heading: '   ',
        description: '',
      },
      exam_result: {
        heading: 'A'.repeat(200),
        description: 'B'.repeat(600),
      },
      dashboard: {
        heading: 123,
        description: null,
      },
    },
  })

  assert.equal(textRes.placements.news_detail_end.heading, 'Padded Heading')
  assert.equal(textRes.placements.news_detail_end.description, 'Padded Description')
  assert.equal(textRes.placements.news_list_banner.heading, SOCIAL_FOLLOW_DEFAULTS.placements.news_list_banner.heading)
  assert.equal(textRes.placements.news_list_banner.description, SOCIAL_FOLLOW_DEFAULTS.placements.news_list_banner.description)
  assert.equal(textRes.placements.exam_result.heading.length, 120)
  assert.equal(textRes.placements.exam_result.description.length, 500)
  assert.equal(textRes.placements.dashboard.heading, SOCIAL_FOLLOW_DEFAULTS.placements.dashboard.heading)
  assert.equal(textRes.placements.dashboard.description, SOCIAL_FOLLOW_DEFAULTS.placements.dashboard.description)

  // Verify platforms normalization: unknown filtering, deduplication, valid empty array, non-array fallback
  const platformRes = normalizeSocialFollowConfig({
    placements: {
      news_detail_end: {
        platforms: ['facebook', 'invalid', 'facebook', 'tiktok', 123, null],
      },
      news_list_banner: {
        platforms: [],
      },
      exam_result: {
        platforms: 'not-an-array',
      },
    },
  })

  assert.deepEqual(platformRes.placements.news_detail_end.platforms, ['facebook', 'tiktok'])
  assert.deepEqual(platformRes.placements.news_list_banner.platforms, [])
  assert.deepEqual(platformRes.placements.exam_result.platforms, ['facebook', 'line', 'tiktok'])

  // Verify button_labels normalization: trim, fallback, max 80 chars, unknown keys ignored
  const labelRes = normalizeSocialFollowConfig({
    placements: {
      news_detail_end: {
        button_labels: {
          facebook: '  Custom FB  ',
          line: '  ',
          tiktok: 'C'.repeat(100),
          unknown_key: 'Ignore',
        },
      },
      news_list_banner: {
        button_labels: 'not-an-object',
      },
    },
  })

  assert.equal(labelRes.placements.news_detail_end.button_labels.facebook, 'Custom FB')
  assert.equal(labelRes.placements.news_detail_end.button_labels.line, 'เพิ่มเพื่อน LINE OA')
  assert.equal(labelRes.placements.news_detail_end.button_labels.tiktok?.length, 80)
  assert.equal((labelRes.placements.news_detail_end.button_labels as any).unknown_key, undefined)
  assert.deepEqual(
    labelRes.placements.news_list_banner.button_labels,
    SOCIAL_FOLLOW_DEFAULTS.placements.news_list_banner.button_labels
  )
}

// ─── 3. Immutability Tests ──────────────────────────────────────────────────

function testImmutability(): void {
  const rawInput = {
    enabled: true,
    placements: {
      news_detail_end: {
        enabled: true,
        heading: 'Raw Heading',
        description: 'Raw Description',
        platforms: ['facebook'],
        button_labels: { facebook: 'Raw Label' },
      },
    },
  }

  const rawCopy = JSON.parse(JSON.stringify(rawInput))
  const res1 = normalizeSocialFollowConfig(rawInput)

  // Verify raw input is not mutated
  assert.deepEqual(rawInput, rawCopy)

  // Verify res1 is not same reference as defaults
  assert.notEqual(res1, SOCIAL_FOLLOW_DEFAULTS)
  assert.notEqual(res1.placements, SOCIAL_FOLLOW_DEFAULTS.placements)
  assert.notEqual(res1.placements.news_detail_end, SOCIAL_FOLLOW_DEFAULTS.placements.news_detail_end)
  assert.notEqual(res1.placements.news_detail_end.platforms, SOCIAL_FOLLOW_DEFAULTS.placements.news_detail_end.platforms)
  assert.notEqual(res1.placements.news_detail_end.button_labels, SOCIAL_FOLLOW_DEFAULTS.placements.news_detail_end.button_labels)

  // Verify mutating res1 does not affect defaults or another result
  const res2 = normalizeSocialFollowConfig(null)
  res1.enabled = true
  res1.placements.news_detail_end.heading = 'Mutated'
  res1.placements.news_detail_end.platforms.push('line')
  res1.placements.news_detail_end.button_labels.facebook = 'Mutated FB'

  assert.equal(SOCIAL_FOLLOW_DEFAULTS.enabled, false)
  assert.equal(SOCIAL_FOLLOW_DEFAULTS.placements.news_detail_end.heading, 'ไม่อยากพลาดข่าวเปิดสอบใหม่?')
  assert.deepEqual(SOCIAL_FOLLOW_DEFAULTS.placements.news_detail_end.platforms, ['facebook', 'line', 'tiktok'])

  assert.equal(res2.enabled, false)
  assert.equal(res2.placements.news_detail_end.heading, 'ไม่อยากพลาดข่าวเปิดสอบใหม่?')
  assert.deepEqual(res2.placements.news_detail_end.platforms, ['facebook', 'line', 'tiktok'])
}

// ─── 4. URL Normalizer Tests ────────────────────────────────────────────────

function testUrlNormalizer(): void {
  // Valid URLs
  assert.equal(normalizeSocialHttpUrl('http://example.com'), 'http://example.com')
  assert.equal(normalizeSocialHttpUrl('https://example.com'), 'https://example.com')
  assert.equal(normalizeSocialHttpUrl('  https://facebook.com/sobdai?ref=1#top  '), 'https://facebook.com/sobdai?ref=1#top')

  // Invalid URLs
  assert.equal(normalizeSocialHttpUrl(undefined), null)
  assert.equal(normalizeSocialHttpUrl(null), null)
  assert.equal(normalizeSocialHttpUrl(123), null)
  assert.equal(normalizeSocialHttpUrl(true), null)
  assert.equal(normalizeSocialHttpUrl(''), null)
  assert.equal(normalizeSocialHttpUrl('   '), null)
  assert.equal(normalizeSocialHttpUrl('/relative/path'), null)
  assert.equal(normalizeSocialHttpUrl('not-a-valid-url'), null)
  assert.equal(normalizeSocialHttpUrl('javascript:alert(1)'), null)
  assert.equal(normalizeSocialHttpUrl('data:text/html,test'), null)
  assert.equal(normalizeSocialHttpUrl('mailto:support@sobdai.com'), null)
  assert.equal(normalizeSocialHttpUrl('ftp://files.sobdai.com'), null)
  assert.equal(normalizeSocialHttpUrl('//example.com'), null)
}

// ─── 5. Channel Resolver Tests ──────────────────────────────────────────────

function testChannelResolver(): void {
  const activeConfig = normalizeSocialFollowConfig({
    enabled: true,
    placements: {
      news_detail_end: {
        enabled: true,
        heading: 'Heading',
        description: 'Description',
        platforms: ['facebook', 'line'],
        button_labels: {
          facebook: '  Follow FB  ',
          line: 'L'.repeat(100),
        },
      },
      exam_result: {
        enabled: false,
      },
    },
  })

  const sources: SocialChannelSource[] = [
    { key: 'facebook', label: 'Facebook Page', url: 'invalid-url', active: true },
    { key: 'facebook', label: 'Facebook Main', url: ' https://facebook.com/sobdai ', active: true },
    { key: 'line', label: 'LINE Official', url: 'https://line.me/ti/p/@sobdai', active: true },
    { key: 'tiktok', label: 'TikTok', url: 'https://tiktok.com/@sobdai', active: true },
    { key: 'facebook', label: 'Facebook Duplicate', url: 'https://facebook.com/sobdai2', active: true },
  ]

  // Global disabled returns []
  assert.deepEqual(resolveSocialFollowChannels(SOCIAL_FOLLOW_DEFAULTS, 'news_detail_end', sources), [])

  // Placement disabled returns []
  assert.deepEqual(resolveSocialFollowChannels(activeConfig, 'exam_result', sources), [])

  // Resolve active channels
  const resolved = resolveSocialFollowChannels(activeConfig, 'news_detail_end', sources)

  // 1. Platform not selected in placement (tiktok) is excluded
  // 2. Inactive channel is excluded
  // 3. Invalid URL (first facebook) is excluded, allowing second valid facebook
  // 4. Output URL is trimmed
  // 5. Source order preserved (facebook first, line second)
  // 6. First valid entry returned, duplicate facebook excluded
  assert.equal(resolved.length, 2)
  assert.equal(resolved[0].key, 'facebook')
  assert.equal(resolved[0].label, 'Facebook Main')
  assert.equal(resolved[0].url, 'https://facebook.com/sobdai')
  assert.equal(resolved[0].button_label, 'Follow FB')

  assert.equal(resolved[1].key, 'line')
  assert.equal(resolved[1].label, 'LINE Official')
  assert.equal(resolved[1].url, 'https://line.me/ti/p/@sobdai')
  assert.equal(resolved[1].button_label.length, 80)

  // Test fallback label when placement button_label is missing/invalid
  const fallbackConfig = normalizeSocialFollowConfig({
    enabled: true,
    placements: {
      news_detail_end: {
        enabled: true,
        button_labels: {
          facebook: '   ',
        },
      },
    },
  })
  const resolvedFallback = resolveSocialFollowChannels(fallbackConfig, 'news_detail_end', [
    { key: 'facebook', label: 'FB Channel', url: 'https://facebook.com/sobdai', active: true },
  ])
  assert.equal(resolvedFallback[0].button_label, 'ติดตาม Facebook')

  // Verify resolver does not mutate config, channels, or defaults
  const configCopy = JSON.parse(JSON.stringify(activeConfig))
  const sourcesCopy = JSON.parse(JSON.stringify(sources))
  const defaultsCopy = JSON.parse(JSON.stringify(SOCIAL_FOLLOW_DEFAULTS))

  resolveSocialFollowChannels(activeConfig, 'news_detail_end', sources)

  assert.deepEqual(activeConfig, configCopy)
  assert.deepEqual(sources, sourcesCopy)
  assert.deepEqual(SOCIAL_FOLLOW_DEFAULTS, defaultsCopy)
}

// ─── Test Runner ─────────────────────────────────────────────────────────────

function runAllTests(): void {
  console.log('Running Social Follow Foundation Unit Tests...')

  testDefaultContract()
  testNormalizer()
  testImmutability()
  testUrlNormalizer()
  testChannelResolver()

  console.log('All Social Follow foundation tests passed successfully! ✅')
}

runAllTests()
