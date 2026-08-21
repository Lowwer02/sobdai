import matter from 'gray-matter'
import { unified } from 'unified'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import type {
  Definition,
  Heading,
  Link,
  LinkReference,
  List,
  ListItem,
  Node,
  Root,
} from 'mdast'

export const WRITTEN_EXAM_FORMAT_VERSION = 'written-exam-v1' as const
export type WrittenExamFormatVersion = typeof WRITTEN_EXAM_FORMAT_VERSION

export const MAX_WRITTEN_EXAM_SOURCE_BYTES = 1024 * 1024
export const MAX_WRITTEN_EXAM_QUESTIONS = 200
export const MAX_WRITTEN_EXAM_KEYWORDS = 30
export const MAX_WRITTEN_EXAM_KEYWORD_LENGTH = 120
export const MAX_WRITTEN_EXAM_MARKDOWN_NESTING_DEPTH = 10
export const MAX_WRITTEN_EXAM_PARSE_ISSUES = 100
export const MAX_WRITTEN_EXAM_STRUCTURAL_HEADINGS = MAX_WRITTEN_EXAM_QUESTIONS * 6

export const WRITTEN_EXAM_SECTION_NAMES = [
  'โจทย์',
  'แนวคำตอบ',
  'Keywords',
  'โครงสร้าง/ประเด็นสำคัญในการตอบ',
  'เทคนิคช่วยจำ',
] as const

export type WrittenExamSectionName = (typeof WRITTEN_EXAM_SECTION_NAMES)[number]

export type WrittenExamParseIssueCode =
  | 'FRONTMATTER_MISSING'
  | 'FRONTMATTER_INVALID'
  | 'FRONTMATTER_DUPLICATE_KEY'
  | 'FRONTMATTER_UNKNOWN_FIELD'
  | 'FRONTMATTER_FIELD_MISSING'
  | 'FORMAT_VERSION_UNSUPPORTED'
  | 'PACKAGE_CODE_INVALID'
  | 'TITLE_INVALID'
  | 'SLUG_INVALID'
  | 'SOURCE_TOO_LARGE'
  | 'SOURCE_INVALID_UTF8'
  | 'NO_QUESTIONS'
  | 'TOO_MANY_QUESTIONS'
  | 'QUESTION_NUMBER_INVALID'
  | 'QUESTION_NUMBER_SEQUENCE'
  | 'SECTION_MISSING'
  | 'SECTION_DUPLICATE'
  | 'SECTION_ORDER_INVALID'
  | 'SECTION_EMPTY'
  | 'KEYWORDS_INVALID'
  | 'UNEXPECTED_HEADING'
  | 'CONTENT_OUTSIDE_QUESTION'
  | 'UNSAFE_MARKDOWN'

export type WrittenExamParseIssueSeverity = 'fatal' | 'warning'

export interface ParsedWrittenExamMetadata {
  formatVersion: WrittenExamFormatVersion
  packageCode: string
  title: string
  slug: string
}

export interface ParsedWrittenExamQuestion {
  questionNumber: number
  order: number
  questionMarkdown: string
  modelAnswerMarkdown: string
  keywords: string[]
  answerStructureMarkdown: string
  memoryTechniqueMarkdown: string
}

export interface WrittenExamParseIssue {
  severity: WrittenExamParseIssueSeverity
  code: WrittenExamParseIssueCode
  message: string
  line?: number
  questionNumber?: number
  section?: WrittenExamSectionName
}

export interface WrittenExamNormalizationReport {
  bomRemoved: boolean
  lineEndingsNormalized: boolean
}

export interface ParsedWrittenExamMaterial {
  isValid: boolean
  metadata: ParsedWrittenExamMetadata | null
  questions: ParsedWrittenExamQuestion[]
  sourceMarkdown: string
  derived: {
    questionCount: number
  }
  issues: WrittenExamParseIssue[]
  normalization: WrittenExamNormalizationReport
}

interface FrontmatterExtraction {
  yaml: string | null
  body: string
  bodyStartLine: number
  hasOpeningDelimiter: boolean
  hasClosingDelimiter: boolean
}

interface HeadingEntry {
  node: Heading
  index: number
  line: number
  startOffset: number
  endOffset: number
  kind: 'question' | 'malformed-question' | 'section' | 'other'
  questionNumber?: number
  sectionName?: WrittenExamSectionName
}

interface SectionCapture {
  name: WrittenExamSectionName
  line: number
  body: string
}

interface InternalQuestion {
  questionNumber: number
  order: number
  line: number
  sections: SectionCapture[]
}

type WrittenExamIssueFactory = () => WrittenExamParseIssue

class WrittenExamIssueCollector {
  readonly items: WrittenExamParseIssue[] = []

