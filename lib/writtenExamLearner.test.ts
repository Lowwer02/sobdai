import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node's strip-types test runner requires an explicit TS extension.
import { discoverPublishedWrittenExamMaterials, getWrittenExamPackageEntitlement, normalizeWrittenExamDiscoveryRows, normalizeWrittenExamLearnerRows, readPublishedWrittenExamForLearner, selectWrittenExamQuestionIndex, type WrittenExamLearnerQuestion } from './writtenExamLearner.ts'

function questionRow(number: number, overrides: Record<string, unknown> = {}) {
  return {
    package_slug: 'public-package',
    material_slug: 'written-exam-set-1',
    material_title: 'ชุดข้อสอบอัตนัย',
    revision_number: 3,
    question_number: number,
    question_markdown: `โจทย์ข้อ ${number}`,
    model_answer_markdown: `แนวคำตอบข้อ ${number}`,
    keywords: [`keyword-${number}`],
    answer_structure_markdown: `โครงสร้างข้อ ${number}`,
    memory_technique_markdown: `เทคนิคข้อ ${number}`,
    ...overrides,
  }
}

test('normalizes discovery metadata, orders it deterministically, and bounds it', () => {
  const rows = Array.from({ length: 22 }, (_, index) => ({
    material_slug: `material-${String(22 - index).padStart(2, '0')}`,
    material_title: `ชุด ${String(22 - index).padStart(2, '0')}`,
    question_count: 1,
  }))

  rows.push(
    { material_slug: 'draft-only', material_title: 'ร่าง', question_count: 0 },
    { material_slug: 'invalid', material_title: 'ไม่สมบูรณ์', question_count: 201 },
    { material_slug: '', material_title: 'ไม่มี slug', question_count: 1 },
  )

  const result = normalizeWrittenExamDiscoveryRows(rows)

  assert.equal(result.length, 20)
  assert.equal(result[0]?.materialSlug, 'material-01')
  assert.equal(result.at(-1)?.materialSlug, 'material-20')
  assert.deepEqual(Object.keys(result[0] ?? {}).sort(), ['materialSlug', 'questionCount', 'title'])
})

test('normalizes only the learner projection and safely omits optional sections', () => {
  const material = normalizeWrittenExamLearnerRows([
    questionRow(2, {
      answer_structure_markdown: null,
      memory_technique_markdown: undefined,
      source_md: 'must never be returned',
      source_checksum: 'must never be returned',
      created_by: 'must never be returned',
    }),
    questionRow(1),
    questionRow(1, { question_markdown: 'duplicate must lose to first row' }),
    questionRow(3, { material_slug: 'other-material' }),
  ])

  assert.ok(material)
  assert.deepEqual(material?.questions.map((question) => question.questionNumber), [1, 2])
  assert.equal(material?.questions[1]?.answerStructureMarkdown, '')
  assert.equal(material?.questions[1]?.memoryTechniqueMarkdown, '')
  assert.equal('source_md' in (material ?? {}), false)
  assert.equal('source_checksum' in (material ?? {}), false)
  assert.equal('created_by' in (material ?? {}), false)
  assert.equal(material?.questions[0]?.questionMarkdown, 'โจทย์ข้อ 1')
})

test('learner content adapter calls only the 082 content RPC', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      return { data: [questionRow(1)], error: null }
    },
  }

  const result = await readPublishedWrittenExamForLearner(
    client,
    'public-package',
    'written-exam-set-1',
  )

  assert.equal(result.status, 'success')
  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.name, 'get_published_written_exam_for_learner')
  assert.deepEqual(calls[0]?.args, {
    p_package_slug: 'public-package',
    p_material_slug: 'written-exam-set-1',
  })
})

test('discovery adapter calls only the new metadata RPC and maps RPC errors safely', async () => {
  const calls: string[] = []
  const client = {
    rpc: async (name: string) => {
      calls.push(name)
      return {
        data: [{ material_slug: 'written-exam-set-1', material_title: 'ชุดอัตนัย', question_count: 2 }],
        error: null,
      }
    },
  }

  assert.deepEqual(await discoverPublishedWrittenExamMaterials(client, 'public-package'), [{
    materialSlug: 'written-exam-set-1',
    title: 'ชุดอัตนัย',
    questionCount: 2,
  }])
  assert.deepEqual(calls, ['get_published_written_exam_materials_for_package'])

  const failed = await readPublishedWrittenExamForLearner(
    {
      rpc: async () => ({ data: null, error: { code: 'PGRST000' } }),
    },
    'public-package',
    'written-exam-set-1',
  )
  assert.equal(failed.status, 'error')
})

test('question navigation falls back safely for missing, invalid, and out-of-range values', () => {
  const questions: WrittenExamLearnerQuestion[] = [
    learnerQuestion(1),
    learnerQuestion(2),
    learnerQuestion(3),
  ]

  assert.equal(selectWrittenExamQuestionIndex(undefined, questions), 0)
  assert.equal(selectWrittenExamQuestionIndex('not-a-number', questions), 0)
  assert.equal(selectWrittenExamQuestionIndex('0', questions), 0)
  assert.equal(selectWrittenExamQuestionIndex('2', questions), 1)
  assert.equal(selectWrittenExamQuestionIndex('999', questions), 2)
})

function learnerQuestion(number: number): WrittenExamLearnerQuestion {
  return {
    questionNumber: number,
    questionMarkdown: `โจทย์ข้อ ${number}`,
    modelAnswerMarkdown: `แนวคำตอบข้อ ${number}`,
    keywords: [`keyword-${number}`],
    answerStructureMarkdown: `โครงสร้างข้อ ${number}`,
    memoryTechniqueMarkdown: `เทคนิคข้อ ${number}`,
  }
}

function fakeAccessClient(
  profileData: unknown,
  profileError: unknown = null,
  orderData: unknown = null,
  orderError: unknown = null,
) {
  const queryFor = (data: unknown, error: unknown) => {
    const query: Record<string, unknown> = {}
    query.select = () => query
    query.eq = () => query
    query.in = () => query
    query.maybeSingle = async () => ({ data, error })
    return query
  }

  return {
    rpc: async () => ({ data: null, error: null }),
    from: (relation: string) => relation === 'profiles'
      ? queryFor(profileData, profileError)
      : queryFor(orderData, orderError),
  }
}

test('entitlement UX mapping mirrors the existing package boundary', async () => {
  assert.equal(
    await getWrittenExamPackageEntitlement(
      fakeAccessClient({ role: 'admin', status: 'active', deleted_at: null }),
      'user-1',
      'package-1',
    ),
    'entitled',
  )
  assert.equal(
    await getWrittenExamPackageEntitlement(
      fakeAccessClient(null, null, { id: 'order-1' }),
      'user-1',
      'package-1',
    ),
    'entitled',
  )
  assert.equal(
    await getWrittenExamPackageEntitlement(
      fakeAccessClient({ role: 'admin', status: 'inactive', deleted_at: null }),
      'user-1',
      'package-1',
    ),
    'not-entitled',
  )
  assert.equal(
    await getWrittenExamPackageEntitlement(
      fakeAccessClient(null, { message: 'database unavailable' }),
      'user-1',
      'package-1',
    ),
    'error',
  )
})
