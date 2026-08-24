'use client'

import Link from 'next/link'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  ArrowLeft,
  Archive,
  CheckCircle2,
  FileText,
  History,
  Loader2,
  RotateCcw,
  Save,
  Send,
  UploadCloud,
} from 'lucide-react'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { toastEvent } from '@/hooks/useToast'
import {
  getWrittenExamLifecycleErrorMessage,
  type WrittenExamAdminVersion,
  type WrittenExamLifecycleAction,
  type WrittenExamLifecycleResult,
  type WrittenExamMaterialDetail,
} from '@/lib/writtenExamAdmin'
import {
  getWrittenExamSaveDraftErrorMessage,
  getWrittenExamUploadErrorMessage,
  isSupportedWrittenExamFileName,
  presentWrittenExamIssue,
  type WrittenExamSaveDraftResult,
  type WrittenExamUploadResult,
} from '@/lib/writtenExamImportPreview'
import {
  createWrittenExamImportController,
  runGenerationGuardedOperation,
  type WrittenExamImportController,
  type WrittenExamImportOperation,
} from '@/lib/writtenExamImportGeneration'
import { WrittenExamQuestionPreview } from '../WrittenExamQuestionPreview'

type ManageState =
  | { status: 'empty' }
  | { status: 'parsing'; fileName: string }
  | WrittenExamUploadResult

type ConfirmAction = WrittenExamLifecycleAction | null

type WrittenExamManageClientProps = {
  material: WrittenExamMaterialDetail
  historyPage: number
  historyTotalPages: number
  canPublish: boolean
  parseWrittenExamUpload: (formData: FormData) => Promise<WrittenExamUploadResult>
  saveWrittenExamDraft: (formData: FormData) => Promise<WrittenExamSaveDraftResult>
  publishWrittenExam: () => Promise<WrittenExamLifecycleResult>
  archiveWrittenExam: () => Promise<WrittenExamLifecycleResult>
}

