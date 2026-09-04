import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const appDir = dirname(fileURLToPath(import.meta.url))
const read = (path: string) => readFileSync(join(appDir, '..', '..', path), 'utf8')
const page = read('app/daily/page.tsx')
const actions = read('app/daily/actions.ts')
const runtime = read('components/daily/DailyRuntime.tsx')
const guestData = read('lib/daily/guest-data.ts')
const proof = read('lib/daily/guest-proof.ts')
const login = read('app/login/page.tsx')
const authModal = read('components/AuthModal.tsx')
const analytics = read('lib/analytics.ts')
const proofSecret = read('lib/daily/guest-proof-secret.ts')

test('unauthenticated Daily renders the guest experience instead of redirecting', () => {
  assert.match(page, /loadGuestDailyState/)
  assert.match(page, /return <ReadyDaily state=\{guestResult\.state\} \/>/)
  assert.doesNotMatch(page, /redirect\(['"]\/login\?redirect=\/daily/)
})

test('guest data access is read-only and does not expose the answer key in state', () => {
  assert.match(guestData, /createAdminClient/)
  assert.match(guestData, /daily_challenges/)
  assert.match(guestData, /questions/)
  assert.doesNotMatch(guestData, /\.(?:insert|update|upsert|delete)\s*\(/)
  assert.match(actions, /submitGuestDailyAnswer/)
  assert.match(actions, /completeGuestDaily/)
  assert.match(actions, /normalizeGuestCompletionAnswers/)
  assert.match(runtime, /questionsAnswered === state\.questions\.length/)
  assert.match(runtime, /ResultList questions=\{state\.questions\} results=\{state\.results\}/)
  assert.doesNotMatch(actions, /loadGuestDailyState[\s\S]*?daily_get_state/)
})

test('proof verification is server-bound and claims only through the 089 RPC', () => {
  assert.match(proof, /createHmac\(['"]sha256['"]/)
  assert.match(proof, /timingSafeEqual/)
  assert.match(proof, /httpOnly: true/)
  assert.match(proof, /sameSite: 'lax'/)
  assert.match(actions, /verifyDailyGuestCompletionProof/)
  assert.match(actions, /daily_submit_answer/)
  assert.match(actions, /for \(const \[index, questionId\] of proof\.questionIds\.entries\(\)/)
  assert.match(actions, /expDelta = Math\.min\(50, expDelta \+ parsed\.result\.expDelta\)/)
  assert.doesNotMatch(actions, /claimGuestDaily\([\s\S]*?p_(?:score|exp|streak|correct)/)
})

test('proof secret loading is server-only, dedicated, and has no service-role fallback', () => {
  assert.match(proofSecret, /import ['"]server-only['"]/)
  assert.match(proofSecret, /process\.env\.DAILY_GUEST_PROOF_SECRET/)
  assert.doesNotMatch(proofSecret, /SUPABASE_SERVICE_ROLE_KEY/)
})

test('auth conversion keeps the Daily return path for login, signup, and email confirmation', () => {
  assert.match(runtime, /\/login\?redirect=%2Fdaily&mode=register/)
  assert.match(runtime, /\/login\?redirect=%2Fdaily&mode=login/)
  assert.match(login, /searchParams\.get\('mode'\)/)
  assert.match(authModal, /emailRedirectTo/)
  assert.match(authModal, /auth\/callback\?next=/)
})

test('new analytics are consent-gated and existing Daily discovery events remain', () => {
  for (const event of [
    'daily_guest_start',
    'daily_guest_complete',
    'daily_guest_auth_click',
    'daily_guest_claim_complete',
  ]) {
    assert.match(analytics, new RegExp(`event: '${event}'`))
  }
  assert.match(analytics, /readConsentFromDocumentCookie/)
  assert.match(analytics, /daily_home_click/)
  assert.match(analytics, /daily_nav_click/)
})
