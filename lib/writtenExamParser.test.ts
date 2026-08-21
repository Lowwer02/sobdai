import assert from 'node:assert/strict'
import test from 'node:test'

// @ts-expect-error Node's strip-types test runner requires the explicit .ts extension.
import { MAX_WRITTEN_EXAM_KEYWORDS, MAX_WRITTEN_EXAM_MARKDOWN_NESTING_DEPTH, MAX_WRITTEN_EXAM_PARSE_ISSUES, MAX_WRITTEN_EXAM_QUESTIONS, MAX_WRITTEN_EXAM_SOURCE_BYTES, parseWrittenExamMarkdown } from './writtenExamParser.ts'

const FRONTMATTER = [
  'format_version: "written-exam-v1"',
  'package_code: "SUPPLIED-BY-SOBDAI"',
  'title: "ชุดข้อสอบอัตนัย"',
  'slug: "written-exam-set-1"',
].join('\n')

type QuestionParts = {
  question?: string
  answer?: string
  keywords?: string
  structure?: string
  memory?: string
  sectionOrder?: string[]
}

const DEFAULT_QUESTION_PARTS: Required<Omit<QuestionParts, 'sectionOrder'>> = {
  question: 'อธิบายหลักการใช้อำนาจทางปกครองโดยชอบด้วยกฎหมาย',
  answer: 'คำตอบควรอธิบายหลักกฎหมายและเหตุผลประกอบให้ครบถ้วน',
  keywords: '- หลักนิติธรรม\n- การใช้ดุลพินิจ',
  structure: '1. หลักกฎหมาย\n2. การปรับใช้กับข้อเท็จจริง',
  memory: 'จำลำดับว่า หลักการ → ข้อเท็จจริง → เหตุผล',
}

function questionBlock(number: number, overrides: QuestionParts = {}): string {
  const parts = { ...DEFAULT_QUESTION_PARTS, ...overrides }
  const values: Record<string, string> = {
    โจทย์: parts.question,
    แนวคำตอบ: parts.answer,
    Keywords: parts.keywords,
    'โครงสร้าง/ประเด็นสำคัญในการตอบ': parts.structure,
    เทคนิคช่วยจำ: parts.memory,
  }
  const sectionOrder = overrides.sectionOrder ?? [
    'โจทย์',
    'แนวคำตอบ',
    'Keywords',
    'โครงสร้าง/ประเด็นสำคัญในการตอบ',
    'เทคนิคช่วยจำ',
  ]

  return [
    `## ข้อที่ ${number}`,
    '',
    ...sectionOrder.flatMap((section) => [`### ${section}`, '', values[section] ?? '']),
  ].join('\n')
}

function documentWithBody(body: string, frontmatter = FRONTMATTER): string {
  return `---\n${frontmatter}\n---\n${body}\n`
}

function validDocument(overrides: QuestionParts = {}): string {
  return documentWithBody(questionBlock(1, overrides))
}

function exactSizeDocument(targetBytes: number): string {
  const prefix = `${documentWithBody('## ข้อที่ 1\n\n### โจทย์\n\nโจทย์\n\n### แนวคำตอบ\n\n').slice(0, -1)}`
  const suffix = '\n\n### Keywords\n\n- คำสำคัญ\n\n### โครงสร้าง/ประเด็นสำคัญในการตอบ\n\nโครงสร้าง\n\n### เทคนิคช่วยจำ\n\nเทคนิค\n'
  const fillerLength = targetBytes - Buffer.byteLength(prefix + suffix)
  assert.ok(fillerLength > 0)
  return prefix + 'x'.repeat(fillerLength) + suffix
}

function nestedList(depth: number): string {
  return Array.from({ length: depth }, (_, index) => `${'  '.repeat(index)}- ระดับ ${index + 1}`).join('\n')
}

function issueCodes(source: string): string[] {
  return parseWrittenExamMarkdown(source).issues.map((item) => item.code)
}

function assertInvalid(source: string, expectedCode?: string): ReturnType<typeof parseWrittenExamMarkdown> {
  const result = parseWrittenExamMarkdown(source)
  assert.equal(result.isValid, false)
  if (expectedCode) assert.ok(issueCodes(source).includes(expectedCode), `Expected issue code ${expectedCode}`)
  return result
}

