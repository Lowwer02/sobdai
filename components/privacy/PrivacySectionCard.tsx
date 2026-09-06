import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { PrivacySection, PrivacyPreamble } from '@/app/privacy/privacy-content'
import styles from '@/app/privacy/privacy.module.css'

interface PrivacySectionCardProps {
  section: PrivacySection
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
      { type: 'normal', content: blocks[0] },
      { type: 'callout', label: 'ประเภทคุกกี้และเทคโนโลยีที่ใช้งาน', content: blocks[1] },
      { type: 'normal', content: blocks.slice(2).join('\n\n') },
    ]
  }

  if (secNum === 5 && blocks.length >= 2) {
    return [
      { type: 'normal', content: blocks[0] },
      { type: 'callout', label: 'ฐานทางกฎหมายในการประมวลผลข้อมูลส่วนบุคคล', content: blocks.slice(1).join('\n\n') },
    ]
  }

  if (secNum === 8) {
    return [
      { type: 'callout', label: 'มาตรการรักษาความปลอดภัยและข้อจำกัดตามสภาพความเป็นจริง', content: body },
    ]
  }

  if (secNum === 9 && blocks.length >= 2) {
    return [
      { type: 'normal', content: blocks[0] },
      { type: 'callout', label: 'สิทธิของเจ้าของข้อมูลส่วนบุคคลตามกฎหมาย', content: blocks.slice(1).join('\n\n') },
    ]
  }

  if (secNum === 10 && blocks.length >= 5) {
    return [
      { type: 'normal', content: blocks[0] },
      { type: 'callout', label: 'ขั้นตอนการถอนความยินยอมคุกกี้วิเคราะห์', content: blocks[1] },
      { type: 'normal', content: blocks.slice(2).join('\n\n') },
    ]
  }

  if (secNum === 14 && blocks.length >= 2) {
    return [
      { type: 'normal', content: blocks[0] },
      { type: 'callout', label: 'ช่องทางติดต่ออย่างเป็นทางการ', content: blocks.slice(1).join('\n\n') },
    ]
  }

  return [{ type: 'normal', content: body }]
}

/**
 * Preamble Card for the introductory section of the Privacy Policy.
 */
export function PrivacyPreambleCard({ preamble }: { preamble: PrivacyPreamble }) {
  return (
    <div className={styles.preambleCard} role="region" aria-label="บทนำนโยบายความเป็นส่วนตัว">
      <div className={styles.preambleHeader}>
        <svg
          className={styles.preambleIcon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <h2 className={styles.preambleTitle}>{preamble.title}</h2>
      </div>

      <div className={styles.preambleDateBadge}>
        อัปเดตล่าสุด: {preamble.lastUpdated}
      </div>

      <div className={styles.cardBody}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{preamble.body}</ReactMarkdown>
      </div>
    </div>
  )
}

/**
 * Section Card for each of the 14 numbered sections.
 */
export default function PrivacySectionCard({ section }: PrivacySectionCardProps) {
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
            const isContactSection = section.num === 14
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
                {isContactSection && (
                  <div className={styles.calloutEmailBox}>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#D4A63A"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                    <a href="mailto:support.sobdai@gmail.com" className={styles.calloutEmailLink}>
                      support.sobdai@gmail.com
                    </a>
                  </div>
                )}
              </div>
            )
          }

          return <ReactMarkdown key={idx} remarkPlugins={[remarkGfm]}>{part.content}</ReactMarkdown>
        })}
      </div>
    </section>
  )
}
