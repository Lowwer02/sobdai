import { requirePermission } from '@/lib/auth/server-protect'
import { parseWrittenExamUpload, saveWrittenExamDraft } from './actions'
import ImportClient from './ImportClient'

export default async function WrittenExamImportPage() {
  await requirePermission('content.read')

  return (
    <ImportClient
      parseWrittenExamUpload={parseWrittenExamUpload}
      saveWrittenExamDraft={saveWrittenExamDraft}
    />
  )
}
