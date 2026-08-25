// @ts-expect-error Node's strip-types test runner requires explicit TS extensions.
import { ORDER_COMPLETED_STATUSES } from './orderUtils.ts'
// @ts-expect-error Node's strip-types test runner requires explicit TS extensions.
import { hasInternalPackageAccess } from './auth/rbac.ts'

export const WRITTEN_EXAM_DISCOVERY_LIMIT = 20
export const WRITTEN_EXAM_QUESTION_LIMIT = 200

export type WrittenExamDiscovery = {
  materialSlug: string
  title: string
  questionCount: number
}

export type WrittenExamLearnerQuestion = {
  questionNumber: number
  questionMarkdown: string
  modelAnswerMarkdown: string
  keywords: string[]
  answerStructureMarkdown: string
  memoryTechniqueMarkdown: string
}

export type WrittenExamLearnerMaterial = {
  packageSlug: string
  materialSlug: string
  title: string
  revisionNumber: number
  questions: WrittenExamLearnerQuestion[]
}

export type WrittenExamContentReadResult =
  | { status: 'success'; material: WrittenExamLearnerMaterial | null }
  | { status: 'error'; error: unknown }

export type PackageEntitlementState = 'entitled' | 'not-entitled' | 'error'

type RpcClient = {
  rpc: (functionName: string, args: Record<string, unknown>) => any
}

type DataClient = RpcClient & {
  from: (relation: string) => any
}

type RecordValue = Record<string, unknown>

export async function discoverPublishedWrittenExamMaterials(
  supabase: RpcClient,
  packageSlug: string,
): Promise<WrittenExamDiscovery[]> {
  const { data, error } = await supabase.rpc(
    'get_published_written_exam_materials_for_package',
    { p_package_slug: packageSlug },
  )

  if (error) throw error
  return normalizeWrittenExamDiscoveryRows(data)
}

/**
 * The only learner content read boundary. The learner route must not query
 * Written Exam persistence tables directly; migration 082 owns publication
 * and entitlement decisions for this call.
 */
export async function readPublishedWrittenExamForLearner(
  supabase: RpcClient,
  packageSlug: string,
  materialSlug: string,
): Promise<WrittenExamContentReadResult> {
  try {
    const { data, error } = await supabase.rpc(
      'get_published_written_exam_for_learner',
      {
        p_package_slug: packageSlug,
        p_material_slug: materialSlug,
      },
    )

    if (error) return { status: 'error', error }
    return {
      status: 'success',
      material: normalizeWrittenExamLearnerRows(data),
    }
  } catch (error) {
    return { status: 'error', error }
  }
}

export async function getWrittenExamPackageEntitlement(
  supabase: DataClient,
  userId: string,
  packageId: string,
): Promise<PackageEntitlementState> {
  try {
    const [profileResult, orderResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('role, status, deleted_at')
        .eq('id', userId)
        .maybeSingle(),
      supabase
        .from('orders')
        .select('id')
        .eq('user_id', userId)
        .eq('package_id', packageId)
        .in('status', ORDER_COMPLETED_STATUSES)
        .maybeSingle(),
    ])

    if (profileResult.error || orderResult.error) return 'error'

    const profile = asRecord(profileResult.data)
    const hasInternalAccess = Boolean(
      profile
      && hasInternalPackageAccess(asString(profile.role))
      && profile.status === 'active'
      && profile.deleted_at === null,
    )

    return hasInternalAccess || Boolean(orderResult.data)
      ? 'entitled'
      : 'not-entitled'
  } catch {
    return 'error'
  }
}

export function normalizeWrittenExamDiscoveryRows(value: unknown): WrittenExamDiscovery[] {
  if (!Array.isArray(value)) return []

  const items = value
    .map((candidate) => {
      const row = asRecord(candidate)
      if (!row) return null

      const materialSlug = asString(row.material_slug)
      const title = asString(row.material_title)
      const questionCount = asInteger(row.question_count)
      if (
        !materialSlug
        || !title
        || questionCount === null
        || questionCount < 1
        || questionCount > WRITTEN_EXAM_QUESTION_LIMIT
      ) return null

      return { materialSlug, title, questionCount }
    })
    .filter((item): item is WrittenExamDiscovery => item !== null)

  // The RPC owns ordering; this second deterministic sort keeps the UI stable
  // if a mocked/client response is reordered before it reaches the component.
  return items
    .sort((left, right) => (
      compareText(left.title, right.title)
      || compareText(left.materialSlug, right.materialSlug)
    ))
    .slice(0, WRITTEN_EXAM_DISCOVERY_LIMIT)
}

export function normalizeWrittenExamLearnerRows(
  value: unknown,
): WrittenExamLearnerMaterial | null {
  if (!Array.isArray(value)) return null

  const rows = value.map(asRecord).filter((row): row is RecordValue => row !== null)
  const first = rows.find((row) => (
    Boolean(asString(row.package_slug))
    && Boolean(asString(row.material_slug))
    && Boolean(asString(row.material_title))
    && (asInteger(row.revision_number) ?? 0) > 0
  ))
  if (!first) return null

  const packageSlug = asString(first.package_slug)!
  const materialSlug = asString(first.material_slug)!
  const title = asString(first.material_title)!
  const revisionNumber = asInteger(first.revision_number)!

  const questionsByNumber = new Map<number, WrittenExamLearnerQuestion>()
  for (const row of rows) {
    if (
      asString(row.package_slug) !== packageSlug
      || asString(row.material_slug) !== materialSlug
    ) continue

    const questionNumber = asInteger(row.question_number)
    const questionMarkdown = asString(row.question_markdown)
    const modelAnswerMarkdown = asString(row.model_answer_markdown)
    if (
      questionNumber === null
      || questionNumber < 1
      || questionNumber > WRITTEN_EXAM_QUESTION_LIMIT
      || !questionMarkdown
      || !modelAnswerMarkdown
      || questionsByNumber.has(questionNumber)
    ) continue

    questionsByNumber.set(questionNumber, {
      questionNumber,
      questionMarkdown,
      modelAnswerMarkdown,
      keywords: normalizeKeywords(row.keywords),
      answerStructureMarkdown: asString(row.answer_structure_markdown) ?? '',
      memoryTechniqueMarkdown: asString(row.memory_technique_markdown) ?? '',
    })
  }

  const questions = [...questionsByNumber.values()]
    .sort((left, right) => left.questionNumber - right.questionNumber)
    .slice(0, WRITTEN_EXAM_QUESTION_LIMIT)

  return {
    packageSlug,
    materialSlug,
    title,
    revisionNumber,
    questions,
  }
}

export function selectWrittenExamQuestionIndex(
  requestedValue: string | string[] | undefined,
  questions: readonly WrittenExamLearnerQuestion[],
): number {
  if (questions.length === 0) return 0

  const requested = firstString(requestedValue)
  const parsed = requested ? Number.parseInt(requested, 10) : 1
  const requestedNumber = Number.isSafeInteger(parsed) && parsed > 0
    ? Math.min(parsed, questions.length)
    : 1

  const exactIndex = questions.findIndex((question) => question.questionNumber === requestedNumber)
  if (exactIndex >= 0) return exactIndex
  return Math.min(requestedNumber - 1, questions.length - 1)
}

function normalizeKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  const keywords: string[] = []
  for (const candidate of value) {
    const keyword = asString(candidate)
    if (keyword && !keywords.includes(keyword)) keywords.push(keyword)
    if (keywords.length >= 30) break
  }
  return keywords
}

function asRecord(value: unknown): RecordValue | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue
    : null
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function asInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null
}

function firstString(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
