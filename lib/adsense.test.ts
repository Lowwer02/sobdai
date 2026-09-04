/**
 * Unit tests for the AdSense Conservative (M3) config/eligibility contract.
 *
 * Pure module, no aliases → runs directly under node --test strip-types:
 *   node --test lib/adsense.test.ts
 */

import assert from 'node:assert/strict'
import test from 'node:test'

// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { ADSENSE_CLIENT_ENV_VAR, ADSENSE_DETAIL_SLOT_ENV_VAR, ADSENSE_LABEL, coerceAdsenseEnabled, getAdsenseDailyConfig, getAdsenseDetailConfigFrom, parseAdsenseClientId, parseAdsenseSlotId, resolveDetailAdUnit } from './adsense.ts'

const VALID_ENV = {
  [ADSENSE_CLIENT_ENV_VAR]: 'ca-pub-1234567890123456',
  [ADSENSE_DETAIL_SLOT_ENV_VAR]: '1234567890',
}

test('adsense client id accepts only the ca-pub-<digits> format', () => {
  assert.equal(parseAdsenseClientId('ca-pub-1234567890123456'), 'ca-pub-1234567890123456')
  assert.equal(parseAdsenseClientId('  ca-pub-1234567890  '), 'ca-pub-1234567890')
  assert.equal(parseAdsenseClientId('pub-1234567890'), null, 'missing ca- prefix')
  assert.equal(parseAdsenseClientId('ca-pub-abc'), null, 'non-digit body')
  assert.equal(parseAdsenseClientId('ca-pub-'), null, 'empty body')
  assert.equal(parseAdsenseClientId('ca-pub-1234567890123456;x=1'), null, 'attribute injection')
  assert.equal(parseAdsenseClientId(''), null)
  assert.equal(parseAdsenseClientId(undefined), null)
  assert.equal(parseAdsenseClientId(null), null)
  assert.equal(parseAdsenseClientId(123), null)
})

test('adsense slot id accepts only numeric strings', () => {
  assert.equal(parseAdsenseSlotId('1234567890'), '1234567890')
  assert.equal(parseAdsenseSlotId(' 12345678 '), '12345678')
  assert.equal(parseAdsenseSlotId('1234567'), null, 'too short')
  assert.equal(parseAdsenseSlotId('1234567890123456'), null, 'too long')
  assert.equal(parseAdsenseSlotId('12345abc'), null)
  assert.equal(parseAdsenseSlotId('"><script>x'), null, 'injection attempt')
  assert.equal(parseAdsenseSlotId(undefined), null)
  assert.equal(parseAdsenseSlotId(null), null)
})

test('adsense_enabled coerces STRICTLY (true only)', () => {
  assert.equal(coerceAdsenseEnabled(true), true)
  for (const falsy of [false, undefined, null, 'true', 1, 'yes', {}]) {
    assert.equal(coerceAdsenseEnabled(falsy), false, `value ${String(falsy)} must stay OFF`)
  }
})

test('config resolves only when BOTH env vars are present and valid', () => {
  assert.deepEqual(getAdsenseDetailConfigFrom(VALID_ENV), {
    clientId: 'ca-pub-1234567890123456',
    slotId: '1234567890',
  })
  // Missing either side → fail closed (no partial config).
  assert.equal(getAdsenseDetailConfigFrom({ [ADSENSE_CLIENT_ENV_VAR]: 'ca-pub-1234567890123456' }), null)
  assert.equal(getAdsenseDetailConfigFrom({ [ADSENSE_DETAIL_SLOT_ENV_VAR]: '1234567890' }), null)
  assert.equal(getAdsenseDetailConfigFrom({}), null)
  // Malformed either side → fail closed.
  assert.equal(
    getAdsenseDetailConfigFrom({
      [ADSENSE_CLIENT_ENV_VAR]: 'not-a-client',
      [ADSENSE_DETAIL_SLOT_ENV_VAR]: '1234567890',
    }),
    null
  )
  assert.equal(
    getAdsenseDetailConfigFrom({
      [ADSENSE_CLIENT_ENV_VAR]: 'ca-pub-1234567890123456',
      [ADSENSE_DETAIL_SLOT_ENV_VAR]: 'slot-id',
    }),
    null
  )
})

test('Daily reuses the same validated platform config entry point', () => {
  const previousClient = process.env[ADSENSE_CLIENT_ENV_VAR]
  const previousSlot = process.env[ADSENSE_DETAIL_SLOT_ENV_VAR]
  process.env[ADSENSE_CLIENT_ENV_VAR] = VALID_ENV[ADSENSE_CLIENT_ENV_VAR]
  process.env[ADSENSE_DETAIL_SLOT_ENV_VAR] = VALID_ENV[ADSENSE_DETAIL_SLOT_ENV_VAR]

  try {
    assert.deepEqual(getAdsenseDailyConfig(), {
      clientId: VALID_ENV[ADSENSE_CLIENT_ENV_VAR],
      slotId: VALID_ENV[ADSENSE_DETAIL_SLOT_ENV_VAR],
    })
  } finally {
    if (previousClient === undefined) delete process.env[ADSENSE_CLIENT_ENV_VAR]
    else process.env[ADSENSE_CLIENT_ENV_VAR] = previousClient
    if (previousSlot === undefined) delete process.env[ADSENSE_DETAIL_SLOT_ENV_VAR]
    else process.env[ADSENSE_DETAIL_SLOT_ENV_VAR] = previousSlot
  }
})

test('eligibility = content opt-in AND config (either failing → no ad unit)', () => {
  // Disabled content → never render, even with full config.
  assert.equal(resolveDetailAdUnit({ adsenseEnabled: false, env: VALID_ENV }), null)
  assert.equal(resolveDetailAdUnit({ adsenseEnabled: undefined, env: VALID_ENV }), null)
  assert.equal(resolveDetailAdUnit({ env: VALID_ENV }), null, 'legacy row (no flag) stays OFF')
  // Enabled content without config → never render, never load the script.
  assert.equal(resolveDetailAdUnit({ adsenseEnabled: true, env: {} }), null)
  // Enabled + config → the validated config to render.
  assert.deepEqual(resolveDetailAdUnit({ adsenseEnabled: true, env: VALID_ENV }), {
    clientId: 'ca-pub-1234567890123456',
    slotId: '1234567890',
  })
})

test('the ad label is the subtle Thai disclosure', () => {
  assert.equal(ADSENSE_LABEL, 'โฆษณา')
})