test('parses the canonical one-question document', () => {
  const result = parseWrittenExamMarkdown(validDocument())

  assert.equal(result.isValid, true)
  assert.deepEqual(result.metadata, {
    formatVersion: 'written-exam-v1',
    packageCode: 'SUPPLIED-BY-SOBDAI',
    title: 'ชุดข้อสอบอัตนัย',
    slug: 'written-exam-set-1',
  })
  assert.equal(result.derived.questionCount, 1)
  assert.equal(result.questions.length, 1)
  assert.deepEqual(result.questions[0], {
    questionNumber: 1,
    order: 1,
    questionMarkdown: DEFAULT_QUESTION_PARTS.question,
    modelAnswerMarkdown: DEFAULT_QUESTION_PARTS.answer,
    keywords: ['หลักนิติธรรม', 'การใช้ดุลพินิจ'],
    answerStructureMarkdown: DEFAULT_QUESTION_PARTS.structure,
    memoryTechniqueMarkdown: DEFAULT_QUESTION_PARTS.memory,
  })
  assert.deepEqual(result.issues, [])
})

test('parses multiple sequential questions and preserves their order', () => {
  const source = documentWithBody(
    [questionBlock(1), questionBlock(2, { question: 'เปรียบเทียบการกระทำทางปกครองสองประเภท' })].join('\n\n'),
  )
  const result = parseWrittenExamMarkdown(source)

  assert.equal(result.isValid, true)
  assert.deepEqual(
    result.questions.map((question) => ({ number: question.questionNumber, order: question.order })),
    [
      { number: 1, order: 1 },
      { number: 2, order: 2 },
    ],
  )
})

test('allows the supported long-form Markdown and safe HTTPS links', () => {
  const answer = [
    'ย่อหน้า **สำคัญ** และ *เน้น* ~~ข้อความเดิม~~ พร้อม `inline code`',
    '',
    '- ประเด็นแรก',
    '  - ประเด็นย่อย',
    '1. ขั้นตอนหนึ่ง',
    '2. ขั้นตอนสอง',
    '',
    '| ประเด็น | คำอธิบาย |',
    '| --- | --- |',
    '| กฎหมาย | ต้องอ้างเหตุผล |',
    '',
    '[แหล่งอ้างอิง](https://example.com/reference)',
  ].join('\n')
  const result = parseWrittenExamMarkdown(validDocument({ answer }))

  assert.equal(result.isValid, true)
  assert.equal(result.questions[0]?.modelAnswerMarkdown, answer)
})

test('allows safe HTTPS and HTTP reference links, including repeated uses', () => {
  const answer = [
    '[พระราชบัญญัติ][law]',
    '',
    '[หลักเกณฑ์][law]',
    '',
    '[law]: https://example.com/law',
    '[http-law]: http://example.com/law',
    '',
    '[แหล่ง HTTP][http-law]',
  ].join('\n')
  const result = parseWrittenExamMarkdown(validDocument({ answer }))

  assert.equal(result.isValid, true)
  assert.deepEqual(result.issues, [])
})

test('allows a safe inline HTTP link', () => {
  const result = parseWrittenExamMarkdown(
    validDocument({ answer: '[แหล่งอ้างอิง](http://example.com/reference)' }),
  )

  assert.equal(result.isValid, true)
  assert.deepEqual(result.issues, [])
})

test('rejects unsafe, duplicate, and unresolved reference definitions', () => {
  const unsafeDefinitions = [
    'javascript:alert(1)',
    'data:text/plain,unsafe',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    '//example.com/unsafe',
    'JaVaScRiPt:alert(1)',
    '\tjavascript:alert(1)',
    '%09javascript:alert(1)',
    'javascript%3Aalert(1)',
    'jav&#x61;script:alert(1)',
  ]

  for (const destination of unsafeDefinitions) {
    assertInvalid(
      validDocument({ answer: `[ลิงก์][ref]\n\n[ref]: ${destination}` }),
      'UNSAFE_MARKDOWN',
    )
  }

  assertInvalid(
    validDocument({ answer: '[ลิงก์][missing]' }),
    'UNSAFE_MARKDOWN',
  )
  const duplicateDefinitions = [
    '[ลิงก์][ref]\n\n[ref]: https://example.com/one\n[ref]: https://example.com/two',
    '[ลิงก์][ref]\n\n[ref]: javascript:alert(1)\n[ref]: https://example.com/two',
    '[ลิงก์][ref]\n\n[ref]: https://example.com/one\n[ref]: javascript:alert(1)',
  ]
  for (const answer of duplicateDefinitions) {
    assertInvalid(validDocument({ answer }), 'UNSAFE_MARKDOWN')
  }
})