  push(factory: WrittenExamIssueFactory): void {
    if (this.items.length >= MAX_WRITTEN_EXAM_PARSE_ISSUES) return
    this.items.push(factory())
  }

  filter(predicate: (item: WrittenExamParseIssue) => boolean): WrittenExamParseIssue[] {
    return this.items.filter(predicate)
  }

  some(predicate: (item: WrittenExamParseIssue) => boolean): boolean {
    return this.items.some(predicate)
  }

  isFull(): boolean {
    return this.items.length >= MAX_WRITTEN_EXAM_PARSE_ISSUES
  }
}

const markdownParser = unified().use(remarkParse).use(remarkGfm)

/**
 * Parse one Written Exam V1 Markdown source document.
 *
 * This function is intentionally pure: it performs no I/O, database lookup,
 * permission check, or persistence. Package resolution and slug conflict
 * handling belong to the future Import Service.
 */
export function parseWrittenExamMarkdown(source: string): ParsedWrittenExamMaterial {
  const issues = new WrittenExamIssueCollector()

  if (typeof source !== 'string') {
    issues.push(issue('SOURCE_INVALID_UTF8', 'Written Exam source must be a UTF-8 string.'))
    return invalidResult('', issues, { bomRemoved: false, lineEndingsNormalized: false })
  }

  if (containsUnpairedSurrogate(source)) {
    issues.push(issue('SOURCE_INVALID_UTF8', 'Written Exam source contains invalid UTF-16 code units.'))
    return invalidResult(source, issues, { bomRemoved: false, lineEndingsNormalized: false })
  }

  const normalized = normalizeSource(source)
  const sourceMarkdown = normalized.source
  const normalization = normalized.report

  if (byteLength(source) > MAX_WRITTEN_EXAM_SOURCE_BYTES) {
    issues.push(
      issue(
        'SOURCE_TOO_LARGE',
        `Written Exam source exceeds the ${MAX_WRITTEN_EXAM_SOURCE_BYTES}-byte limit.`,
      ),
    )
    return invalidResult(sourceMarkdown, issues, normalization)
  }

  const frontmatter = extractFrontmatter(sourceMarkdown)
  let metadata: ParsedWrittenExamMetadata | null = null

  if (!frontmatter.hasOpeningDelimiter) {
    issues.push(issue('FRONTMATTER_MISSING', 'Written Exam source must begin with YAML frontmatter.'))
  } else if (!frontmatter.hasClosingDelimiter) {
    issues.push(issue('FRONTMATTER_INVALID', 'YAML frontmatter is missing its closing --- delimiter.'))
  } else if (frontmatter.yaml !== null) {
    metadata = parseFrontmatter(frontmatter.yaml, issues)
  }

  let tree: Root | null = null
  try {
    tree = parseMarkdown(frontmatter.body)
  } catch (error) {
    issues.push(
      issue(
        'UNSAFE_MARKDOWN',
        `Markdown could not be parsed safely: ${error instanceof Error ? error.message : String(error)}`,
      ),
    )
  }

  const questions = tree
    ? parseQuestionStructure(tree, frontmatter.body, frontmatter.bodyStartLine, issues)
    : []

  const fatalIssues = issues.filter((item) => item.severity === 'fatal')

  return {
    isValid: fatalIssues.length === 0,
    metadata,
    questions,
    sourceMarkdown,
    derived: { questionCount: questions.length },
    issues: issues.items,
    normalization,
  }
}

/** Alias matching the material-oriented domain name used by the import layer. */
export const parseWrittenExamMaterial = parseWrittenExamMarkdown

function parseMarkdown(source: string): Root {
  return markdownParser.parse(source) as Root
}

