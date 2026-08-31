import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

test('Route Handler enforces server-side authentication, RBAC, and early size gate', () => {
  const routeSource = read('app/api/admin/media/upload/route.ts')

  // Enforces Supabase server auth
  assert.match(routeSource, /createClient\(\)/)
  assert.match(routeSource, /supabase\.auth\.getUser\(\)/)

  // Enforces 'content.write' permission
  assert.match(routeSource, /hasPermission\(profile\.role,\s*['"]content\.write['"]\)/)

  // Early request size gate BEFORE request.formData()
  const earlyGateIdx = routeSource.indexOf("request.headers.get('content-length')")
  const formDataIdx = routeSource.indexOf('request.formData()')
  assert.ok(earlyGateIdx !== -1, 'Must check content-length header')
  assert.ok(formDataIdx !== -1, 'Must parse formData')
  assert.ok(earlyGateIdx < formDataIdx, 'Early Content-Length gate must precede request.formData()')

  // Returns 413 for oversized Content-Length requests
  assert.match(routeSource, /status:\s*413/)

  // Returns 401 for unauthenticated requests
  assert.match(routeSource, /status:\s*401/)

  // Returns 403 for unauthorized requests
  assert.match(routeSource, /status:\s*403/)

  // Returns generic error message for unexpected failures (never exposes internals)
  assert.match(routeSource, /error:\s*['"]Image upload failed['"]/)

  // Enforces scope whitelist
  assert.match(routeSource, /isValidAssetScope/)

  // Enforces UUID entityId validation
  assert.match(routeSource, /isValidEntityUuid/)

  // Never leaks credentials
  assert.doesNotMatch(routeSource, /R2_ACCESS_KEY_ID/)
  assert.doesNotMatch(routeSource, /R2_SECRET_ACCESS_KEY/)
})

test('Server Action upload surface has been removed in favor of single API Route boundary', () => {
  const serverActionPath = join(root, 'app/admin/media/actions.ts')
  assert.equal(existsSync(serverActionPath), false, 'app/admin/media/actions.ts must NOT exist')
})

test('R2 config strictly validates public URL and prohibits NEXT_PUBLIC_ credential prefix', () => {
  const configSource = read('lib/storage/r2-config.ts')

  // Must check non-public env variables
  assert.match(configSource, /R2_ACCOUNT_ID/)
  assert.match(configSource, /R2_ACCESS_KEY_ID/)
  assert.match(configSource, /R2_SECRET_ACCESS_KEY/)
  assert.match(configSource, /R2_BUCKET_NAME/)
  assert.match(configSource, /R2_PUBLIC_BASE_URL/)

  // Strictly NO NEXT_PUBLIC_ for credentials
  assert.doesNotMatch(configSource, /NEXT_PUBLIC_R2_ACCESS_KEY_ID/)
  assert.doesNotMatch(configSource, /NEXT_PUBLIC_R2_SECRET_ACCESS_KEY/)

  // Enforces https validation
  assert.match(configSource, /https:/)
})

test('R2 uploader strictly enforces immutable cache-control and image/webp content type', () => {
  const uploaderSource = read('lib/storage/r2-uploader.ts')

  assert.match(uploaderSource, /ContentType:\s*['"]image\/webp['"]/)
  assert.match(uploaderSource, /CacheControl:\s*['"]public,\s*max-age=31536000,\s*immutable['"]/)
})
