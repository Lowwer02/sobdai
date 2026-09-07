import React from 'react'
import Link from 'next/link'
import styles from '@/app/cookies/cookies.module.css'

interface HelpCardData {
  title: string
  description: string
  href: string
  cta: string
  icon: React.ReactNode
}

const HELP_CARDS: HelpCardData[] = [
  {
    title: 'นโยบายความเป็นส่วนตัว',
    description: 'เรียนรู้มาตรการคุ้มครองข้อมูลส่วนบุคคลและสิทธิของคุณตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA)',
    href: '/privacy',
    cta: 'อ่านนโยบายความเป็นส่วนตัว',
    icon: (
      <svg
        className={styles.helpCardIcon}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    title: 'เงื่อนไขการให้บริการ',
    description: 'ข้อตกลงและเงื่อนไขการใช้งานแพลตฟอร์ม Sobdai สิทธิ และข้อจำกัดความรับผิดชอบ',
    href: '/terms',
    cta: 'อ่านเงื่อนไขการให้บริการ',
    icon: (
      <svg
        className={styles.helpCardIcon}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    title: 'ติดต่อเรา',
    description: 'สอบถามข้อมูลเพิ่มเติม แจ้งปัญหาการใช้งาน หรือยื่นคำร้องเกี่ยวกับข้อมูลส่วนบุคคล',
    href: '/contact',
    cta: 'ไปยังหน้าติดต่อเรา',
    icon: (
      <svg
        className={styles.helpCardIcon}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
]

/**
 * CookiesHelpStrip — End-of-Page Navigation Strip linking to /privacy, /terms, and /contact
 * 100% Server Component
 */
export default function CookiesHelpStrip() {
  return (
    <section className={styles.helpStrip} aria-labelledby="help-strip-title">
      <div className={styles.container}>
        <div className={styles.helpHeader}>
          <h2 id="help-strip-title" className={styles.helpTitle}>
            ข้อมูลเพิ่มเติมที่อาจเป็นประโยชน์
          </h2>
          <p className={styles.helpCopy}>
            ศึกษาข้อกำหนดทางกฎหมายและนโยบายด้านความปลอดภัยอื่น ๆ ของ Sobdai เพื่อความโปร่งใสและมั่นใจในการใช้งาน
          </p>
        </div>

        <div className={styles.helpGrid}>
          {HELP_CARDS.map((card) => (
            <Link key={card.href} href={card.href} className={styles.helpCard}>
              <div>
                <div className={styles.helpCardIconBox}>{card.icon}</div>
                <h3 className={styles.helpCardTitle}>{card.title}</h3>
                <p className={styles.helpCardDesc}>{card.description}</p>
              </div>
              <span className={styles.helpCardCta}>
                {card.cta} <span aria-hidden="true">→</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