function parseFrontmatter(
  yamlSource: string,
  issues: WrittenExamIssueCollector,
): ParsedWrittenExamMetadata | null {
  const yamlLines = yamlSource.split('\n')
  const seenKeys = new Set<string>()
  let shapeIsValid = true

  for (let index = 0; index < yamlLines.length; index += 1) {
    const line = yamlLines[index]
    const trimmed = line.trim()

    if (trimmed === '' || trimmed.startsWith('#')) continue

    if (line !== line.trimStart()) {
      issues.push(
        issue(
          'FRONTMATTER_INVALID',
          'Frontmatter must be a flat mapping without indentation.',
          index + 2,
        ),
      )
      shapeIsValid = false
      continue
    }

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/)
    if (!match) {
      issues.push(issue('FRONTMATTER_INVALID', 'Every frontmatter line must be a key: value mapping.', index + 2))
      shapeIsValid = false
      continue
    }

    const key = match[1]
    const rawValue = match[2]

    if (seenKeys.has(key)) {
      issues.push(issue('FRONTMATTER_DUPLICATE_KEY', `Frontmatter key is duplicated: ${key}.`, index + 2))
      shapeIsValid = false
    }
    seenKeys.add(key)

    if (key === '<<') {
      issues.push(issue('FRONTMATTER_INVALID', 'YAML merge keys are not allowed.', index + 2))
      shapeIsValid = false
    }

    if (/^(?:[&*!]|<<\s*:|[\[{])/.test(rawValue.trim())) {
      issues.push(
        issue(
          'FRONTMATTER_INVALID',
          'Frontmatter values must be single-line scalar strings without anchors, aliases, tags, arrays, or objects.',
          index + 2,
        ),
      )
      shapeIsValid = false
    }

    if (/^[|>]/.test(rawValue.trim())) {
      issues.push(issue('FRONTMATTER_INVALID', 'Multiline YAML scalars are not allowed.', index + 2))
      shapeIsValid = false
    }
  }

  if (!shapeIsValid) return null

  let data: unknown
  try {
    // gray-matter's YAML engine uses js-yaml.safeLoad. The lexical checks above
    // additionally narrow the accepted input to the frozen flat-string shape.
    data = matter(`---\n${yamlSource}\n---\n`).data
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!issues.some((item) => item.code === 'FRONTMATTER_DUPLICATE_KEY')) {
      issues.push(issue('FRONTMATTER_INVALID', `Frontmatter YAML is invalid: ${message}`))
    }
    return null
  }

  if (!isPlainObject(data)) {
    issues.push(issue('FRONTMATTER_INVALID', 'Frontmatter must be a flat YAML mapping.'))
    return null
  }

  const keys = Object.keys(data)
  const allowedKeys = new Set(['format_version', 'package_code', 'title', 'slug'])

  for (const key of keys) {
    if (!allowedKeys.has(key)) {
      issues.push(issue('FRONTMATTER_UNKNOWN_FIELD', `Unknown frontmatter field: ${key}.`))
      shapeIsValid = false
    }
  }

  for (const key of allowedKeys) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) {
      issues.push(issue('FRONTMATTER_FIELD_MISSING', `Required frontmatter field is missing: ${key}.`))
      shapeIsValid = false
    }
  }

  if (!shapeIsValid) return null

  const formatVersion = data.format_version
  const packageCode = data.package_code
  const title = data.title
  const slug = data.slug

  if (formatVersion !== WRITTEN_EXAM_FORMAT_VERSION) {
    issues.push(issue('FORMAT_VERSION_UNSUPPORTED', `Unsupported format_version: ${String(formatVersion)}.`))
  }

  const packageCodeValid = validateMetadataString(
    packageCode,
    1,
    100,
    (value) => value.length > 0,
  )
  if (!packageCodeValid) {
    issues.push(issue('PACKAGE_CODE_INVALID', 'package_code must be a non-empty string without surrounding whitespace.'))
  }

  const titleValid = validateMetadataString(
    title,
    1,
    200,
    (value) => value.length > 0,
  )
  if (!titleValid) {
    issues.push(issue('TITLE_INVALID', 'title must be a non-empty string without surrounding whitespace.'))
  }

  const slugValid =
    typeof slug === 'string' &&
    slug.length >= 1 &&
    slug.length <= 80 &&
    slug === slug.trim() &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
  if (!slugValid) {
    issues.push(issue('SLUG_INVALID', 'slug must match [a-z0-9]+(?:-[a-z0-9]+)* and contain no surrounding whitespace.'))
  }

  if (
    formatVersion !== WRITTEN_EXAM_FORMAT_VERSION ||
    !packageCodeValid ||
    !titleValid ||
    !slugValid
  ) {
    return null
  }

  return {
    formatVersion,
    packageCode,
    title,
    slug,
  }
}

function validateMetadataString(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
  predicate: (value: string) => boolean,
): value is string {
  return (
    typeof value === 'string' &&
    value === value.trim() &&
    Array.from(value).length >= minimumLength &&
    Array.from(value).length <= maximumLength &&
    !value.includes('\n') &&
    !value.includes('\r') &&
    predicate(value)
  )
}

