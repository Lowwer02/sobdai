import type {
  ParsedWrittenExamMaterial,
  WrittenExamParseIssue,
  WrittenExamParseIssueCode,
} from './writtenExamParser'

export const WRITTEN_EXAM_ALLOWED_FILE_EXTENSIONS = ['.md', '.markdown'] as const

export type WrittenExamUploadErrorKind =
  | 'unsupported-file'
  | 'unreadable-file'
  | 'oversized-source'
  | 'invalid-utf8'
  | 'invalid-content'

export type WrittenExamUploadResult =
  | {
      status: 'success'
      fileName: string
      material: ParsedWrittenExamMaterial
    }
  | {
      status: 'invalid'
      fileName: string
      material: ParsedWrittenExamMaterial
    }
  | {
      status: 'error'
      fileName?: string
      kind: WrittenExamUploadErrorKind
      message: string
    }

export type WrittenExamSaveDraftErrorKind =
  | WrittenExamUploadErrorKind
  | 'authorization-denied'
  | 'package-not-found'
  | 'binding-conflict'
  | 'database-conflict'
  | 'unexpected'

export type WrittenExamSaveDraftResult =
  | {
      status: 'success'
      fileName: string
      materialId: string
      versionId: string
      revisionNumber: number
      questionCount: number
      idempotentRetry: boolean
    }
  | {
      status: 'error'
      fileName?: string
      kind: WrittenExamSaveDraftErrorKind
      message: string
    }

export type WrittenExamIssuePresentation = {
  label: string
  detail: string
  location: string
}

const ISSUE_LABELS: Record<WrittenExamParseIssueCode, string> = {
  FRONTMATTER_MISSING: 'ไม่พบ YAML frontmatter',
  FRONTMATTER_INVALID: 'YAML frontmatter ไม่ถูกต้อง',
  FRONTMATTER_DUPLICATE_KEY: 'frontmatter มีคีย์ซ้ำ',
  FRONTMATTER_UNKNOWN_FIELD: 'frontmatter มีฟิลด์ที่ไม่รองรับ',
  FRONTMATTER_FIELD_MISSING: 'frontmatter ขาดฟิลด์ที่จำเป็น',
  FORMAT_VERSION_UNSUPPORTED: 'format_version ไม่รองรับ',
  PACKAGE_CODE_INVALID: 'package_code ไม่ถูกต้อง',
  TITLE_INVALID: 'title ไม่ถูกต้อง',
  SLUG_INVALID: 'slug ไม่ถูกต้อง',
  SOURCE_TOO_LARGE: 'ไฟล์มีขนาดเกินกำหนด',
  SOURCE_INVALID_UTF8: 'การเข้ารหัสเนื้อหาไม่ถูกต้อง',
  NO_QUESTIONS: 'ไม่พบคำถาม',
  TOO_MANY_QUESTIONS: 'จำนวนคำถามเกินกำหนด',
  QUESTION_NUMBER_INVALID: 'เลขข้อไม่ถูกต้อง',
  QUESTION_NUMBER_SEQUENCE: 'ลำดับเลขข้อไม่ถูกต้อง',
  SECTION_MISSING: 'ขาดส่วนเนื้อหาที่จำเป็น',
  SECTION_DUPLICATE: 'ส่วนเนื้อหาซ้ำ',
  SECTION_ORDER_INVALID: 'ลำดับส่วนเนื้อหาไม่ถูกต้อง',
  SECTION_EMPTY: 'ส่วนเนื้อหาว่าง',
  KEYWORDS_INVALID: 'Keywords ไม่ถูกต้อง',
  UNEXPECTED_HEADING: 'พบหัวข้อ Markdown ที่ไม่รองรับ',
  CONTENT_OUTSIDE_QUESTION: 'พบเนื้อหานอกข้อสอบ',
  UNSAFE_MARKDOWN: 'พบ Markdown ที่ไม่ปลอดภัย',
}

export function isSupportedWrittenExamFileName(fileName: string): boolean {
  const normalizedName = fileName.toLowerCase()
  return WRITTEN_EXAM_ALLOWED_FILE_EXTENSIONS.some((extension) => normalizedName.endsWith(extension))
}

export function getWrittenExamUploadErrorMessage(kind: WrittenExamUploadErrorKind): string {
  switch (kind) {
    case 'unsupported-file':
      return 'รองรับเฉพาะไฟล์ .md และ .markdown เท่านั้น'
    case 'unreadable-file':
      return 'ไม่สามารถอ่านไฟล์นี้ได้ กรุณาเลือกไฟล์ Markdown ใหม่'
    case 'oversized-source':
      return 'ไฟล์มีขนาดเกิน 1 MiB ซึ่งเป็นขีดจำกัดของ Parser V1'
    case 'invalid-utf8':
      return 'ไฟล์มีการเข้ารหัส UTF-8 ไม่ถูกต้อง จึงไม่สามารถตรวจสอบเนื้อหาได้'
    case 'invalid-content':
      return 'เนื้อหาไฟล์ไม่ถูกต้อง หรือมีขนาดเกินขีดจำกัดของ Parser V1'
  }
}

export function getWrittenExamSaveDraftErrorMessage(kind: WrittenExamSaveDraftErrorKind): string {
  switch (kind) {
    case 'unsupported-file':
    case 'unreadable-file':
    case 'oversized-source':
    case 'invalid-utf8':
    case 'invalid-content':
      return getWrittenExamUploadErrorMessage(kind)
    case 'authorization-denied':
      return 'คุณไม่มีสิทธิ์บันทึกฉบับร่าง Written Exam'
    case 'package-not-found':
      return 'ไม่พบ package_code นี้ในระบบ กรุณาตรวจสอบ frontmatter แล้วลองใหม่'
    case 'binding-conflict':
      return 'package หรือ slug นี้ไม่ตรงกับรายการเดิม จึงไม่สามารถบันทึกฉบับร่างได้'
    case 'database-conflict':
      return 'ข้อมูลมีการเปลี่ยนแปลงหรือชนกับรายการเดิม กรุณาตรวจสอบแล้วลองใหม่'
    case 'unexpected':
      return 'ไม่สามารถบันทึกฉบับร่างได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง'
  }
}

export function presentWrittenExamIssue(issue: WrittenExamParseIssue): WrittenExamIssuePresentation {
  const location = [
    issue.line === undefined ? '' : `บรรทัด ${issue.line}`,
    issue.questionNumber === undefined ? '' : `ข้อ ${issue.questionNumber}`,
    issue.section === undefined ? '' : `ส่วน ${issue.section}`,
  ]
    .filter(Boolean)
    .join(' · ')

  return {
    label: ISSUE_LABELS[issue.code],
    detail: issue.message,
    location,
  }
}
