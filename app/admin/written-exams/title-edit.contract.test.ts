import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
// @ts-expect-error Node's strip-types test runner requires explicit .ts extensions.
import { getWrittenExamTitleErrorMessage, mapWrittenExamTitleError, normalizeWrittenExamTitleResponse } from '../../../lib/writtenExamAdmin.ts'

const actions = readFileSync(join(process.cwd(), 'app/admin/written-exams/actions.ts'), 'utf8')
const detailPage = readFileSync(join(process.cwd(), 'app/admin/written-exams/[materialId]/page.tsx'), 'utf8')
const manageClient = readFileSync(join(process.cwd(), 'app/admin/written-exams/[materialId]/WrittenExamManageClient.tsx'), 'utf8')

test('title edit success and unauthorized failure stay inside the existing content.write/RPC boundary', () => {
  assert.match(actions, /export async function updateWrittenExamMaterialTitle/)
  assert.match(actions, /requirePermission\('content\.write'\)/)
  assert.match(actions, /update_written_exam_material_title/)
  assert.match(actions, /p_material_id: materialId/)
  assert.doesNotMatch(actions, /p_actor|p_role|p_package|p_slug/)
  assert.doesNotMatch(actions, /\.from\(['"]written_exam_/)
  assert.doesNotMatch(actions, /\.\s*(?:insert|update|delete)\s*\(/)

  assert.deepEqual(
    normalizeWrittenExamTitleResponse({ material_id: '11111111-1111-4111-8111-111111111111', title: 'ชื่อใหม่' }),
    { status: 'success', materialId: '11111111-1111-4111-8111-111111111111', title: 'ชื่อใหม่' },
  )
  assert.equal(mapWrittenExamTitleError({ code: '42501', message: 'permission denied' }), 'authorization-denied')
  assert.match(getWrittenExamTitleErrorMessage('authorization-denied'), /สิทธิ์/)
})

test('admin binds the route material id on the server and the UI submits title only', () => {
  assert.match(detailPage, /updateWrittenExamTitle=\{updateWrittenExamMaterialTitle\.bind\(null, materialId\)\}/)
  assert.match(detailPage, /select\('id, package_id, slug, title, created_at, updated_at/)
  assert.match(manageClient, /updateWrittenExamTitle\(nextTitle\)/)
  assert.match(manageClient, /maxLength=\{300\}/)
  assert.match(manageClient, /แก้ไขชื่อเรื่อง/)
})