function parseQuestionStructure(
  tree: Root,
  body: string,
  bodyStartLine: number,
  issues: WrittenExamIssueCollector,
): ParsedWrittenExamQuestion[] {
  validateUnsupportedMarkdown(tree, body, bodyStartLine, issues)

  const sourceLines = body.split('\n')
  const topLevelHeadings: HeadingEntry[] = []
  const headingEntriesByNode = new Map<Heading, HeadingEntry>()
  let structuralHeadingLimitReported = false
  for (const child of tree.children) {
    if (child.type !== 'heading') continue

    if (
      topLevelHeadings.length >= MAX_WRITTEN_EXAM_STRUCTURAL_HEADINGS &&
      !structuralHeadingLimitReported
    ) {
      issues.push(
        issue(
          'UNSAFE_MARKDOWN',
          `Written Exam source exceeds the ${MAX_WRITTEN_EXAM_STRUCTURAL_HEADINGS}-heading structural limit.`,
          absoluteNodeLine(child, bodyStartLine),
        ),
      )
      structuralHeadingLimitReported = true
    }

    if (topLevelHeadings.length >= MAX_WRITTEN_EXAM_STRUCTURAL_HEADINGS + 6) {
      break
    }

    const entry = classifyHeading(
      child,
      sourceLines,
      bodyStartLine,
      topLevelHeadings.length,
    )
    topLevelHeadings.push(entry)
    headingEntriesByNode.set(child, entry)
  }

  const questions: InternalQuestion[] = []
  const seenQuestionNumbers = new Set<number>()
  let expectedQuestionNumber = 1
  let current: InternalQuestion | null = null
  let currentSectionName: WrittenExamSectionName | null = null

  for (let index = 0; index < tree.children.length; index += 1) {
    const child = tree.children[index]

    if (child.type === 'heading') {
      const entry = headingEntriesByNode.get(child)
      if (!entry) continue

      if (entry.kind === 'other') {
        issues.push(
          issue(
            'UNEXPECTED_HEADING',
            'Only the frozen Written Exam question and section headings are allowed.',
            entry.line,
          ),
        )
        continue
      }

      if (entry.kind === 'malformed-question') {
        issues.push(
          issue(
            'QUESTION_NUMBER_INVALID',
            'Question heading must be exactly ## ข้อที่ {N}, with an unpadded positive ASCII integer and no trailing text.',
            entry.line,
          ),
        )
        continue
      }

      if (entry.kind === 'question') {
        if (entry.questionNumber === undefined) {
          issues.push(issue('QUESTION_NUMBER_INVALID', 'Question heading has no valid question number.', entry.line))
          continue
        }

        if (seenQuestionNumbers.has(entry.questionNumber)) {
          issues.push(
            issue(
              'QUESTION_NUMBER_INVALID',
              `Question number is duplicated: ${entry.questionNumber}.`,
              entry.line,
              entry.questionNumber,
            ),
          )
        } else if (entry.questionNumber !== expectedQuestionNumber) {
          issues.push(
            issue(
              'QUESTION_NUMBER_SEQUENCE',
              `Expected question ${expectedQuestionNumber}, found ${entry.questionNumber}.`,
              entry.line,
              entry.questionNumber,
            ),
          )
        }

        seenQuestionNumbers.add(entry.questionNumber)
        expectedQuestionNumber = entry.questionNumber + 1

        if (current) questions.push(current)
        current = {
          questionNumber: entry.questionNumber,
          order: questions.length + 1,
          line: entry.line,
          sections: [],
        }
        currentSectionName = null
        continue
      }

      if (!current || entry.sectionName === undefined) {
        issues.push(
          issue(
            'CONTENT_OUTSIDE_QUESTION',
            'A section heading cannot appear before the first question heading.',
            entry.line,
          ),
        )
        continue
      }

      const name = entry.sectionName
      const nextExpected = current.sections.length
        ? WRITTEN_EXAM_SECTION_NAMES[current.sections.length]
        : WRITTEN_EXAM_SECTION_NAMES[0]

      if (current.sections.some((section) => section.name === name)) {
        issues.push(
          issue(
            'SECTION_DUPLICATE',
            `Section is duplicated: ${name}.`,
            entry.line,
            current.questionNumber,
            name,
          ),
        )
      } else if (name !== nextExpected) {
        issues.push(
          issue(
            'SECTION_ORDER_INVALID',
            `Expected section ${nextExpected}, found ${name}.`,
            entry.line,
            current.questionNumber,
            name,
          ),
        )
      }

      current.sections.push({
        name,
        line: entry.line,
        body: sliceHeadingBody(entry, topLevelHeadings, body),
      })
      currentSectionName = name
      continue
    }

    if (!current || currentSectionName === null) {
      issues.push(
        issue(
          'CONTENT_OUTSIDE_QUESTION',
          'Content is not inside a recognized Written Exam question section.',
          absoluteNodeLine(child, bodyStartLine),
        ),
      )
    }
  }

  if (current) questions.push(current)

  if (questions.length === 0) {
    issues.push(issue('NO_QUESTIONS', 'Written Exam document must contain at least one question.'))
  }

  if (questions.length > MAX_WRITTEN_EXAM_QUESTIONS) {
    issues.push(
      issue(
        'TOO_MANY_QUESTIONS',
        `Written Exam document exceeds the ${MAX_WRITTEN_EXAM_QUESTIONS}-question limit.`,
      ),
    )
  }

  return questions.map((question) => finalizeQuestion(question, issues))
}

