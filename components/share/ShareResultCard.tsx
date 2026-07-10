'use client'

/**
 * ShareResultCard — a 1200×1200 PNG-ready card for sharing exam results.
 *
 * Session 6.14.1 polish:
 *   - Dynamic auto color theme (red/orange/gold/green) by score band.
 *   - Dynamic background glow tinted by score band (still Sobdai dark).
 *   - Hero score circle enlarged (~30%) with score-tinted glow; true hero.
 *   - Header hierarchy tightened: logo → package → position → exam name.
 *   - Motivation rendered as a premium glass card with quote styling.
 *   - Reserved area styled as a Future Expansion card (glass + grid + glow,
 *     NO data, NO placeholder text).
 *   - Subject summary upgraded: percent + correct/total + premium spacing.
 *   - Uses the Supermarket font everywhere (loaded via @font-face globally).
 *
 * Rendering stays pure client-side; no data flow changes.
 */

import { SOBDAI_QR_SVG, SOBDAI_URL } from './qrCode'

export interface SubjectScore {
  subject: string
  correct: number
  total: number
}

export interface ShareResultCardProps {
  packageName: string
  positionName: string
  examName: string
  scorePercent: number
  correct: number
  wrong: number
  timeUsedSeconds: number
  subjects: SubjectScore[]
}

// ----- score band → theme ---------------------------------------------------

type ScoreBand = 'red' | 'orange' | 'gold' | 'green'

interface Theme {
  accent: string
  /** Soft accent used for glows / backgrounds. */
  glow: string
  band: ScoreBand
}

function getTheme(percent: number): Theme {
  if (percent >= 80) return { accent: '#22C55E', glow: 'rgba(34,197,94,0.16)', band: 'green' }
  if (percent >= 60) return { accent: '#D4AF37', glow: 'rgba(212,175,55,0.16)', band: 'gold' }
  if (percent >= 40) return { accent: '#F97316', glow: 'rgba(249,115,22,0.16)', band: 'orange' }
  return { accent: '#EF4444', glow: 'rgba(239,68,68,0.16)', band: 'red' }
}

function getHeadline(percent: number): { headline: string; subtitle: string } {
  if (percent >= 80) return { headline: 'ยอดเยี่ยม!', subtitle: 'คุณพร้อมสำหรับการสอบแล้ว' }
  if (percent >= 60) return { headline: 'ทำได้ดี!', subtitle: 'ทบทวนอีกนิดรับรองผ่านฉลุย' }
  if (percent >= 40) return { headline: 'ใกล้แล้ว', subtitle: 'คุณใกล้สอบผ่านแล้ว อีกนิดเดียว' }
  return { headline: 'อย่าท้อแท้', subtitle: 'ฝึกต่อไป คุณทำได้แน่นอน' }
}

function getMotivation(percent: number): string {
  if (percent >= 80) return 'ผลลัพธ์นี้คือผลของความขยัน วันสอบจะเป็นวันของคุณ'
  if (percent >= 60) return 'คุณใกล้สอบผ่านแล้ว ทบทวนจุดที่พลาดแล้วกลับมาให้ดีกว่าเดิม'
  if (percent >= 40) return 'อีกนิดเดียวก็ผ่าน ลองดูเฉลยแล้วฝึกซ้ำในส่วนที่ยังไม่แข็งแรง'
  return 'ความพยายามอยู่ที่ไหน ความสำเร็จอยู่ที่นั่น ลองใหม่ได้เสมอ อย่าเพิ่งท้อ'
}

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

const BASE = {
  bg: '#0F0B07',
  cardBg: '#1A140E',
  cardBorder: 'rgba(255,255,255,0.06)',
  glassBg: 'rgba(255,255,255,0.03)',
  glassBorder: 'rgba(212,175,55,0.18)',
  cream: '#F5E9D6',
  muted: '#A1866B',
}

