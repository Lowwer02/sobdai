import type { Metadata } from 'next'
import { LEGAL } from '@/lib/legal'
import { createPageMetadata, SITE_URL } from '@/lib/seo'
import StructuredData from '@/components/StructuredData'
import { getPrivacyData } from './privacy-content'
import PrivacyHero from '@/components/privacy/PrivacyHero'
import PrivacyQuickNav from '@/components/privacy/PrivacyQuickNav'
import PrivacyToc from '@/components/privacy/PrivacyToc'
import PrivacySectionCard, { PrivacyPreambleCard } from '@/components/privacy/PrivacySectionCard'
import PrivacyHelpStrip from '@/components/privacy/PrivacyHelpStrip'
import styles from './privacy.module.css'

/**
 * /privacy — Privacy Policy Page (Redesign V1)
 *
 * Visual Direction:
 *   Calm, Secure, Transparent, Readable, Authoritative.
 *   Adheres strictly to Sobdai's dark/gold visual language (#0F0A06 / #D4A63A).
 *
 * Legal Fidelity:
 *   100% faithful to existing production legal content (content/legal/privacy.md).
 *   Preserves preamble, all 14 numbered sections, exact headings, exact sequence, and all clauses.
 *   Includes ONE authorized contact email correction: support.sobdai@gmail.com.
 *
 * Architecture & Performance:
 *   - 100% Server Component — 0 KB client JS delta.
 *   - Native anchor navigation (#section-1 ... #section-14).
 *   - Scoped styles via privacy.module.css.
 *   - app/globals.css remains 100% untouched.
 *   - Shared components/legal/LegalLayout.tsx remains 100% untouched.
 */

export const PRIVACY_TITLE = `นโยบายความเป็นส่วนตัว | ${LEGAL.companyName}`
export const PRIVACY_DESCRIPTION = 'นโยบายการเก็บรักษาและคุ้มครองข้อมูลส่วนบุคคล (Privacy Policy)'

export const metadata: Metadata = createPageMetadata({
  title: PRIVACY_TITLE,
  description: PRIVACY_DESCRIPTION,
  path: '/privacy',
})

const privacyPageJsonLd: Record<string, unknown> = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  '@id': `${SITE_URL}/privacy#webpage`,
  name: PRIVACY_TITLE,
  url: `${SITE_URL}/privacy`,
  description: PRIVACY_DESCRIPTION,
  inLanguage: 'th-TH',
  isPartOf: {
    '@id': `${SITE_URL}/#website`,
  },
  publisher: {
    '@id': `${SITE_URL}/#organization`,
  },
}

export default async function PrivacyPage() {
  const { preamble, sections, lastUpdated } = getPrivacyData()

  return (
    <div className={styles.root}>
      {/* WebPage JSON-LD */}
      <StructuredData data={privacyPageJsonLd} />

      {/* ══════════════════════════════════════════════════════════════
          SECTION 01 — PRIVACY HERO
          ══════════════════════════════════════════════════════════════ */}
      <PrivacyHero lastUpdated={lastUpdated} />

      {/* ══════════════════════════════════════════════════════════════
          SECTION 02 — QUICK PRIVACY NAVIGATION (ANCHOR CARDS)
          ══════════════════════════════════════════════════════════════ */}
      <PrivacyQuickNav />

      {/* ══════════════════════════════════════════════════════════════
          SECTION 03 — PRIVACY CONTENT + TABLE OF CONTENTS
          Desktop: 2-column legal reading layout with sticky TOC
          Mobile: Top quick-jump TOC with continuous reading flow
          ══════════════════════════════════════════════════════════════ */}
      <section className={styles.mainReadingSection} aria-label="เนื้อหานโยบายความเป็นส่วนตัว">
        <div className={styles.container}>
          <div className={styles.readingLayout}>
            {/* Left Column: Sticky Table of Contents (Desktop) & Mobile Jump */}
            <PrivacyToc sections={sections} />

            {/* Right Column: Full Legal Content Cards */}
            <div className={styles.contentArea}>
              {/* Preamble Card */}
              <PrivacyPreambleCard preamble={preamble} />

              {/* All 14 Legal Section Cards */}
              {sections.map((section) => (
                <PrivacySectionCard key={section.id} section={section} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          SECTION 07 — END-OF-PAGE SUPPORT STRIP
          Quiet support cards linking to /contact, /cookies, /terms
          ══════════════════════════════════════════════════════════════ */}
      <PrivacyHelpStrip />
    </div>
  )
}