function finalizeQuestion(
  question: InternalQuestion,
  issues: WrittenExamIssueCollector,
): ParsedWrittenExamQuestion {
  const byName = new Map<WrittenExamSectionName, SectionCapture>()
  for (const section of question.sections) {
    if (!byName.has(section.name)) byName.set(section.name, section)
  }

  for (const name of WRITTEN_EXAM_SECTION_NAMES) {
    const section = byName.get(name)
    if (!section) {
      issues.push(
        issue(
          'SECTION_MISSING',
          `Question ${question.questionNumber} is missing section: ${name}.`,
          question.line,
          question.questionNumber,
          name,
        ),
      )
      continue
    }

    if (section.body.trim() === '') {
      issues.push(
        issue(
          'SECTION_EMPTY',
          `Question ${question.questionNumber} has an empty section: ${name}.`,
          section.line,
          question.questionNumber,
          name,
        ),
      )
    }
  }

  const keywordsSection = byName.get('Keywords')
  const keywords = keywordsSection
    ? parseKeywords(keywordsSection.body, keywordsSection.line, question.questionNumber, issues)
    : []

  return {
    questionNumber: question.questionNumber,
    order: question.order,
    questionMarkdown: byName.get('โจทย์')?.body ?? '',
    modelAnswerMarkdown: byName.get('แนวคำตอบ')?.body ?? '',
    keywords,
    answerStructureMarkdown: byName.get('โครงสร้าง/ประเด็นสำคัญในการตอบ')?.body ?? '',
    memoryTechniqueMarkdown: byName.get('เทคนิคช่วยจำ')?.body ?? '',
  }
}

function parseKeywords(
  source: string,
  sectionLine: number,
  questionNumber: number,
  issues: WrittenExamIssueCollector,
): string[] {
  let tree: Root
  try {
    tree = parseMarkdown(source)
  } catch (error) {
    issues.push(
      issue(
        'KEYWORDS_INVALID',
        `Keywords Markdown could not be parsed: ${error instanceof Error ? error.message : String(error)}.`,
        sectionLine,
        questionNumber,
        'Keywords',
      ),
    )
    return []
  }

  if (tree.children.length !== 1 || tree.children[0]?.type !== 'list') {
    issues.push(
      issue(
        'KEYWORDS_INVALID',
        'Keywords must contain exactly one top-level unordered list.',
        sectionLine,
        questionNumber,
        'Keywords',
      ),
    )
    return []
  }

  const list = tree.children[0] as List
  if (list.ordered) {
    issues.push(
      issue(
        'KEYWORDS_INVALID',
        'Keywords must use an unordered list with the - marker.',
        sectionLine,
        questionNumber,
        'Keywords',
      ),
    )
    return []
  }

  if (list.children.length < 1 || list.children.length > MAX_WRITTEN_EXAM_KEYWORDS) {
    issues.push(
      issue(
        'KEYWORDS_INVALID',
        `Keywords must contain 1–${MAX_WRITTEN_EXAM_KEYWORDS} items.`,
        sectionLine,
        questionNumber,
        'Keywords',
      ),
    )
  }

  const keywords: string[] = []
  let invalid = false

  for (const item of list.children) {
    const rawLine = firstSourceLine(source, item.position?.start.offset ?? 0)
    if (
      !rawLine.startsWith('- ') ||
      rawLine.length <= 2 ||
      rawLine.slice(2) !== rawLine.slice(2).trimStart() ||
      item.position?.start.line !== item.position?.end.line
    ) {
      invalid = true
      continue
    }

    const listItem = item as ListItem
    if (
      (listItem.checked !== null && listItem.checked !== undefined) ||
      listItem.children.length !== 1 ||
      listItem.children[0]?.type !== 'paragraph'
    ) {
      invalid = true
      continue
    }

    const paragraph = listItem.children[0]
    if (!paragraph.children.every((child) => child.type === 'text')) {
      invalid = true
      continue
    }

    const keyword = paragraph.children.map((child) => child.value).join('').trim()
    if (
      keyword.length === 0 ||
      Array.from(keyword).length > MAX_WRITTEN_EXAM_KEYWORD_LENGTH ||
      keywords.includes(keyword)
    ) {
      invalid = true
      continue
    }

    keywords.push(keyword)
  }

  if (invalid || keywords.length !== list.children.length) {
    issues.push(
      issue(
        'KEYWORDS_INVALID',
        'Each Keyword must be one non-empty plain-text top-level item using exactly the - marker, with no duplicates.',
        sectionLine,
        questionNumber,
        'Keywords',
      ),
    )
  }

  return keywords
}

