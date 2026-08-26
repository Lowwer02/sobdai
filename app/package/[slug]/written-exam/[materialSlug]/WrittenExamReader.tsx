'use client'

import Link from 'next/link'
import { BookOpen, ChevronLeft, ChevronRight, Eye, EyeOff, FileText, Lightbulb, ListChecks } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import SummaryMarkdown from '@/components/summary/SummaryMarkdown'
import type { WrittenExamLearnerMaterial, WrittenExamLearnerQuestion } from '@/lib/writtenExamLearner'

export default function WrittenExamReader({
  packageName,
  packageSlug,
  material,
  initialQuestionIndex,
  discoveryQuestionCount,
}: {
  packageName: string
  packageSlug: string
  material: WrittenExamLearnerMaterial
  initialQuestionIndex: number
  discoveryQuestionCount: number
}) {
  const [selectedIndex, setSelectedIndex] = useState(initialQuestionIndex)
  const [showAnswer, setShowAnswer] = useState(true)

  useEffect(() => {
    setSelectedIndex(clampIndex(initialQuestionIndex, material.questions.length))
    setShowAnswer(true)
  }, [initialQuestionIndex, material.materialSlug, material.revisionNumber, material.questions.length])

  const question = material.questions[selectedIndex]
  if (!question) return null

  const totalQuestions = material.questions.length
  const hasPrevious = selectedIndex > 0
  const hasNext = selectedIndex < totalQuestions - 1

  const selectQuestion = (index: number) => {
    const nextIndex = clampIndex(index, totalQuestions)
    setSelectedIndex(nextIndex)
    setShowAnswer(true)
    const nextQuestion = material.questions[nextIndex]
    if (nextQuestion) {
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}?question=${nextQuestion.questionNumber}`,
      )
    }
  }

  return (
    <div className="min-h-screen bg-[#0F0B07] pb-20 text-[#F5E9D6] selection:bg-[#D4AF37]/30 selection:text-[#F5E9D6]">
      <header className="sticky top-0 z-40 border-b border-[rgba(212,175,55,0.12)] bg-[#0F0B07]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 md:px-8">
          <Link
            href={`/package/${packageSlug}`}
            className="inline-flex min-w-0 items-center gap-2 rounded-lg px-1 py-1 text-sm font-medium text-[#A1866B] transition-colors hover:text-[#D4AF37] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
          >
            <ChevronLeft size={16} aria-hidden="true" />
            <span className="truncate">กลับไปที่ {packageName}</span>
          </Link>
          <span className="hidden flex-shrink-0 items-center gap-2 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#1A140E] px-3 py-1.5 text-xs font-bold text-[#A1866B] sm:inline-flex">
            <BookOpen size={14} className="text-[#D4AF37]" aria-hidden="true" />
            อ่าน / ท่องจำ
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-7 md:px-8 md:py-10">
        <header className="mb-7 max-w-3xl">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className="rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/10 px-3 py-1 text-[#D4AF37]">
              ข้อสอบอัตนัย
            </span>
            <span className="rounded-full border border-[rgba(255,255,255,0.08)] bg-[#1A140E] px-3 py-1 text-[#A1866B]">
              {discoveryQuestionCount} ข้อ
            </span>
          </div>
          <h1 className="text-3xl font-bold font-display leading-tight text-[#F5E9D6] md:text-5xl">
            {material.title}
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#A1866B] md:text-base">
            ศึกษาโจทย์และแนวคำตอบสำหรับการสอบอัตนัย เลือกข้อเพื่ออ่านทบทวนได้ทันที
          </p>
        </header>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-8">
          <aside className="lg:sticky lg:top-24">
            <div className="rounded-2xl border border-[rgba(212,175,55,0.15)] bg-[#1A140E] p-4 shadow-xl">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-sm font-bold text-[#F5E9D6]">
                  <ListChecks size={17} className="text-[#D4AF37]" aria-hidden="true" />
                  เลือกคำถาม
                </h2>
                <span className="text-xs text-[#A1866B]">{selectedIndex + 1} / {totalQuestions}</span>
              </div>
              <nav aria-label="รายการคำถาม Written Exam" className="max-h-52 overflow-y-auto pr-1 lg:max-h-[calc(100vh-190px)]">
                <ol className="grid grid-cols-5 gap-2 sm:grid-cols-8 lg:grid-cols-4">
                  {material.questions.map((item, index) => (
                    <li key={item.questionNumber}>
                      <button
                        type="button"
                        onClick={() => selectQuestion(index)}
                        aria-label={`ไปยังข้อที่ ${item.questionNumber}`}
                        aria-current={index === selectedIndex ? 'true' : undefined}
                        className={`flex min-h-9 w-full items-center justify-center rounded-lg border px-1 text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-[#D4AF37] ${index === selectedIndex
                          ? 'border-[#D4AF37] bg-[#D4AF37] text-[#1A140E]'
                          : 'border-[rgba(255,255,255,0.08)] bg-[#0F0B07] text-[#A1866B] hover:border-[#D4AF37]/50 hover:text-[#D4AF37]'
                        }`}
                      >
                        {item.questionNumber}
                      </button>
                    </li>
                  ))}
                </ol>
              </nav>
            </div>
          </aside>

          <article className="min-w-0">
            <div className="mb-4 flex items-center justify-between gap-3 text-sm">
              <span className="font-bold text-[#D4AF37]">ข้อที่ {question.questionNumber}</span>
              <span className="text-[#A1866B]">{selectedIndex + 1} / {totalQuestions}</span>
            </div>

            <StudySection title="โจทย์" icon={<FileText size={18} aria-hidden="true" />} emphasis>
              <SummaryMarkdown content={question.questionMarkdown} />
            </StudySection>

            <section className="mt-5 overflow-hidden rounded-2xl border border-[#D4AF37]/30 bg-[#1A140E] shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(212,175,55,0.14)] bg-[#D4AF37]/5 px-5 py-4 md:px-7">
                <h2 className="flex items-center gap-2 text-lg font-bold font-display text-[#F5E9D6]">
                  <BookOpen size={19} className="text-[#D4AF37]" aria-hidden="true" />
                  แนวคำตอบ
                </h2>
                <button
                  type="button"
                  onClick={() => setShowAnswer((visible) => !visible)}
                  className="inline-flex items-center gap-2 rounded-lg border border-[#D4AF37]/30 px-3 py-2 text-xs font-bold text-[#D4AF37] transition-colors hover:bg-[#D4AF37]/10 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                  aria-expanded={showAnswer}
                >
                  {showAnswer ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
                  {showAnswer ? 'ซ่อนแนวคำตอบ' : 'แสดงแนวคำตอบ'}
                </button>
              </div>
              {showAnswer ? (
                <div className="p-5 md:p-7">
                  <SummaryMarkdown content={question.modelAnswerMarkdown} />
                </div>
              ) : (
                <div className="px-5 py-8 text-center text-sm text-[#A1866B] md:px-7">
                  ซ่อนแนวคำตอบไว้ชั่วคราว กด “แสดงแนวคำตอบ” เมื่อพร้อมตรวจทบทวน
                </div>
              )}
            </section>

            {question.keywords.length > 0 && (
              <section className="mt-5 rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[#1A140E] p-5 shadow-lg md:p-7">
                <h2 className="mb-4 text-base font-bold font-display text-[#D4AF37]">Keywords</h2>
                <ul className="flex flex-wrap gap-2" aria-label="Keywords">
                  {question.keywords.map((keyword) => (
                    <li key={keyword} className="rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/10 px-3 py-1.5 text-sm text-[#E5C86B]">
                      {keyword}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {question.answerStructureMarkdown && (
              <StudySection title="โครงสร้าง/ประเด็นสำคัญในการตอบ" icon={<ListChecks size={18} aria-hidden="true" />}>
                <SummaryMarkdown content={question.answerStructureMarkdown} />
              </StudySection>
            )}

            {question.memoryTechniqueMarkdown && (
              <StudySection title="เทคนิคช่วยจำ" icon={<Lightbulb size={18} aria-hidden="true" />} memory>
                <SummaryMarkdown content={question.memoryTechniqueMarkdown} />
              </StudySection>
            )}

            <nav className="mt-7 flex items-center justify-between gap-3" aria-label="เปลี่ยนคำถาม">
              <button
                type="button"
                onClick={() => selectQuestion(selectedIndex - 1)}
                disabled={!hasPrevious}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[rgba(255,255,255,0.1)] px-4 py-3 text-sm font-bold text-[#F5E9D6] transition-colors hover:border-[#D4AF37]/50 hover:text-[#D4AF37] disabled:cursor-not-allowed disabled:opacity-35"
              >
                <ChevronLeft size={17} aria-hidden="true" />
                <span className="hidden sm:inline">ข้อก่อนหน้า</span>
                <span className="sm:hidden">ก่อนหน้า</span>
              </button>
              <span className="text-xs text-[#A1866B]">เลือกข้อเพื่ออ่านต่อ</span>
              <button
                type="button"
                onClick={() => selectQuestion(selectedIndex + 1)}
                disabled={!hasNext}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#D4AF37]/35 px-4 py-3 text-sm font-bold text-[#D4AF37] transition-colors hover:bg-[#D4AF37]/10 disabled:cursor-not-allowed disabled:opacity-35"
              >
                <span className="hidden sm:inline">ข้อถัดไป</span>
                <span className="sm:hidden">ถัดไป</span>
                <ChevronRight size={17} aria-hidden="true" />
              </button>
            </nav>
          </article>
        </div>
      </main>
    </div>
  )
}

function StudySection({
  title,
  icon,
  children,
  emphasis = false,
  memory = false,
}: {
  title: string
  icon: ReactNode
  children: ReactNode
  emphasis?: boolean
  memory?: boolean
}) {
  return (
    <section className={`overflow-hidden rounded-2xl border shadow-lg ${emphasis
      ? 'border-[#D4AF37]/30 bg-[#1A140E]'
      : memory
        ? 'border-[#D4AF37]/20 bg-[#D4AF37]/[0.06]'
        : 'border-[rgba(255,255,255,0.08)] bg-[#1A140E]'
    }`}>
      <div className="flex items-center gap-2 border-b border-[rgba(255,255,255,0.07)] px-5 py-4 md:px-7">
        <span className="text-[#D4AF37]">{icon}</span>
        <h2 className="text-lg font-bold font-display text-[#F5E9D6]">{title}</h2>
      </div>
      <div className="p-5 md:p-7">{children}</div>
    </section>
  )
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0
  if (!Number.isSafeInteger(index)) return 0
  return Math.min(Math.max(index, 0), length - 1)
}
