import { Mail, Clock, MessageSquare } from 'lucide-react'
import styles from '@/app/contact/contact.module.css'

/**
 * ContactQuickCards — Section 02: Quick Contact Channels
 *
 * Three core contact cards:
 *   1. EMAIL: support.sobdai@gmail.com (mailto link, anytime)
 *   2. HOURS: จันทร์ – ศุกร์, 09:00 – 18:00 น. (เวลาประเทศไทย)
 *   3. RESPONSE: โดยทั่วไปภายใน 1–3 วันทำการ (ทีมงานจะพยายามตอบกลับโดยเร็วที่สุด)
 *
 * Strict product truth:
 *   - No phone number
 *   - No round-the-clock support claim (hours clearly specified)
 *   - No guaranteed SLA (bounded wording: โดยทั่วไปภายใน 1–3 วันทำการ)
 *
 * Server Component — no 'use client', no state, no event handlers.
 */
export default function ContactQuickCards() {
  return (
    <section aria-labelledby="contact-quick-heading">
      <div className={styles.hairline} aria-hidden="true" />

      <div className={`${styles.sectionInner} ${styles.quickCardsSection}`}>
        <h2 id="contact-quick-heading" className="sr-only">
          ช่องทางติดต่อด่วน
        </h2>

        <div className={styles.quickGrid}>
          {/* ── CARD 1: EMAIL ── */}
          <div className={styles.quickCard}>
            <div className={styles.quickIconWrap} aria-hidden="true">
              <Mail size={22} />
            </div>
            <p className={styles.quickLabel}>อีเมลสำหรับติดต่อ</p>
            <div className={styles.quickValue}>
              <a
                href="mailto:support.sobdai@gmail.com"
                className={styles.quickLink}
                id="contact-email-link"
              >
                support.sobdai@gmail.com
              </a>
            </div>
            <p className={styles.quickSubtext}>ส่งอีเมลหาเราได้ตลอดเวลา</p>
          </div>

          {/* ── CARD 2: HOURS ── */}
          <div className={styles.quickCard}>
            <div className={styles.quickIconWrap} aria-hidden="true">
              <Clock size={22} />
            </div>
            <p className={styles.quickLabel}>เวลาทำการ</p>
            <div className={styles.quickValue}>
              จันทร์ – ศุกร์
              <br />
              09:00 – 18:00 น.
            </div>
            <p className={styles.quickSubtext}>เวลาประเทศไทย</p>
          </div>

          {/* ── CARD 3: RESPONSE ── */}
          <div className={styles.quickCard}>
            <div className={styles.quickIconWrap} aria-hidden="true">
              <MessageSquare size={22} />
            </div>
            <p className={styles.quickLabel}>เวลาตอบกลับ</p>
            <div className={styles.quickValue}>
              โดยทั่วไปภายใน 1–3 วันทำการ
            </div>
            <p className={styles.quickSubtext}>ทีมงานจะพยายามตอบกลับโดยเร็วที่สุด</p>
          </div>
        </div>
      </div>
    </section>
  )
}
