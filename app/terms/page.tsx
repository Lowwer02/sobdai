import type { Metadata } from 'next'
import { LEGAL } from '@/lib/legal'
import { createPageMetadata, SITE_URL } from '@/lib/seo'
import StructuredData from '@/components/StructuredData'
import { getTermsData } from './terms-content'
import TermsHero from '@/components/terms/TermsHero'
import TermsQuickNav from '@/components/terms/TermsQuickNav'
import TermsToc from '@/components/terms/TermsToc'
import TermsSectionCard from '@/components/terms/TermsSectionCard'
import TermsHelpStrip from '@/components/terms/TermsHelpStrip'
import styles from './terms.module.css'

/**
 * /terms — Terms of Service Page (Redesign V1)
 *
 * Visual Direction:
 *   Authoritative, Calm, Premium, Readable, Trustworthy.
 *   Adheres strictly to Sobdai's dark/gold visual language (#0F0A06 / #D4A63A).
 *
 * Legal Fidelity:
 *   100% faithful to existing production legal content (content/legal/terms.md).
 *   Preserves all 12 numbered sections, exact titles, exact order, and all clauses.
 *   Zero legal rewrites, zero invented rights or restrictions.
 *
 * Architecture & Performance:
 *   - 100% Server Component — 0 KB client JS delta.
 *   - Native anchor navigation (#section-1 ... #section-12).
 *   - Scoped styles via terms.module.css.
 *   - app/globals.css remains 100% untouched.
 *   - Shared components/legal/LegalLayout.tsx remains 100% untouched.
 */

export const TERMS_TITLE = `เงื่อนไขการให้บริการ | ${LEGAL.companyName}`
export const TERMS_DESCRIPTION =
  'เงื่อนไขการให้บริการและข้อตกลงการใช้งานระบบสอบออนไลน์ Sobdai สิทธิ์การใช้งาน การซื้อแพ็กเกจ นโยบายการคืนเงิน และข้อตกลงทางกฎหมาย'

export const metadata: Metadata = createPageMetadata({
  title: TERMS_TITLE,
  description: TERMS_DESCRIPTION,
  path: '/terms',
})

const termsPageJsonLd: Record<string, unknown> = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  '@id': `${SITE_URL}/terms#webpage`,
  name: TERMS_TITLE,
  url: `${SITE_URL}/terms`,
  description: TERMS_DESCRIPTION,
  inLanguage: 'th-TH',
  isPartOf: {
    '@id': `${SITE_URL}/#website`,
  },
  publisher: {
    '@id': `${SITE_URL}/#organization`,
  },
}

export default async function TermsPage() {
  const { sections } = getTermsData()

  return (
    <div className={styles.root}>
      {/* WebPage JSON-LD */}
      <StructuredData data={termsPageJsonLd} />

      {/* ══════════════════════════════════════════════════════════════
          SECTION 01 — LEGAL HERO
          ══════════════════════════════════════════════════════════════ */}
      <TermsHero />

      {/* ══════════════════════════════════════════════════════════════
          SECTION 02 — QUICK LEGAL NAVIGATION (ANCHOR CARDS)
          ══════════════════════════════════════════════════════════════ */}
      <TermsQuickNav />

      {/* ══════════════════════════════════════════════════════════════
          SECTION 03 — TERMS CONTENT + TABLE OF CONTENTS
          Desktop: 2-column legal reading layout with sticky TOC
          Mobile: Top quick-jump TOC with continuous reading flow
          ══════════════════════════════════════════════════════════════ */}
      <section className={styles.mainReadingSection} aria-label="เนื้อหาเงื่อนไขการให้บริการ">
        <div className={styles.container}>
          <div className={styles.readingLayout}>
            {/* Left Column: Sticky Table of Contents (Desktop) & Mobile Jump */}
            <TermsToc sections={sections} />

            {/* Right Column: Full Legal Content Cards */}
            <div className={styles.contentArea}>
              {sections.map((section) => (
                <TermsSectionCard key={section.id} section={section} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          SECTION 07 — END-OF-PAGE SUPPORT STRIP
          Quiet support cards linking to /contact, /privacy, /faq
          ══════════════════════════════════════════════════════════════ */}
      <TermsHelpStrip />
    </div>
  )
}
