import React from 'react'
import Link from 'next/link'
import { TermsSection } from '@/app/terms/terms-content'
import styles from '@/app/terms/terms.module.css'

interface TermsTocProps {
  sections: TermsSection[]
}

export default function TermsToc({ sections }: TermsTocProps) {
  return (
    <>
      {/* Desktop Sticky Rail (hidden on <= 1024px via CSS) */}
      <aside className={styles.tocRail} aria-label="สารบัญข้อกำหนด (Desktop)">
        <div className={styles.tocCard}>
          <h2 className={styles.tocTitle}>สารบัญข้อกำหนด</h2>
          <nav aria-label="สารบัญ">
            <ol className={styles.tocNavList}>
              {sections.map((sec) => (
                <li key={sec.id}>
                  <a href={`#${sec.id}`} className={styles.tocLink}>
                    <span className={styles.tocNumber}>{sec.num}.</span>
                    <span className={styles.tocText}>{sec.title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </div>

        {/* Support card at the bottom of the TOC */}
        <div className={styles.tocSupportCard}>
          <h3 className={styles.tocSupportTitle}>มีคำถาม?</h3>
          <p className={styles.tocSupportCopy}>ติดต่อทีมงานของเรา เพื่อรับความช่วยเหลือ</p>
          <Link href="/contact" className={styles.tocSupportButton}>
            ติดต่อเรา →
          </Link>
        </div>
      </aside>

      {/* Mobile / Tablet Compact TOC (visible on <= 1024px via CSS) */}
      <div className={styles.mobileTocSection} aria-label="สารบัญข้อกำหนด (Mobile)">
        <div className={styles.mobileTocCard}>
          <h2 className={styles.mobileTocTitle}>สารบัญข้อกำหนด (ข้ามไปยังข้อที่ต้องการ)</h2>
          <nav aria-label="สารบัญบนมือถือ">
            <div className={styles.mobileTocGrid}>
              {sections.map((sec) => (
                <a key={sec.id} href={`#${sec.id}`} className={styles.mobileTocLink}>
                  <span className={styles.tocNumber}>{sec.num}.</span>
                  <span className={styles.tocText}>{sec.title}</span>
                </a>
              ))}
            </div>
          </nav>
        </div>
      </div>
    </>
  )
}
