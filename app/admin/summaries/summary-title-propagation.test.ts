import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { buildSummaryRevalidationPaths, shouldRepublishEditedSummary } from './summary-action-logic.ts'
// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { mergePublicSummaryListRows, resolvePublicSummaryRouteRows } from '../../../lib/public-summary.ts'

const PACKAGE_A = '00000000-0000-4000-8000-0000000000a1'
const PACKAGE_B = '00000000-0000-4000-8000-0000000000b1'
const SUMMARY_ID = '00000000-0000-4000-8000-000000000201'
const PUBLISHED_VERSION_ID = '00000000-0000-4000-8000-000000000301'
const EDITED_VERSION_ID = '00000000-0000-4000-8000-000000000302'

const OLD_TITLE = '5 นโยบายหลัก เกษตรนวัตกรรม เพื่อความยั่งยืนเกษตรกรไทย'
const NEW_TITLE = 'สรุป 5 นโยบายหลัก เกษตรนวัตกรรม เพื่อความยั่งยืนเกษตรกรไทย'
const OLD_SLUG = 'summary-old-slug'
const NEW_SLUG = 'summary-new-slug'

// ─── Republish decision ──────────────────────────────────────────────────────

test('published KP-native edits republish; drafts and Legacy edits do not', () => {
  assert.equal(shouldRepublishEditedSummary('kp_native', true), true)
  assert.equal(shouldRepublishEditedSummary('kp_native', false), false)
  assert.equal(shouldRepublishEditedSummary('legacy', true), false)
  assert.equal(shouldRepublishEditedSummary('legacy', false), false)
})

// ─── Public route invalidation targets ───────────────────────────────────────

test('revalidation covers old and new Packages crossed with old and new Summary slugs', () => {
  const paths = buildSummaryRevalidationPaths(
    [{ slug: 'package-a' }, { slug: 'package-b' }],
    [OLD_SLUG, NEW_SLUG],
  )

  // Membership moved A -> B while the slug changed in the same save: the
  // removed Package page and the old slug route must not stay stale either.
  for (const expected of [
    '/package/package-a',
    '/package/package-b',
    '/package/package-a/summary/summary-old-slug',
    '/package/package-a/summary/summary-new-slug',
    '/package/package-b/summary/summary-old-slug',
    '/package/package-b/summary/summary-new-slug',
  ]) {
    assert.ok(paths.includes(expected), `missing revalidation target ${expected}`)
  }
  assert.equal(paths.length, 6)
})

test('revalidation targets are addressed by Package slug, never by Package ID', () => {
  const paths = buildSummaryRevalidationPaths(
    [{ slug: 'package-a' }],
    [NEW_SLUG],
  )

  assert.deepEqual(paths, [
    '/package/package-a',
    `/package/package-a/summary/${NEW_SLUG}`,
  ])
  assert.ok(!paths.some((path) => path.includes(PACKAGE_A)))
})

test('revalidation drops unusable slugs but still invalidates the Package page', () => {
  const paths = buildSummaryRevalidationPaths(
    [{ slug: 'package-a' }, { slug: '' }, { slug: null }, {}],
    [NEW_SLUG, '', null],
  )

  assert.deepEqual(paths, [
    '/package/package-a',
    `/package/package-a/summary/${NEW_SLUG}`,
  ])
})

// ─── Bug mechanism at the public read boundary ───────────────────────────────
//
// The reported bug: Admin Save succeeds (root row + draft revision carry the
// new title), but the public Package page kept rendering the old title because
// public reads resolve KP titles exclusively through the CURRENT PUBLISHED
// revision. These cases pin the read contract the fix relies on: the public
// title flips only when the edited revision becomes the current published one.

function publishedCardRow(packageId: string, overrides: Record<string, unknown> = {}) {
  return {
    package_id: packageId,
    package_slug: `package-${packageId.slice(-2)}`,
    summary_id: SUMMARY_ID,
    summary_code: 'SUM-000201',
    summary_slug: OLD_SLUG,
    title: OLD_TITLE,
    subject: 'agriculture',
    topic: 'policy',
    read_time_minutes: 5,
    display_order: 10,
    released_at: '2026-08-03T00:00:00.000Z',
    published_at: '2026-08-04T00:00:00.000Z',
    ...overrides,
  }
}

function publishedRootRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SUMMARY_ID,
    summary_code: 'SUM-000201',
    is_published: true,
    lifecycle_status: 'active',
    current_published_version_id: PUBLISHED_VERSION_ID,
    ...overrides,
  }
}

function publishedRouteRow(packageId: string, overrides: Record<string, unknown> = {}) {
  return {
    summary_id: SUMMARY_ID,
    summary_code: 'SUM-000201',
    canonical_slug: 'canonical-summary',
    canonical_title: OLD_TITLE,
    subject: 'agriculture',
    topic: 'policy',
    law: null,
    visibility: 'product_entitled',
    summary_lifecycle_status: 'active',
    package_id: packageId,
    package_slug: `package-${packageId.slice(-2)}`,
    package_name: 'Package',
    placement_status: 'active',
    version_policy: 'latest_published',
    pinned_summary_version_id: null,
    sort_order: 1,
    display_order: 10,
    navigation_label: null,
    legacy_slug: OLD_SLUG,
    summary_version_id: PUBLISHED_VERSION_ID,
    revision_number: 1,
    version_status: 'published',
    version_title: OLD_TITLE,
    version_subject: 'agriculture',
    version_topic: 'policy',
    version_law: null,
    content_md: '# Old published content',
    content_checksum: 'checksum-1',
    read_time_minutes: 5,
    version_published_at: '2026-08-04T00:00:00.000Z',
    source_citations: [],
    ...overrides,
  }
}

