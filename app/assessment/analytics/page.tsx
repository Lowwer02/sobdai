import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { fetchMyAnalytics, fetchMyRecommendations } from '@/app/assessment/actions'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft, Sparkles } from 'lucide-react'

export const metadata: Metadata = {
  title: 'ผลการเรียนของฉัน | Sobdai',
  description: 'สรุปผลและแนวโน้มการทำข้อสอบของคุณ',
}

export default async function MyAnalyticsPage() {
  // Auth gate — matches the /settings convention.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Analytics and Recommendations are independent read-only calls — fetch in
  // parallel. Recommendations consume Analytics internally but expose their
  // own read-path (with target enrichment), so both resolve here.
  const [{ data: analytics, error }, { data: recs }] = await Promise.all([
    fetchMyAnalytics(),
    fetchMyRecommendations(),
  ])

  return (
    <div className="min-h-screen bg-[#0F0B07] text-[#F5E9D6] py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <Link
            href="/my-packages"
            className="inline-flex items-center gap-1 text-sm text-[#A1866B] hover:text-[#D4AF37] transition-colors mb-3"
          >
            <ChevronLeft size={16} /> กลับ
          </Link>
          <h1 className="text-2xl font-bold font-display">ผลการเรียนของฉัน</h1>
          <p className="text-sm text-[#A1866B] mt-1">
            สรุปจากการทำข้อสอบทั้งหมดของคุณ — อ่านจากประวัติที่บันทึกไว้
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            ไม่สามารถโหลดข้อมูลได้: {error}
          </div>
        )}

        {analytics && analytics.overall.totalAttempts === 0 && (
          <div className="rounded-2xl border border-[rgba(212,175,55,0.15)] bg-[#1A140E] p-8 text-center">
            <p className="text-[#F5E9D6] font-medium">ยังไม่มีประวัติการทำข้อสอบ</p>
            <p className="text-sm text-[#A1866B] mt-1">
              เริ่มทำข้อสอบเพื่อดูสรุปผลและแนวโน้มของคุณที่นี่
            </p>
            <Link
              href="/my-packages"
              className="inline-block mt-4 bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] font-bold text-sm px-5 py-2.5 rounded-xl transition-colors"
            >
              ดูแพ็กเกจของฉัน
            </Link>
          </div>
        )}

        {analytics && analytics.overall.totalAttempts > 0 && (
          <>
            {/* Recommendations — what to do next (Epic 4). Surfaces first because
                it's the most actionable signal. Read-only; derived from the
                learner's Analytics. Each card explains WHY. */}
            {recs && !recs.isEmpty && recs.recommendations.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-[#A1866B] flex items-center gap-2">
                  <Sparkles size={14} className="text-[#D4AF37]" />
                  ขั้นตอนถัดไปแนะนำ
                </h2>
                <div className="space-y-2">
                  {recs.recommendations.map((r, i) => {
                    const targetHref =
                      r.target?.kind === 'summary' && r.target.slug && r.target.packageSlug
                        ? `/package/${r.target.packageSlug}/summary/${r.target.slug}`
                        : null
                    const body = (
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[#F5E9D6]">
                          {r.title}
                        </div>
                        <div className="text-xs text-[#A1866B] mt-1 leading-relaxed">
                          {r.reason}
                        </div>
                        {r.target?.label && (
                          <div className="text-xs text-[#D4AF37] mt-2">
                            → {r.target.label}
                          </div>
                        )}
                      </div>
                    )
                    return targetHref ? (
                      <Link
                        key={i}
                        href={targetHref}
                        className="block rounded-xl border border-[rgba(212,175,55,0.2)] bg-[#1A140E] px-4 py-3 hover:border-[#D4AF37]/50 transition-colors"
                      >
                        {body}
                      </Link>
                    ) : (
                      <div
                        key={i}
                        className="rounded-xl border border-[rgba(255,255,255,0.05)] bg-[#1A140E] px-4 py-3"
                      >
                        {body}
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* Overall performance */}
            <section className="space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-[#A1866B]">
                ภาพรวม
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="จำนวนครั้งที่ทำ" value={String(analytics.overall.totalAttempts)} />
                <Stat
                  label="คะแนนเฉลี่ย"
                  value={String(analytics.overall.averageScore)}
                />
                <Stat
                  label="คะแนนสูงสุด"
                  value={String(analytics.overall.bestScore)}
                />
                <Stat
                  label="ความแม่นยำเฉลี่ย"
                  value={`${analytics.overall.averageAccuracy}%`}
                />
                <Stat label="ตอบถูก" value={String(analytics.overall.totalCorrect)} />
                <Stat label="ตอบผิด" value={String(analytics.overall.totalIncorrect)} />
                <Stat
                  label="จำนวนข้อที่ทำ"
                  value={String(analytics.overall.totalAnswered)}
                />
                <Stat
                  label="เวลาเฉลี่ย/ครั้ง"
                  value={formatDuration(analytics.overall.averageTimeSeconds)}
                />
              </div>
              <p className="text-xs text-[#A1866B]">
                แบ่งตามประเภท: ฝึกหัด {analytics.overall.practiceAttempts} ครั้ง ·
                จำลองข้อสอบ {analytics.overall.simulationAttempts} ครั้ง
              </p>
            </section>

            {/* Weak / strong subjects */}
            <section className="space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-[#A1866B]">
                รายวิชา
              </h2>
              {analytics.weakSubjects.length === 0 &&
              analytics.strongSubjects.length === 0 ? (
                <p className="text-sm text-[#A1866B]">
                  ยังไม่มีข้อมูลรายวิชาเพียงพอที่จะจัดกลุ่ม
                </p>
              ) : (
                <div className="space-y-2">
                  {analytics.subjectPerformance.map((s) => {
                    const cls =
                      s.accuracy < 50
                        ? 'weak'
                        : s.accuracy >= 80
                        ? 'strong'
                        : 'mid'
                    return (
                      <div
                        key={s.name}
                        className="flex items-center justify-between rounded-xl border border-[rgba(255,255,255,0.05)] bg-[#1A140E] px-4 py-3"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-[#F5E9D6] truncate">
                            {s.name}
                          </div>
                          <div className="text-xs text-[#A1866B]">
                            ถูก {s.correct}/{s.total}
                          </div>
                        </div>
                        <span
                          className={`text-sm font-bold px-2.5 py-1 rounded-md ${
                            cls === 'weak'
                              ? 'text-red-300 bg-red-500/10'
                              : cls === 'strong'
                              ? 'text-green-300 bg-green-500/10'
                              : 'text-[#D4AF37] bg-[#D4AF37]/10'
                          }`}
                        >
                          {s.accuracy}%
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            {/* Topic performance */}
            {analytics.topicPerformance.length > 0 && (
              <section className="space-y-4">
                <h2 className="text-sm font-bold uppercase tracking-wider text-[#A1866B]">
                  หัวข้อย่อย
                </h2>
                <div className="space-y-2">
                  {analytics.topicPerformance.slice(0, 12).map((t) => (
                    <div
                      key={t.name}
                      className="flex items-center justify-between rounded-xl border border-[rgba(255,255,255,0.05)] bg-[#1A140E] px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm text-[#F5E9D6] truncate">{t.name}</div>
                        <div className="text-xs text-[#A1866B]">
                          ถูก {t.correct}/{t.total}
                        </div>
                      </div>
                      <span className="text-sm font-bold text-[#F5E9D6]">{t.accuracy}%</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Recent history */}
            <section className="space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-[#A1866B]">
                ประวัติล่าสุด
              </h2>
              <div className="space-y-2">
                {analytics.history
                  .slice()
                  .reverse()
                  .slice(0, 10)
                  .map((h) => (
                    <div
                      key={h.id}
                      className="flex items-center justify-between rounded-xl border border-[rgba(255,255,255,0.05)] bg-[#1A140E] px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm text-[#F5E9D6]">
                          {h.mode === 'simulation' ? 'จำลองข้อสอบ' : 'ฝึกหัด'} ·{' '}
                          {h.score}/{h.total}
                        </div>
                        <div className="text-xs text-[#A1866B]">
                          {new Date(h.completed_at).toLocaleString('th-TH', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </div>
                      </div>
                      <span
                        className={`text-xs font-bold px-2 py-1 rounded-md ${
                          h.passed
                            ? 'text-green-300 bg-green-500/10'
                            : 'text-red-300 bg-red-500/10'
                        }`}
                      >
                        {h.accuracy}%
                      </span>
                    </div>
                  ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}

// ─── small presentational helpers (local to this page) ───────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.05)] bg-[#1A140E] px-4 py-3">
      <div className="text-xl font-bold text-[#F5E9D6]">{value}</div>
      <div className="text-[11px] text-[#A1866B] mt-0.5">{label}</div>
    </div>
  )
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s}วิ`
  return `${m}นาที ${s.toString().padStart(2, '0')}วิ`
}
