import React from 'react'
import Link from 'next/link'
import styles from '@/app/terms/terms.module.css'

export default function TermsHelpStrip() {
  return (
    <section className={styles.helpSection} aria-labelledby="help-strip-title">
      <div className={styles.container}>
        <div className={styles.helpContent}>
          <h2 id="help-strip-title" className={styles.helpTitle}>
            ต้องการความช่วยเหลือเพิ่มเติม?
          </h2>
          <p className={styles.helpCopy}>
            หากคุณมีคำถามเกี่ยวกับเงื่อนไขการให้บริการ หรือต้องการสอบถามเรื่องการใช้งาน
            โปรดติดต่อเราผ่านช่องทางที่กำหนดไว้
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
              ติดต่อทีมงาน Sobdai สำหรับความช่วยเหลือด้านเทคนิค การชำระเงิน หรือข้อเสนอแนะ
            </p>
            <span className={styles.helpCardCta} aria-hidden="true">
              ไปยังหน้าติดต่อเรา →
            </span>
          </Link>

          {/* Card 2: Privacy Policy */}
          <Link href="/privacy" className={styles.helpCard}>
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
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h3 className={styles.helpCardTitle}>นโยบายความเป็นส่วนตัว</h3>
            <p className={styles.helpCardDesc}>
              ทำความเข้าใจวิธีที่เราคุ้มครอง จัดเก็บ และดูแลข้อมูลส่วนบุคคลของคุณ
            </p>
            <span className={styles.helpCardCta} aria-hidden="true">
              อ่านนโยบายความเป็นส่วนตัว →
            </span>
          </Link>

          {/* Card 3: FAQ */}
          <Link href="/faq" className={styles.helpCard}>
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
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h3 className={styles.helpCardTitle}>คำถามที่พบบ่อย</h3>
            <p className={styles.helpCardDesc}>
              ค้นหาคำตอบอย่างรวดเร็วสำหรับข้อสงสัยทั่วไปเกี่ยวกับการใช้งานระบบและแพ็กเกจ
            </p>
            <span className={styles.helpCardCta} aria-hidden="true">
              ดูคำถามที่พบบ่อย →
            </span>
          </Link>
        </div>
      </div>
    </section>
  )
}