test('rejects an unsafe unused reference definition', () => {
  assertInvalid(
    validDocument({ answer: 'เนื้อหาปกติ\n\n[unused]: javascript:alert(1)' }),
    'UNSAFE_MARKDOWN',
  )
})

test('preserves escaped brackets and detects even-parity unresolved references', () => {
  const escaped = parseWrittenExamMarkdown(
    validDocument({ answer: '\\[ลิงก์\\][missing]' }),
  )
  const evenParity = parseWrittenExamMarkdown(
    validDocument({ answer: '\\\\[ลิงก์][missing]' }),
  )

  assert.equal(escaped.isValid, true)
  assert.deepEqual(escaped.issues, [])
  assert.equal(evenParity.isValid, false)
  assert.ok(evenParity.issues.some((item) => item.code === 'UNSAFE_MARKDOWN'))
})

test('keeps image references forbidden even when their definition is safe', () => {
  assertInvalid(
    validDocument({ answer: '![ภาพ][image]\n\n[image]: https://example.com/image.png' }),
    'UNSAFE_MARKDOWN',
  )
})

test('accepts punctuation in plain-text Keywords', () => {
  const result = parseWrittenExamMarkdown(
    validDocument({ keywords: '- มาตรา 5/6, วรรคหนึ่ง\n- “ดุลพินิจ” — ต้องมีเหตุผล' }),
  )

  assert.equal(result.isValid, true)
  assert.deepEqual(result.questions[0]?.keywords, ['มาตรา 5/6, วรรคหนึ่ง', '“ดุลพินิจ” — ต้องมีเหตุผล'])
})

test('allows flexible blank lines while keeping extracted section values deterministic', () => {
  const body = [
    '  ',
    '',
    '## ข้อที่ 1',
    '',
    '',
    '### โจทย์',
    '',
    '',
    'อธิบายหลักการ',
    '',
    '### แนวคำตอบ',
    '',
    'ตอบโดยอ้างหลักกฎหมาย',
    '',
    '### Keywords',
    '',
    '- หลักนิติธรรม',
    '',
    '### โครงสร้าง/ประเด็นสำคัญในการตอบ',
    '',
    '1. หลักกฎหมาย',
    '',
    '### เทคนิคช่วยจำ',
    '',
    'จำเป็นลำดับ',
    '',
    '',
  ].join('\n')
  const result = parseWrittenExamMarkdown(documentWithBody(body))

  assert.equal(result.isValid, true)
  assert.equal(result.questions[0]?.questionMarkdown, 'อธิบายหลักการ')
})

test('removes one BOM and normalizes CRLF/CR without rewriting Markdown semantics', () => {
  const answer = [
    'บรรทัดที่มี hard break  ',
    'บรรทัดถัดไป',
    '',
    '- รายการหลัก',
    '  - รายการย่อย',
    '',
    '| คอลัมน์ | ค่า |',
    '| --- | --- |',
    '| ไทย, / — | 1 |',
  ].join('\n')
  const source = validDocument({
    question: 'โจทย์ภาษาไทย, มีเครื่องหมาย / และ —',
    answer,
  })
  const crlfSource = `\uFEFF${source.replace(/\n/g, '\r\n')}`
  const result = parseWrittenExamMarkdown(crlfSource)

  assert.equal(result.isValid, true)
  assert.equal(result.normalization.bomRemoved, true)
  assert.equal(result.normalization.lineEndingsNormalized, true)
  assert.equal(result.sourceMarkdown, source)
  assert.equal(result.questions[0]?.modelAnswerMarkdown, answer)
  assert.match(result.sourceMarkdown, /hard break  \nบรรทัดถัดไป/)
  assert.match(result.sourceMarkdown, /รายการหลัก\n  - รายการย่อย/)
  assert.match(result.sourceMarkdown, /\| ไทย, \/ — \| 1 \|/)

  const crOnlyResult = parseWrittenExamMarkdown(source.replace(/\n/g, '\r'))
  assert.equal(crOnlyResult.isValid, true)
  assert.equal(crOnlyResult.normalization.lineEndingsNormalized, true)
  assert.equal(crOnlyResult.sourceMarkdown, source)
})