export default function ShareResultCard({
  packageName,
  positionName,
  examName,
  scorePercent,
  correct,
  wrong,
  timeUsedSeconds,
  subjects,
}: ShareResultCardProps) {
  const theme = getTheme(scorePercent)
  const { headline, subtitle } = getHeadline(scorePercent)
  const motivation = getMotivation(scorePercent)

  // Enlarged hero (~30% bigger than v1): radius 88 → 116, container 240 → 320.
  const RADIUS = 116
  const CIRC = 2 * Math.PI * RADIUS
  const dashOffset = CIRC - (CIRC * scorePercent) / 100

  return (
    <div
      id="sobdai-share-card"
      style={{
        width: 1200,
        // Content-driven height: NO fixed height. The card grows to fit its
        // content (many subjects, reserved area, QR, footer) so html-to-image
        // exports everything without bottom clipping. Fixed `height` + `overflow:
        // hidden` was the root cause of the clip.
        backgroundColor: BASE.bg,
        color: BASE.cream,
        fontFamily: 'Supermarket, system-ui, sans-serif',
        position: 'relative',
        // `visible` so the card can grow; the off-screen wrapper in
        // DownloadShareButton controls visibility during export.
        overflow: 'hidden',
        paddingTop: 56,
        paddingRight: 56,
        paddingLeft: 56,
        // Bottom safe padding (≈56px) so html-to-image never cuts the footer.
        paddingBottom: 64,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Dynamic background glow tinted by score band (still Sobdai dark). */}
      <div
        style={{
          position: 'absolute',
          top: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 900,
          height: 900,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${theme.glow} 0%, transparent 65%)`,
          pointerEvents: 'none',
        }}
      />
      {/* Subtle grid texture (background decoration). */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          pointerEvents: 'none',
        }}
      />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 28 }}>

        {/* ---- HEADER (tightened hierarchy) ---- */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 8 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              padding: '8px 18px',
              borderRadius: 999,
              backgroundColor: BASE.glassBg,
              border: `1px solid ${BASE.glassBorder}`,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={BASE.glassBorder.includes('212') ? '#D4AF37' : theme.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <circle cx="12" cy="10" r="3" fill={theme.accent} stroke="none" />
            </svg>
            <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.02em', color: '#D4AF37' }}>Sobdai</span>
          </div>
          {/* Package name — clamped to max 2 lines so very long names never
              overlap the rows below. Uses standard -webkit-line-clamp which
              html-to-image renders correctly. */}
          <div
            className="line-clamp-2"
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: BASE.cream,
              maxWidth: 980,
              lineHeight: 1.35,
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 2,
              overflow: 'hidden',
            }}
          >
            {packageName}
          </div>
          {/* Position · Exam name — clamped to 1 line. */}
          <div
            style={{
              fontSize: 15,
              color: BASE.muted,
              maxWidth: 980,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {positionName} · {examName}
          </div>
        </div>

        {/* ---- HEADLINE ---- */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: BASE.muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            สรุปผลการทดสอบ
          </div>
          <div style={{ fontSize: 44, fontWeight: 800, color: theme.accent, marginTop: 6, lineHeight: 1.1 }}>{headline}</div>
          <div style={{ fontSize: 20, color: BASE.muted, marginTop: 4 }}>{subtitle}</div>
        </div>

        {/* ---- HERO SCORE CIRCLE (enlarged + glow) ---- */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '8px 0' }}>
          <div
            style={{
              position: 'relative',
              width: 320,
              height: 320,
              borderRadius: '50%',
              boxShadow: `0 0 80px 8px ${theme.glow}`,
            }}
          >
            <svg width="320" height="320" viewBox="0 0 320 320">
              <circle cx="160" cy="160" r={RADIUS} fill="none" stroke={BASE.cardBorder} strokeWidth="16" />
              <circle
                cx="160"
                cy="160"
                r={RADIUS}
                fill="none"
                stroke={theme.accent}
                strokeWidth="16"
                strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={dashOffset}
                transform="rotate(-90 160 160)"
              />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 96, fontWeight: 800, color: BASE.cream, lineHeight: 1 }}>
                {scorePercent}<span style={{ fontSize: 44, color: BASE.muted }}>%</span>
              </div>
            </div>
          </div>
        </div>

        {/* ---- STATISTICS: 3 cards ---- */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          {[
            { value: correct, label: 'ตอบถูก', color: '#22C55E' },
            { value: wrong, label: 'ตอบผิด', color: '#EF4444' },
            { value: formatDuration(timeUsedSeconds), label: 'เวลาที่ใช้', color: '#D4AF37' },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                backgroundColor: BASE.cardBg,
                border: `1px solid ${BASE.cardBorder}`,
                borderRadius: 20,
                padding: '20px 12px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 38, fontWeight: 800, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: 14, color: BASE.muted, marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* ---- MOTIVATION — premium glass card with quote style ---- */}
        <div
          style={{
            backgroundColor: BASE.glassBg,
            border: `1px solid ${BASE.glassBorder}`,
            borderRadius: 20,
            padding: '22px 28px',
            textAlign: 'center',
            boxShadow: `0 0 40px 0 ${theme.glow}`,
            position: 'relative',
          }}
        >
          <div style={{ fontSize: 40, color: theme.accent, lineHeight: 0.6, opacity: 0.5, position: 'absolute', top: 16, left: 18 }}>&ldquo;</div>
          <div style={{ fontSize: 19, color: BASE.cream, lineHeight: 1.55, padding: '0 20px', fontWeight: 600 }}>
            {motivation}
          </div>
          <div style={{ fontSize: 40, color: theme.accent, lineHeight: 0.6, opacity: 0.5, position: 'absolute', bottom: 10, right: 18 }}>&rdquo;</div>
        </div>

        {/* ---- SUMMARY BY SUBJECT (premium progress bars) ---- */}
        {subjects.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {subjects.map((s) => {
              const pct = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0
              return (
                <div key={s.subject} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ color: BASE.cream, fontWeight: 700, fontSize: 16 }}>{s.subject}</span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                      <span style={{ color: theme.accent, fontWeight: 800, fontSize: 18 }}>{pct}%</span>
                      <span style={{ color: BASE.muted, fontSize: 14 }}>{s.correct}/{s.total}</span>
                    </div>
                  </div>
                  <div style={{ height: 12, borderRadius: 999, backgroundColor: BASE.cardBg, overflow: 'hidden', border: `1px solid ${BASE.cardBorder}` }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, ${theme.accent}, ${theme.glow})`, borderRadius: 999 }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ---- RESERVED: Future Expansion Card (glass + grid + glow, NO data) ---- */}
        {/* NOTE: no flex-grow. A fixed minHeight keeps the slot compact so it
            never inflates and pushes QR/footer out of the exported canvas. */}
        <div
          style={{
            height: 72,
            borderRadius: 20,
            background: BASE.glassBg,
            border: `1px solid ${BASE.glassBorder}`,
            backgroundImage:
              'linear-gradient(rgba(212,175,55,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,55,0.06) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            boxShadow: `inset 0 0 40px 0 ${theme.glow}`,
          }}
        />

        {/* ---- QR + FOOTER ---- */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, paddingTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: 16,
                overflow: 'hidden',
                backgroundColor: '#ffffff',
                padding: 6,
                boxSizing: 'border-box',
              }}
              dangerouslySetInnerHTML={{ __html: SOBDAI_QR_SVG }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ fontSize: 13, color: BASE.muted }}>Scan เพื่อทดลองใช้งาน</div>
              <div style={{ fontSize: 15, color: BASE.cream, fontWeight: 700 }}>Sobdai</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#D4AF37' }}>Sobdai</div>
            <div style={{ fontSize: 13, color: BASE.muted }}>เตรียมสอบอย่างมีระบบ</div>
            <div style={{ fontSize: 13, color: BASE.cream, fontWeight: 700 }}>{SOBDAI_URL.replace('https://', '')}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
