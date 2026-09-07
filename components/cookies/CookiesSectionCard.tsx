import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CookiesSection, CookiesPreamble } from '@/app/cookies/cookies-content'
import CookiePreferencesButton from '@/components/cookies/CookiePreferencesButton'
import styles from '@/app/cookies/cookies.module.css'

interface CookiesSectionCardProps {
  section: CookiesSection
}

interface SectionPart {
  type: 'normal' | 'callout'
  label?: string
  content: string
  hasSettingsBtn?: boolean
}

/**
 * Splits section body into standard reading text and restrained callout emphasis blocks.
 * GUARANTEE: The concatenated content of all parts exactly matches the original section body.
 */
function getSectionParts(secNum: number, body: string): SectionPart[] {
  const blocks = body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)

  if (secNum === 4 && blocks.length >= 1) {
    return [
      {
        type: 'callout',
        label: 'หลักเกณฑ์การให้ความยินยอมและการทำงานของคุกกี้',
        content: body,
      },
    ]
  }

  if (secNum === 5 && blocks.length >= 2) {
    return [
      { type: 'normal', content: blocks[0] },
      {
        type: 'callout',
        label: 'ขั้นตอนการเปลี่ยนแปลงหรือถอนความยินยอมคุกกี้วิเคราะห์',
        content: blocks[1],
        hasSettingsBtn: true,
      },
      { type: 'normal', content: blocks.slice(2).join('\n\n') },
    ]
  }

  if (secNum === 6) {
    return [
      {
        type: 'callout',
        label: 'คำแนะนำการตั้งค่าผ่านเว็บเบราว์เซอร์',
        content: body,
      },
    ]
  }

  if (secNum === 8 && blocks.length >= 2) {
    return [
      { type: 'normal', content: blocks[0] },
      {
        type: 'callout',
        label: 'ช่องทางติดต่ออย่างเป็นทางการ',
        content: blocks.slice(1).join('\n\n'),
      },
    ]
  }

  return [{ type: 'normal', content: body }]
}

const markdownComponents = {
  table: ({ children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) => (
    <div
      className={styles.tableWrapper}
      role="region"
      aria-label="ตารางคุกกี้และเครื่องมือที่อาจพบ"
      tabIndex={0}
    >
      <table className={styles.legalTable} {...props}>
        {children}
      </table>
    </div>
  ),
  a: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
    const isEmail = href === 'mailto:support.sobdai@gmail.com' || href?.startsWith('mailto:')
    if (isEmail) {
      return (
        <a
          href={href || 'mailto:support.sobdai@gmail.com'}
          className={styles.calloutEmailLink}
          {...props}
        >
          <svg
            className={styles.emailInlineIcon}
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
          {children}
        </a>
      )
    }
    return (
      <a href={href} {...props}>
        {children}
      </a>
    )
  },
}

/**
 * Preamble Card for the introductory section of the Cookie Policy.
 *
 * PREAMBLE DUPLICATION GUARD:
 * - NO duplicate H1 or title below Hero.
 * - NO duplicate "อัปเดตล่าสุด" badge below Hero.
 * - Preserves the exact introductory prose once.
 */
export function CookiesPreambleCard({ preamble }: { preamble: CookiesPreamble }) {
  return (
    <div className={styles.preambleCard} role="region" aria-label="บทนำนโยบายคุกกี้">
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
          <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" />
          <path d="M8.5 8.5v.01" />
          <path d="M16 15.5v.01" />
          <path d="M12 12v.01" />
          <path d="M11 17v.01" />
          <path d="M7 13v.01" />
        </svg>
        <h2 className={styles.preambleTitle}>ภาพรวมนโยบายคุกกี้</h2>
      </div>

      <div className={styles.cardBody}>
        <p className={styles.preambleText}>{preamble.body}</p>
      </div>
    </div>
  )
}

/**
 * Section Card for each of the 8 numbered legal sections.
 */
export default function CookiesSectionCard({ section }: CookiesSectionCardProps) {
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
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {part.content}
                </ReactMarkdown>

                {/* Section 5 Embedded Consent Settings Button */}
                {part.hasSettingsBtn && (
                  <div>
                    <CookiePreferencesButton className={styles.sectionSettingsBtn}>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" />
                      </svg>
                      เปิดการตั้งค่าความเป็นส่วนตัว
                    </CookiePreferencesButton>
                  </div>
                )}
              </div>
            )
          }

          return (
            <ReactMarkdown key={idx} remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {part.content}
            </ReactMarkdown>
          )
        })}
      </div>
    </section>
  )
}