test('accepts exactly 1 MiB and rejects 1 MiB plus one byte', () => {
  const exact = exactSizeDocument(1024 * 1024)
  const result = parseWrittenExamMarkdown(exact)

  assert.equal(Buffer.byteLength(exact), 1024 * 1024)
  assert.equal(result.isValid, true)
  assertInvalid(`${exact}x`, 'SOURCE_TOO_LARGE')
})

test('accepts exactly 200 questions and rejects 201 questions', () => {
  const exact = documentWithBody(
    Array.from({ length: 200 }, (_, index) => questionBlock(index + 1)).join('\n\n'),
  )
  const result = parseWrittenExamMarkdown(exact)

  assert.equal(result.isValid, true)
  assert.equal(result.questions.length, 200)

  const tooMany = documentWithBody(
    Array.from({ length: 201 }, (_, index) => questionBlock(index + 1)).join('\n\n'),
  )
  assertInvalid(tooMany, 'TOO_MANY_QUESTIONS')
})

test('accepts exactly 30 Keywords and rejects 31', () => {
  const exact = validDocument({
    keywords: Array.from({ length: MAX_WRITTEN_EXAM_KEYWORDS }, (_, index) => `- keyword-${index + 1}`).join('\n'),
  })
  const result = parseWrittenExamMarkdown(exact)

  assert.equal(result.isValid, true)
  assert.equal(result.questions[0]?.keywords.length, 30)

  assertInvalid(
    validDocument({
      keywords: Array.from({ length: MAX_WRITTEN_EXAM_KEYWORDS + 1 }, (_, index) => `- keyword-${index + 1}`).join('\n'),
    }),
    'KEYWORDS_INVALID',
  )
})

test('counts Keyword Unicode code points at the exact 120/121 boundary', () => {
  const exact = parseWrittenExamMarkdown(validDocument({ keywords: `- ${'😀'.repeat(120)}` }))
  const tooLong = parseWrittenExamMarkdown(validDocument({ keywords: `- ${'😀'.repeat(121)}` }))

  assert.equal(exact.isValid, true)
  assert.equal(tooLong.isValid, false)
  assert.ok(tooLong.issues.some((item) => item.code === 'KEYWORDS_INVALID'))
})

test('enforces exact metadata length boundaries', () => {
  const exact = documentWithBody(
    questionBlock(1),
    [
      'format_version: "written-exam-v1"',
      `package_code: "${'P'.repeat(100)}"`,
      `title: "${'ก'.repeat(200)}"`,
      `slug: "${'a'.repeat(80)}"`,
    ].join('\n'),
  )
  const result = parseWrittenExamMarkdown(exact)

  assert.equal(result.isValid, true)
  assertInvalid(
    documentWithBody(questionBlock(1), exact.split('\n').slice(1, 5).join('\n').replace('P'.repeat(100), 'P'.repeat(101))),
    'PACKAGE_CODE_INVALID',
  )
  assertInvalid(
    documentWithBody(questionBlock(1), exact.split('\n').slice(1, 5).join('\n').replace('ก'.repeat(200), 'ก'.repeat(201))),
    'TITLE_INVALID',
  )
  assertInvalid(
    documentWithBody(questionBlock(1), exact.split('\n').slice(1, 5).join('\n').replace('a'.repeat(80), 'a'.repeat(81))),
    'SLUG_INVALID',
  )
})

test('rejects a missing frontmatter block', () => {
  assertInvalid(questionBlock(1), 'FRONTMATTER_MISSING')
})

test('rejects malformed YAML frontmatter', () => {
  assertInvalid(
    documentWithBody(questionBlock(1), [
      'format_version: "written-exam-v1"',
      'package_code: "SUPPLIED-BY-SOBDAI"',
      'title: [unterminated',
      'slug: "written-exam-set-1"',
    ].join('\n')),
    'FRONTMATTER_INVALID',
  )
})