function validateUnsupportedMarkdown(
  tree: Root,
  body: string,
  bodyStartLine: number,
  issues: WrittenExamIssueCollector,
): void {
  const referenceDefinitions = collectReferenceDefinitions(tree, bodyStartLine, issues)

  walkNodes(tree, 0, (node, nestingDepth) => {
    if (nestingDepth > MAX_WRITTEN_EXAM_MARKDOWN_NESTING_DEPTH) {
      issues.push(
        issue(
          'UNSAFE_MARKDOWN',
          `Markdown nesting exceeds the ${MAX_WRITTEN_EXAM_MARKDOWN_NESTING_DEPTH}-level limit.`,
          absoluteNodeLine(node, bodyStartLine),
        ),
      )
      return false
    }

    if (node.type === 'heading') return

    if (node.type === 'linkReference') {
      const reference = node as LinkReference
      if (!referenceDefinitions.has(reference.identifier)) {
        issues.push(
          issue(
            'UNSAFE_MARKDOWN',
            `Markdown reference has no valid definition: ${reference.identifier}.`,
            absoluteNodeLine(node, bodyStartLine),
          ),
        )
      }
      return
    }

    if (node.type === 'definition') return

    if (node.type === 'text') {
      reportUnresolvedReferenceSyntax(node, body, referenceDefinitions, bodyStartLine, issues)
      return
    }

    if (node.type === 'link') {
      const link = node as Link
      if (!isSafeLink(link.url)) {
        issues.push(
          issue(
            'UNSAFE_MARKDOWN',
            `Unsafe or unsupported link URL: ${link.url}.`,
            absoluteNodeLine(node, bodyStartLine),
          ),
        )
      }
      return
    }

    if (ALLOWED_MARKDOWN_NODE_TYPES.has(node.type)) return

    issues.push(
      issue(
        'UNSAFE_MARKDOWN',
        `Unsupported or unsafe Markdown node: ${node.type}.`,
        absoluteNodeLine(node, bodyStartLine),
      ),
    )
  }, () => issues.isFull())

  walkNestedHeadings(tree, bodyStartLine, issues)
}

function collectReferenceDefinitions(
  tree: Root,
  bodyStartLine: number,
  issues: WrittenExamIssueCollector,
): Map<string, Definition> {
  const definitions = new Map<string, Definition>()

  for (const child of tree.children) {
    if (issues.isFull()) break
    if (child.type !== 'definition') continue

    const definition = child as Definition
    const safe = isSafeLink(definition.url)
    if (!safe) {
      issues.push(
        issue(
          'UNSAFE_MARKDOWN',
          `Unsafe or unsupported reference definition URL: ${definition.url}.`,
          absoluteNodeLine(definition, bodyStartLine),
        ),
      )
    }

    if (definitions.has(definition.identifier)) {
      issues.push(
        issue(
          'UNSAFE_MARKDOWN',
          `Duplicate Markdown reference definition: ${definition.identifier}.`,
          absoluteNodeLine(definition, bodyStartLine),
        ),
      )
      continue
    }

    if (safe) definitions.set(definition.identifier, definition)
  }

  return definitions
}

function reportUnresolvedReferenceSyntax(
  node: Node,
  body: string,
  referenceDefinitions: ReadonlyMap<string, Definition>,
  bodyStartLine: number,
  issues: WrittenExamIssueCollector,
): void {
  const position = node.position
  const value = node as Node & { value?: unknown }
  if (
    !position ||
    typeof position.start.offset !== 'number' ||
    typeof position.end.offset !== 'number' ||
    typeof value.value !== 'string'
  ) {
    return
  }

  const raw = body.slice(position.start.offset, position.end.offset)

  let labelStart = -1
  let labelEnd = -1
  let referenceStart = -1
  let backslashRun = 0

  for (let index = 0; index < raw.length; index += 1) {
    if (issues.isFull()) return

    const character = raw[index]
    const escaped = backslashRun % 2 === 1

    if (character === '\n' || character === '\r') {
      labelStart = -1
      labelEnd = -1
      referenceStart = -1
    } else if (character === '[' && !escaped) {
      if (referenceStart !== -1 || labelStart !== -1) {
        // Unescaped nested brackets cannot form the frozen reference shape.
        // Treat the newest opening bracket as the next candidate in the same
        // linear pass.
        labelEnd = -1
        referenceStart = -1
      }
      labelStart = index
    } else if (character === ']' && !escaped) {
      if (referenceStart !== -1) {
        const label = raw.slice(labelStart + 1, labelEnd)
        const explicitIdentifier = raw.slice(referenceStart + 1, index)
        const identifier = normalizeReferenceIdentifier(explicitIdentifier || label)

        if (identifier && !referenceDefinitions.has(identifier)) {
          issues.push(
            issue(
              'UNSAFE_MARKDOWN',
              `Markdown reference has no valid definition: ${identifier}.`,
              absoluteNodeLine(node, bodyStartLine),
            ),
          )
        }

        labelStart = -1
        labelEnd = -1
        referenceStart = -1
      } else if (labelStart !== -1) {
        if (index === labelStart + 1) {
          labelStart = -1
        } else if (raw[index + 1] === '[') {
          labelEnd = index
          referenceStart = index + 1
          index += 1
        } else {
          labelStart = -1
        }
      }
    }

    if (character === '\\') {
      backslashRun += 1
    } else {
      backslashRun = 0
    }
  }
}

