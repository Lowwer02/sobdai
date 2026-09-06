import React from 'react'
import Link from 'next/link'
import styles from '@/app/privacy/privacy.module.css'

export default function PrivacyHelpStrip() {
  return (
    <aside className={styles.helpStrip} aria-label="ความช่วยเหลือเพิ่มเติม">
      <div className={styles.container}>
        <div className={styles.helpHeader}>
          <h2 className={styles.helpTitle}>ต้องการความช่วยเหลือเพิ่มเติม?</h2>
          <p className={styles.helpCopy}>
            หากคุณมีคำถามเกี่ยวกับนโยบายความเป็นส่วนตัว หรือการใช้สิทธิของคุณ สามารถติดต่อเราได้
          </p>
        </div>

        <div className={styles.helpGrid}>
          {/* Card 1: Contact */}
          <Link href="/contact" className={styles.helpCard}>
            <div className={styles.helpCardIconBox} aria-hidden="true">
              <svg
                className={styles.helpCardIcon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </div>
            <h3 className={styles.helpCardTitle}>ติดต่อเรา</h3>
            <p className={styles.helpCardDesc}>
              ติดต่อทีมงาน Sobdai สำหรับคำถามเกี่ยวกับข้อมูลส่วนบุคคลหรือบริการช่วยเหลือ
            </p>
            <span className={styles.helpCardCta} aria-hidden="true">
              ไปยังหน้าติดต่อเรา →
            </span>
          </Link>

          {/* Card 2: Cookies */}
          <Link href="/cookies" className={styles.helpCard}>
            <div className={styles.helpCardIconBox} aria-hidden="true">
              <svg
                className={styles.helpCardIcon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a10 10 0 0 0-1.5 19.9" />
                <circle cx="8.5" cy="8.5" r="1" fill="currentColor" />
                <circle cx="15.5" cy="8.5" r="1" fill="currentColor" />
                <circle cx="12" cy="12" r="1" fill="currentColor" />
                <circle cx="9" cy="15.5" r="1" fill="currentColor" />
                <circle cx="14.5" cy="15" r="1" fill="currentColor" />
              </svg>
            </div>
            <h3 className={styles.helpCardTitle}>นโยบายคุกกี้</h3>
            <p className={styles.helpCardDesc}>
              ทำความเข้าใจการใช้งานคุกกี้และเทคโนโลยีการจัดเก็บข้อมูลบนเบราว์เซอร์
            </p>
            <span className={styles.helpCardCta} aria-hidden="true">
              อ่านนโยบายคุกกี้ →
            </span>
          </Link>

          {/* Card 3: Terms */}
          <Link href="/terms" className={styles.helpCard}>
            <div className={styles.helpCardIconBox} aria-hidden="true">
              <svg
                className={styles.helpCardIcon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <h3 className={styles.helpCardTitle}>ข้อกำหนดการใช้งาน</h3>
            <p className={styles.helpCardDesc}>
              ข้อตกลงและเงื่อนไขการใช้บริการระบบสอบออนไลน์ Sobdai
            </p>
            <span className={styles.helpCardCta} aria-hidden="true">
              อ่านข้อกำหนดการใช้งาน →
            </span>
          </Link>
        </div>
      </div>
    </aside>
  )
}