test('rejects non-string YAML scalars and non-standalone frontmatter delimiters', () => {
  const scalarCases = [
    ['format_version: true', 'FORMAT_VERSION_UNSUPPORTED'],
    ['package_code: 123', 'PACKAGE_CODE_INVALID'],
    ['title: null', 'TITLE_INVALID'],
  ] as const

  for (const [replacement, code] of scalarCases) {
    const lines = FRONTMATTER.split('\n')
    const fieldIndex = replacement.startsWith('format') ? 0 : replacement.startsWith('package') ? 1 : 2
    lines.splice(fieldIndex, 1, replacement)
    assertInvalid(documentWithBody(questionBlock(1), lines.join('\n')), code)
  }

  assertInvalid(`\n---\n${FRONTMATTER}\n---\n${questionBlock(1)}`, 'FRONTMATTER_MISSING')
  assertInvalid(`--- \n${FRONTMATTER}\n---\n${questionBlock(1)}`, 'FRONTMATTER_MISSING')
  assertInvalid(`---\n${FRONTMATTER}\n--- \n${questionBlock(1)}`, 'FRONTMATTER_INVALID')
  assertInvalid(`\uFEFF\uFEFF---\n${FRONTMATTER}\n---\n${questionBlock(1)}`, 'FRONTMATTER_MISSING')
})

test('rejects duplicate and unknown frontmatter fields', () => {
  const duplicate = documentWithBody(
    questionBlock(1),
    `${FRONTMATTER}\ntitle: "ซ้ำ"`,
  )
  const unknown = documentWithBody(
    questionBlock(1),
    `${FRONTMATTER}\ndescription: "ไม่อนุญาต"`,
  )

  assertInvalid(duplicate, 'FRONTMATTER_DUPLICATE_KEY')
  assertInvalid(unknown, 'FRONTMATTER_UNKNOWN_FIELD')
})

test('rejects array and object frontmatter values', () => {
  const arrayValue = documentWithBody(
    questionBlock(1),
    FRONTMATTER.replace('package_code: "SUPPLIED-BY-SOBDAI"', 'package_code: ["A", "B"]'),
  )
  const objectValue = documentWithBody(
    questionBlock(1),
    FRONTMATTER.replace('title: "ชุดข้อสอบอัตนัย"', 'title: { label: "ไม่อนุญาต" }'),
  )
  const forbiddenYamlForms = [
    'package_code: &code SUPPLIED-BY-SOBDAI',
    'package_code: *code',
    '<<: *defaults',
    'title: !!str "ชุดข้อสอบอัตนัย"',
    'title: |-\n  ชุดข้อสอบอัตนัย',
  ] as const

  assertInvalid(arrayValue, 'FRONTMATTER_INVALID')
  assertInvalid(objectValue, 'FRONTMATTER_INVALID')

  for (const form of forbiddenYamlForms) {
    const lines = FRONTMATTER.split('\n')
    const replacementIndex = form.startsWith('title:') ? 2 : 1
    lines.splice(replacementIndex, 1, form)
    assertInvalid(documentWithBody(questionBlock(1), lines.join('\n')), 'FRONTMATTER_INVALID')
  }
})

test('rejects unsupported format versions and invalid metadata fields', () => {
  const unsupportedVersion = documentWithBody(
    questionBlock(1),
    FRONTMATTER.replace('written-exam-v1', 'written-exam-v2'),
  )
  const packageWhitespace = documentWithBody(
    questionBlock(1),
    FRONTMATTER.replace('"SUPPLIED-BY-SOBDAI"', '" SUPPLIED-BY-SOBDAI "'),
  )
  const emptyTitle = documentWithBody(questionBlock(1), FRONTMATTER.replace('"ชุดข้อสอบอัตนัย"', '""'))
  const invalidSlug = documentWithBody(
    questionBlock(1),
    FRONTMATTER.replace('written-exam-set-1', 'Written_Exam'),
  )

  assertInvalid(unsupportedVersion, 'FORMAT_VERSION_UNSUPPORTED')
  assertInvalid(packageWhitespace, 'PACKAGE_CODE_INVALID')
  assertInvalid(emptyTitle, 'TITLE_INVALID')
  assertInvalid(invalidSlug, 'SLUG_INVALID')
})

test('rejects a missing required frontmatter field', () => {
  const source = documentWithBody(
    questionBlock(1),
    FRONTMATTER.replace('slug: "written-exam-set-1"', ''),
  )

  assertInvalid(source, 'FRONTMATTER_FIELD_MISSING')
})