function normalizeReferenceIdentifier(value: string): string {
  return value.trim().replace(/[\t\n\r ]+/g, ' ').toLowerCase()
}

const ALLOWED_MARKDOWN_NODE_TYPES = new Set([
  'root',
  'paragraph',
  'text',
  'emphasis',
  'strong',
  'delete',
  'inlineCode',
  'break',
  'link',
  'linkReference',
  'list',
  'listItem',
  'table',
  'tableRow',
  'tableCell',
  'definition',
])

const MARKDOWN_NESTING_NODE_TYPES = new Set([
  'blockquote',
  'delete',
  'emphasis',
  'link',
  'list',
  'strong',
  'table',
])

function walkNestedHeadings(
  tree: Root,
  bodyStartLine: number,
  issues: WrittenExamIssueCollector,
): void {
  const stack: Array<{ node: Node; nestingDepth: number }> = []
  const rootChildren = nodeChildren(tree)

  for (let index = rootChildren.length - 1; index >= 0; index -= 1) {
    const child = rootChildren[index]
    if (child.type !== 'heading') stack.push({ node: child, nestingDepth: 0 })
  }

  while (stack.length > 0 && !issues.isFull()) {
    const frame = stack.pop()
    if (!frame) continue

    const nodeDepth = MARKDOWN_NESTING_NODE_TYPES.has(frame.node.type)
      ? frame.nestingDepth + 1
      : frame.nestingDepth
    if (nodeDepth > MAX_WRITTEN_EXAM_MARKDOWN_NESTING_DEPTH) continue

    if (frame.node.type === 'heading') {
      issues.push(
        issue(
          'UNEXPECTED_HEADING',
          'Markdown headings are only allowed for the frozen top-level question grammar.',
          absoluteNodeLine(frame.node, bodyStartLine),
        ),
      )
    }

    const children = nodeChildren(frame.node)
    for (let index = children.length - 1; index >= 0 && !issues.isFull(); index -= 1) {
      const child = children[index]
      stack.push({ node: child, nestingDepth: nodeDepth })
    }
  }
}

function walkNodes(
  node: Node,
  nestingDepth: number,
  visitor: (node: Node, nestingDepth: number) => boolean | void,
  shouldStop: () => boolean = () => false,
): void {
  const stack: Array<{ node: Node; nestingDepth: number }> = [{ node, nestingDepth }]

  while (stack.length > 0 && !shouldStop()) {
    const frame = stack.pop()
    if (!frame) continue

    const nextDepth = MARKDOWN_NESTING_NODE_TYPES.has(frame.node.type)
      ? frame.nestingDepth + 1
      : frame.nestingDepth
    if (visitor(frame.node, nextDepth) === false) continue

    const children = nodeChildren(frame.node)
    for (let index = children.length - 1; index >= 0 && !shouldStop(); index -= 1) {
      stack.push({ node: children[index], nestingDepth: nextDepth })
    }
  }
}

function nodeChildren(node: Node): Node[] {
  const candidate = node as Node & { children?: unknown[] }
  return Array.isArray(candidate.children)
    ? candidate.children.filter(isNode)
    : []
}

function isNode(value: unknown): value is Node {
  return Boolean(value && typeof value === 'object' && 'type' in value && typeof (value as { type?: unknown }).type === 'string')
}

