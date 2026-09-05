import {
  AlertCircle,
  Package,
  CreditCard,
  Lightbulb,
  ShieldCheck,
  Check,
} from 'lucide-react'
import styles from '@/app/contact/contact.module.css'

/**
 * ContactTopicsChecklist — Section 03: Contact Topics + Issue Checklist
 *
 * Desktop 2-column layout:
 *   - LEFT: เรื่องที่สามารถติดต่อได้ (5 verified categories)
 *   - RIGHT: ก่อนส่งอีเมล แนะนำให้แนบข้อมูลเหล่านี้ (5 checklist items)
 *
 * Server Component — no 'use client', no state.
 */

const TOPICS = [
  {
    icon: AlertCircle,
    title: 'แจ้งปัญหาการใช้งาน',
    desc: 'เช่น เข้าใช้งานไม่ได้ ระบบไม่ตอบสนอง หรือพบข้อผิดพลาด',
  },
  {
    icon: Package,
    title: 'สอบถามเกี่ยวกับแพ็กเกจ',
    desc: 'รายละเอียดแพ็กเกจ การสมัครสมาชิก และการใช้งาน',
  },
  {
    icon: CreditCard,
    title: 'ปัญหาการชำระเงิน',
    desc: 'เช่น การตัดเงินไม่ได้ การคืนเงิน หรือใบเสร็จรับเงิน',
  },
  {
    icon: Lightbulb,
    title: 'ข้อเสนอแนะ',
    desc: 'ความคิดเห็นเพื่อให้ Sobdai ดีขึ้น',
  },
  {
    icon: ShieldCheck,
    title: 'ความเป็นส่วนตัวของข้อมูล',
    desc: 'สอบถามเกี่ยวกับการจัดเก็บและการใช้งานข้อมูลส่วนบุคคล',
  },
] as const

const CHECKLIST = [
  {
    title: 'อีเมลที่ใช้สมัครสมาชิก',
    desc: 'เพื่อความสะดวกรวดเร็วในการค้นหาบัญชีผู้ใช้ของคุณ',
  },
  {
    title: 'อุปกรณ์ที่ใช้งาน',
    desc: 'เช่น คอมพิวเตอร์ โทรศัพท์มือถือ หรือแท็บเล็ต',
  },
  {
    title: 'Browser ที่ใช้',
    desc: 'เช่น Chrome, Safari, Firefox, Edge พร้อมเวอร์ชันหากทราบ',
  },
  {
    title: 'รายละเอียดปัญหา',
    desc: 'อธิบายสิ่งที่เกิดขึ้น ขั้นตอนที่ทำ และข้อความที่พบ',
  },
  {
    title: 'ภาพหน้าจอ (ถ้ามี)',
    desc: 'ภาพหน้าจอช่วยให้ทีมงานเข้าใจและวิเคราะห์ปัญหาได้ตรงจุดยิ่งขึ้น',
  },
] as const

export default function ContactTopicsChecklist() {
  return (
    <section aria-labelledby="contact-topics-heading">
      <div className={styles.hairline} aria-hidden="true" />

      <div className={`${styles.sectionInner} ${styles.topicsSection}`}>
        <div className={styles.topicsLayout}>
          {/* ── LEFT COLUMN: Supported Topics ── */}
          <div className={styles.topicsCol}>
            <p className={styles.eyebrow}>หัวข้อที่ติดต่อได้</p>
            <h2 id="contact-topics-heading" className={styles.sectionHeading}>
              เรื่องที่สามารถติดต่อได้
            </h2>
            <p className={styles.sectionSubhead}>
              ทีมงานยินดีให้คำแนะนำและช่วยเหลือในประเด็นต่าง ๆ ดังนี้
            </p>

            <div className={styles.topicsList}>
              {TOPICS.map((topic) => {
                const IconComponent = topic.icon
                return (
                  <div key={topic.title} className={styles.topicItem}>
                    <div className={styles.topicIconBox} aria-hidden="true">
                      <IconComponent size={18} />
                    </div>
                    <div>
                      <h3 className={styles.topicTitle}>{topic.title}</h3>
                      <p className={styles.topicDesc}>{topic.desc}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── RIGHT COLUMN: Preparation Checklist ── */}
          <div className={styles.checklistCol}>
            <p className={styles.eyebrow}>คำแนะนำการแจ้งเรื่อง</p>
            <h2 id="contact-checklist-heading" className={styles.sectionHeading}>
              ก่อนส่งอีเมล แนะนำให้แนบข้อมูลเหล่านี้
            </h2>
            <p className={styles.sectionSubhead}>
              เพื่อให้ทีมงานสามารถตรวจสอบและช่วยเหลือคุณได้เร็วขึ้น
            </p>

            <div className={styles.checkItems}>
              {CHECKLIST.map((item) => (
                <div key={item.title} className={styles.checkItem}>
                  <div className={styles.checkIconBox} aria-hidden="true">
                    <Check size={14} strokeWidth={2.5} />
                  </div>
                  <div>
                    <h3 className={styles.checkTitle}>{item.title}</h3>
                    <p className={styles.checkDesc}>{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