test('rejects documents with no questions', () => {
  assertInvalid(documentWithBody('   \n\n'), 'NO_QUESTIONS')
})

test('rejects question numbers that start at two, skip a number, or duplicate a number', () => {
  assertInvalid(documentWithBody(questionBlock(2)), 'QUESTION_NUMBER_SEQUENCE')
  assertInvalid(documentWithBody([questionBlock(1), questionBlock(3)].join('\n\n')), 'QUESTION_NUMBER_SEQUENCE')
  assertInvalid(documentWithBody([questionBlock(1), questionBlock(1)].join('\n\n')), 'QUESTION_NUMBER_INVALID')
})

test('rejects zero-padded and malformed question headings', () => {
  const zeroPadded = validDocument().replace('## ข้อที่ 1', '## ข้อที่ 01')
  const malformed = validDocument().replace('## ข้อที่ 1', '## ข้อที่ 1: อธิบาย')

  assertInvalid(zeroPadded, 'QUESTION_NUMBER_INVALID')
  assertInvalid(malformed, 'QUESTION_NUMBER_INVALID')
})

test('uses Markdown AST semantics for heading-like content and malformed headings', () => {
  const indented = validDocument().replace('## ข้อที่ 1', ' ## ข้อที่ 1')
  const closingMarkers = validDocument().replace('## ข้อที่ 1', '## ข้อที่ 1 ##')
  const nonAsciiDigits = validDocument().replace('## ข้อที่ 1', '## ข้อที่ ١')
  const escapedHeading = validDocument({ answer: '\\## ข้อที่ 9' })
  const inlineCodeHeading = validDocument({ answer: '`## ข้อที่ 9`' })
  const listHeading = validDocument({ answer: '- # nested heading' })
  const blockquoteHeading = validDocument({ answer: '> ## ข้อที่ 9' })

  assertInvalid(indented, 'QUESTION_NUMBER_INVALID')
  assertInvalid(closingMarkers, 'QUESTION_NUMBER_INVALID')
  assertInvalid(nonAsciiDigits, 'QUESTION_NUMBER_INVALID')
  assert.equal(parseWrittenExamMarkdown(escapedHeading).isValid, true)
  assert.equal(parseWrittenExamMarkdown(inlineCodeHeading).isValid, true)
  assertInvalid(listHeading, 'UNEXPECTED_HEADING')
  assertInvalid(blockquoteHeading, 'UNSAFE_MARKDOWN')
})

test('rejects missing, duplicate, out-of-order, and empty required sections', () => {
  const missing = validDocument().replace('\n### เทคนิคช่วยจำ\n\nจำลำดับว่า หลักการ → ข้อเท็จจริง → เหตุผล', '')
  const duplicate = `${validDocument()}\n### โจทย์\n\nโจทย์ซ้ำ\n`
  const wrongOrder = documentWithBody(
    questionBlock(1, {
      sectionOrder: [
        'แนวคำตอบ',
        'โจทย์',
        'Keywords',
        'โครงสร้าง/ประเด็นสำคัญในการตอบ',
        'เทคนิคช่วยจำ',
      ],
    }),
  )
  const empty = validDocument({ answer: '' })

  assertInvalid(missing, 'SECTION_MISSING')
  assertInvalid(duplicate, 'SECTION_DUPLICATE')
  assertInvalid(wrongOrder, 'SECTION_ORDER_INVALID')
  assertInvalid(empty, 'SECTION_EMPTY')
})

test('rejects malformed, nested, formatted, duplicate, and overlong Keywords lists', () => {
  const malformed = validDocument({ keywords: 'หลักนิติธรรม, การใช้ดุลพินิจ' })
  const nested = validDocument({ keywords: '- หลักนิติธรรม\n  - รายการซ้อน' })
  const formatted = validDocument({ keywords: '- **หลักนิติธรรม**' })
  const duplicate = validDocument({ keywords: '- หลักนิติธรรม\n- หลักนิติธรรม' })
  const tooMany = validDocument({
    keywords: Array.from({ length: MAX_WRITTEN_EXAM_KEYWORDS + 1 }, (_, index) => `- keyword-${index + 1}`).join('\n'),
  })

  assertInvalid(malformed, 'KEYWORDS_INVALID')
  assertInvalid(nested, 'KEYWORDS_INVALID')
  assertInvalid(formatted, 'KEYWORDS_INVALID')
  assertInvalid(duplicate, 'KEYWORDS_INVALID')
  assertInvalid(tooMany, 'KEYWORDS_INVALID')
})

