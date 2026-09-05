import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { TermsSection } from '@/app/terms/terms-content'
import styles from '@/app/terms/terms.module.css'

interface TermsSectionCardProps {
  section: TermsSection
}

interface SectionPart {
  type: 'normal' | 'callout'
  label?: string
  content: string
}

/**
 * Splits section body into standard reading text and restrained callout emphasis blocks.
 * GUARANTEE: The concatenated content of all parts exactly matches the original section body.
 */
function getSectionParts(secNum: number, body: string): SectionPart[] {
  const blocks = body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)

  if (secNum === 4 && blocks.length >= 5) {
    return [
      { type: 'normal', content: blocks.slice(0, 2).join('\n\n') },
      { type: 'callout', label: 'ข้อห้ามและข้อจำกัดการใช้งาน', content: blocks.slice(2, 4).join('\n\n') },
      { type: 'normal', content: blocks[4] },
    ]
  }

  if (secNum === 6 && blocks.length >= 5) {
    return [
      { type: 'normal', content: blocks[0] },
      { type: 'callout', label: 'เงื่อนไขการคืนเงินสำหรับสินค้าดิจิทัล', content: blocks[1] },
      { type: 'normal', content: blocks.slice(2).join('\n\n') },
    ]
  }

  if (secNum === 7) {
    return [
      { type: 'callout', label: 'พฤติกรรมต้องห้ามบนระบบ', content: blocks.join('\n\n') },
    ]
  }

  if (secNum === 8 && blocks.length >= 5) {
    return [
      { type: 'normal', content: blocks.slice(0, 4).join('\n\n') },
      { type: 'callout', label: 'เงื่อนไขการระงับและจำกัดสิทธิ์', content: blocks[4] },
    ]
  }

  if (secNum === 10 && blocks.length >= 5) {
    return [
      { type: 'normal', content: blocks[0] },
      { type: 'callout', label: 'การให้บริการตามสภาพ', content: blocks[1] },
      { type: 'normal', content: blocks.slice(2, 4).join('\n\n') },
      { type: 'callout', label: 'การยอมรับความเสี่ยง', content: blocks[4] },
    ]
  }

  return [{ type: 'normal', content: body }]
}

export default function TermsSectionCard({ section }: TermsSectionCardProps) {
  const parts = getSectionParts(section.num, section.body)

  return (
    <section id={section.id} className={styles.legalCard} aria-labelledby={`heading-${section.num}`}>
      {/* Section Header: Number Badge & Exact Heading */}
      <div className={styles.cardHeader}>
        <span className={styles.sectionBadge} aria-hidden="true">
          {section.numFormatted}
        </span>
        <h2 id={`heading-${section.num}`} className={styles.sectionH2}>
          {section.fullHeading}
        </h2>
      </div>

      {/* Section Body */}
      <div className={styles.cardBody}>
        {parts.map((part, idx) => {
          if (part.type === 'callout') {
            return (
              <div key={idx} className={styles.legalCallout} role="note" aria-label={part.label}>
                <div className={styles.calloutHeader}>
                  <svg
                    className={styles.calloutIcon}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{part.label}</span>
                </div>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.content}</ReactMarkdown>
              </div>
            )
          }

          return <ReactMarkdown key={idx} remarkPlugins={[remarkGfm]}>{part.content}</ReactMarkdown>
        })}
      </div>
    </section>
  )
}
