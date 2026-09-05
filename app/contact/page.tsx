import type { Metadata } from 'next'
import { createPageMetadata, SITE_URL } from '@/lib/seo'
import { getHomepageSettings } from '@/lib/homepageConfig'
import StructuredData from '@/components/StructuredData'
import ContactHeroVisual from '@/components/contact/ContactHeroVisual'
import ContactQuickCards from '@/components/contact/ContactQuickCards'
import ContactTopicsChecklist from '@/components/contact/ContactTopicsChecklist'
import ContactSelfService from '@/components/contact/ContactSelfService'
import ContactSocial from '@/components/contact/ContactSocial'
import ContactCta from '@/components/contact/ContactCta'
import styles from './contact.module.css'

/**
 * /contact — Contact Page (Redesign V1)
 *
 * Support + Clarity + Trust.
 * Provides direct, transparent contact information and guided preparation
 * for users seeking assistance, submitting feedback, or inquiring about packages.
 *
 * Distinct identity:
 *   - Focuses on user support, resolution guidance, and platform feedback.
 *   - Not a duplicate of About V2, Homepage, or generic SaaS contact form.
 *
 * SEO:
 *   Title: ติดต่อ Sobdai | ความช่วยเหลือและสอบถามการใช้งาน
 *   Canonical: /contact
 *   Single H1: ติดต่อเรา
 *   Not stuffed with transactional practice-exam keywords.
 *
 * Performance:
 *   - 100% Server Component — 0 KB client JS delta.
 *   - No 'use client', no state, no event handlers.
 *   - Scoped styles via contact.module.css.
 *   - app/globals.css remains 100% untouched.
 */

export const CONTACT_TITLE = 'ติดต่อ Sobdai | ความช่วยเหลือและสอบถามการใช้งาน'

export const CONTACT_DESCRIPTION =
  'ติดต่อ Sobdai สำหรับคำถามเกี่ยวกับการใช้งาน แพ็กเกจ การสมัครสมาชิก การชำระเงิน ข้อเสนอแนะ และเรื่องความเป็นส่วนตัว พร้อมข้อมูลเวลาทำการและช่องทางช่วยเหลือ'

export const metadata: Metadata = createPageMetadata({
  title: CONTACT_TITLE,
  description: CONTACT_DESCRIPTION,
  path: '/contact',
})

// ─── ContactPage JSON-LD ─────────────────────────────────────────────────────
const contactPageJsonLd: Record<string, unknown> = {
  '@context': 'https://schema.org',
  '@type': 'ContactPage',
  '@id': `${SITE_URL}/contact#webpage`,
  name: CONTACT_TITLE,
  url: `${SITE_URL}/contact`,
  description: CONTACT_DESCRIPTION,
  inLanguage: 'th-TH',
  isPartOf: {
    '@id': `${SITE_URL}/#website`,
  },
  publisher: {
    '@id': `${SITE_URL}/#organization`,
  },
}

export default async function ContactPage() {
  const homepageSettings = await getHomepageSettings()

  return (
    <div className={styles.root}>
      {/* ContactPage JSON-LD */}
      <StructuredData data={contactPageJsonLd} />

      {/* ══════════════════════════════════════════════════════════════
          SECTION 01 — HERO (2-COLUMN ON DESKTOP)
          ══════════════════════════════════════════════════════════════ */}
      <section className={styles.heroSection} aria-labelledby="contact-h1">
        <div className={styles.sectionInner}>
          <div className={styles.heroGrid}>
            {/* Left Column: Copy & Reassurance */}
            <div className={styles.heroContent}>
              <p className={styles.eyebrow} aria-label="section label">
                SOBDAI SUPPORT
              </p>

              <h1 id="contact-h1" className={styles.heroH1}>
                ติดต่อเรา
              </h1>

              <p className={styles.heroCopy}>
                หากคุณมีคำถาม พบปัญหาการใช้งาน
                ต้องการสอบถามเกี่ยวกับแพ็กเกจ
                หรือมีข้อเสนอแนะ ทีมงาน Sobdai ยินดีให้ความช่วยเหลือเสมอ
              </p>

              <div className={styles.heroReassurance} role="note">
                <span className={styles.reassuranceDot} aria-hidden="true" />
                <span>เราพร้อมดูแล และตอบกลับทุกข้อความของคุณ</span>
              </div>
            </div>

            {/* Right Column: Lightweight Support Visual */}
            <div>
              <ContactHeroVisual />
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          SECTION 02 — QUICK CONTACT CARDS
          ══════════════════════════════════════════════════════════════ */}
      <ContactQuickCards />

      {/* ══════════════════════════════════════════════════════════════
          SECTION 03 — CONTACT TOPICS + ISSUE CHECKLIST
          ══════════════════════════════════════════════════════════════ */}
      <ContactTopicsChecklist />

      {/* ══════════════════════════════════════════════════════════════
          SECTION 04 — SELF-SERVICE HELP
          ══════════════════════════════════════════════════════════════ */}
      <ContactSelfService />

      {/* ══════════════════════════════════════════════════════════════
          SECTION 04.5 — SOCIAL FOLLOW (COMPACT STRIP)
          ══════════════════════════════════════════════════════════════ */}
      <ContactSocial socialLinks={homepageSettings.footer.social_links} />

      {/* ══════════════════════════════════════════════════════════════
          SECTION 05 — FINAL CTA
          ══════════════════════════════════════════════════════════════ */}
      <ContactCta />

      {/* Bottom breathing room before Footer */}
      <div className={styles.pageEndSpacer} aria-hidden="true" />
    </div>
  )
}
