import React from 'react'
import Link from 'next/link'
import { PrivacySection } from '@/app/privacy/privacy-content'
import styles from '@/app/privacy/privacy.module.css'

interface PrivacyTocProps {
  sections: PrivacySection[]
}

export default function PrivacyToc({ sections }: PrivacyTocProps) {
  return (
    <>
      {/* ── Desktop Sticky Rail ── */}
      <aside className={styles.tocRail} aria-label="สารบัญข้อกำหนดนโยบายความเป็นส่วนตัว">
        <div className={styles.tocCard}>
          <div className={styles.tocHeader}>
            <svg
              className={styles.tocIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
            <h2>สารบัญข้อกำหนด</h2>
          </div>

          <nav aria-label="สารบัญ">
            <ol className={styles.tocNavList}>
              {sections.map((sec) => (
                <li key={sec.id}>
                  <a href={`#${sec.id}`} className={styles.tocLink} title={sec.fullHeading}>
                    <span className={styles.tocLinkNum}>{sec.num}.</span>
                    <span className={styles.tocLinkText}>{sec.title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          {/* Quick Support Card within TOC rail */}
          <div className={styles.tocSupportCard}>
            <p className={styles.tocSupportTitle}>มีคำถามเกี่ยวกับข้อมูล?</p>
            <p className={styles.tocSupportText}>
              สอบถามเรื่องการใช้สิทธิหรือข้อมูลส่วนบุคคลกับทีมงาน Sobdai
            </p>
            <Link href="/contact" className={styles.tocSupportBtn}>
              ติดต่อทีมงาน →
            </Link>
          </div>
        </div>
      </aside>

      {/* ── Mobile TOC (Pills Grid, shown only on tablet/mobile) ── */}
      <div className={styles.mobileTocCard} aria-label="สารบัญแบบย่อสำหรับอุปกรณ์เคลื่อนที่">
        <h2 className={styles.mobileTocHeader}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
          สารบัญข้อกำหนด (ข้ามไปยังข้อที่ต้องการ)
        </h2>
        <nav aria-label="สารบัญบนมือถือ">
          <div className={styles.mobileTocGrid}>
            {sections.map((sec) => (
              <a key={sec.id} href={`#${sec.id}`} className={styles.mobileTocPill}>
                <span className={styles.tocLinkNum}>{sec.num}.</span>
                <span className={styles.tocLinkText}>{sec.title}</span>
              </a>
            ))}
          </div>
        </nav>
      </div>
    </>
  )
}
