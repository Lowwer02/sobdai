import Link from 'next/link'
import { Mail, HelpCircle } from 'lucide-react'
import styles from '@/app/contact/contact.module.css'

/**
 * ContactCta — Section 05: Final CTA
 *
 * Reassuring final section inviting feedback and questions:
 *   - Primary: ส่งอีเมลถึงเรา → mailto:support.sobdai@gmail.com
 *   - Secondary: อ่านคำถามที่พบบ่อย → /faq
 *
 * Server Component — no 'use client'.
 */
export default function ContactCta() {
  return (
    <section aria-labelledby="contact-cta-heading">
      <div className={styles.hairline} aria-hidden="true" />

      <div className={`${styles.sectionInner} ${styles.ctaSection}`}>
        <div className={styles.ctaBox}>
          <p className={styles.eyebrow}>ร่วมพัฒนา Sobdai</p>
          <h2 id="contact-cta-heading" className={styles.ctaHeading}>
            ข้อเสนอแนะของคุณมีความหมาย
          </h2>
          <p className={styles.ctaCopy}>
            ทุกความคิดเห็นช่วยให้ Sobdai พัฒนา
            และเป็นพื้นที่การเรียนรู้ที่ดีขึ้นสำหรับผู้ใช้งานทุกคน
          </p>

          <div className={styles.ctaActions}>
            <a
              href="mailto:support.sobdai@gmail.com"
              className={styles.btnPrimary}
              id="contact-cta-email"
            >
              <Mail size={18} aria-hidden="true" />
              <span>ส่งอีเมลถึงเรา</span>
            </a>

            <Link
              href="/faq"
              className={styles.btnSecondary}
              id="contact-cta-faq"
            >
              <HelpCircle size={18} aria-hidden="true" />
              <span>อ่านคำถามที่พบบ่อย</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
