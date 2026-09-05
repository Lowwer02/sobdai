import fs from 'node:fs'
import path from 'node:path'

export interface TermsSection {
  num: number
  numFormatted: string
  title: string
  fullHeading: string
  id: string
  body: string
  hasCallout: boolean
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
    num: 1,
    numFormatted: '01',
    id: 'section-1',
    title: 'การยอมรับข้อกำหนด',
    description: 'ข้อตกลงและเงื่อนไขเริ่มต้นก่อนเข้าใช้งานระบบ Sobdai',
  },
  {
    num: 4,
    numFormatted: '04',
    id: 'section-4',
    title: 'สิทธิ์การใช้งาน',
    description: 'สิทธิ์การใช้งานเฉพาะบุคคลและข้อจำกัดการใช้งานลิขสิทธิ์',
  },
  {
    num: 5,
    numFormatted: '05',
    id: 'section-5',
    title: 'การซื้อแพ็กเกจ',
    description: 'การชำระเงินและการผูกสิทธิ์การใช้งานกับบัญชีผู้ใช้',
  },
  {
    num: 6,
    numFormatted: '06',
    id: 'section-6',
    title: 'นโยบายการคืนเงิน',
    description: 'ข้อกำหนดสินค้าดิจิทัลและการพิจารณาข้อผิดพลาดระบบ',
  },
  {
    num: 8,
    numFormatted: '08',
    id: 'section-8',
    title: 'การระงับบัญชี',
    description: 'เงื่อนไขการจำกัดสิทธิ์และการระงับบัญชีผู้ใช้งาน',
  },
]

/**
 * Parses raw Terms markdown from content/legal/terms.md into structured sections.
 * Guarantees that every section and its full body content is extracted without alteration.
 */
export function parseTermsMarkdown(rawMarkdown: string): TermsSection[] {
  const chunks = rawMarkdown.split(/\n---\n/).map((c) => c.trim()).filter(Boolean)

  if (chunks.length !== 12) {
    throw new Error(`Expected exactly 12 legal sections in terms.md, but found ${chunks.length}`)
  }

  const calloutSectionNumbers = new Set([4, 6, 7, 8, 10])

  return chunks.map((chunk, index) => {
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
}

/**
 * Loads terms.md directly from disk and returns parsed sections.
 */
export function getTermsData(customPath?: string): {
  rawContent: string
  sections: TermsSection[]
} {
  const filePath = customPath || path.join(/*turbopackIgnore: true*/ process.cwd(), 'content', 'legal', 'terms.md')
  const rawContent = fs.readFileSync(filePath, 'utf8')
  const sections = parseTermsMarkdown(rawContent)
  return { rawContent, sections }
}
