'use client'

/**
 * ShareResultCard — a 1200×1200 PNG-ready card for sharing exam results on
 * social media (Facebook / LINE / Instagram / X / Threads).
 *
 * Design direction: Sobdai theme — dark background, gold accent, premium,
 * minimal, glassmorphism. No emoji, no cartoon. Mirrors the approved mockup.
 *
 * Rendering:
 *   This component renders an off-screen 1200×1200 element. It is NOT visible
 *   to the user directly; DownloadShareButton wraps it and calls html-to-image
 *   to produce a PNG. Pure client-side — no upload, no DB, no API.
 *
 * Reserved area:
 *   A "future expansion slot" is built into the layout (a glass card with a
 *   subtle grid pattern). It shows NO data and NO placeholder text — it is
 *   decoration only, ready to host Top%, Ranking, Badges, Streaks, AI recs,
 *   etc. later without changing the main layout.
 */

import { SOBDAI_QR_SVG, SOBDAI_URL } from './qrCode'

export interface SubjectScore {
  subject: string
  correct: number
  total: number
}

export interface ShareResultCardProps {
  /** Package display name, e.g. "ตำรวจภูธรภาค ๘". */
  packageName: string
  /** Position display name, e.g. "สอบตรงเข้ารับราชการ". */
  positionName: string
  /** Exam set name. */
  examName: string
  /** Overall score percentage 0–100. */
  scorePercent: number
  /** Number of correct answers. */
  correct: number
  /** Number of wrong/unanswered questions. */
  wrong: number
  /** Total time used in seconds. */
  timeUsedSeconds: number
  /** Per-subject breakdown (already computed by the caller). */
  subjects: SubjectScore[]
}

// ----- helpers ---------------------------------------------------------------

function getHeadline(percent: number): { headline: string; subtitle: string } {
  if (percent >= 80) {
    return { headline: 'ยอดเยี่ยม!', subtitle: 'คุณพร้อมสำหรับการสอบแล้ว' }
  }
  if (percent >= 60) {
    return { headline: 'ทำได้ดี!', subtitle: 'ทบทวนอีกนิดรับรองผ่านฉลุย' }
  }
  return { headline: 'อย่าท้อแท้', subtitle: 'ฝึกต่อไป คุณทำได้แน่นอน' }
}

function getMotivation(percent: number): string {
  if (percent >= 80) {
    return 'บทเรียนที่คุณทำได้ดี คือพื้นฐานของความสำเร็จ วันสอบจะเป็นวันของคุณ'
  }
  if (percent >= 60) {
    return 'คุณใกล้สอบผ่านแล้ว ทบทวนจุดที่พลาด แล้วกลับมาทำใหม่อีกครั้ง'
  }
  return 'ความพยายามอยู่ที่ไหน ความสำเร็จอยู่ที่นั่น ลองใหม่อีกครั้งได้เสมอ'
}

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

// ----- card -----------------------------------------------------------------

