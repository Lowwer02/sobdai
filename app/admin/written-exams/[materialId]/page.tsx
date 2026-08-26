import { notFound } from 'next/navigation'
import { hasPermission } from '@/lib/auth/rbac'
import { requirePermission } from '@/lib/auth/server-protect'
import {
  isWrittenExamMaterialId,
  mapWrittenExamMaterialDetail,
  mergeWrittenExamVersionRows,
  parseWrittenExamPage,
  WRITTEN_EXAM_CURRENT_QUESTION_ROW_LIMIT,
  WRITTEN_EXAM_CURRENT_REVISION_LIMIT,
  WRITTEN_EXAM_HISTORY_PAGE_SIZE,
} from '@/lib/writtenExamAdmin'
import { parseWrittenExamUpload } from '../import/actions'
import {
  archiveWrittenExamMaterial,
  publishWrittenExamMaterial,
  saveWrittenExamDraftForMaterial,
  updateWrittenExamMaterialTitle,
} from '../actions'
import WrittenExamManageClient from './WrittenExamManageClient'

export default async function WrittenExamManagePage({
  params,
  searchParams,
}: {
  params: Promise<{ materialId: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { supabase, profile } = await requirePermission('content.read')
  const { materialId } = await params
  const historyParams = await searchParams
  const historyPage = parseWrittenExamPage(historyParams.historyPage)
  const historyFrom = (historyPage - 1) * WRITTEN_EXAM_HISTORY_PAGE_SIZE
  const historyTo = historyFrom + WRITTEN_EXAM_HISTORY_PAGE_SIZE - 1

  if (!isWrittenExamMaterialId(materialId)) notFound()

  const [materialResult, currentVersionsResult, historyResult] = await Promise.all([
    supabase
      .from('written_exam_materials')
      .select('id, package_id, slug, title, created_at, updated_at, packages(id, name, package_code, slug)')
      .eq('id', materialId)
      .maybeSingle(),
    supabase
      .from('written_exam_material_versions')
      .select('id, material_id, revision_number, format_version, title, source_filename, status, created_at, updated_at, published_at, archived_at')
      .eq('material_id', materialId)
      .in('status', ['draft', 'published'])
      .order('revision_number', { ascending: false })
      .order('id', { ascending: false })
      .limit(WRITTEN_EXAM_CURRENT_REVISION_LIMIT),
    supabase
      .from('written_exam_material_versions')
      .select('id, material_id, revision_number, format_version, title, source_filename, status, created_at, updated_at, published_at, archived_at', { count: 'exact' })
      .eq('material_id', materialId)
      .order('revision_number', { ascending: false })
      .order('id', { ascending: false })
      .range(historyFrom, historyTo),
  ])

  if (materialResult.error || currentVersionsResult.error || historyResult.error || historyResult.count === null) {
    throw new Error('Written Exam state could not be loaded safely.')
  }
  if (!materialResult.data) notFound()

  // Only current draft/published revisions are allowed to bring full question
  // bodies into the detail view. Historical rows remain metadata-only.
  const currentRevisionIds = (currentVersionsResult.data ?? [])
    .map((version: { id?: unknown }) => version.id)
    .filter((id): id is string => typeof id === 'string')

  let questionRows: unknown[] = []
  if (currentRevisionIds.length > 0) {
    const { data, error } = await supabase
      .from('written_exam_questions')
      .select('id, material_version_id, question_number, question_markdown, model_answer_markdown, keywords, answer_structure_markdown, memory_technique_markdown')
      .in('material_version_id', currentRevisionIds)
      .order('material_version_id', { ascending: true })
      .order('question_number', { ascending: true })
      .range(0, WRITTEN_EXAM_CURRENT_QUESTION_ROW_LIMIT - 1)

    if (error) throw new Error('Written Exam question state could not be loaded safely.')
    questionRows = data ?? []
  }

  const versionRows = mergeWrittenExamVersionRows(
    historyResult.data ?? [],
    currentVersionsResult.data ?? [],
  )
  const material = mapWrittenExamMaterialDetail(materialResult.data, versionRows, questionRows)
  if (!material) notFound()

  return (
    <WrittenExamManageClient
      material={material}
      historyPage={historyPage}
      historyTotalPages={historyResult.count === 0 ? 0 : Math.ceil(historyResult.count / WRITTEN_EXAM_HISTORY_PAGE_SIZE)}
      canPublish={hasPermission(profile.role, 'content.publish')}
      parseWrittenExamUpload={parseWrittenExamUpload}
      saveWrittenExamDraft={saveWrittenExamDraftForMaterial.bind(null, materialId)}
      publishWrittenExam={publishWrittenExamMaterial.bind(null, materialId)}
      archiveWrittenExam={archiveWrittenExamMaterial.bind(null, materialId)}
      updateWrittenExamTitle={updateWrittenExamMaterialTitle.bind(null, materialId)}
    />
  )
}
