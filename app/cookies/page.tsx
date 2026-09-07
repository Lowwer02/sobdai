import type { Metadata } from 'next'
import { LEGAL } from '@/lib/legal'
import { createPageMetadata, SITE_URL } from '@/lib/seo'
import StructuredData from '@/components/StructuredData'
import { getCookiesData } from './cookies-content'
import CookiesHero from '@/components/cookies/CookiesHero'
import CookiesQuickNav from '@/components/cookies/CookiesQuickNav'
import CookiesToc from '@/components/cookies/CookiesToc'
import CookiesSectionCard, { CookiesPreambleCard } from '@/components/cookies/CookiesSectionCard'
import CookiesHelpStrip from '@/components/cookies/CookiesHelpStrip'
import styles from './cookies.module.css'

/**
 * /cookies — Cookie Policy Page (Redesign V1)
 *
 * Visual Direction:
 *   Premium / Modern / Luxury / Clean / Professional.
 *   Adheres strictly to Sobdai's dark/gold visual language (#0F0A06 / #D4A63A).
 *   Has its own distinct COOKIE / CONSENT identity.
 *
 * Legal Fidelity:
 *   100% faithful to existing production legal content (content/legal/cookies.md).
 *   Preserves preamble, all 8 numbered sections, exact headings, exact sequence, and all clauses.
 *   Includes ONE authorized contact email correction: support.sobdai@gmail.com.
 *
 * Preamble Duplication Guard:
 *   - Exactly ONE visible H1: "นโยบายคุกกี้" (in CookiesHero).
 *   - Operative date shown once in Hero metadata: "4 กันยายน 2569".
 *   - Source introductory prose rendered cleanly once without legacy duplicate title/date block.
 *
 * Architecture & Performance:
 *   - Server Component architecture — 0 KB unnecessary client JS.
 *   - The ONLY client component is CookiePreferencesButton, wired to existing ConsentProvider.
 *   - Native anchor navigation (#section-1 ... #section-8).
 *   - Scoped styles via cookies.module.css.
 *   - app/globals.css and lib/legal.ts remain 100% untouched.
 */

export const COOKIES_TITLE = `นโยบายคุกกี้ | ${LEGAL.companyName}`
export const COOKIES_DESCRIPTION = 'นโยบายการใช้งานคุกกี้และการจัดการความยินยอม (Cookie Policy)'

export const metadata: Metadata = createPageMetadata({
  title: COOKIES_TITLE,
  description: COOKIES_DESCRIPTION,
  path: '/cookies',
})

const cookiesPageJsonLd: Record<string, unknown> = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  '@id': `${SITE_URL}/cookies#webpage`,
  name: COOKIES_TITLE,
  url: `${SITE_URL}/cookies`,
  description: COOKIES_DESCRIPTION,
  inLanguage: 'th-TH',
  isPartOf: {
    '@id': `${SITE_URL}/#website`,
  },
  publisher: {
    '@id': `${SITE_URL}/#organization`,
  },
}

export default async function CookiesPage() {
  const { preamble, sections, lastUpdated } = getCookiesData()

  return (
    <div className={styles.root}>
      {/* WebPage JSON-LD */}
      <StructuredData data={cookiesPageJsonLd} />

      {/* ══════════════════════════════════════════════════════════════
          SECTION 01 — COOKIES HERO
          ══════════════════════════════════════════════════════════════ */}
      <CookiesHero lastUpdated={lastUpdated} />

      {/* ══════════════════════════════════════════════════════════════
          SECTION 02 — QUICK COOKIES NAVIGATION (5 ANCHOR CARDS)
          ══════════════════════════════════════════════════════════════ */}
      <CookiesQuickNav />

      {/* ══════════════════════════════════════════════════════════════
          SECTION 03 — COOKIES CONTENT + TABLE OF CONTENTS
          Desktop: 2-column legal reading layout with sticky TOC
          Mobile: Top quick-jump TOC with continuous reading flow
          ══════════════════════════════════════════════════════════════ */}
      <section className={styles.mainReadingSection} aria-label="เนื้อหานโยบายคุกกี้">
        <div className={styles.container}>
          <div className={styles.readingLayout}>
            {/* Left Column: Sticky Table of Contents (Desktop) & Mobile Jump */}
            <CookiesToc sections={sections} />

            {/* Right Column: Full Legal Content Cards */}
            <div className={styles.contentArea}>
              {/* Preamble Card (Introductory prose, no duplicate title/date) */}
              <CookiesPreambleCard preamble={preamble} />

              {/* All 8 Legal Section Cards */}
              {sections.map((section) => (
                <CookiesSectionCard key={section.id} section={section} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          SECTION 08 — END-OF-PAGE SUPPORT STRIP
          Quiet support cards linking to /privacy, /terms, /contact
          ══════════════════════════════════════════════════════════════ */}
      <CookiesHelpStrip />
    </div>
  )
}