const COLORS = {
  bg: '#0F0B07',
  cardBg: '#1A140E',
  cardBorder: 'rgba(255,255,255,0.06)',
  glassBg: 'rgba(255,255,255,0.03)',
  glassBorder: 'rgba(212,175,55,0.18)',
  gold: '#D4AF37',
  goldSoft: 'rgba(212,175,55,0.12)',
  cream: '#F5E9D6',
  muted: '#A1866B',
  green: '#22C55E',
  red: '#EF4444',
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
  const { headline, subtitle } = getHeadline(scorePercent)
  const motivation = getMotivation(scorePercent)
  const scoreColor = scorePercent >= 60 ? COLORS.green : COLORS.red

  // Score ring maths (SVG circle).
  const RADIUS = 88
  const CIRC = 2 * Math.PI * RADIUS
  const dashOffset = CIRC - (CIRC * scorePercent) / 100

  return (
    <div
      id="sobdai-share-card"
      style={{
        width: 1200,
        height: 1200,
        backgroundColor: COLORS.bg,
        color: COLORS.cream,
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        position: 'relative',
        overflow: 'hidden',
        padding: 56,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Ambient gold glow (background decoration) */}
      <div
        style={{
          position: 'absolute',
          top: -160,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 760,
          height: 760,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${COLORS.goldSoft} 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />
      {/* Subtle grid texture (background decoration) */}
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

      {/* Content stack */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%', gap: 24 }}>

        {/* ---- HEADER: logo / package / position / exam name ---- */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 8 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              padding: '8px 18px',
              borderRadius: 999,
              backgroundColor: COLORS.glassBg,
              border: `1px solid ${COLORS.glassBorder}`,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={COLORS.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <circle cx="12" cy="10" r="3" fill={COLORS.gold} stroke="none" />
            </svg>
            <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.02em', color: COLORS.gold }}>Sobdai</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, color: COLORS.cream }}>{packageName}</div>
          <div style={{ fontSize: 15, color: COLORS.muted }}>{positionName} · {examName}</div>
        </div>

        {/* ---- HEADLINE ---- */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.cream, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            สรุปผลการทดสอบ
          </div>
          <div style={{ fontSize: 40, fontWeight: 800, color: scoreColor, marginTop: 6, lineHeight: 1.1 }}>{headline}</div>
          <div style={{ fontSize: 20, color: COLORS.muted, marginTop: 4 }}>{subtitle}</div>
        </div>

        {/* ---- HERO SCORE CIRCLE (largest element) ---- */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ position: 'relative', width: 240, height: 240 }}>
            <svg width="240" height="240" viewBox="0 0 240 240">
              <circle cx="120" cy="120" r={RADIUS} fill="none" stroke={COLORS.cardBorder} strokeWidth="14" />
              <circle
                cx="120"
                cy="120"
                r={RADIUS}
                fill="none"
                stroke={scoreColor}
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={dashOffset}
                transform="rotate(-90 120 120)"
              />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 72, fontWeight: 800, color: COLORS.cream, lineHeight: 1 }}>
                {scorePercent}<span style={{ fontSize: 36, color: COLORS.muted }}>%</span>
              </div>
            </div>
          </div>
        </div>

        {/* ---- STATISTICS: 3 cards ---- */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          {[
            { value: correct, label: 'ตอบถูก', color: COLORS.green },
            { value: wrong, label: 'ตอบผิด', color: COLORS.red },
            { value: formatDuration(timeUsedSeconds), label: 'เวลาที่ใช้', color: COLORS.gold },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                backgroundColor: COLORS.cardBg,
                border: `1px solid ${COLORS.cardBorder}`,
                borderRadius: 20,
                padding: '20px 12px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 36, fontWeight: 800, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: 14, color: COLORS.muted, marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* ---- MOTIVATION ---- */}
        <div
          style={{
            textAlign: 'center',
            fontSize: 18,
            color: COLORS.cream,
            lineHeight: 1.5,
            padding: '0 24px',
          }}
        >
          {motivation}
        </div>

        {/* ---- SUMMARY BY SUBJECT (progress bars) ---- */}
        {subjects.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {subjects.map((s) => {
              const pct = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0
              return (
                <div key={s.subject} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
                    <span style={{ color: COLORS.cream, fontWeight: 600 }}>{s.subject}</span>
                    <span style={{ color: COLORS.muted }}>{s.correct}/{s.total}</span>
                  </div>
                  <div style={{ height: 10, borderRadius: 999, backgroundColor: COLORS.cardBg, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, backgroundColor: COLORS.gold, borderRadius: 999 }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ---- RESERVED: Future Expansion Slot ---- */}
        {/* No data, no placeholder text. Glass card + grid pattern decoration.
            Ready to host Top%, Ranking, Badges, Streaks, AI recs, etc. later
            without changing the main layout. */}
        <div
          style={{
            flex: 1,
            minHeight: 60,
            borderRadius: 20,
            background: COLORS.glassBg,
            border: `1px solid ${COLORS.glassBorder}`,
            backgroundImage:
              'linear-gradient(rgba(212,175,55,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,55,0.06) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        />

        {/* ---- QR + FOOTER ---- */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, paddingTop: 8 }}>
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
              <div style={{ fontSize: 13, color: COLORS.muted }}>Scan เพื่อทดลองใช้งาน</div>
              <div style={{ fontSize: 15, color: COLORS.cream, fontWeight: 600 }}>Sobdai</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: COLORS.gold }}>Sobdai</div>
            <div style={{ fontSize: 13, color: COLORS.muted }}>เตรียมสอบอย่างมีระบบ</div>
            <div style={{ fontSize: 13, color: COLORS.cream, fontWeight: 600 }}>{SOBDAI_URL.replace('https://', '')}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