export default function WrittenExamManageClient({
  material,
  historyPage,
  historyTotalPages,
  canPublish,
  parseWrittenExamUpload,
  saveWrittenExamDraft,
  publishWrittenExam,
  archiveWrittenExam,
}: WrittenExamManageClientProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [state, setState] = useState<ManageState>({ status: 'empty' })
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const [operation, setOperation] = useState<WrittenExamImportOperation>(null)
  const [saveResult, setSaveResult] = useState<WrittenExamSaveDraftResult | null>(null)
  const [lifecycleResult, setLifecycleResult] = useState<WrittenExamLifecycleResult | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const controllerRef = useRef<WrittenExamImportController | null>(null)
  if (controllerRef.current === null) controllerRef.current = createWrittenExamImportController()
  const controller = controllerRef.current

  const resetReplacement = () => {
    const snapshot = controller.reset()
    setState({ status: 'empty' })
    setSourceFile(null)
    setSaveResult(null)
    setLifecycleResult(null)
    setOperation(snapshot.operation)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const processFile = (file: File | undefined) => {
    if (!file) return

    const requestGeneration = controller.beginParse()
    setSaveResult(null)
    setLifecycleResult(null)

    if (!isSupportedWrittenExamFileName(file.name)) {
      setState({
        status: 'error',
        fileName: file.name,
        kind: 'unsupported-file',
        message: getWrittenExamUploadErrorMessage('unsupported-file'),
      })
      setSourceFile(null)
      if (controller.finish(requestGeneration)) setOperation(controller.snapshot().operation)
      return
    }

    setState({ status: 'parsing', fileName: file.name })
    setSourceFile(null)
    setOperation(controller.snapshot().operation)

    const formData = new FormData()
    formData.append('file', file, file.name)

    startTransition(() => {
      void runGenerationGuardedOperation(
        controller,
        requestGeneration,
        () => parseWrittenExamUpload(formData),
        {
          onSuccess: (result) => {
            setState(result)
            setSourceFile(result.status === 'success' ? file : null)
          },
          onError: () => {
            setState({
              status: 'error',
              fileName: file.name,
              kind: 'unreadable-file',
              message: getWrittenExamUploadErrorMessage('unreadable-file'),
            })
            setSourceFile(null)
          },
          onFinish: () => setOperation(controller.snapshot().operation),
        },
      )
    })
  }

  const handleSaveDraft = () => {
    if (!sourceFile || state.status !== 'success' || controller.snapshot().operation !== null) return

    const formData = new FormData()
    formData.append('file', sourceFile, sourceFile.name)
    const requestGeneration = controller.beginSave()
    setSaveResult(null)
    setLifecycleResult(null)
    setOperation(controller.snapshot().operation)

    startTransition(() => {
      void runGenerationGuardedOperation(
        controller,
        requestGeneration,
        () => saveWrittenExamDraft(formData),
        {
          onSuccess: (result) => {
            setSaveResult(result)
            if (result.status === 'success') {
              toastEvent(result.idempotentRetry ? 'ฉบับร่างนี้ไม่มีการเปลี่ยนแปลง' : 'บันทึกฉบับร่างสำเร็จ')
              router.refresh()
            }
          },
          onError: () => {
            setSaveResult({
              status: 'error',
              kind: 'unexpected',
              message: getWrittenExamSaveDraftErrorMessage('unexpected'),
            })
          },
          onFinish: () => setOperation(controller.snapshot().operation),
        },
      )
    })
  }

  const confirmLifecycle = () => {
    if (!confirmAction || controller.snapshot().operation !== null) return

    const action = confirmAction
    setConfirmAction(null)
    const requestGeneration = action === 'publish' ? controller.beginPublish() : controller.beginArchive()
    setSaveResult(null)
    setLifecycleResult(null)
    setOperation(controller.snapshot().operation)

    startTransition(() => {
      void runGenerationGuardedOperation(
        controller,
        requestGeneration,
        action === 'publish' ? publishWrittenExam : archiveWrittenExam,
        {
          onSuccess: (result) => {
            setLifecycleResult(result)
            if (result.status === 'success') {
              toastEvent(action === 'publish' ? 'เผยแพร่ Written Exam สำเร็จ' : 'เก็บถาวร Written Exam สำเร็จ')
              router.refresh()
            }
          },
          onError: () => {
            setLifecycleResult({
              status: 'error',
              action,
              kind: 'unexpected',
              message: getWrittenExamLifecycleErrorMessage('unexpected'),
            })
          },
          onFinish: () => setOperation(controller.snapshot().operation),
        },
      )
    })
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    processFile(file)
  }

  const isParsing = state.status === 'parsing' || operation === 'parse'
  const isSaving = operation === 'save'
  const isLifecycleBusy = operation === 'publish' || operation === 'archive'
  const isBusy = isPending || operation !== null

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/admin/written-exams" className="inline-flex items-center gap-2 text-sm font-bold text-[#D4AF37] hover:text-[#F1D17A]">
            <ArrowLeft size={16} aria-hidden="true" />
            กลับไปคลัง Written Exam
          </Link>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-[#D4AF37]">Written Exam · Manage</p>
          <h1 className="mt-2 break-words text-3xl font-bold font-display tracking-tight text-[#F5E9D6]">{material.title}</h1>
          <p className="mt-2 break-all text-sm text-[#A1866B]">/{material.slug}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {material.currentDraft && canPublish && (
            <button
              type="button"
              onClick={() => setConfirmAction('publish')}
              disabled={isBusy}
              className="inline-flex items-center gap-2 rounded-xl bg-[#22C55E] px-4 py-2.5 text-sm font-bold text-[#07150B] transition-colors hover:bg-[#4ADE80] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send size={16} aria-hidden="true" />
              เผยแพร่ฉบับร่าง
            </button>
          )}
          {material.currentPublished && canPublish && (
            <button
              type="button"
              onClick={() => setConfirmAction('archive')}
              disabled={isBusy}
              className="inline-flex items-center gap-2 rounded-xl border border-red-400/30 px-4 py-2.5 text-sm font-bold text-red-300 transition-colors hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Archive size={16} aria-hidden="true" />
              เก็บถาวรฉบับเผยแพร่
            </button>
          )}
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard label="Package" value={material.package?.name ?? 'ไม่ระบุ package'} detail={material.package?.packageCode} />
        <InfoCard label="สถานะปัจจุบัน" value={getStatusLabel(material.status)} detail={material.revisionNumber ? `Revision ${material.revisionNumber}` : undefined} />
        <InfoCard label="ปรับปรุงล่าสุด" value={formatDate(material.updatedAt)} />
        <InfoCard label="สร้างเมื่อ" value={formatDate(material.createdAt)} />
      </section>

      {saveResult?.status === 'error' && <InlineError title="บันทึกฉบับร่างไม่สำเร็จ" message={saveResult.message} />}
      {lifecycleResult?.status === 'error' && <InlineError title="เปลี่ยนสถานะไม่สำเร็จ" message={lifecycleResult.message} />}
      {lifecycleResult?.status === 'success' && (
        <div className="rounded-xl border border-[#22C55E]/25 bg-[#22C55E]/5 p-4 text-sm text-[#86EFAC]" role="status">
          {lifecycleResult.action === 'publish' ? 'เผยแพร่ฉบับร่างแล้ว' : 'เก็บถาวรฉบับเผยแพร่แล้ว'} ระบบโหลดสถานะล่าสุดจากฐานข้อมูลแล้ว
        </div>
      )}

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="space-y-8">
          <RevisionSummary title="ฉบับร่างปัจจุบัน" version={material.currentDraft} emptyMessage="ยังไม่มีฉบับร่าง" />
          <RevisionSummary title="ฉบับที่เผยแพร่ปัจจุบัน" version={material.currentPublished} emptyMessage="ยังไม่มีฉบับที่เผยแพร่" />
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-[#D4AF37]/25 bg-[#1A140E] p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <UploadCloud className="mt-0.5 shrink-0 text-[#D4AF37]" size={22} aria-hidden="true" />
              <div>
                <h2 className="text-xl font-bold font-display text-[#F5E9D6]">แทนที่ด้วย Markdown</h2>
                <p className="mt-1 text-sm leading-6 text-[#A1866B]">อัปโหลดไฟล์ใหม่เพื่อให้เซิร์ฟเวอร์อ่านและตรวจด้วย Parser V1 ก่อนบันทึก</p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.markdown,text/markdown"
              className="sr-only"
              aria-label="เลือกไฟล์ Written Exam Markdown ฉบับแก้ไข"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isBusy}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#D4AF37]/35 px-4 py-3 text-sm font-bold text-[#D4AF37] transition-colors hover:border-[#D4AF37] hover:bg-[#D4AF37]/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileText size={17} aria-hidden="true" />
              เลือกไฟล์ .md หรือ .markdown
            </button>
            <p className="mt-3 text-xs leading-5 text-[#A1866B]">รองรับไฟล์ไม่เกิน 1 MiB ตามขอบเขต Parser V1 · package และ slug ต้องตรงกับรายการเดิม</p>
          </section>

          {isParsing && state.status === 'parsing' && <ParsingState fileName={state.fileName} />}
          {state.status === 'error' && !isParsing && <UploadErrorState result={state} onReset={resetReplacement} />}
          {state.status === 'invalid' && !isParsing && <ParserErrorState result={state} onReset={resetReplacement} />}
          {state.status === 'success' && !isParsing && (
            <ReplacementPreview
              result={state}
              isSaving={isSaving}
              onSaveDraft={handleSaveDraft}
              onReset={resetReplacement}
              saveResult={saveResult}
            />
          )}
          {state.status === 'empty' && <EmptyReplacementState />}
        </div>
      </div>

      <RevisionHistory
        materialId={material.id}
        versions={material.versions}
        currentPage={historyPage}
        totalPages={historyTotalPages}
      />

      <ConfirmDialog
        isOpen={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        onConfirm={confirmLifecycle}
        title={confirmAction === 'publish' ? 'ยืนยันการเผยแพร่' : 'ยืนยันการเก็บถาวร'}
        description={confirmAction === 'publish'
          ? 'ระบบจะเปลี่ยนฉบับร่างที่ตรวจสอบแล้วเป็นฉบับที่เผยแพร่ และเก็บฉบับเผยแพร่เดิมตาม lifecycle ของ Written Exam'
          : 'ระบบจะเก็บฉบับที่เผยแพร่ไว้ในประวัติ โดยไม่ลบข้อมูลถาวร'}
        confirmText={confirmAction === 'publish' ? 'เผยแพร่' : 'เก็บถาวร'}
        cancelText="ยกเลิก"
        isDestructive={confirmAction === 'archive'}
        isLoading={isLifecycleBusy}
      />
    </div>
  )
}

function RevisionSummary({
  title,
  version,
  emptyMessage,
}: {
  title: string
  version: WrittenExamAdminVersion | null
  emptyMessage: string
}) {
  if (!version) {
    return (
      <section className="rounded-2xl border border-[rgba(212,175,55,0.15)] bg-[#1A140E] p-6 shadow-xl">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#D4AF37]">{title}</p>
        <p className="mt-4 text-sm text-[#A1866B]">{emptyMessage}</p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-[rgba(212,175,55,0.15)] bg-[#1A140E] p-6 shadow-xl md:p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#D4AF37]">{title}</p>
          <h2 className="mt-1 text-xl font-bold font-display text-[#F5E9D6]">{version.title}</h2>
        </div>
        <StatusPill status={version.status} />
      </div>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
        <Definition label="Revision" value={`v${version.revisionNumber}`} />
        <Definition label="จำนวนข้อ" value={version.questionCount === null ? '—' : version.questionCount.toLocaleString()} />
        <Definition label="ปรับปรุง" value={formatDate(version.updatedAt)} />
      </dl>
      <div className="mt-6 space-y-5">
        {version.questions.map((question) => (
          <WrittenExamQuestionPreview
            key={`${version.id}-${question.id}`}
            question={{ ...question, order: question.questionNumber }}
          />
        ))}
      </div>
    </section>
  )
}

function RevisionHistory({
  materialId,
  versions,
  currentPage,
  totalPages,
}: {
  materialId: string
  versions: WrittenExamAdminVersion[]
  currentPage: number
  totalPages: number
}) {
  return (
    <section className="rounded-2xl border border-[rgba(212,175,55,0.15)] bg-[#1A140E] shadow-xl">
      <div className="flex items-center gap-3 border-b border-[rgba(255,255,255,0.06)] px-6 py-5">
        <History className="text-[#D4AF37]" size={20} aria-hidden="true" />
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#D4AF37]">Revision history</p>
          <h2 className="mt-1 text-xl font-bold font-display text-[#F5E9D6]">ประวัติฉบับ</h2>
        </div>
      </div>
      {versions.length === 0 ? (
        <p className="p-6 text-sm text-[#A1866B]">ยังไม่มีประวัติ revision</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-[rgba(255,255,255,0.06)] text-xs uppercase tracking-wider text-[#A1866B]">
              <tr>
                <th className="px-6 py-4 font-semibold">Revision</th>
                <th className="px-6 py-4 font-semibold">ชื่อเรื่อง</th>
                <th className="px-6 py-4 font-semibold">สถานะ</th>
                <th className="px-6 py-4 font-semibold">ข้อ</th>
                <th className="px-6 py-4 font-semibold">เวลา</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(255,255,255,0.06)]">
              {versions.map((version) => (
                <tr key={version.id}>
                  <td className="px-6 py-4 font-mono text-[#D4AF37]">v{version.revisionNumber}</td>
                  <td className="px-6 py-4 text-[#D6CBB8]">{version.title}</td>
                  <td className="px-6 py-4"><StatusPill status={version.status} /></td>
                  <td className="px-6 py-4 text-[#D6CBB8]">{version.questionCount === null ? '—' : version.questionCount.toLocaleString()}</td>
                  <td className="px-6 py-4 text-xs text-[#A1866B]">{formatDate(version.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-[rgba(255,255,255,0.06)] px-6 py-4" aria-label="หน้าประวัติ Written Exam">
          {currentPage > 1 ? (
            <Link
              href={writtenExamHistoryPageHref(materialId, currentPage - 1)}
              className="rounded-lg border border-[rgba(255,255,255,0.1)] px-3 py-2 text-xs font-bold text-[#D6CBB8] hover:border-[#D4AF37]/50 hover:text-[#D4AF37]"
            >
              ก่อนหน้า
            </Link>
          ) : <span />}
          <span className="text-xs text-[#A1866B]">หน้า {currentPage} / {totalPages}</span>
          {currentPage < totalPages ? (
            <Link
              href={writtenExamHistoryPageHref(materialId, currentPage + 1)}
              className="rounded-lg border border-[rgba(255,255,255,0.1)] px-3 py-2 text-xs font-bold text-[#D6CBB8] hover:border-[#D4AF37]/50 hover:text-[#D4AF37]"
            >
              ถัดไป
            </Link>
          ) : <span />}
        </div>
      )}
    </section>
  )
}

function writtenExamHistoryPageHref(materialId: string, page: number): string {
  return page <= 1
    ? `/admin/written-exams/${materialId}`
    : `/admin/written-exams/${materialId}?historyPage=${page}`
}

function ReplacementPreview({
  result,
  isSaving,
  onSaveDraft,
  onReset,
  saveResult,
}: {
  result: Extract<WrittenExamUploadResult, { status: 'success' }>
  isSaving: boolean
  onSaveDraft: () => void
  onReset: () => void
  saveResult: WrittenExamSaveDraftResult | null
}) {
  const metadata = result.material.metadata
  if (!metadata) return <InlineError title="ไม่สามารถแสดงตัวอย่างได้" message="ไม่พบ metadata ที่จำเป็นจาก Parser V1" />

  return (
    <section className="space-y-5 rounded-2xl border border-[#22C55E]/25 bg-[#1A140E] p-6 shadow-xl">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 shrink-0 text-[#22C55E]" size={22} aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="text-xl font-bold font-display text-[#F5E9D6]">ตรวจสอบผ่าน — ตัวอย่างฉบับใหม่</h2>
          <p className="mt-1 break-all text-xs text-[#A1866B]">ไฟล์: {result.fileName}</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <InfoCard label="ชื่อเรื่อง" value={metadata.title} />
        <InfoCard label="package_code" value={metadata.packageCode} />
        <InfoCard label="slug" value={metadata.slug} />
        <InfoCard label="จำนวนข้อ" value={result.material.derived.questionCount.toLocaleString()} />
      </div>
      <div className="rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/5 p-4 text-sm leading-6 text-[#E5C86B]">
        การบันทึกจะส่ง material_id เดิมไปยัง RPC เพื่อคง package binding และ slug ของรายการนี้
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onSaveDraft}
          disabled={isSaving}
          className="inline-flex items-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-2.5 text-sm font-bold text-[#1A140E] transition-colors hover:bg-[#F1D17A] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? <Loader2 className="animate-spin" size={17} aria-hidden="true" /> : <Save size={17} aria-hidden="true" />}
          {isSaving ? 'กำลังบันทึก…' : 'บันทึกฉบับร่างแทนที่'}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={isSaving}
          className="inline-flex items-center gap-2 rounded-xl border border-[#D4AF37]/30 px-4 py-2.5 text-sm font-bold text-[#D4AF37] transition-colors hover:border-[#D4AF37] hover:bg-[#D4AF37]/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw size={16} aria-hidden="true" />
          เลือกไฟล์ใหม่
        </button>
      </div>
      {saveResult?.status === 'success' && (
        <div className="rounded-xl border border-[#22C55E]/25 bg-[#22C55E]/5 p-4 text-sm text-[#86EFAC]" role="status">
          {saveResult.idempotentRetry ? 'ไม่มีการเปลี่ยนแปลง — ใช้ฉบับร่างเดิมแล้ว' : 'บันทึกฉบับร่างแทนที่สำเร็จ'} · Revision v{saveResult.revisionNumber} · {saveResult.questionCount.toLocaleString()} ข้อ
        </div>
      )}
      <div className="space-y-4">
        {result.material.questions.map((question) => (
          <WrittenExamQuestionPreview key={`${question.questionNumber}-${question.order}`} question={question} />
        ))}
      </div>
    </section>
  )
}

function UploadErrorState({
  result,
  onReset,
}: {
  result: Extract<WrittenExamUploadResult, { status: 'error' }>
  onReset: () => void
}) {
  return (
    <section className="rounded-2xl border border-red-500/30 bg-[#1A140E] p-6 shadow-xl" role="alert">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 shrink-0 text-red-400" size={22} aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="font-bold text-red-300">ไม่สามารถตรวจสอบไฟล์ได้</h2>
          <p className="mt-2 text-sm leading-7 text-[#D6CBB8]">{result.message}</p>
          {result.fileName && <p className="mt-2 break-all text-xs text-[#A1866B]">ไฟล์: {result.fileName}</p>}
        </div>
      </div>
      <ResetButton onReset={onReset} />
    </section>
  )
}

function ParserErrorState({
  result,
  onReset,
}: {
  result: Extract<WrittenExamUploadResult, { status: 'invalid' }>
  onReset: () => void
}) {
  const diagnostics = result.material.issues.map(presentWrittenExamIssue)
  return (
    <section className="space-y-4 rounded-2xl border border-red-500/30 bg-[#1A140E] p-6 shadow-xl" role="alert">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 shrink-0 text-red-400" size={22} aria-hidden="true" />
        <div>
          <h2 className="font-bold text-red-300">ตรวจสอบ Parser V1 ไม่ผ่าน</h2>
          <p className="mt-1 text-sm leading-6 text-[#D6CBB8]">พบข้อผิดพลาด {diagnostics.length.toLocaleString()} รายการในไฟล์ {result.fileName}</p>
        </div>
      </div>
      <ul className="space-y-3">
        {diagnostics.length > 0 ? diagnostics.map((diagnostic, index) => (
          <li key={`${diagnostic.label}-${diagnostic.location}-${index}`} className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
            <div className="flex flex-wrap justify-between gap-2 text-sm font-bold text-red-200">
              <span>{diagnostic.label}</span>
              {diagnostic.location && <span className="text-xs text-red-200/70">{diagnostic.location}</span>}
            </div>
            <p className="mt-2 text-sm leading-6 text-[#D6CBB8]">{diagnostic.detail}</p>
          </li>
        )) : <li className="text-sm text-[#D6CBB8]">เนื้อหาไม่ตรงตามรูปแบบ Written Exam V1</li>}
      </ul>
      <ResetButton onReset={onReset} />
    </section>
  )
}

function ParsingState({ fileName }: { fileName: string }) {
  return (
    <section className="rounded-2xl border border-[rgba(212,175,55,0.2)] bg-[#1A140E] p-8 text-center shadow-xl" role="status" aria-live="polite">
      <Loader2 className="mx-auto animate-spin text-[#D4AF37]" size={32} aria-hidden="true" />
      <p className="mt-4 text-sm text-[#A1866B]">กำลังตรวจสอบ {fileName}</p>
    </section>
  )
}

function EmptyReplacementState() {
  return (
    <section className="rounded-2xl border border-dashed border-[rgba(212,175,55,0.2)] bg-[#1A140E] p-8 text-center">
      <FileText className="mx-auto text-[#D4AF37]" size={30} aria-hidden="true" />
      <p className="mt-3 text-sm leading-6 text-[#A1866B]">เลือกไฟล์ Markdown เพื่อดูตัวอย่างฉบับที่จะบันทึกเป็น draft</p>
    </section>
  )
}

function ResetButton({ onReset }: { onReset: () => void }) {
  return (
    <button type="button" onClick={onReset} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-[#D4AF37]/30 px-4 py-2.5 text-sm font-bold text-[#D4AF37] hover:border-[#D4AF37] hover:bg-[#D4AF37]/10">
      <RotateCcw size={16} aria-hidden="true" />
      เลือกไฟล์ใหม่
    </button>
  )
}

function InlineError({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-4" role="alert">
      <p className="font-bold text-red-200">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[#D6CBB8]">{message}</p>
    </div>
  )
}

function InfoCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-[rgba(255,255,255,0.06)] bg-[#1A140E] p-4">
      <p className="text-xs text-[#A1866B]">{label}</p>
      <p className="mt-1 break-words text-sm font-bold text-[#F5E9D6]">{value}</p>
      {detail && <p className="mt-1 break-all font-mono text-xs text-[#D4AF37]">{detail}</p>}
    </div>
  )
}

function Definition({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-[#A1866B]">{label}</dt><dd className="mt-1 text-[#D6CBB8]">{value}</dd></div>
}

function StatusPill({ status }: { status: WrittenExamAdminVersion['status'] }) {
  const label = status === 'draft' ? 'ฉบับร่าง' : status === 'published' ? 'เผยแพร่แล้ว' : 'เก็บถาวร'
  const classes = status === 'published'
    ? 'border-[#22C55E]/30 bg-[#22C55E]/10 text-[#86EFAC]'
    : status === 'draft'
      ? 'border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#E5C86B]'
      : 'border-[rgba(255,255,255,0.1)] bg-[#0F0B07] text-[#A1866B]'
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${classes}`}>{label}</span>
}

function getStatusLabel(status: WrittenExamMaterialDetail['status']): string {
  return status === 'published' ? 'เผยแพร่แล้ว' : status === 'draft' ? 'ฉบับร่าง' : status === 'archived' ? 'เก็บถาวร' : 'ยังไม่มี revision'
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
