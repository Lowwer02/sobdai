import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { buildInternalReturnUrl } from '../../lib/auth/return-path.ts'

const appAuthDir = dirname(fileURLToPath(import.meta.url))
const root = join(appAuthDir, '..', '..')
const read = (path) => readFileSync(join(root, path), 'utf8')
const callback = read('app/auth/callback/route.ts')
const login = read('app/login/page.tsx')
const authModal = read('components/AuthModal.tsx')

test('the auth callback fails closed for the reported userinfo exploit', () => {
  const result = buildInternalReturnUrl('https://sobdai.example', '@evil.example')
  assert.equal(result.href, 'https://sobdai.example/')
  assert.match(callback, /buildInternalReturnUrl\(origin, next\)/)
  assert.doesNotMatch(callback, /`\$\{origin\}\$\{next\}`/)
})

test('login, email signup, and OAuth normalize the return path before use', () => {
  assert.match(login, /normalizeInternalReturnPath\(searchParams\.get\('redirect'\)\)/)
  assert.match(login, /window\.location\.href = returnPath/)
  assert.match(authModal, /normalizeInternalReturnPath\(redirectUrl\)/)
  assert.match(authModal, /emailRedirectTo = .*encodeURIComponent\(returnPath\)/)
  assert.match(authModal, /redirectTo = .*encodeURIComponent\(returnPath\)/)
})
