import Link from 'next/link'
import { BookOpen, HelpCircle, Info, ArrowRight } from 'lucide-react'
import styles from '@/app/contact/contact.module.css'

/**
 * ContactSelfService — Section 04: Self-Service Help
 *
 * Fast shortcuts to key support & contextual resources:
 *   1. วิธีใช้งาน → /help
 *   2. คำถามที่พบบ่อย → /faq
 *   3. เกี่ยวกับเรา → /about
 *
 * Note: Deliberately does NOT duplicate FAQ accordion here.
 *
 * Server Component — no 'use client', no state.
 */

const SELF_SERVICE_LINKS = [
  {
    href: '/help',
    id: 'contact-self-help',
    icon: BookOpen,
    title: 'วิธีใช้งาน',
    desc: 'เรียนรู้การใช้งาน Sobdai ตั้งแต่เริ่มต้น',
  },
  {
    href: '/faq',
    id: 'contact-self-faq',
    icon: HelpCircle,
    title: 'คำถามที่พบบ่อย',
    desc: 'รวมคำถามยอดนิยม พร้อมคำตอบ',
  },
  {
    href: '/about',
    id: 'contact-self-about',
    icon: Info,
    title: 'เกี่ยวกับเรา',
    desc: 'รู้จัก Sobdai และแนวคิดเบื้องหลังแพลตฟอร์ม',
  },
] as const

export default function ContactSelfService() {
  return (
    <section aria-labelledby="contact-selfservice-heading">
      <div className={styles.hairline} aria-hidden="true" />

      <div className={`${styles.sectionInner} ${styles.selfServiceSection}`}>
        <div className={styles.sectionHeaderCentered}>
          <p className={styles.eyebrow}>ศูนย์ช่วยเหลือ</p>
          <h2 id="contact-selfservice-heading" className={styles.sectionHeading}>
            ทางลัดไปยังหน้าช่วยเหลือ
          </h2>
          <p className={styles.sectionSubhead}>
            หาคำตอบได้เร็วขึ้น ด้วยแหล่งข้อมูลที่อาจช่วยคุณได้
          </p>
        </div>

        <div className={styles.selfServiceGrid}>
          {SELF_SERVICE_LINKS.map((item) => {
            const IconComponent = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                id={item.id}
                className={styles.selfServiceCard}
              >
                <div>
                  <div className={styles.selfServiceHeader}>
                    <div className={styles.selfServiceIconBox} aria-hidden="true">
                      <IconComponent size={20} />
                    </div>
                    <ArrowRight size={18} className={styles.selfServiceArrow} aria-hidden="true" />
                  </div>
                  <h3 className={styles.selfServiceTitle}>{item.title}</h3>
                  <p className={styles.selfServiceDesc}>{item.desc}</p>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}
