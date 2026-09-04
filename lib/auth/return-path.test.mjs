import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildInternalReturnUrl,
  normalizeInternalReturnPath,
} from './return-path.ts'

test('normal internal return paths are preserved', () => {
  for (const value of [
    '/',
    '/daily',
    '/login',
    '/packages',
    '/daily?x=1',
    '/packages/example/details?tab=overview#questions',
    '/search?q=%E0%B8%97%E0%B8%94%E0%B8%AA%E0%B8%AD%E0%B8%9A',
  ]) {
    assert.equal(normalizeInternalReturnPath(value), value)
  }
})

test('external, authority-like, backslash, control, and malformed values fail closed', () => {
  for (const value of [
    'https://evil.example',
    'http://evil.example',
    '//evil.example',
    '\\evil.example',
    '/\\evil.example',
    '@evil.example',
    '/%5C%5Cevil.example',
    '/%5c%5cevil.example',
    '/%255C%255Cevil.example',
    '/%2F%2Fevil.example',
    '/%252F%252Fevil.example',
    '/daily\nevil',
    '/daily\u0000evil',
    '/%0d%0aLocation%3A%20https%3A%2F%2Fevil.example',
    '/%',
    '',
    null,
    undefined,
    123,
  ]) {
    assert.equal(normalizeInternalReturnPath(value), '/', String(value))
  }
})

test('the callback URL builder cannot leave the supplied origin', () => {
  const origin = 'https://sobdai.example'
  for (const value of [
    '@evil.example',
    'https://evil.example',
    '//evil.example',
    '\\evil.example',
    '/\\evil.example',
    '/%5C%5Cevil.example',
    '/%0a@evil.example',
  ]) {
    const result = buildInternalReturnUrl(origin, value)
    assert.equal(result.origin, origin)
    assert.equal(result.pathname, '/')
  }

  assert.equal(buildInternalReturnUrl(origin, '/daily?x=1').href, `${origin}/daily?x=1`)
})
