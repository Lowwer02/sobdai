import React from 'react'
import { legalConfig } from '@/lib/legal'
import styles from '@/app/cookies/cookies.module.css'

interface CookiesHeroProps {
  lastUpdated: string
}

/**
 * CookiesHero — Premium Dark/Gold Hero for Sobdai Cookie Policy
 *
 * Requirements:
 * - Exactly ONE H1: "นโยบายคุกกี้"
 * - Dynamic date: derived from cookies.md preamble (4 กันยายน 2569)
 * - Version: imported from legalConfig.cookiesVersion (1.0)
 * - Restrained, truthful introductory copy
 * - SVG Cookie & Security Trust Motif (pure inline SVG/CSS, aria-hidden)
 * - 100% Server Component
 */
export default function CookiesHero({ lastUpdated }: CookiesHeroProps) {
  return (
    <section className={styles.heroSection} aria-labelledby="cookies-h1">
      <div className={styles.container}>
        <div className={styles.heroGrid}>
          {/* Left Column: Eyebrow, Heading, Intro Copy & Metadata Badge */}
          <div className={styles.heroContent}>
            <p className={styles.eyebrow} aria-label="section label">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {/* Cookie icon */}
                <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" />
                <path d="M8.5 8.5v.01" />
                <path d="M16 15.5v.01" />
                <path d="M12 12v.01" />
                <path d="M11 17v.01" />
                <path d="M7 13v.01" />
              </svg>
              COOKIE POLICY
            </p>

            <h1 id="cookies-h1" className={styles.heroH1}>
              นโยบายคุกกี้
            </h1>

            <p className={styles.heroCopy}>
              Sobdai ใช้คุกกี้ เครื่องมือวิเคราะห์ข้อมูล เทคโนโลยีโฆษณา และลิงก์พันธมิตร อย่างจำกัด
              เพื่อปรับปรุงประสบการณ์การใช้งานเว็บไซต์ ให้ดียิ่งขึ้น
              และเพื่อให้บริการของเราทำงานได้อย่างมีประสิทธิภาพ
            </p>

            {/* Preserved Actual Values from source parsing & legalConfig */}
            <div className={styles.heroMetaRow} role="note" aria-label="ข้อมูลเวอร์ชันและวันที่ปรับปรุง">
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>อัปเดตล่าสุด:</span>
                <span className={styles.metaValue}>{lastUpdated}</span>
              </div>
              <div className={styles.metaDivider} aria-hidden="true" />
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>เวอร์ชัน:</span>
                <span className={styles.metaValue}>{legalConfig.cookiesVersion}</span>
              </div>
            </div>
          </div>

          {/* Right Column: Cookie/Security Trust Motif Artwork (Inline SVG/CSS, aria-hidden) */}
          <div className={styles.heroVisual} aria-hidden="true">
            <div className={styles.heroMotifBox}>
              <svg
                className={styles.heroMotifIcon}
                viewBox="0 0 240 240"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <defs>
                  {/* Luxury Gold Linear Gradient */}
                  <linearGradient id="heroGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#FDF2B5" />
                    <stop offset="35%" stopColor="#F3D78A" />
                    <stop offset="70%" stopColor="#D4A63A" />
                    <stop offset="100%" stopColor="#8C6D23" />
                  </linearGradient>

                  {/* Deep Shield Radial Gradient */}
                  <radialGradient id="heroShieldGrad" cx="50%" cy="40%" r="60%">
                    <stop offset="0%" stopColor="#2A1C10" />
                    <stop offset="60%" stopColor="#1B120A" />
                    <stop offset="100%" stopColor="#110B06" />
                  </radialGradient>

                  {/* Cookie Body Radial Fill */}
                  <radialGradient id="heroCookieGrad" cx="45%" cy="40%" r="55%">
                    <stop offset="0%" stopColor="#2E1E12" />
                    <stop offset="70%" stopColor="#21150C" />
                    <stop offset="100%" stopColor="#160E08" />
                  </radialGradient>

                  {/* Golden Ambient Glow */}
                  <radialGradient id="heroCenterGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#D4A63A" stopOpacity="0.25" />
                    <stop offset="55%" stopColor="#D4A63A" stopOpacity="0.08" />
                    <stop offset="100%" stopColor="#D4A63A" stopOpacity="0" />
                  </radialGradient>
                </defs>

                {/* Ambient Center Glow */}
                <circle cx="120" cy="120" r="108" fill="url(#heroCenterGlow)" />

                {/* Outer Dashed Orbit Ring */}
                <circle
                  cx="120"
                  cy="120"
                  r="102"
                  stroke="#D4A63A"
                  strokeWidth="1.2"
                  strokeOpacity="0.22"
                  strokeDasharray="4 6"
                />

                {/* Inner Concentric Orbit Ring */}
                <circle
                  cx="120"
                  cy="120"
                  r="86"
                  stroke="#D4A63A"
                  strokeWidth="0.8"
                  strokeOpacity="0.18"
                />

                {/* ── SATELLITE GLYPH 1: Analytics / Telemetry (Top-Right) ── */}
                <g transform="translate(186, 56)">
                  <circle cx="0" cy="0" r="14" fill="#18110B" stroke="#D4A63A" strokeWidth="1.2" strokeOpacity="0.5" />
                  <rect x="-7" y="1" width="3" height="6" rx="1" fill="#D4A63A" fillOpacity="0.75" />
                  <rect x="-1.5" y="-4" width="3" height="11" rx="1" fill="#F3D78A" />
                  <rect x="4" y="-8" width="3" height="15" rx="1" fill="#D4A63A" fillOpacity="0.75" />
                </g>

                {/* ── SATELLITE GLYPH 2: Privacy / Toggle Settings (Bottom-Left) ── */}
                <g transform="translate(54, 184)">
                  <circle cx="0" cy="0" r="14" fill="#18110B" stroke="#D4A63A" strokeWidth="1.2" strokeOpacity="0.5" />
                  <rect x="-9" y="-4" width="18" height="8" rx="4" stroke="#D4A63A" strokeWidth="1.2" fill="none" strokeOpacity="0.7" />
                  <circle cx="4" cy="0" r="2.8" fill="#F3D78A" />
                </g>

                {/* ── SATELLITE GLYPH 3: Sparkle of Trust (Top-Left) ── */}
                <path
                  d="M54 48 Q54 58 44 58 Q54 58 54 68 Q54 58 64 58 Q54 58 54 48 Z"
                  fill="#F3D78A"
                  fillOpacity="0.6"
                />

                {/* ── SATELLITE GLYPH 4: Verified Consent Check (Bottom-Right) ── */}
                <g transform="translate(186, 182)">
                  <circle cx="0" cy="0" r="12" fill="#18110B" stroke="#D4A63A" strokeWidth="1.1" strokeOpacity="0.45" />
                  <path
                    d="M-4.5 -0.5 L-1.5 2.5 L5 -4"
                    stroke="#F3D78A"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>

                {/* ── CENTRAL TRUST SHIELD ── */}
                {/* Outer Shield Contour */}
                <path
                  d="M120 38 L176 60 V124 C176 168 120 198 120 198 C120 198 64 168 64 124 V60 Z"
                  fill="url(#heroShieldGrad)"
                  stroke="url(#heroGoldGrad)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Inner Shield Accent Contour */}
                <path
                  d="M120 48 L166 68 V122 C166 158 120 184 120 184 C120 184 74 158 74 122 V68 Z"
                  stroke="#D4A63A"
                  strokeWidth="1.1"
                  strokeOpacity="0.32"
                  strokeDasharray="4 4"
                />

                {/* ── GRAND CENTRAL COOKIE EMBLEM ── */}
                {/* Cookie Contour with Bite Silhouette */}
                <path
                  d="M120 78 C131 78 141 83 147 91 C144 95 145 101 150 103 C155 105 158 102 160 109 C161 113 161 117 161 120 C161 140 142 154 120 154 C98 154 80 137 80 116 C80 95 98 78 120 78 Z"
                  fill="url(#heroCookieGrad)"
                  stroke="url(#heroGoldGrad)"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Cookie Inner Texture Ring */}
                <circle
                  cx="120"
                  cy="116"
                  r="28"
                  stroke="#D4A63A"
                  strokeWidth="0.8"
                  strokeOpacity="0.2"
                />

                {/* Golden Chocolate Chips with Highlights */}
                <circle cx="106" cy="104" r="3.6" fill="#D4A63A" />
                <circle cx="105" cy="103" r="1.1" fill="#FFF5D1" />

                <circle cx="126" cy="98" r="3.2" fill="#F3D78A" />
                <circle cx="125" cy="97" r="1.0" fill="#FFF8DE" />

                <circle cx="138" cy="116" r="3.4" fill="#D4A63A" />
                <circle cx="137" cy="115" r="1.0" fill="#FFF5D1" />

                <circle cx="116" cy="118" r="4.0" fill="#F3D78A" />
                <circle cx="115" cy="117" r="1.3" fill="#FFF8DE" />

                <circle cx="100" cy="125" r="3.2" fill="#D4A63A" />
                <circle cx="99" cy="124" r="1.0" fill="#FFF5D1" />

                <circle cx="128" cy="134" r="3.4" fill="#F3D78A" />
                <circle cx="127" cy="133" r="1.0" fill="#FFF8DE" />

                <circle cx="114" cy="140" r="2.6" fill="#D4A63A" />

                {/* Lower Shield Verification Accent */}
                <path
                  d="M108 172 H132 M120 167 V177"
                  stroke="#D4A63A"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <circle cx="120" cy="172" r="2.8" fill="#F3D78A" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
