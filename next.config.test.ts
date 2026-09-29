import test from "node:test"
import assert from "node:assert/strict"
// @ts-expect-error Node's strip-types test runner requires explicit .ts extensions.
import nextConfig from "./next.config.ts"

test("image optimization cache and existing configuration contract", () => {
  const images = nextConfig.images

  assert.ok(images)
  assert.equal(images.minimumCacheTTL, 2_678_400)
  assert.notEqual(images.unoptimized, true)
  assert.deepEqual(images.formats, ["image/avif", "image/webp"])
  assert.deepEqual(images.remotePatterns, [
    {
      protocol: "https",
      hostname: "*.supabase.co",
      pathname: "/storage/v1/object/public/**",
    },
    {
      protocol: "https",
      hostname: "assets.sobdai.com",
      port: "",
      pathname: "/news/*/cover/**",
      search: "",
    },
    {
      protocol: "https",
      hostname: "assets.sobdai.com",
      port: "",
      pathname: "/articles/*/cover/**",
      search: "",
    },
  ])
})

test("OCR tracing is scoped to analyzer routes", () => {
  const includes = nextConfig.outputFileTracingIncludes as Record<string, string[]> | undefined
  assert.ok(includes)
  assert.ok(includes['/api/payment/manual/slip'])
  assert.ok(includes['/admin/orders/[id]'])
  assert.equal(includes['/admin/orders'], undefined)
  assert.equal(includes['/*'], undefined)
  for (const patterns of Object.values(includes)) {
    assert.ok(patterns.some((pattern) => pattern.includes('tesseract.js-core')))
    assert.ok(patterns.some((pattern) => pattern.includes('tha.traineddata.gz')))
    assert.ok(patterns.some((pattern) => pattern.includes('eng.traineddata.gz')))
  }
})
