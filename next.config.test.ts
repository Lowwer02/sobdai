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
  ])
})
