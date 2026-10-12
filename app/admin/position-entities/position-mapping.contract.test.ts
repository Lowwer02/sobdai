import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(path, 'utf8')
const action = read('app/admin/position-entities/actions.ts')
const form = read('app/admin/position-entities/PositionEntityForm.tsx')
const createPage = read('app/admin/position-entities/create/page.tsx')
const editPage = read('app/admin/position-entities/[id]/edit/page.tsx')
const unmappedPage = read('app/admin/position-entities/unmapped/page.tsx')

const rpcCallCount = action.match(/supabase\.rpc\(\s*'replace_position_entity_mappings'/g)?.length ?? 0

test('Position mapping action reloads operational fields and uses the atomic RPC', () => {
  assert.match(action, /select\('id, code, name, organization_id, position_entity_id'\)/)
  assert.match(action, /validatePositionMappingSelection/)
  assert.equal(rpcCallCount, 1, 'the RPC must have exactly one call site (single mapping write path)')
  assert.doesNotMatch(action, /clearError|linkError/)
  assert.doesNotMatch(action, /\.from\('positions'\)\s*\.update/)
})

test('editorial save and mapping save are separate actions (split-safe workflow)', () => {
  // Editorial action never touches mappings; mapping writes go through the
  // owner-only action so an RPC failure cannot be mistaken for a failed
  // editorial save and the two requests are never presented as atomic.
  assert.match(action, /export async function savePositionEntityAction/)
  assert.match(action, /export async function replacePositionEntityMappingsAction/)
  assert.match(action, /export async function searchOperationalPositionsAction/)
  assert.doesNotMatch(action, /getAll\('position_ids'\)/)
  assert.doesNotMatch(form, /name="position_ids"/)
})

test('mapping write stays owner-gated in the app on top of the RPC owner check', () => {
  const rpcCalls = (action.match(/requirePermission\('system\.manage'\)/g) ?? []).length
  assert.ok(rpcCalls >= 2, 'editorial save and mapping replace must both gate on system.manage')
  assert.match(action, /requirePermission\('content\.read'\)/)
  assert.match(action, /เลือกตำแหน่งได้ไม่เกิน 2,000 รายการ/)
})

test('mapping save detects stale loaded state and never silently overwrites', () => {
  assert.match(action, /stale: true/)
  assert.match(action, /currentIds/)
  assert.match(action, /position_entity_id', entityId\)/)
  // The rejection message must tell the operator what happened and force a re-review.
  assert.match(action, /ถูกเปลี่ยนแปลงจากที่อื่นระหว่างที่คุณกำลังแก้ไข/)
})

test('conflicting ownership is rejected with the owning entity named', () => {
  assert.match(action, /position_entities'\)\s*\n?\s*\.select\('id, name, slug'\)/)
  assert.match(action, /ถูก map กับ Position Entity อื่นแล้ว/)
  assert.match(action, /already owned by another Position Entity/i)
})

test('picker search is server-side, paginated, placeholder-free, and ownership-aware', () => {
  assert.match(action, /POSITION_MAPPING_SEARCH_PAGE_SIZE/)
  assert.match(action, /excludePlaceholderPositions/)
  assert.match(action, /position_entities\(id, slug, name\)/)
  assert.match(action, /name\.ilike\.%\$\{search\}%,code\.ilike\.%\$\{search\}%/)
  assert.match(action, /hasMore/)
})

test('mapping save revalidates targeted public surfaces including agencies', () => {
  assert.match(action, /revalidatePath\('\/positions'\)/)
  assert.match(action, /revalidatePath\('\/sitemap\.xml'\)/)
  assert.match(action, /agency_profiles!\(inner\)|agency_profiles!inner/)
  assert.match(action, /revalidatePath\(`\/agencies\/\$\{encodeURIComponent\(slug\)\}`\)/)
  // Draft-only saves keep public caches untouched.
  assert.match(action, /entity\.status === 'published'/)
})

test('form diffs the full loaded set and confirms removals before saving', () => {
  assert.match(form, /computeMappingDiff/)
  assert.match(form, /ConfirmDialog/)
  assert.match(form, /requireTyping=\{emptiesAllMappings/)
  assert.match(form, /แทนที่ชุด mapping ทั้งหมด/)
  assert.match(form, /เพิ่ม \{mappingDiff\.addedIds\.length\} · ถอด \{mappingDiff\.removedIds\.length\}/)
  // Debounced server search with stale-response guard (ArticlePackagePicker pattern).
  assert.match(form, /300/)
  assert.match(form, /requestIdRef/)
  // Selection never submits via hidden inputs; it goes through the typed action.
  assert.match(form, /replacePositionEntityMappingsAction/)
  // 2,000-position RPC cap is enforced client-side too.
  assert.match(form, /MAX_MAPPED_POSITIONS = 2000/)
  // No browser Supabase client: all reads/writes go through server actions.
  assert.doesNotMatch(form, /@\/lib\/supabase\/client/)
})

test('create and edit pages load ownership metadata instead of all-position checkbox lists', () => {
  assert.match(editPage, /position_entity_id', id\)/)
  assert.match(editPage, /organizations\(id, name, short_name\)/)
  assert.doesNotMatch(editPage, /\.from\('positions'\)\s*\n\s*\.select\([^\)]*\)\s*\n\s*\.order\('name'/)
  assert.match(createPage, /loadedPositions=\{\[\]\}/)
  for (const page of [createPage, editPage]) {
    assert.match(page, /requirePermission\('system\.manage'\)/)
    assert.doesNotMatch(page, /isOperationalPositionPlaceholder/)
  }
  // The report page is linked for discoverability.
  assert.match(read('app/admin/position-entities/PositionEntitiesClient.tsx'), /\/admin\/position-entities\/unmapped/)
})

test('unmapped report is read-only, paginated, and placeholder-free', () => {
  assert.match(unmappedPage, /requirePermission\('content\.read'\)/)
  assert.match(unmappedPage, /\.is\('position_entity_id', null\)/)
  assert.match(unmappedPage, /excludePlaceholderPositions/)
  assert.match(unmappedPage, /isOperationalPositionPlaceholder/)
  assert.match(unmappedPage, /count: 'exact'/)
  assert.match(unmappedPage, /const PAGE_SIZE = 15/)
  assert.match(unmappedPage, /\.range\(from,/)
  assert.match(unmappedPage, /\/admin\/position-entities\//)
  assert.doesNotMatch(unmappedPage, /\.rpc\(|\.update\(|\.insert\(|\.upsert\(|\.delete\(/)
})

test('"use server" module exports only async functions', () => {
  assert.match(action, /^['"]use server['"]/m)
  const runtimeExports = action
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('export ') && !line.startsWith('export type'))
  assert.ok(runtimeExports.length > 0, 'expected at least one server action export')
  for (const line of runtimeExports) {
    assert.match(line, /^export async function/, `non-async runtime export: ${line}`)
  }
})
