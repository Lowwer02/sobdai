import matter from 'gray-matter'

export interface SummaryMetadata {
  title: string
  slug: string
  subject?: string
  law?: string
  topic?: string
  package?: string
  published?: boolean
  sort?: number
}

export interface ParsedSummary {
  metadata: SummaryMetadata
  content: string
  read_time_minutes: number
  isValid: boolean
  errors: string[]
}

export function parseMarkdownSummary(markdown: string): ParsedSummary {
  const errors: string[] = []
  
  let parsed: matter.GrayMatterFile<string>
  try {
    parsed = matter(markdown)
  } catch (e: any) {
    return {
      metadata: {} as SummaryMetadata,
      content: markdown,
      read_time_minutes: 0,
      isValid: false,
      errors: [`Failed to parse Markdown Frontmatter: ${e.message}`]
    }
  }

  const { data, content } = parsed

  const title = data.title || ''
  const slug = data.slug || ''
  const pkg = data.package || ''
  
  if (!title) errors.push('Missing "title" in metadata')
  if (!slug) errors.push('Missing "slug" in metadata')
  if (!pkg) errors.push('Missing "package" in metadata')
  if (!content.trim()) errors.push('Markdown body is empty')

  const wordCount = content.trim().split(/\s+/).length
  const read_time_minutes = Math.max(1, Math.ceil(wordCount / 200))

  return {
    metadata: {
      title,
      slug,
      subject: data.subject || '',
      law: data.law || '',
      topic: data.topic || '',
      package: pkg,
      published: data.published === true || data.published === 'true',
      sort: data.sort ? parseInt(data.sort, 10) : 0
    },
    content: content.trim(),
    read_time_minutes,
    isValid: errors.length === 0,
    errors
  }
}