function routeRequest(packageId: string, summarySlug: string) {
  return {
    packageId,
    packageSlug: `package-${packageId.slice(-2)}`,
    packageName: 'Package',
    summarySlug,
  }
}

test('before republish, both public Package cards still render the published (old) title', () => {
  // The public Package page merges rows per Package, exactly as below.
  for (const packageId of [PACKAGE_A, PACKAGE_B]) {
    const rows = mergePublicSummaryListRows(
      [],
      [publishedCardRow(packageId)],
      packageId,
      [publishedRootRow()],
    )

    assert.equal(rows.length, 1)
    assert.equal(rows[0]!.title, OLD_TITLE)
  }
})

test('after the edited revision is promoted, every member Package renders the new title', () => {
  const promoted = {
    summary_version_id: EDITED_VERSION_ID,
    current_published_version_id: EDITED_VERSION_ID,
  }

  // One edited Summary shared by two Packages flips on both pages.
  for (const packageId of [PACKAGE_A, PACKAGE_B]) {
    const rows = mergePublicSummaryListRows(
      [],
      [publishedCardRow(packageId, { title: NEW_TITLE, ...promoted })],
      packageId,
      [publishedRootRow(promoted)],
    )

    assert.equal(rows.length, 1)
    assert.equal(rows[0]!.title, NEW_TITLE)
  }
})

test('the Summary detail route resolves the old title before the promotion', () => {
  const detail = resolvePublicSummaryRouteRows(
    [],
    [publishedRouteRow(PACKAGE_A)],
    routeRequest(PACKAGE_A, OLD_SLUG),
    [publishedRootRow()],
  )

  assert.ok(detail)
  assert.equal(detail.title, OLD_TITLE)
})

test('the Summary detail route resolves the new title after the promotion', () => {
  const detail = resolvePublicSummaryRouteRows(
    [],
    [publishedRouteRow(PACKAGE_A, {
      legacy_slug: NEW_SLUG,
      summary_version_id: EDITED_VERSION_ID,
      revision_number: 2,
      version_title: NEW_TITLE,
      canonical_title: NEW_TITLE,
      content_md: '# New published content',
      content_checksum: 'checksum-2',
    })],
    routeRequest(PACKAGE_A, NEW_SLUG),
    [publishedRootRow({ current_published_version_id: EDITED_VERSION_ID })],
  )

  assert.ok(detail)
  assert.equal(detail.title, NEW_TITLE)
})

// ─── Server action wiring contract ───────────────────────────────────────────

const actionsSource = readFileSync(
  join(process.cwd(), 'app/admin/summaries/actions.ts'),
  'utf8',
)

function getActionBody(actionName: string): string {
  const start = actionsSource.indexOf(`export async function ${actionName}`)
  assert.notEqual(start, -1, `${actionName} must exist`)

  const nextAction = actionsSource.indexOf('\nexport async function ', start + 1)
  return actionsSource.slice(start, nextAction === -1 ? actionsSource.length : nextAction)
}

test('a saved edit of a published KP-native Summary promotes the edited revision', () => {
  const update = getActionBody('updateSummary')

  assert.match(update, /shouldRepublishEditedSummary\(\s*selection\.summaryKind,\s*summary\.wasPublished\s*\)/)
  // Publication flows through the central dispatch, exactly like the Publish
  // control; the edit itself never calls the publication writers directly.
  assert.match(update, /dispatchSummaryPublication\(\{\s*summary,\s*actorId: user\.id,\s*isPublished: true,\s*writer,\s*\}\)/)
  assert.doesNotMatch(update, /writer\.(?:publish|unpublish)\(/)
  // A failed promotion must be reported, never silently swallowed.
  assert.match(update, /Summary saved, but publishing the updated revision failed\./)
})

test('Summary mutations invalidate real public Package routes for old and new state', () => {
  const update = getActionBody('updateSummary')
  const create = getActionBody('createSummary')
  const toggle = getActionBody('toggleSummaryPublish')

  // Slug-based targeted invalidation (public routes are /package/<slug>).
  assert.match(update, /revalidateSummaryPackages\(\s*supabase,/)
  assert.match(update, /\[summary\.slug,\s*input\.slug\]/)
  assert.match(create, /revalidateSummaryPackages\(\s*supabase,\s*selection\.packageIds,/)
  assert.match(toggle, /revalidateSummaryPackages\(\s*supabase,\s*affectedPackageIds,/)
  assert.match(actionsSource, /buildSummaryRevalidationPaths\(/)

  // The removed UUID-targeting bug: /package/<packageId> never matches a route.
  assert.doesNotMatch(actionsSource, /revalidatePath\(`\/package\/\$\{packageId\}`\)/)
  assert.doesNotMatch(actionsSource, /revalidatePath\(`\/package\/\$\{packageId\}\/summary\//)

  // Fallback when slugs cannot be resolved, so pages can never stay stale.
  assert.match(actionsSource, /revalidatePath\('\/package', 'layout'\)/)
})
