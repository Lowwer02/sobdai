import fs from 'node:fs'
import path from 'node:path'

export interface PrivacySection {
  num: number
  numFormatted: string
  title: string
  fullHeading: string
  id: string
  body: string
  hasCallout: boolean
}

export interface PrivacyPreamble {
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
    title: 'ข้อมูลที่ Sobdai อาจเก็บรวบรวม',
    description: 'ประเภทข้อมูลบัญชี การเรียน และข้อมูลการใช้งานอุปกรณ์',
  },
  {
    num: 3,
    numFormatted: '03',
    id: 'section-3',
    title: 'วัตถุประสงค์ในการใช้ข้อมูล',
    description: 'ขอบเขตและเป้าหมายการนำข้อมูลไปประมวลผลเพื่อการให้บริการ',
  },
  {
    num: 4,
    numFormatted: '04',
    id: 'section-4',
    title: 'คุกกี้และเทคโนโลยีจากผู้ให้บริการ',
    description: 'คุกกี้จำเป็น คุกกี้วิเคราะห์ และเทคโนโลยีโฆษณา',
  },
  {
    num: 9,
    numFormatted: '09',
    id: 'section-9',
    title: 'สิทธิของเจ้าของข้อมูล',
    description: 'สิทธิ์ในการเข้าถึง ขอสำเนา แก้ไข ลบ และระงับการประมวลผล',
  },
  {
    num: 14,
    numFormatted: '14',
    id: 'section-14',
    title: 'ติดต่อเรา',
    description: 'ช่องทางติดต่อทีมงานเพื่อสอบถามหรือยื่นคำร้องขอใช้สิทธิ',
  },
]

/**
 * Parses raw Privacy Policy markdown from content/legal/privacy.md into structured preamble and sections.
 * Guarantees that every section and its full body content is extracted without alteration.
 */
export function parsePrivacyMarkdown(rawMarkdown: string): {
  preamble: PrivacyPreamble
  sections: PrivacySection[]
  lastUpdated: string
} {
  const chunks = rawMarkdown.split(/\n---\n/).map((c) => c.trim()).filter(Boolean)

  if (chunks.length !== 15) {
    throw new Error(
      `Expected exactly 15 markdown blocks (1 preamble + 14 legal sections) in privacy.md, but found ${chunks.length}`
    )
  }

  // Block 0: Preamble
  const preambleRaw = chunks[0]
  const dateMatch = preambleRaw.match(/อัปเดตล่าสุด:\s*([^\n\r]+)/)
  const lastUpdated = dateMatch ? dateMatch[1].trim() : ''

  if (!lastUpdated) {
    throw new Error("Failed to extract 'อัปเดตล่าสุด' date from privacy.md preamble")
  }

  const preambleLines = preambleRaw.split('\n').map((l) => l.trim()).filter(Boolean)
  const titleLine = preambleLines[0].replace(/^#\s*/, '')
  // Body text of preamble starts after title and date line
  const preambleBodyLines = preambleRaw
    .split('\n')
    .filter((line) => !line.startsWith('#') && !line.includes('อัปเดตล่าสุด:'))
    .join('\n')
    .trim()

  const preamble: PrivacyPreamble = {
    title: titleLine,
    lastUpdated,
    body: preambleBodyLines,
    raw: preambleRaw,
  }

  // Blocks 1 through 14: Sections
  const calloutSectionNumbers = new Set([4, 5, 8, 9, 10, 14])

  const sections: PrivacySection[] = chunks.slice(1).map((chunk, index) => {
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
 * Loads privacy.md directly from disk and returns parsed sections and metadata.
 */
export function getPrivacyData(customPath?: string): {
  rawContent: string
  preamble: PrivacyPreamble
  sections: PrivacySection[]
  lastUpdated: string
} {
  const filePath = customPath || path.join(/*turbopackIgnore: true*/ process.cwd(), 'content', 'legal', 'privacy.md')
  const rawContent = fs.readFileSync(filePath, 'utf8')
  const { preamble, sections } = parsePrivacyMarkdown(rawContent)
  return {
    rawContent,
    preamble,
    sections,
    lastUpdated: preamble.lastUpdated,
  }
}