test('rejects an item that does not use exactly the - marker and one plain-text line', () => {
  const plusMarker = validDocument({ keywords: '+ หลักนิติธรรม' })
  const extraMarkerWhitespace = validDocument({ keywords: '-  หลักนิติธรรม' })
  const multilineItem = validDocument({ keywords: '- หลักนิติธรรม\n  ต่อบรรทัด' })
  const taskList = validDocument({ keywords: '- [x] หลักนิติธรรม' })

  assertInvalid(plusMarker, 'KEYWORDS_INVALID')
  assertInvalid(extraMarkerWhitespace, 'KEYWORDS_INVALID')
  assertInvalid(multilineItem, 'KEYWORDS_INVALID')
  assertInvalid(taskList, 'KEYWORDS_INVALID')
})

test('does not case-fold or Unicode-normalize Keyword duplicates', () => {
  const caseDifferent = parseWrittenExamMarkdown(validDocument({ keywords: '- Law\n- law' }))
  const canonicallyDifferent = parseWrittenExamMarkdown(validDocument({ keywords: '- é\n- é' }))

  assert.equal(caseDifferent.isValid, true)
  assert.equal(canonicallyDifferent.isValid, true)
})

test('rejects documents with more than the maximum question count', () => {
  const body = Array.from({ length: MAX_WRITTEN_EXAM_QUESTIONS + 1 }, (_, index) => questionBlock(index + 1)).join('\n\n')
  assertInvalid(documentWithBody(body), 'TOO_MANY_QUESTIONS')
})

test('rejects source larger than one MiB before parsing its Markdown body', () => {
  const source = `${validDocument()}${'x'.repeat(MAX_WRITTEN_EXAM_SOURCE_BYTES)}`
  assertInvalid(source, 'SOURCE_TOO_LARGE')
})

test('rejects Markdown headings outside the frozen question grammar', () => {
  const additionalHeading = validDocument({ answer: '#### ไม่อนุญาต\n\nเนื้อหา' })
  const setextHeading = validDocument({ answer: 'เนื้อหาก่อนหน้า\n\nหัวข้อแบบ Setext\n---\n\nเนื้อหาต่อไป' })

  assertInvalid(additionalHeading, 'UNEXPECTED_HEADING')
  assertInvalid(setextHeading, 'UNEXPECTED_HEADING')
})

const forbiddenMarkdownCases = [
  ['raw HTML', '<div>ไม่อนุญาต</div>'],
  ['HTML comment', '<!-- ไม่อนุญาต -->'],
  ['image', '![ภาพ](https://example.com/image.png)'],
  ['fenced code', '```ts\nconst unsafe = true\n```'],
  ['thematic break', '---'],
] as const

for (const [name, answer] of forbiddenMarkdownCases) {
  test(`rejects ${name}`, () => {
    assertInvalid(validDocument({ answer }), 'UNSAFE_MARKDOWN')
  })
}

const unsafeLinkCases = [
  ['javascript', '[ลิงก์](javascript:alert(1))'],
  ['data', '[ลิงก์](data:text/plain,unsafe)'],
  ['vbscript', '[ลิงก์](vbscript:msgbox(1))'],
  ['file', '[ลิงก์](file:///etc/passwd)'],
  ['protocol-relative', '[ลิงก์](//example.com/unsafe)'],
  ['mixed-case javascript', '[ลิงก์](JaVaScRiPt:alert(1))'],
  ['encoded control prefix', '[ลิงก์](%09javascript:alert(1))'],
  ['encoded javascript colon', '[ลิงก์](javascript%3Aalert(1))'],
  ['character-entity javascript', '[ลิงก์](jav&#x61;script:alert(1))'],
] as const

for (const [name, answer] of unsafeLinkCases) {
  test(`rejects ${name} links`, () => {
    assertInvalid(validDocument({ answer }), 'UNSAFE_MARKDOWN')
  })
}

test('rejects prose before the first question', () => {
  assertInvalid(documentWithBody(`คำอธิบายก่อนเริ่มข้อสอบ\n\n${questionBlock(1)}`), 'CONTENT_OUTSIDE_QUESTION')
})

