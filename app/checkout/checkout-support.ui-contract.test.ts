import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const checkoutPageSource = readFileSync(
  join(process.cwd(), 'app/checkout/[id]/page.tsx'),
  'utf8',
)
const checkoutClientSource = readFileSync(
  join(process.cwd(), 'app/checkout/[id]/CheckoutClient.tsx'),
  'utf8',
)
const supportModalSource = readFileSync(
  join(process.cwd(), 'components/SupportModal.tsx'),
  'utf8',
)
const supportDetailsSource = readFileSync(
  join(process.cwd(), 'components/SupportDetails.tsx'),
  'utf8',
)
const analyticsSource = readFileSync(
  join(process.cwd(), 'lib/analytics.ts'),
  'utf8',
)

test('Checkout server page loads Support config from getHomepageSettings without ad-hoc DB query', () => {
  assert.match(checkoutPageSource, /import\s*\{\s*getHomepageSettings\s*\}\s*from\s*'@\/lib\/homepageConfig'/)
  assert.match(checkoutPageSource, /getHomepageSettings\(\)/)
  assert.match(checkoutPageSource, /<CheckoutClient[^>]*supportConfig=\{homepageSettings\.support\}/)
})

test('CheckoutClient handles free package claim state locally without immediate redirect', () => {
  // Local state for claim success
  assert.match(checkoutClientSource, /const \[claimedSuccess, setClaimedSuccess\] = useState\(false\)/)
  // Free checkout sets local claimedSuccess and tracks freePackageClaimed
  assert.match(checkoutClientSource, /if \(data\.success\) \{\s*setClaimedSuccess\(true\)\s*freePackageClaimed\(pkg\.id, pkg\.name\)/)
  // Does not do router.push for free checkout
  assert.doesNotMatch(checkoutClientSource, /handleFreeCheckout[\s\S]*router\.push/)
})

test('CheckoutClient free claim success renders proper success panel and Start Learning CTA', () => {
  // Required message
  assert.match(checkoutClientSource, /เปิดใช้งานแพ็กเกจเรียบร้อยแล้ว/)
  // Primary CTA with strong visual styling and target
  assert.match(checkoutClientSource, /href=\{`\/package\/\$\{pkg\.slug\}#resources`\}/)
  assert.match(checkoutClientSource, /เริ่มเรียน/)
})

test('CheckoutClient voluntary Support section obeys visibility rules and disclosure', () => {
  // Visibility predicate requires claimedSuccess, enabled, and qr_image_url
  assert.match(
    checkoutClientSource,
    /const showSupportSection =\s*claimedSuccess &&\s*Boolean\(supportConfig\?\.enabled\) &&\s*Boolean\(supportConfig\?\.qr_image_url\?\.trim\(\)\)/,
  )
  // Uses shared SupportDetails with showPlaceholderIfEmpty={false}
  assert.match(checkoutClientSource, /<SupportDetails[\s\S]*showPlaceholderIfEmpty=\{false\}[\s\S]*qrSize=\{180\}/)
  // Required static disclosure
  assert.match(checkoutClientSource, /การสนับสนุนเป็นทางเลือก ไม่จำเป็นต่อการรับหรือใช้งานแพ็กเกจฟรี/)
})

test('CheckoutClient prevents double claim once claim is pending or successful', () => {
  assert.match(checkoutClientSource, /if \(loading \|\| claimedSuccess\) return/)
})

test('CheckoutClient preserves card checkout and uses the manual PromptPay flow', () => {
  // Paid card payment still redirects to /package/${pkg.slug}?success=1
  assert.match(checkoutClientSource, /handleCardPayment[\s\S]*router\.push\(`\/package\/\$\{pkg\.slug\}\?success=1`\)/)
  // PromptPay creates the server-owned order before showing the upload flow
  assert.match(checkoutClientSource, /fetch\('\/api\/payment\/manual\/order'/)
  assert.match(checkoutClientSource, /fetch\('\/api\/payment\/manual\/slip'/)
})

test('SupportModal reuses extracted SupportDetails component with placeholder fallback', () => {
  assert.match(supportModalSource, /import SupportDetails from '\.\/SupportDetails'/)
  assert.match(supportModalSource, /<SupportDetails[\s\S]*showPlaceholderIfEmpty=\{true\}[\s\S]*qrSize=\{220\}/)
})

test('SupportDetails handles both QR and placeholder modes safely', () => {
  assert.match(supportDetailsSource, /export default function SupportDetails/)
  assert.match(supportDetailsSource, /if \(!hasQR && !showPlaceholderIfEmpty\) \{\s*return null/)
  assert.match(supportDetailsSource, /PromptPay/)
})

test('lib/analytics exports freePackageClaimed conforming to pushToDataLayer', () => {
  assert.match(analyticsSource, /export function freePackageClaimed\(/)
  assert.match(analyticsSource, /event: 'free_package_claimed'/)
  assert.match(analyticsSource, /value: 0/)
})
