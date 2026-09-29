import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canonicalAmount,
  maskReference,
  normalizeRecipientName,
  normalizeThaiDigits,
  tailMatches,
} from './verification-normalize'

test('normalization is conservative and exact for recipient identity', () => {
  assert.equal(normalizeRecipientName(' คุณ กิตติพงษ์ '), normalizeRecipientName('กิตติพงษ์'))
  assert.notEqual(normalizeRecipientName('กิตติพงษ์ศรี'), normalizeRecipientName('กิตติพงษ์'))
  assert.equal(normalizeThaiDigits('๙๙๙๙'), '9999')
})

test('amount normalization uses exact decimal strings', () => {
  assert.equal(canonicalAmount('฿1,234.5'), '1234.50')
  assert.equal(canonicalAmount('1234.50'), '1234.50')
  assert.equal(canonicalAmount('1234.567'), null)
  assert.equal(canonicalAmount('0.00'), null)
})

test('destination matching is suffix-only and reference display is masked', () => {
  assert.equal(tailMatches('๐๑๒๓๔๕๑๘๕๓', ['1853', '853']), true)
  assert.equal(tailMatches('0123458999', ['1853', '853']), false)
  assert.equal(maskReference('BANKREF1234'), '••••1234')
})