test('enforces the exact Markdown nesting boundary', () => {
  const exactlyTen = parseWrittenExamMarkdown(
    validDocument({ answer: nestedList(MAX_WRITTEN_EXAM_MARKDOWN_NESTING_DEPTH) }),
  )
  const eleven = parseWrittenExamMarkdown(
    validDocument({ answer: nestedList(MAX_WRITTEN_EXAM_MARKDOWN_NESTING_DEPTH + 1) }),
  )

  assert.equal(exactlyTen.isValid, true)
  assert.equal(eleven.isValid, false)
  assert.ok(eleven.issues.some((item) => item.code === 'UNSAFE_MARKDOWN'))
})

test('does not throw on deeply nested blockquotes and remains deterministic', () => {
  const source = validDocument({ answer: `${'> '.repeat(4_500)}deep content` })
  assert.ok(Buffer.byteLength(source) <= MAX_WRITTEN_EXAM_SOURCE_BYTES)

  assert.doesNotThrow(() => parseWrittenExamMarkdown(source))

  const first = parseWrittenExamMarkdown(source)
  const second = parseWrittenExamMarkdown(source)

  assert.equal(first.isValid, false)
  assert.ok(first.issues.length <= MAX_WRITTEN_EXAM_PARSE_ISSUES)
  assert.ok(first.issues.some((item) => item.code === 'UNSAFE_MARKDOWN'))
  assert.deepEqual(second.issues, first.issues)
})

test('bounds and deterministically rejects pathological unmatched brackets', () => {
  const source = validDocument({ answer: `${'['.repeat(250_000)}\n\n[x][missing]` })
  assert.ok(Buffer.byteLength(source) <= MAX_WRITTEN_EXAM_SOURCE_BYTES)

  const first = parseWrittenExamMarkdown(source)
  const second = parseWrittenExamMarkdown(source)

  assert.equal(first.isValid, false)
  assert.ok(first.issues.length <= MAX_WRITTEN_EXAM_PARSE_ISSUES)
  assert.deepEqual(second.issues, first.issues)
})

test('caps repeated unresolved-reference diagnostics and preserves determinism', () => {
  const answer = Array.from(
    { length: MAX_WRITTEN_EXAM_PARSE_ISSUES * 20 },
    (_, index) => `[ลิงก์ ${index}][missing-${index}]`,
  ).join(' ')
  const source = validDocument({ answer })
  const first = parseWrittenExamMarkdown(source)
  const second = parseWrittenExamMarkdown(source)

  assert.equal(first.isValid, false)
  assert.equal(first.issues.length, MAX_WRITTEN_EXAM_PARSE_ISSUES)
  assert.ok(first.issues.every((item) => item.code === 'UNSAFE_MARKDOWN'))
  assert.deepEqual(second.issues, first.issues)
})

test('trims large section boundaries without rewriting the source or internal formatting', () => {
  const internalAnswer = [
    'บรรทัดแรก  ',
    '  บรรทัดเยื้อง',
    '',
    '| คอลัมน์ | ค่า |',
    '| --- | --- |',
    '| ไทย | รักษารูปแบบ |',
  ].join('\n')
  const source = validDocument({
    answer: `${'\n'.repeat(25_000)}${internalAnswer}${'\n'.repeat(25_000)}`,
  })
  const result = parseWrittenExamMarkdown(source)

  assert.equal(result.isValid, true)
  assert.equal(result.sourceMarkdown, source)
  assert.equal(result.questions[0]?.modelAnswerMarkdown, internalAnswer)
})

test('bounds diagnostics for pathological heading volume', () => {
  const headingHeavyBody = [
    questionBlock(1),
    ...Array.from({ length: 2500 }, (_, index) => `#### หัวข้อที่ไม่อนุญาต ${index + 1}`),
  ].join('\n\n')
  const result = parseWrittenExamMarkdown(documentWithBody(headingHeavyBody))

  assert.equal(result.isValid, false)
  assert.ok(result.issues.length <= MAX_WRITTEN_EXAM_PARSE_ISSUES)
  assert.ok(result.issues.some((item) => item.code === 'UNEXPECTED_HEADING'))
})

test('rejects an invalid UTF-16 source string as invalid UTF-8 input', () => {
  assertInvalid(`${validDocument()}\ud800`, 'SOURCE_INVALID_UTF8')
})
