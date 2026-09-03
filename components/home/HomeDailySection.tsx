'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, Flame, Sparkles, Zap } from 'lucide-react'
import { loadDailyState } from '@/app/daily/actions'
import { trackDailyHomeClick } from '@/lib/analytics'
import type { DailyState } from '@/lib/daily/types'

function hasPossibleSession(): boolean {
  if (typeof document === 'undefined') return false

  try {
    if (document.cookie.includes('sb-') && document.cookie.includes('-auth-token')) {
      return true
    }

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        return true
      }
    }
  } catch {}

  return false
}

function DailyStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        minWidth: 0,
        padding: '12px 14px',
        border: '1px solid var(--border-card)',
        borderRadius: 'var(--radius-md)',
        background: 'rgba(15, 11, 8, 0.34)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '30px',
          height: '30px',
          flexShrink: 0,
          borderRadius: '50%',
          color: 'var(--gold-light)',
          background: 'var(--gold-tint)',
        }}
      >
        {icon}
      </span>
      <span style={{ minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            color: 'var(--text-muted)',
            fontSize: '12px',
            lineHeight: 1.3,
          }}
        >
          {label}
        </span>
        <span
          style={{
            display: 'block',
            marginTop: '2px',
            color: 'var(--text-primary)',
            fontSize: '15px',
            fontWeight: 700,
            lineHeight: 1.35,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {value}
        </span>
      </span>
    </div>
  )
}

function DailyCta({ label }: { label: string }) {
  return (
    <Link
      href="/daily"
      prefetch={false}
      onClick={() => {
        try {
          trackDailyHomeClick()
        } catch {}
      }}
      className="btn-primary"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        textDecoration: 'none',
      }}
    >
      {label}
      <ArrowRight size={17} aria-hidden="true" />
    </Link>
  )
}

function getDailyCopy(state: DailyState | null) {
  if (!state) {
    return {
      state: 'logged-out',
      eyebrow: 'แบบฝึกประจำวัน',
      title: 'ข้อสอบประจำวัน 5 ข้อ',
      description: 'ฝึกสั้น ๆ วันละ 5 ข้อ ใช้เวลาเพียงไม่กี่นาที เพื่อฝึกให้ต่อเนื่องทุกวัน',
      cta: 'เริ่มฝึกวันนี้',
      stats: [
        { label: 'โจทย์ประจำวัน', value: '5 ข้อ', icon: <Sparkles size={15} /> },
        { label: 'ใช้เวลา', value: 'ไม่กี่นาที', icon: <Check size={15} /> },
        { label: 'เป้าหมาย', value: 'ฝึกต่อเนื่อง', icon: <Flame size={15} /> },
      ],
    } as const
  }

  if (state.progress.dailyCompleted) {
    return {
      state: 'completed',
      eyebrow: 'วันนี้ทำครบแล้ว',
      title: 'ทำครบ 5 ข้อแล้ว',
      description: `วันนี้ตอบถูก ${state.progress.correctAnswers}/5 ข้อ และได้รับ +${state.progress.expEarned} EXP`,
      cta: 'ดูผลวันนี้',
      stats: [
        { label: 'ผลวันนี้', value: `${state.progress.correctAnswers}/5 ถูก`, icon: <Check size={15} /> },
        { label: 'EXP วันนี้', value: `+${state.progress.expEarned} EXP`, icon: <Zap size={15} /> },
        { label: 'ต่อเนื่อง', value: `${state.lifetime.currentStreak} วัน`, icon: <Flame size={15} /> },
      ],
    } as const
  }

  if (state.progress.questionsAnswered > 0) {
    return {
      state: 'in-progress',
      eyebrow: 'ฝึกให้ต่อเนื่องทุกวัน',
      title: 'ทำข้อสอบวันนี้ต่อ',
      description: `วันนี้ตอบแล้ว ${state.progress.questionsAnswered}/5 ข้อ กลับมาฝึกต่อให้ครบ 5 ข้อ`,
      cta: 'ทำต่อ',
      stats: [
        { label: 'ความคืบหน้า', value: `${state.progress.questionsAnswered}/5 ข้อ`, icon: <Check size={15} /> },
        { label: 'ต่อเนื่อง', value: `${state.lifetime.currentStreak} วัน`, icon: <Flame size={15} /> },
        { label: 'EXP สะสม', value: `${state.stats.totalExp} EXP`, icon: <Zap size={15} /> },
      ],
    } as const
  }

  return {
    state: 'not-started',
    eyebrow: 'วันนี้ยังไม่ได้เริ่ม',
    title: 'ข้อสอบประจำวัน 5 ข้อ',
    description: 'เริ่มจากข้อสอบสั้น ๆ ใช้เวลาเพียงไม่กี่นาที แล้วฝึกให้ต่อเนื่องทุกวัน',
    cta: 'เริ่มฝึกวันนี้',
    stats: [
      { label: 'โจทย์วันนี้', value: '5 ข้อ', icon: <Sparkles size={15} /> },
      { label: 'ต่อเนื่อง', value: `${state.lifetime.currentStreak} วัน`, icon: <Flame size={15} /> },
      { label: 'EXP สะสม', value: `${state.stats.totalExp} EXP`, icon: <Zap size={15} /> },
    ],
  } as const
}

export default function HomeDailySection() {
  const [dailyState, setDailyState] = useState<DailyState | null>(null)

  useEffect(() => {
    if (!hasPossibleSession()) return

    let cancelled = false

    void loadDailyState()
      .then((result) => {
        if (cancelled || result.status !== 'ready') return
        setDailyState(result.state)
      })
      .catch(() => {
        // The public discovery card remains useful if Daily is temporarily unavailable.
      })

    return () => {
      cancelled = true
    }
  }, [])

  const copy = getDailyCopy(dailyState)

  return (
    <section
      aria-labelledby="home-daily-title"
      data-daily-state={copy.state}
      style={{
        padding: 'clamp(24px, 4vw, 40px) 20px clamp(48px, 7vw, 88px)',
        maxWidth: '1160px',
        margin: '0 auto',
      }}
    >
      <div
        className="card-gold"
        style={{
          position: 'relative',
          overflow: 'hidden',
          padding: 'clamp(22px, 4vw, 36px)',
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.38)',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '-110px',
            right: '-60px',
            width: '280px',
            height: '280px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(212, 168, 67, 0.14) 0%, transparent 68%)',
            pointerEvents: 'none',
          }}
        />

        <div
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
            gap: 'clamp(24px, 5vw, 52px)',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ marginBottom: '12px' }}>
              <span className="badge badge-gold" style={{ fontSize: '11.5px', padding: '3px 11px' }}>
                {copy.eyebrow}
              </span>
            </div>
            <h2
              id="home-daily-title"
              className="font-display"
              style={{
                margin: '0 0 10px',
                color: 'var(--text-primary)',
                fontSize: 'clamp(25px, 4vw, 36px)',
                lineHeight: 1.25,
              }}
            >
              {copy.title}
            </h2>
            <p
              style={{
                maxWidth: '520px',
                margin: '0 0 22px',
                color: 'var(--text-secondary)',
                fontSize: '15.5px',
                lineHeight: 1.65,
              }}
            >
              {copy.description}
            </p>
            <DailyCta label={copy.cta} />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '10px',
            }}
          >
            {copy.stats.map((stat) => (
              <DailyStat key={stat.label} {...stat} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
