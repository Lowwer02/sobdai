import type { Metadata } from 'next'
import { createPageMetadata, SITE_URL } from '@/lib/seo'
import StructuredData from '@/components/StructuredData'
import AboutPerson from '@/components/about/AboutPerson'
import AboutPrinciples from '@/components/about/AboutPrinciples'
import AboutTrust from '@/components/about/AboutTrust'
import styles from './about.module.css'

/**
 * /about — About Page (Redesign V2)
 *
 * Purpose-led, editorial, human-centred.
 * Answers: WHO is behind Sobdai, WHY it exists, WHAT principles guide it,
 * and WHY users can trust the platform.
 *
 * This page deliberately does NOT showcase products, packages, prices,
 * or features — that is the homepage's responsibility.
 *
 * SEO:
 *   Primary keywords: แนวข้อสอบราชการ · เตรียมสอบราชการ
 *   Used naturally, not stuffed.
 *
 * Structured data:
 *   - AboutPage JSON-LD (references existing site-level Organisation + WebSite IDs)
 *   - No Person schema in V1 (deferred — insufficient verified anchor data)
 *   - No Course / Exam schema (belongs on /package/[slug])
 *
 * Performance:
 *   - 100% Server Component — 0 KB client JS delta.
 *   - No 'use client', no state, no event handlers, no data fetching.
 *   - No new fonts, no animation libraries.
 *   - CSS scoped via CSS Module (about.module.css).
 *     app/globals.css remains 100% untouched.
 *
 * Accessibility:
 *   - Exactly one <h1> (inside the hero below).
 *   - H2 hierarchy maintained per section.
 *   - All links are crawlable anchors with descriptive text.
 *   - Portrait image has verified alt text.
 */

// ─── SEO Metadata ────────────────────────────────────────────────────────────
//
// Keyword ownership: /about is an entity/brand page.
// "แนวข้อสอบราชการ" and "เตรียมสอบราชการ" appear once each in the title,
// matching the natural cluster without competing against /packages as a
// transactional hub.
//
// These constants are defined inline here (not in lib/seo.ts) because the
// About page copy is editorial, not shared with any other module.

export const ABOUT_TITLE = 'เกี่ยวกับ Sobdai | แนวข้อสอบราชการและการเตรียมสอบราชการ'

export const ABOUT_DESCRIPTION =
  'รู้จัก Sobdai แนวคิดและคนเบื้องหลังแพลตฟอร์มสำหรับเตรียมสอบราชการ พร้อมแนวทางการฝึกแนวข้อสอบราชการ การอ้างอิงแหล่งข้อมูล และความเป็นอิสระของแพลตฟอร์ม'

export const metadata: Metadata = createPageMetadata({
  title: ABOUT_TITLE,
  description: ABOUT_DESCRIPTION,
  path: '/about',
})

// ─── AboutPage JSON-LD ───────────────────────────────────────────────────────
//
// Minimal, verified. References the canonical site-level IDs already present
// in app/layout.tsx (WebSite) and lib/seo.ts (SITE_ORGANIZATION / Organization).
// Does NOT redefine Organization. Does NOT add Person schema (deferred to V2).

const aboutPageJsonLd: Record<string, unknown> = {
  '@context': 'https://schema.org',
  '@type': 'AboutPage',
  '@id': `${SITE_URL}/about#webpage`,
  name: ABOUT_TITLE,
  url: `${SITE_URL}/about`,
  description: ABOUT_DESCRIPTION,
  inLanguage: 'th-TH',
  isPartOf: {
    '@id': `${SITE_URL}/#website`,
  },
  publisher: {
    '@id': `${SITE_URL}/#organization`,
  },
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AboutPage() {
  return (
    <div className={styles.root}>
      {/* AboutPage JSON-LD — injected into <head> by Next.js RSC */}
      <StructuredData data={aboutPageJsonLd} />

      {/* ══════════════════════════════════════════════════════════════
          SECTION 01 — HERO
          Purpose-led, not product-feature-led.
          No dashboard, no stats, no fake user metrics.
          ══════════════════════════════════════════════════════════════ */}
      <section className={styles.heroSection} aria-labelledby="about-h1">
        <div className={styles.heroInner}>
          {/* Eyebrow */}
          <p className={styles.eyebrow} aria-label="section label">เกี่ยวกับ Sobdai</p>

          {/* H1 — exactly one on the page */}
          <h1 id="about-h1" className={styles.heroH1}>
            เราอยากให้การเตรียมสอบราชการ
            <br className={styles.heroBr} />
            เป็นเรื่องของความเข้าใจ ไม่ใช่แค่การจำ
          </h1>

          {/* Supporting copy — keywords appear once, naturally */}
          <p className={styles.heroCopy}>
            Sobdai คือพื้นที่สำหรับฝึกแนวข้อสอบราชการอย่างมีทิศทาง
            ช่วยให้ผู้เรียนฝึกฝน ทบทวน และมองเห็นสิ่งที่ควรพัฒนาต่อ
            โดยให้ความสำคัญกับข้อมูลที่ตรวจสอบย้อนกลับไปยังแหล่งต้นทางได้
          </p>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          SECTION 02 — PERSON BEHIND SOBDAI
          Human identity anchor. Approved facts only. Real portrait asset.
          ══════════════════════════════════════════════════════════════ */}
      <AboutPerson />

      {/* ══════════════════════════════════════════════════════════════
          SECTIONS 03 + 04 — WHY SOBDAI EXISTS + HOW WE WORK
          ══════════════════════════════════════════════════════════════ */}
      <AboutPrinciples />

      {/* ══════════════════════════════════════════════════════════════
          SECTIONS 05 + 06 + 07 — TRUST + IMPROVEMENT + CTA
          ══════════════════════════════════════════════════════════════ */}
      <AboutTrust />

      {/* Bottom breathing room before Footer */}
      <div className={styles.pageEndSpacer} aria-hidden="true" />
    </div>
  )
}
