import React from 'react'
import { legalConfig } from '@/lib/legal'
import styles from '@/app/privacy/privacy.module.css'

interface PrivacyHeroProps {
  lastUpdated: string
}

export default function PrivacyHero({ lastUpdated }: PrivacyHeroProps) {
  return (
    <section className={styles.heroSection} aria-labelledby="privacy-h1">
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
              PRIVACY POLICY
            </p>

            <h1 id="privacy-h1" className={styles.heroH1}>
              นโยบายความเป็นส่วนตัว
            </h1>

            <p className={styles.heroCopy}>
              Sobdai ให้ความสำคัญกับความเป็นส่วนตัวของคุณ เรามุ่งมั่นที่จะดูแลและปกป้องข้อมูลส่วนบุคคล
              ตามที่อธิบายไว้ในนโยบายฉบับนี้
            </p>

            {/* Preserved Actual Values from source parsing & legalConfig */}
            <div className={styles.heroMetaRow} role="note" aria-label="ข้อมูลเวอร์ชันและวันที่ปรับปรุง">
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>อัปเดตล่าสุด:</span>
                <span className={styles.metaValue}>{lastUpdated}</span>
              </div>
              <div className={styles.metaDivider} aria-hidden="true" />
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>เวอร์ชัน:</span>
                <span className={styles.metaValue}>{legalConfig.privacyVersion}</span>
              </div>
            </div>
          </div>

          {/* Right Column: Abstract Dark/Gold Privacy Motif (Shield & Keyhole, Pure CSS/SVG) */}
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
                {/* Shield Frame */}
                <path d="M24 4L8 10v12c0 11.5 6.8 22.3 16 25.5 9.2-3.2 16-14 16-25.5V10L24 4z" stroke="currentColor" />
                {/* Inner Lock Motif */}
                <rect x="18" y="22" width="12" height="10" rx="2" stroke="#E5B84C" strokeWidth="1.6" />
                <path d="M21 22v-4a3 3 0 0 1 6 0v4" stroke="#E5B84C" strokeWidth="1.6" />
                <circle cx="24" cy="27" r="1.5" fill="#E5B84C" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
