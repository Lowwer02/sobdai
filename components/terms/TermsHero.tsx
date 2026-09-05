import React from 'react'
import { legalConfig } from '@/lib/legal'
import styles from '@/app/terms/terms.module.css'

export default function TermsHero() {
  return (
    <section className={styles.heroSection} aria-labelledby="terms-h1">
      <div className={styles.container}>
        <div className={styles.heroGrid}>
          {/* Left Column: Heading, Supporting Copy & Actual Metadata */}
          <div className={styles.heroContent}>
            <p className={styles.eyebrow} aria-label="section label">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              TERMS OF SERVICE
            </p>

            <h1 id="terms-h1" className={styles.heroH1}>
              เงื่อนไขการให้บริการ
            </h1>

            <p className={styles.heroCopy}>
              โปรดอ่านเงื่อนไขการให้บริการฉบับนี้อย่างละเอียดก่อนใช้งาน Sobdai
              การใช้งานบริการของเราถือว่าคุณยอมรับข้อกำหนดที่ระบุไว้ด้านล่าง
            </p>

            {/* Preserved Actual Values from legalConfig */}
            <div className={styles.heroMetaRow} role="note" aria-label="ข้อมูลเวอร์ชันและวันที่ปรับปรุง">
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>อัปเดตล่าสุด:</span>
                <span className={styles.metaValue}>{legalConfig.lastUpdated}</span>
              </div>
              <div className={styles.metaDivider} aria-hidden="true" />
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>เวอร์ชัน:</span>
                <span className={styles.metaValue}>{legalConfig.termsVersion}</span>
              </div>
            </div>
          </div>

          {/* Right Column: Abstract Dark/Gold Legal Motif (Pure CSS/SVG, no external assets) */}
          <div className={styles.heroVisual} aria-hidden="true">
            <div className={styles.heroMotifBox}>
              <svg
                className={styles.heroMotifIcon}
                viewBox="0 0 48 48"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {/* Outer Document Shield Frame */}
                <path d="M24 4L8 10v12c0 11.5 6.8 22.3 16 25.5 9.2-3.2 16-14 16-25.5V10L24 4z" stroke="currentColor" />
                {/* Inner Document Outline */}
                <rect x="17" y="15" width="14" height="18" rx="2" stroke="#E5B84C" strokeWidth="1.6" />
                {/* Legal Clause Lines */}
                <line x1="20" y1="20" x2="28" y2="20" stroke="#E5B84C" strokeWidth="1.4" />
                <line x1="20" y1="24" x2="28" y2="24" stroke="#E5B84C" strokeWidth="1.4" />
                <line x1="20" y1="28" x2="25" y2="28" stroke="#E5B84C" strokeWidth="1.4" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