function classifyHeading(
  node: Heading,
  sourceLines: string[],
  bodyStartLine: number,
  index: number,
): HeadingEntry {
  const line = absoluteNodeLine(node, bodyStartLine)
  const rawLine = sourceLineAt(sourceLines, node.position?.start.line ?? 1)
  const startOffset = node.position?.start.offset ?? 0
  const endOffset = node.position?.end.offset ?? startOffset

  const questionMatch = rawLine.match(/^## ข้อที่ ([1-9][0-9]*)$/)
  if (questionMatch) {
    const questionNumber = Number(questionMatch[1])
    if (!Number.isSafeInteger(questionNumber)) {
      return {
        node,
        index,
        line,
        startOffset,
        endOffset,
        kind: 'malformed-question',
      }
    }

    return {
      node,
      index,
      line,
      startOffset,
      endOffset,
      kind: 'question',
      questionNumber,
    }
  }

  if (node.depth === 2 && rawLine.trimStart().startsWith('## ข้อที่')) {
    return {
      node,
      index,
      line,
      startOffset,
      endOffset,
      kind: 'malformed-question',
    }
  }

  const sectionName = WRITTEN_EXAM_SECTION_NAMES.find(
    (candidate) => rawLine === `### ${candidate}`,
  )
  if (sectionName) {
    return {
      node,
      index,
      line,
      startOffset,
      endOffset,
      kind: 'section',
      sectionName,
    }
  }

  return { node, index, line, startOffset, endOffset, kind: 'other' }
}

function sliceHeadingBody(entry: HeadingEntry, headings: HeadingEntry[], body: string): string {
  const nextHeading = headings[entry.index + 1]
  const endOffset = nextHeading?.startOffset ?? body.length
  return trimBoundaryBlankLines(body.slice(entry.endOffset, endOffset))
}

function trimBoundaryBlankLines(value: string): string {
  const lines = value.split('\n')
  let firstRetainedLine = 0
  let lastRetainedLine = lines.length

  while (firstRetainedLine < lastRetainedLine && lines[firstRetainedLine].trim() === '') {
    firstRetainedLine += 1
  }

  while (lastRetainedLine > firstRetainedLine && lines[lastRetainedLine - 1].trim() === '') {
    lastRetainedLine -= 1
  }

  return lines.slice(firstRetainedLine, lastRetainedLine).join('\n')
}

function extractFrontmatter(source: string): FrontmatterExtraction {
  const lines = source.split('\n')
  if (lines[0] !== '---') {
    return {
      yaml: null,
      body: source,
      bodyStartLine: 1,
      hasOpeningDelimiter: false,
      hasClosingDelimiter: false,
    }
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && line === '---')
  if (closingIndex === -1) {
    return {
      yaml: null,
      body: '',
      bodyStartLine: lines.length + 1,
      hasOpeningDelimiter: true,
      hasClosingDelimiter: false,
    }
  }

  return {
    yaml: lines.slice(1, closingIndex).join('\n'),
    body: lines.slice(closingIndex + 1).join('\n'),
    bodyStartLine: closingIndex + 2,
    hasOpeningDelimiter: true,
    hasClosingDelimiter: true,
  }
}

function normalizeSource(source: string): {
  source: string
  report: WrittenExamNormalizationReport
} {
  const bomRemoved = source.charCodeAt(0) === 0xfeff
  const withoutBom = bomRemoved ? source.slice(1) : source
  const lineEndingsNormalized = /\r/.test(withoutBom)
  const normalized = withoutBom.replace(/\r\n?/g, '\n')

  return {
    source: normalized,
    report: { bomRemoved, lineEndingsNormalized },
  }
}

function isSafeLink(value: string): boolean {
  if (value.startsWith('//')) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

function sourceLineAt(sourceLines: readonly string[], oneIndexedLine: number): string {
  return sourceLines[oneIndexedLine - 1] ?? ''
}

function firstSourceLine(source: string, offset: number): string {
  const lineStart = source.lastIndexOf('\n', Math.max(0, offset - 1)) + 1
  const lineEnd = source.indexOf('\n', offset)
  return source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd)
}

function absoluteNodeLine(node: Node, bodyStartLine: number): number {
  return bodyStartLine + (node.position?.start.line ?? 1) - 1
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

function containsUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next < 0xdc00 || next > 0xdfff || Number.isNaN(next)) return true
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true
    }
  }
  return false
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function issue(
  code: WrittenExamParseIssueCode,
  message: string,
  line?: number,
  questionNumber?: number,
  section?: WrittenExamSectionName,
): WrittenExamIssueFactory {
  return () => ({
    severity: 'fatal',
    code,
    message,
    ...(line === undefined ? {} : { line }),
    ...(questionNumber === undefined ? {} : { questionNumber }),
    ...(section === undefined ? {} : { section }),
  })
}

function invalidResult(
  sourceMarkdown: string,
  issues: WrittenExamIssueCollector,
  normalization: WrittenExamNormalizationReport,
): ParsedWrittenExamMaterial {
  return {
    isValid: false,
    metadata: null,
    questions: [],
    sourceMarkdown,
    derived: { questionCount: 0 },
    issues: issues.items,
    normalization,
  }
}
