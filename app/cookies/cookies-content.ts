import fs from 'node:fs'
import path from 'node:path'

export interface CookiesSection {
  num: number
  numFormatted: string
  title: string
  fullHeading: string
  id: string
  body: string
  hasCallout: boolean
}

export interface CookiesPreamble {
  title: string
  lastUpdated: string
  body: string
  raw: string
}

export interface QuickNavItem {
  num: number
  numFormatted: string
  id: string
  title: string
  description: string
}

export const QUICK_NAV_SECTIONS: QuickNavItem[] = [
  {
    num: 2,
    numFormatted: '02',
    id: 'section-2',
    title: 'ประเภทคุกกี้ที่ Sobdai ใช้',
    description: 'คุกกี้ที่จำเป็น คุกกี้วิเคราะห์ เทคโนโลยีโฆษณา และลิงก์แนะนำ',
  },
  {
    num: 3,
    numFormatted: '03',
    id: 'section-3',
    title: 'คุกกี้และเครื่องมือที่อาจพบ',
    description: 'ตารางแจกแจงชื่อผู้ให้บริการ วัตถุประสงค์ และระยะเวลาจัดเก็บ',
  },
  {
    num: 4,
    numFormatted: '04',
    id: 'section-4',
    title: 'การยอมรับหรือปฏิเสธคุกกี้',
    description: 'เงื่อนไขการให้ความยินยอมและการทำงานของคุกกี้แต่ละประเภท',
  },
  {
    num: 5,
    numFormatted: '05',
    id: 'section-5',
    title: 'การเปลี่ยนแปลงหรือถอนความยินยอม',
    description: 'ขั้นตอนการปรับเปลี่ยนหรือถอนความยินยอมคุกกี้วิเคราะห์',
  },
  {
    num: 8,
    numFormatted: '08',
    id: 'section-8',
    title: 'ติดต่อเรา',
    description: 'ช่องทางติดต่อทีมงานสำหรับข้อสงสัยเกี่ยวกับนโยบายคุกกี้',
  },
]

/**
 * Parses raw Cookie Policy markdown from content/legal/cookies.md into structured preamble and sections.
 * Guarantees that every section and its full body content is extracted without alteration.
 */
export function parseCookiesMarkdown(rawMarkdown: string): {
  preamble: CookiesPreamble
  sections: CookiesSection[]
  lastUpdated: string
} {
  const chunks = rawMarkdown.split(/\n---\n/).map((c) => c.trim()).filter(Boolean)

  if (chunks.length !== 9) {
    throw new Error(
      `Expected exactly 9 markdown blocks (1 preamble + 8 legal sections) in cookies.md, but found ${chunks.length}`
    )
  }

  // Block 0: Preamble
  const preambleRaw = chunks[0]
  const dateMatch = preambleRaw.match(/อัปเดตล่าสุด:\s*([^\n\r]+)/)
  const lastUpdated = dateMatch ? dateMatch[1].trim() : ''

  if (!lastUpdated) {
    throw new Error("Failed to extract 'อัปเดตล่าสุด' date from cookies.md preamble")
  }

  const preambleLines = preambleRaw.split('\n').map((l) => l.trim()).filter(Boolean)
  const titleLine = preambleLines[0].replace(/^#\s*/, '')
  // Body text of preamble starts after title and date line
  const preambleBodyLines = preambleRaw
    .split('\n')
    .filter((line) => !line.startsWith('#') && !line.includes('อัปเดตล่าสุด:'))
    .join('\n')
    .trim()

  const preamble: CookiesPreamble = {
    title: titleLine,
    lastUpdated,
    body: preambleBodyLines,
    raw: preambleRaw,
  }

  // Blocks 1 through 8: Sections
  const calloutSectionNumbers = new Set([4, 5, 6, 8])

  const sections: CookiesSection[] = chunks.slice(1).map((chunk, index) => {
    const lines = chunk.split('\n')
    const headingLine = lines[0]
    const match = headingLine.match(/^##\s+(\d+)\.\s*(.+)$/)

    if (!match) {
      throw new Error(`Section ${index + 1} heading does not match format '## N. Title': ${headingLine}`)
    }

    const num = parseInt(match[1], 10)
    const title = match[2].trim()
    const body = lines.slice(1).join('\n').trim()

    return {
      num,
      numFormatted: String(num).padStart(2, '0'),
      title,
      fullHeading: `${num}. ${title}`,
      id: `section-${num}`,
      body,
      hasCallout: calloutSectionNumbers.has(num),
    }
  })

  return { preamble, sections, lastUpdated: preamble.lastUpdated }
}

/**
 * Loads cookies.md directly from disk and returns parsed sections and metadata.
 */
export function getCookiesData(customPath?: string): {
  rawContent: string
  preamble: CookiesPreamble
  sections: CookiesSection[]
  lastUpdated: string
} {
  const filePath = customPath || path.join(/*turbopackIgnore: true*/ process.cwd(), 'content', 'legal', 'cookies.md')
  const rawContent = fs.readFileSync(filePath, 'utf8')
  const { preamble, sections } = parseCookiesMarkdown(rawContent)

  return {
    rawContent,
    preamble,
    sections,
    lastUpdated: preamble.lastUpdated,
  }
}
