import { requirePermission } from '@/lib/auth/server-protect'
import {
  mapWrittenExamLibraryRows,
  parseWrittenExamPage,
  WRITTEN_EXAM_CURRENT_REVISION_LIMIT,
  WRITTEN_EXAM_LIBRARY_PAGE_SIZE,
} from '@/lib/writtenExamAdmin'
import WrittenExamLibraryClient from './WrittenExamLibraryClient'

export default async function WrittenExamLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { supabase } = await requirePermission('content.read')
  const params = await searchParams
  const page = parseWrittenExamPage(params.page)
  const from = (page - 1) * WRITTEN_EXAM_LIBRARY_PAGE_SIZE
  const to = from + WRITTEN_EXAM_LIBRARY_PAGE_SIZE - 1

  // The nested relation projection is intentionally bounded below. Erase the
  // generated Supabase relation type at this boundary to avoid excessive
  // TypeScript instantiation while keeping the runtime query unchanged.
  const materialsQuery = (supabase as any).from('written_exam_materials')
  const {
    data: materialRows,
    count: materialCount,
    error: materialError,
  } = await materialsQuery
    .select(`
      id,
      package_id,
      slug,
      created_at,
      updated_at,
      packages(id, name, package_code, slug),
      written_exam_material_versions(
        id,
        material_id,
        revision_number,
        format_version,
        title,
        source_filename,
        status,
        created_at,
        updated_at,
        published_at,
        archived_at
      )
    `, { count: 'exact' })
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .order('revision_number', {
      ascending: false,
      referencedTable: 'written_exam_material_versions',
    })
    .order('id', {
      ascending: false,
      referencedTable: 'written_exam_material_versions',
    })
    .limit(WRITTEN_EXAM_CURRENT_REVISION_LIMIT, {
      referencedTable: 'written_exam_material_versions',
    })
    .range(from, to)

  if (materialError || materialCount === null) {
    throw new Error('Written Exam library could not be loaded safely.')
  }

  // Migration 082 permits at most one current draft and one current published
  // row per material. The embedded two-row metadata window therefore contains
  // every state needed for each library card without loading all history.
  const versionRows = (materialRows ?? []).flatMap((row: {
    id?: unknown
    written_exam_material_versions?: unknown
  }) => {
    if (!Array.isArray(row.written_exam_material_versions)) return []
    return row.written_exam_material_versions.map((version) => ({
      ...(typeof version === 'object' && version !== null ? version : {}),
      material_id: typeof row.id === 'string' ? row.id : undefined,
    }))
  })

  const materials = mapWrittenExamLibraryRows(materialRows ?? [], versionRows)

  return (
    <WrittenExamLibraryClient
      materials={materials}
      currentPage={page}
      totalPages={materialCount === 0 ? 0 : Math.ceil(materialCount / WRITTEN_EXAM_LIBRARY_PAGE_SIZE)}
    />
  )
}
