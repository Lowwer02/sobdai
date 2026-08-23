'use client'

import { useRef, useState, useTransition } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  RotateCcw,
  UploadCloud,
} from 'lucide-react'
import SummaryMarkdown from '@/components/summary/SummaryMarkdown'
import {
  getWrittenExamUploadErrorMessage,
  isSupportedWrittenExamFileName,
  presentWrittenExamIssue,
  type WrittenExamUploadResult,
} from '@/lib/writtenExamImportPreview'
import type { ParsedWrittenExamQuestion } from '@/lib/writtenExamParser'

type ImportClientProps = {
  parseWrittenExamUpload: (formData: FormData) => Promise<WrittenExamUploadResult>
}

type ImportState =
  | { status: 'empty' }
  | { status: 'parsing'; fileName: string }
  | WrittenExamUploadResult

export default function ImportClient({ parseWrittenExamUpload }: ImportClientProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [state, setState] = useState<ImportState>({ status: 'empty' })

  const reset = () => {
    setState({ status: 'empty' })
    setIsDragging(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const processFile = (file: File | undefined) => {
    if (!file) return

    if (!isSupportedWrittenExamFileName(file.name)) {
      setState({
        status: 'error',
        fileName: file.name,
        kind: 'unsupported-file',
        message: getWrittenExamUploadErrorMessage('unsupported-file'),
      })
      return
    }

    setState({ status: 'parsing', fileName: file.name })

    const formData = new FormData()
    formData.append('file', file, file.name)

    startTransition(async () => {
      try {
        const result = await parseWrittenExamUpload(formData)
        setState(result)
      } catch {
        setState({
          status: 'error',
          fileName: file.name,
          kind: 'unreadable-file',
          message: getWrittenExamUploadErrorMessage('unreadable-file'),
        })
      }
    })
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    processFile(file)
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    processFile(event.dataTransfer.files?.[0])
  }

  const isParsing = state.status === 'parsing' || isPending

  return (
    <div className="space-y-6 pb-20">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#D4AF37]">Written Exam · Preview</p>
        <h1 className="mt-2 text-3xl font-bold font-display tracking-tight text-[#F5E9D6]">
          อัปโหลดข้อสอบอัตนัย
        </h1>
        <p className="mt-1 text-[#A1866B]">
          ตรวจสอบไฟล์ Markdown ด้วย Parser V1 และดูตัวอย่างเนื้อหาก่อนเชื่อมต่อระบบจัดเก็บ
        </p>
      </div>

      {state.status === 'empty' && (
        <UploadPanel
          isDragging={isDragging}
          onDragEnter={() => setIsDragging(true)}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onBrowse={() => fileInputRef.current?.click()}
          fileInputRef={fileInputRef}
          onFileChange={handleFileChange}
        />
      )}

      {isParsing && state.status === 'parsing' && (
        <ParsingState fileName={state.fileName} />
      )}

      {state.status === 'error' && !isParsing && (
        <UploadErrorState fileName={state.fileName} message={state.message} onReset={reset} />
      )}

      {state.status === 'invalid' && !isParsing && (
        <ParserErrorState result={state} onReset={reset} />
      )}

      {state.status === 'success' && !isParsing && (
        <PreviewState result={state} onReset={reset} />
      )}
    </div>
  )
}

function UploadPanel({
  isDragging,
  onDragEnter,
  onDragLeave,
  onDrop,
  onBrowse,
  fileInputRef,
  onFileChange,
}: {
  isDragging: boolean
  onDragEnter: () => void
  onDragLeave: () => void
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void
  onBrowse: () => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <section
      className={`rounded-2xl border-2 border-dashed p-12 text-center shadow-xl transition-colors md:p-16 ${
        isDragging
          ? 'border-[#D4AF37] bg-[#D4AF37]/10'
          : 'border-[rgba(212,175,55,0.2)] bg-[#1A140E]'
      }`}
      onDragOver={(event) => {
        event.preventDefault()
        onDragEnter()
      }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.markdown,text/markdown"
        className="sr-only"
        aria-label="เลือกไฟล์ Written Exam Markdown"
        onChange={onFileChange}
      />
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#D4AF37]/10 text-[#D4AF37]">
        <UploadCloud size={32} aria-hidden="true" />
      </div>
      <h2 className="mt-5 text-xl font-bold font-display text-[#F5E9D6]">เลือกไฟล์ Markdown</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-7 text-[#A1866B]">
        ลากไฟล์มาวางที่นี่ หรือเลือกไฟล์จากเครื่อง รองรับเฉพาะ .md และ .markdown
      </p>
      <button
        type="button"
        onClick={onBrowse}
        className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[#D4AF37] px-6 py-3 text-sm font-bold text-[#1A140E] transition-colors hover:bg-[#F1D17A]"
      >
        <FileText size={17} aria-hidden="true" />
        เลือกไฟล์
      </button>
      <p className="mt-4 text-xs text-[#A1866B]">Parser V1 จำกัดขนาดเนื้อหาไว้ไม่เกิน 1 MiB</p>
    </section>
  )
}

function ParsingState({ fileName }: { fileName: string }) {
  return (
    <section className="rounded-2xl border border-[rgba(212,175,55,0.2)] bg-[#1A140E] p-10 text-center shadow-xl" role="status" aria-live="polite">
      <Loader2 className="mx-auto animate-spin text-[#D4AF37]" size={34} aria-hidden="true" />
      <h2 className="mt-5 text-xl font-bold font-display text-[#F5E9D6]">กำลังตรวจสอบไฟล์</h2>
      <p className="mt-2 break-all text-sm text-[#A1866B]">{fileName}</p>
    </section>
  )
}

function UploadErrorState({
  fileName,
  message,
  onReset,
}: {
  fileName?: string
  message: string
  onReset: () => void
}) {
  return (
    <section className="rounded-2xl border border-red-500/30 bg-[#1A140E] p-8 shadow-xl" role="alert">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 shrink-0 text-red-400" size={22} aria-hidden="true" />
        <div>
          <h2 className="font-bold text-red-300">ไม่สามารถตรวจสอบไฟล์ได้</h2>
          <p className="mt-2 text-sm leading-7 text-[#D6CBB8]">{message}</p>
          {fileName && <p className="mt-2 break-all text-xs text-[#A1866B]">ไฟล์: {fileName}</p>}
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
    <section className="space-y-5 rounded-2xl border border-red-500/30 bg-[#1A140E] p-6 shadow-xl md:p-8" role="alert">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 shrink-0 text-red-400" size={22} aria-hidden="true" />
        <div>
          <h2 className="font-bold text-red-300">ตรวจสอบรูปแบบ Written Exam ไม่ผ่าน</h2>
          <p className="mt-1 text-sm leading-7 text-[#D6CBB8]">
            Parser V1 พบข้อผิดพลาด {diagnostics.length.toLocaleString()} รายการในไฟล์นี้
          </p>
          <p className="mt-1 break-all text-xs text-[#A1866B]">ไฟล์: {result.fileName}</p>
        </div>
      </div>

      <ul className="space-y-3" aria-label="รายการข้อผิดพลาดจาก Parser V1">
        {diagnostics.length > 0 ? diagnostics.map((diagnostic, index) => (
          <li key={`${diagnostic.label}-${diagnostic.location}-${index}`} className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold text-red-200">{diagnostic.label}</p>
              {diagnostic.location && <p className="text-xs text-red-200/70">{diagnostic.location}</p>}
            </div>
            <p className="mt-2 text-sm leading-6 text-[#D6CBB8]">{diagnostic.detail}</p>
          </li>
        )) : (
          <li className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-[#D6CBB8]">
            เนื้อหาไม่ตรงตามรูปแบบ Written Exam V1
          </li>
        )}
      </ul>

      <ResetButton onReset={onReset} />
    </section>
  )
}

function PreviewState({
  result,
  onReset,
}: {
  result: Extract<WrittenExamUploadResult, { status: 'success' }>
  onReset: () => void
}) {
  const material = result.material
  const metadata = material.metadata

  if (!metadata) {
    return (
      <UploadErrorState
        fileName={result.fileName}
        message="ไม่พบ metadata ที่จำเป็นสำหรับการแสดงตัวอย่าง"
        onReset={onReset}
      />
    )
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[#22C55E]/25 bg-[#1A140E] p-6 shadow-xl md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 shrink-0 text-[#22C55E]" size={24} aria-hidden="true" />
            <div>
              <h2 className="text-xl font-bold font-display text-[#F5E9D6]">ตรวจสอบผ่าน — ตัวอย่างเนื้อหา</h2>
              <p className="mt-1 break-all text-sm text-[#A1866B]">ไฟล์: {result.fileName}</p>
            </div>
          </div>
          <ResetButton onReset={onReset} />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <MetadataCard label="format_version" value={metadata.formatVersion} accent />
          <MetadataCard label="ชื่อชุดข้อสอบ" value={metadata.title} />
          <MetadataCard label="package_code" value={metadata.packageCode} accent />
          <MetadataCard label="slug" value={metadata.slug} />
          <MetadataCard label="จำนวนข้อ" value={material.derived.questionCount.toLocaleString()} accent />
        </div>

        {(material.normalization.bomRemoved || material.normalization.lineEndingsNormalized) && (
          <p className="mt-4 rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/5 px-4 py-3 text-sm text-[#E5C86B]">
            Parser V1 ได้ปรับรูปแบบอินพุตให้เป็นมาตรฐานแล้ว
            {material.normalization.bomRemoved ? ' (ลบ BOM)' : ''}
            {material.normalization.lineEndingsNormalized ? ' (ปรับ line endings)' : ''}
          </p>
        )}
      </section>

      <section aria-labelledby="written-exam-preview-heading" className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#D4AF37]">Parsed questions</p>
            <h2 id="written-exam-preview-heading" className="mt-1 text-2xl font-bold font-display text-[#F5E9D6]">
              ตัวอย่างคำถามทั้งหมด
            </h2>
          </div>
          <p className="text-sm text-[#A1866B]">{material.derived.questionCount.toLocaleString()} ข้อ</p>
        </div>

        <div className="space-y-5">
          {material.questions.map((question) => (
            <QuestionPreviewCard key={`${question.questionNumber}-${question.order}`} question={question} />
          ))}
        </div>
      </section>
    </div>
  )
}

function MetadataCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border border-[rgba(255,255,255,0.06)] bg-[#0F0B07] p-4">
      <p className="text-xs text-[#A1866B]">{label}</p>
      <p className={`mt-1 break-words text-sm font-bold ${accent ? 'text-[#D4AF37]' : 'text-[#F5E9D6]'}`}>{value}</p>
    </div>
  )
}

function QuestionPreviewCard({ question }: { question: ParsedWrittenExamQuestion }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-[rgba(212,175,55,0.15)] bg-[#1A140E] shadow-xl">
      <header className="border-b border-[rgba(255,255,255,0.06)] bg-[#0F0B07]/60 px-5 py-5 md:px-7">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#D4AF37]">Question {question.order}</p>
        <h3 className="mt-1 text-xl font-bold font-display text-[#F5E9D6]">ข้อที่ {question.questionNumber}</h3>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#A1866B]">{getQuestionTitle(question.questionMarkdown)}</p>
      </header>

      <div className="space-y-5 p-5 md:p-7">
        <PreviewSection title="โจทย์" content={question.questionMarkdown} />
        <PreviewSection title="แนวคำตอบ" content={question.modelAnswerMarkdown} />
        <KeywordsSection keywords={question.keywords} />
        <PreviewSection title="โครงสร้าง/ประเด็นสำคัญในการตอบ" content={question.answerStructureMarkdown} />
        <PreviewSection title="เทคนิคช่วยจำ" content={question.memoryTechniqueMarkdown} />
      </div>
    </article>
  )
}

function PreviewSection({ title, content }: { title: string; content: string }) {
  return (
    <section className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[#0F0B07] p-4 md:p-5">
      <h4 className="mb-3 text-sm font-bold text-[#D4AF37]">{title}</h4>
      <SummaryMarkdown content={content} />
    </section>
  )
}

function KeywordsSection({ keywords }: { keywords: string[] }) {
  return (
    <section className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[#0F0B07] p-4 md:p-5">
      <h4 className="mb-3 text-sm font-bold text-[#D4AF37]">Keywords</h4>
      <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-[#D6CBB8] marker:text-[#D4AF37]">
        {keywords.map((keyword) => <li key={keyword}>{keyword}</li>)}
      </ul>
    </section>
  )
}

function getQuestionTitle(markdown: string): string {
  const firstLine = markdown.split('\n').map((line) => line.trim()).find(Boolean)
  if (!firstLine) return 'ไม่มีชื่อโจทย์'
  return firstLine.length > 180 ? `${firstLine.slice(0, 177)}…` : firstLine
}

function ResetButton({ onReset }: { onReset: () => void }) {
  return (
    <button
      type="button"
      onClick={onReset}
      className="mt-6 inline-flex items-center gap-2 rounded-xl border border-[#D4AF37]/30 px-4 py-2.5 text-sm font-bold text-[#D4AF37] transition-colors hover:border-[#D4AF37] hover:bg-[#D4AF37]/10"
    >
      <RotateCcw size={16} aria-hidden="true" />
      เลือกไฟล์ใหม่
    </button>
  )
}
