'use client'

import React, { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Clock, Flag, CheckCircle, XCircle, Lightbulb, BookOpen, AlertCircle, RefreshCw } from 'lucide-react'

// Map letter answers to corresponding choice keys
const CHOICE_LETTERS = ['A', 'B', 'C', 'D'] as const
type ChoiceLetter = typeof CHOICE_LETTERS[number]

interface Question {
  id: string
  content: string
  choice_a: string
  choice_b: string
  choice_c: string
  choice_d: string
  correct_answer: ChoiceLetter
  hint: string | null
  full_explanation: string | null
  why_a_wrong: string | null
  why_b_wrong: string | null
  why_c_wrong: string | null
  why_d_wrong: string | null
  reference: string | null
  subject: string | null
  law: string | null
  topic: string | null
  is_common?: boolean
}

interface ExamRuntimeProps {
  pkg: any
  examSet: any
  questions: Question[]
  mode?: string
}

export default function ExamRuntime({ pkg, examSet, questions, mode }: ExamRuntimeProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, ChoiceLetter>>({})
  const [flagged, setFlagged] = useState<Record<string, boolean>>({})
  const [status, setStatus] = useState<'IN_PROGRESS' | 'CONFIRM_SUBMIT' | 'REVIEW'>('IN_PROGRESS')
  const [isExplanationExpanded, setIsExplanationExpanded] = useState(false)

  // Reset expanded state when question changes
  useEffect(() => {
    setIsExplanationExpanded(false)
  }, [currentIndex])
  
  // Timer State
  const initialTime = (examSet.time_limit_minutes || 60) * 60
  const [timeRemaining, setTimeRemaining] = useState(initialTime)
  const [timeUsed, setTimeUsed] = useState(0)

  // Weak Topic Analysis
  const [weakTopics, setWeakTopics] = useState<{name: string, count: number, type: string}[]>([])

  const q = questions[currentIndex]

  // Timer Effect
  useEffect(() => {
    if (status !== 'IN_PROGRESS') return
    if (timeRemaining <= 0) {
      handleForceSubmit()
      return
    }
    const timer = setInterval(() => {
      setTimeRemaining(prev => prev - 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [timeRemaining, status])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  // Navigation
  const goNext = () => {
    if (currentIndex < questions.length - 1) setCurrentIndex(currentIndex + 1)
  }
  const goPrev = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1)
  }
  const toggleFlag = () => {
    setFlagged(prev => ({ ...prev, [q.id]: !prev[q.id] }))
  }

  // Answer selection
  const handleSelect = (letter: ChoiceLetter) => {
    if (status !== 'IN_PROGRESS') return
    setAnswers(prev => ({ ...prev, [q.id]: letter }))
    // Auto next on answer (only for non-practice modes)
    if (mode !== 'practice' && currentIndex < questions.length - 1) {
      setTimeout(() => goNext(), 300)
    }
  }

  // Submit Flow
  const handleRequestSubmit = () => {
    setStatus('CONFIRM_SUBMIT')
  }

  const handleCancelSubmit = () => {
    setStatus('IN_PROGRESS')
  }

  const handleForceSubmit = () => {
    setTimeUsed(initialTime - Math.max(0, timeRemaining))
    calculateResults()
    setStatus('REVIEW')
    setCurrentIndex(-1)
  }

  const calculateResults = () => {
    const wrongQuestions = questions.filter(question => answers[question.id] !== question.correct_answer)
    
    // Calculate weak topics
    const topicCounts: Record<string, { count: number, type: string }> = {}
    
    wrongQuestions.forEach(wq => {
      if (wq.topic) topicCounts[wq.topic] = { count: (topicCounts[wq.topic]?.count || 0) + 1, type: 'Topic' }
      if (wq.subject) topicCounts[wq.subject] = { count: (topicCounts[wq.subject]?.count || 0) + 1, type: 'Subject' }
      if (wq.law) topicCounts[wq.law] = { count: (topicCounts[wq.law]?.count || 0) + 1, type: 'Law' }
    })

    const sortedWeak = Object.entries(topicCounts)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)

    setWeakTopics(sortedWeak)
  }

  const score = questions.filter(q => answers[q.id] === q.correct_answer).length
  const accuracy = Math.round((score / questions.length) * 100)
  const answeredCount = Object.keys(answers).length

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (status === 'IN_PROGRESS') {
        if (e.key === 'ArrowRight') goNext()
        if (e.key === 'ArrowLeft') goPrev()
        if (['1','2','3','4'].includes(e.key)) {
          const mapping = {'1':'A','2':'B','3':'C','4':'D'} as Record<string, ChoiceLetter>
          handleSelect(mapping[e.key])
        }
        if (e.key === 'f') toggleFlag()
      } else if (status === 'REVIEW') {
        if (e.key === 'ArrowRight') goNext()
        if (e.key === 'ArrowLeft') goPrev()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [currentIndex, status, q])

  // Helper for rendering Question Indicators
  const renderIndicators = () => (
    questions.map((question, i) => {
      let dotClass = "w-2.5 h-2.5 rounded-full transition-all "
      if (status === 'REVIEW') {
        const isAnsCorrect = answers[question.id] === question.correct_answer
        if (answers[question.id]) {
          dotClass += isAnsCorrect ? "bg-green-500 " : "bg-red-500 "
        } else {
          dotClass += "bg-[rgba(255,255,255,0.1)] "
        }
      } else {
        if (answers[question.id]) dotClass += "bg-[#D4AF37] "
        else dotClass += "bg-[rgba(255,255,255,0.2)] "
      }

      const isCurrent = i === currentIndex

      return (
        <button type="button" 
          key={question.id}
          onClick={() => setCurrentIndex(i)}
          className={`relative p-2 rounded-full hover:bg-[rgba(255,255,255,0.05)] transition-colors ${isCurrent ? 'ring-2 ring-[#D4AF37] ring-offset-2 ring-offset-[#0F0B07]' : ''}`}
          aria-label={`ไปข้อที่ ${i + 1}`}
        >
          <div className={dotClass} />
          {status === 'IN_PROGRESS' && flagged[question.id] && (
            <div className="absolute -top-1.5 -right-1.5 w-2 h-2 rounded-full bg-yellow-500 border border-[#0F0B07]" />
          )}
        </button>
      )
    })
  )

  // Choice rendering helper
  const renderChoice = (letter: ChoiceLetter, text: string) => {
    const isSelected = answers[q.id] === letter
    const isAnsweredInPractice = mode === 'practice' && !!answers[q.id]
    const isReview = status === 'REVIEW' || isAnsweredInPractice
    const isCorrectChoice = q.correct_answer === letter
    
    let btnClass = "w-full text-left p-4 rounded-xl border flex gap-4 transition-all "
    
    if (isReview) {
      if (isCorrectChoice) {
        btnClass += "bg-green-500/10 border-green-500/50 text-[#F5E9D6]"
      } else if (isSelected && !isCorrectChoice) {
        btnClass += "bg-red-500/10 border-red-500/50 text-[#F5E9D6]"
      } else {
        btnClass += "bg-[#1A140E] border-[rgba(255,255,255,0.05)] opacity-50 text-[#A1866B]"
      }
    } else {
      if (isSelected) {
        btnClass += "bg-[#D4AF37]/10 border-[#D4AF37] text-[#D4AF37]"
      } else {
        btnClass += "bg-[#1A140E] border-[rgba(255,255,255,0.1)] hover:border-[#D4AF37]/50 text-[#F5E9D6] hover:bg-[rgba(255,255,255,0.02)] cursor-pointer"
      }
    }

    const whyWrongProp = `why_${letter.toLowerCase()}_wrong` as keyof Question
    const whyWrongText = q[whyWrongProp] as string | null

    const showExplanation = isReview && whyWrongText

    return (
      <div key={letter} className="mb-3">
        <button type="button" 
          onClick={() => handleSelect(letter)}
          disabled={status === 'REVIEW' || isAnsweredInPractice}
          className={`${btnClass} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]`}
        >
          <div className={`w-8 h-8 rounded-full border flex items-center justify-center flex-shrink-0 font-bold ${
            isReview 
              ? (isCorrectChoice ? 'border-green-500 text-green-500 bg-green-500/10' : (isSelected ? 'border-red-500 text-red-500 bg-red-500/10' : 'border-[#A1866B] text-[#A1866B]'))
              : (isSelected ? 'border-[#D4AF37] text-[#D4AF37] bg-[#D4AF37]/10' : 'border-[rgba(255,255,255,0.2)] text-[#A1866B]')
          }`}>
            {letter}
          </div>
          <div className="flex-1 mt-1 leading-relaxed">
            {text}
          </div>
          {isReview && isCorrectChoice && <CheckCircle className="text-green-500 mt-1" size={20} />}
          {isReview && isSelected && !isCorrectChoice && <XCircle className="text-red-500 mt-1" size={20} />}
        </button>
        
        {/* Explanation specifically for this choice */}
        {showExplanation && (
          <div className="mt-2 ml-12 p-3 bg-red-500/5 border border-red-500/20 rounded-xl text-sm text-red-200/90 leading-relaxed shadow-sm animate-in fade-in slide-in-from-top-2">
            <span className="font-bold text-red-400 block mb-1">เหตุผล:</span>
            {whyWrongText}
          </div>
        )}
      </div>
    )
  }

  // Practice Mode Immediate Feedback
  const renderPracticeFeedback = () => {
    if (mode !== 'practice') return null
    const isAnswered = !!answers[q.id]
    if (!isAnswered) return null
    const isCorrect = answers[q.id] === q.correct_answer

    return (
      <div className={`mt-8 p-5 rounded-2xl border animate-in fade-in slide-in-from-top-4 duration-500 bg-[#2A1F0D] border-[#D4AF37]/30 shadow-lg`}>
        <div className="flex items-start gap-4">
          {isCorrect ? (
            <div className="bg-green-500/20 p-2 rounded-full mt-0.5">
              <CheckCircle className="text-green-500 shrink-0" size={24} />
            </div>
          ) : (
            <div className="bg-red-500/20 p-2 rounded-full mt-0.5">
              <XCircle className="text-red-500 shrink-0" size={24} />
            </div>
          )}
          <div className="flex-1">
            <h4 className={`font-bold text-lg mb-1 ${isCorrect ? 'text-green-400' : 'text-red-400'}`}>
              {isCorrect ? 'ตอบถูกต้อง! 🎉' : 'ตอบผิด 😅'}
            </h4>
            <div className="text-sm font-medium text-[#A1866B] mb-3">
              คุณตอบ: <span className="text-[#F5E9D6] mr-4">{answers[q.id]}</span>
              คำตอบที่ถูก: <span className="text-green-400">{q.correct_answer}</span>
            </div>
            
            {q.full_explanation && (
              <div className="mt-4 pt-4 border-t border-[#D4AF37]/20">
                <span className="font-bold text-[#D4AF37] block mb-2">เหตุผลของคำตอบ:</span>
                <div 
                  className={`text-sm text-[#F5E9D6] leading-relaxed opacity-90 whitespace-pre-line transition-all duration-300 overflow-hidden ${
                    !isExplanationExpanded ? 'line-clamp-3' : ''
                  }`}
                >
                  {q.full_explanation}
                </div>
                
                {q.full_explanation.length > 150 && (
                  <button type="button" 
                    onClick={() => setIsExplanationExpanded(!isExplanationExpanded)}
                    className="mt-3 text-[#D4AF37] text-sm font-bold flex items-center gap-1 hover:text-[#F1D17A] transition-colors focus-visible:outline-none"
                  >
                    {isExplanationExpanded ? (
                      <>▲ ซ่อนเฉลย</>
                    ) : (
                      <>▼ ดูเฉลยทั้งหมด</>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // CONFIRM SUBMIT MODAL
  if (status === 'CONFIRM_SUBMIT') {
    const unAnswered = questions.length - answeredCount
    const flaggedCount = Object.values(flagged).filter(Boolean).length
    return (
      <div className="min-h-screen bg-[#0F0B07] flex items-center justify-center p-4">
        <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.2)] p-8 rounded-3xl max-w-md w-full animate-in zoom-in-95 duration-200 shadow-2xl">
          <div className="w-16 h-16 bg-yellow-500/10 text-yellow-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-2xl font-bold text-[#F5E9D6] font-display mb-2 text-center">ยืนยันการส่งข้อสอบ?</h2>
          <p className="text-center text-[#A1866B] text-sm mb-6">คุณจะไม่สามารถกลับมาแก้ไขคำตอบได้อีก</p>
          
          <div className="bg-[#0F0B07] rounded-2xl p-6 my-6 border border-[rgba(255,255,255,0.05)] space-y-4 shadow-inner">
            <div className="flex justify-between items-center text-sm">
              <span className="text-[#A1866B]">ทำไปแล้ว</span>
              <span className="text-[#F5E9D6] font-bold text-base px-3 py-1 bg-[rgba(255,255,255,0.03)] rounded-lg">{answeredCount} / {questions.length} ข้อ</span>
            </div>
            {unAnswered > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-red-400">ยังไม่ได้ทำ</span>
                <span className="text-red-400 font-bold text-base px-3 py-1 bg-red-500/10 rounded-lg">{unAnswered} ข้อ</span>
              </div>
            )}
            {flaggedCount > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-yellow-400">ปักหมุดไว้</span>
                <span className="text-yellow-400 font-bold text-base px-3 py-1 bg-yellow-500/10 rounded-lg">{flaggedCount} ข้อ</span>
              </div>
            )}
            <div className="flex justify-between items-center text-sm pt-4 border-t border-[rgba(255,255,255,0.05)]">
              <span className="text-[#A1866B]">เวลาที่เหลือ</span>
              <span className="text-[#D4AF37] font-bold text-base px-3 py-1 bg-[#D4AF37]/10 rounded-lg">{formatTime(timeRemaining)}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button type="submit" onClick={handleCancelSubmit} className="flex-1 bg-transparent border border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.05)] text-[#F5E9D6] font-bold py-3 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]">
              ทำต่อ
            </button>
            <button type="button" onClick={handleForceSubmit} className="flex-1 bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] font-bold py-3 rounded-xl transition-all shadow-[0_4px_15px_rgba(212,175,55,0.3)] hover:shadow-[0_4px_25px_rgba(212,175,55,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              ส่งข้อสอบ
            </button>
          </div>
        </div>
      </div>
    )
  }

  // RESULT OVERVIEW (First page of REVIEW mode)
  if (status === 'REVIEW' && currentIndex === -1) {
    return (
      <div className="min-h-screen bg-[#0F0B07] py-12 px-4">
        <div className="max-w-2xl mx-auto space-y-8 animate-in slide-in-from-bottom-8 duration-500">
          
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1A140E] border border-[rgba(255,255,255,0.05)] text-xs font-bold text-[#A1866B] mb-6">
              <CheckCircle size={14} className="text-green-500" />
              ส่งข้อสอบเรียบร้อยแล้ว
            </div>
            <h1 className="text-3xl font-bold text-[#F5E9D6] font-display mb-2">{examSet.title}</h1>
            <p className="text-[#A1866B]">{pkg.name}</p>
          </div>

          <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.2)] rounded-2xl p-8 relative overflow-hidden">
            {/* Background glow */}
            <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-sm bg-gradient-to-b ${accuracy >= 60 ? 'from-green-500/10' : 'from-red-500/10'} to-transparent opacity-50 blur-2xl pointer-events-none`} />
            
            <div className="relative z-10 flex flex-col items-center">
              
              {/* Circular Progress Placeholder */}
              <div className="relative w-40 h-40 mb-6 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle className="text-[#0F0B07] stroke-current" strokeWidth="8" cx="50" cy="50" r="40" fill="transparent" />
                  <circle 
                    className={`${accuracy >= 60 ? 'text-green-500' : 'text-red-500'} stroke-current transition-all duration-1000 ease-out`} 
                    strokeWidth="8" strokeLinecap="round" cx="50" cy="50" r="40" fill="transparent" 
                    strokeDasharray="251.2" strokeDashoffset={251.2 - (251.2 * accuracy) / 100}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-4xl font-display font-bold" style={{ color: accuracy >= 60 ? '#22c55e' : '#ef4444' }}>
                    {accuracy}%
                  </div>
                </div>
              </div>

              <div className="text-[#F5E9D6] font-bold text-lg mb-8 text-center px-4">
                {accuracy >= 80 ? 'ยอดเยี่ยม! คุณพร้อมสำหรับการสอบแล้ว' : accuracy >= 60 ? 'ทำได้ดี! ทบทวนอีกนิดรับรองผ่านฉลุย' : 'ฝึกต่อไป! คุณทำได้แน่นอน'}
              </div>

              <div className="grid grid-cols-3 w-full gap-4 max-w-sm mb-8">
                <div className="text-center p-4 bg-[#0F0B07] rounded-xl border border-[rgba(255,255,255,0.05)]">
                  <div className="text-2xl font-bold text-green-500 mb-1">{score}</div>
                  <div className="text-xs text-[#A1866B] uppercase tracking-wider">ตอบถูก</div>
                </div>
                <div className="text-center p-4 bg-[#0F0B07] rounded-xl border border-[rgba(255,255,255,0.05)]">
                  <div className="text-2xl font-bold text-red-500 mb-1">{questions.length - score}</div>
                  <div className="text-xs text-[#A1866B] uppercase tracking-wider">ตอบผิด</div>
                </div>
                <div className="text-center p-4 bg-[#0F0B07] rounded-xl border border-[rgba(255,255,255,0.05)]">
                  <div className="text-2xl font-bold text-[#D4AF37] mb-1">{formatTime(timeUsed)}</div>
                  <div className="text-xs text-[#A1866B] uppercase tracking-wider">เวลาที่ใช้</div>
                </div>
              </div>
            </div>
          </div>

          {weakTopics.length > 0 && (
            <div className="bg-[#1A140E] border border-[rgba(255,255,255,0.05)] rounded-2xl p-6">
              <h3 className="text-[#F5E9D6] font-bold mb-4 flex items-center gap-2">
                <AlertCircle className="text-yellow-500" size={18} />
                หัวข้อที่ควรทบทวนเพิ่มเติม
              </h3>
              <div className="space-y-3">
                {weakTopics.map((topic, i) => (
                  <div key={i} className="flex justify-between items-center bg-[#0F0B07] p-3 rounded-lg border border-[rgba(255,255,255,0.02)]">
                    <span className="text-[#F5E9D6] text-sm">{topic.name}</span>
                    <span className="text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded-md">ผิด {topic.count} ข้อ</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-4">
            <button type="button" onClick={() => setCurrentIndex(0)} className="flex-1 bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] font-bold py-4 px-6 rounded-xl transition-all shadow-[0_4px_15px_rgba(212,175,55,0.3)] hover:shadow-[0_4px_25px_rgba(212,175,55,0.4)] flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              <BookOpen size={18} />
              ดูเฉลยอย่างละเอียด
            </button>
            <Link href={`/package/${pkg.slug}`} className="flex-1 bg-transparent border border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.05)] text-[#F5E9D6] font-bold py-4 px-6 rounded-xl transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]">
              กลับหน้าหลัก
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // MAIN RUNTIME & REVIEW VIEW
  return (
    <div className="min-h-screen pb-32 lg:pb-24 font-sans" style={{ backgroundColor: '#0F0B07', color: '#F5E9D6' }}>
      
      {/* Header */}
      <div className="sticky top-0 z-50 bg-[#0F0B07] border-b border-[rgba(212,175,55,0.1)]">
        {/* Progress bar */}
        <div 
          className={`absolute top-0 left-0 h-[2px] transition-all duration-300 z-50 ${status === 'REVIEW' ? 'bg-[#D4AF37]' : 'bg-[#D4AF37]'}`} 
          style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }} 
        />
        
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={status === 'REVIEW' ? '#' : `/package/${pkg.slug}`} onClick={(e) => { if (status === 'IN_PROGRESS' && !confirm('คุณต้องการออกจากข้อสอบใช่หรือไม่? การทำข้อสอบจะไม่ถูกบันทึก')) e.preventDefault(); if (status === 'REVIEW') { e.preventDefault(); setCurrentIndex(-1); } }} className="text-[#A1866B] hover:text-[#D4AF37] transition-colors p-2 -ml-2 rounded-lg hover:bg-[rgba(255,255,255,0.05)]">
              <ChevronLeft size={20} />
            </Link>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-[#A1866B] mb-0.5">{status === 'REVIEW' ? 'โหมดทบทวนเฉลย' : examSet.title}</div>
              <div className="text-sm font-bold text-[#F5E9D6] lg:hidden">ข้อ {currentIndex + 1} จาก {questions.length}</div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {status === 'IN_PROGRESS' ? (
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono text-sm font-bold transition-all ${timeRemaining < 300 ? 'border-red-500/30 text-red-400 bg-red-500/10 shadow-[0_0_10px_rgba(239,68,68,0.2)] animate-pulse' : 'border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.03)] text-[#D4AF37]'}`}>
                <Clock size={14} className={timeRemaining < 300 ? "animate-pulse" : ""} />
                {mode === 'practice' ? 'ไม่จำกัดเวลา' : formatTime(timeRemaining)}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.03)] text-[#A1866B] text-sm font-bold">
                <CheckCircle size={14} className={answers[q.id] === q.correct_answer ? "text-green-500" : "text-red-500"} />
                <span className="hidden sm:inline">{answers[q.id] === q.correct_answer ? 'ตอบถูก' : 'ตอบผิด'}</span>
              </div>
            )}
            
            {status === 'IN_PROGRESS' && (
              <button type="button" 
                onClick={handleRequestSubmit} 
                className="hidden sm:flex bg-transparent hover:bg-[rgba(255,255,255,0.05)] text-[#D4AF37] border border-[rgba(212,175,55,0.3)] px-4 py-1.5 rounded-lg text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
              >
                ส่งข้อสอบ
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        
        {/* Question Area */}
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex items-center gap-2">
              <span className="inline-block px-3 py-1 rounded-md bg-[#1A140E] text-[#A1866B] text-xs font-bold border border-[rgba(255,255,255,0.05)]">
                ข้อที่ {currentIndex + 1}
              </span>
              {q.is_common !== undefined && (
                <span className={`inline-block px-3 py-1 rounded-md text-xs font-bold border ${q.is_common ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>
                  {q.is_common ? '🔥 ออกสอบบ่อย' : '📘 พื้นฐาน'}
                </span>
              )}
            </div>
            {status === 'IN_PROGRESS' && (
              <button type="button" 
                onClick={toggleFlag}
                className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-md border transition-colors ${flagged[q.id] ? 'bg-yellow-500/10 border-yellow-500/50 text-yellow-500' : 'bg-transparent border-[rgba(255,255,255,0.1)] text-[#A1866B] hover:text-[#F5E9D6]'}`}
              >
                <Flag size={12} className={flagged[q.id] ? 'fill-yellow-500' : ''} />
                {flagged[q.id] ? 'ปักหมุดแล้ว' : 'ปักหมุดไว้ทบทวน'}
              </button>
            )}
          </div>
          
          <h2 className="text-xl md:text-2xl leading-relaxed font-medium text-[#F5E9D6]">
            {q.content}
          </h2>
        </div>

        {/* Choices Area */}
        <div className="space-y-0">
          {renderChoice('A', q.choice_a)}
          {renderChoice('B', q.choice_b)}
          {renderChoice('C', q.choice_c)}
          {renderChoice('D', q.choice_d)}
        </div>

        {/* Practice Mode Placeholder */}
        {renderPracticeFeedback()}

        {/* Post-Question Explanations (Review Mode) */}
        {status === 'REVIEW' && (
          <div className="mt-8 space-y-4 animate-in slide-in-from-bottom-4">
            {(q.hint || q.full_explanation) && (
              <div className="bg-[#1A140E] rounded-xl border border-[rgba(255,255,255,0.05)] overflow-hidden">
                <div className="px-5 py-3 border-b border-[rgba(255,255,255,0.05)] bg-[#0F0B07] flex items-center gap-2 text-sm font-bold text-[#A1866B]">
                  <Lightbulb size={16} className="text-yellow-500" />
                  คำอธิบายเพิ่มเติม
                </div>
                <div className="p-5 text-[#F5E9D6] text-sm leading-relaxed space-y-4">
                  {q.hint && <p className="text-[#A1866B] italic">คำใบ้: {q.hint}</p>}
                  {q.full_explanation && <div className="whitespace-pre-line">{q.full_explanation}</div>}
                </div>
              </div>
            )}
            
            {q.reference && (
              <div className="flex items-start gap-2 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-200 text-sm">
                <BookOpen size={16} className="mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-bold block mb-0.5">อ้างอิง:</span>
                  {q.reference}
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Mobile & Tablet Navigation Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 w-full bg-[#0F0B07] border-t border-[rgba(255,255,255,0.05)] pb-safe z-40">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          
          <button type="button" 
            onClick={goPrev} 
            disabled={currentIndex === 0}
            className={`flex items-center gap-2 font-bold px-4 py-2.5 rounded-xl transition-colors ${currentIndex === 0 ? 'text-[#A1866B] opacity-50 cursor-not-allowed' : 'text-[#F5E9D6] hover:bg-[#1A140E]'}`}
          >
            <ChevronLeft size={18} />
            <span className="hidden sm:inline">ก่อนหน้า</span>
          </button>

          {/* Quick Pagination Dots */}
          <div className="flex-1 flex justify-center px-4 overflow-x-auto custom-scrollbar no-scrollbar py-2">
            <div className="flex items-center gap-1.5">
              {renderIndicators()}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {status === 'IN_PROGRESS' && currentIndex === questions.length - 1 ? (
              <button type="button" 
                onClick={handleRequestSubmit} 
                className={`flex items-center gap-2 font-bold px-5 py-2.5 rounded-xl transition-all shadow-[0_0_15px_rgba(212,175,55,0.3)] hover:shadow-[0_0_20px_rgba(212,175,55,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${mode === 'practice' && !answers[q.id] ? 'bg-transparent text-[#A1866B] opacity-50 cursor-not-allowed border border-[rgba(255,255,255,0.1)] shadow-none hover:shadow-none' : 'bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E]'}`}
                disabled={mode === 'practice' && !answers[q.id]}
              >
                {mode === 'practice' ? 'ดูผลคะแนน' : 'ส่งข้อสอบ'}
              </button>
            ) : status === 'IN_PROGRESS' && mode === 'practice' ? (
              <button type="button" 
                onClick={goNext} 
                disabled={!answers[q.id]}
                className={`flex items-center gap-2 font-bold px-5 py-2.5 rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] ${!answers[q.id] ? 'bg-transparent text-[#A1866B] opacity-50 cursor-not-allowed border border-[rgba(255,255,255,0.1)]' : 'bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] shadow-[0_4px_15px_rgba(212,175,55,0.3)]'}`}
              >
                <span className="hidden sm:inline">ข้อถัดไป</span>
                <ChevronRight size={18} className="sm:hidden" />
              </button>
            ) : (
              <button type="button" 
                onClick={goNext} 
                disabled={currentIndex === questions.length - 1}
                className={`flex items-center gap-2 font-bold px-4 py-2.5 rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] ${currentIndex === questions.length - 1 ? 'text-[#A1866B] opacity-50 cursor-not-allowed' : 'bg-transparent text-[#F5E9D6] hover:bg-[rgba(255,255,255,0.05)]'}`}
              >
                <span className="hidden sm:inline">ถัดไป</span>
                <ChevronRight size={18} />
              </button>
            )}
          </div>
          
        </div>
      </div>

      {/* Desktop Navigation Bar (Redesigned) */}
      <div className="hidden lg:flex fixed bottom-0 left-0 w-full bg-[#0F0B07] border-t border-[rgba(255,255,255,0.05)] pb-safe z-40 flex-col items-center shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
        <div className="w-full max-w-5xl mx-auto px-8 py-5 flex flex-col gap-5">
          
          {/* Top Row: Prev | Counter | Next */}
          <div className="flex items-center justify-between w-full">
            <button type="button" 
              onClick={goPrev} 
              disabled={currentIndex === 0}
              className={`group flex items-center gap-3 font-medium px-6 py-2.5 rounded-xl border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] ${currentIndex === 0 ? 'border-transparent text-[#A1866B] opacity-30 cursor-not-allowed' : 'border-[rgba(255,255,255,0.1)] text-[#F5E9D6] hover:bg-[rgba(255,255,255,0.05)] hover:border-[rgba(255,255,255,0.2)]'}`}
            >
              <ChevronLeft size={18} className={currentIndex === 0 ? "" : "text-[#A1866B] group-hover:text-[#F5E9D6] transition-colors"} />
              <span>ก่อนหน้า</span>
            </button>

            <div className="text-center flex items-center gap-3 text-sm font-medium text-[#A1866B]">
              ข้อ <span className="text-xl font-bold text-[#D4AF37]">{currentIndex + 1}</span> / {questions.length}
            </div>

            {status === 'IN_PROGRESS' && currentIndex === questions.length - 1 ? (
              <button type="button" 
                onClick={handleRequestSubmit} 
                disabled={mode === 'practice' && !answers[q.id]}
                className={`group flex items-center gap-3 font-medium px-6 py-2.5 rounded-xl border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] ${mode === 'practice' && !answers[q.id] ? 'border-[rgba(255,255,255,0.1)] text-[#A1866B] opacity-50 cursor-not-allowed' : 'border-[rgba(255,255,255,0.1)] text-[#F5E9D6] hover:bg-[rgba(255,255,255,0.05)] hover:border-[rgba(255,255,255,0.2)]'}`}
              >
                <span>{mode === 'practice' ? 'ดูผลคะแนน' : 'ส่งข้อสอบ'}</span>
                <CheckCircle size={18} className={mode === 'practice' && !answers[q.id] ? "" : "text-[#A1866B] group-hover:text-[#F5E9D6] transition-colors"} />
              </button>
            ) : (
              <button type="button" 
                onClick={goNext} 
                disabled={mode === 'practice' ? !answers[q.id] : currentIndex === questions.length - 1}
                className={`group flex items-center gap-3 font-medium px-6 py-2.5 rounded-xl border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] ${(mode === 'practice' ? !answers[q.id] : currentIndex === questions.length - 1) ? 'border-transparent text-[#A1866B] opacity-30 cursor-not-allowed' : 'border-[rgba(255,255,255,0.1)] text-[#F5E9D6] hover:bg-[rgba(255,255,255,0.05)] hover:border-[rgba(255,255,255,0.2)]'}`}
              >
                <span>ข้อถัดไป</span>
                <ChevronRight size={18} className={(mode === 'practice' ? !answers[q.id] : currentIndex === questions.length - 1) ? "" : "text-[#A1866B] group-hover:text-[#F5E9D6] transition-colors"} />
              </button>
            )}
          </div>

          {/* Bottom Row: Indicators (Centered) */}
          <div className="w-full flex justify-center overflow-x-auto custom-scrollbar no-scrollbar pb-2">
            <div className="flex items-center gap-2 px-4">
              {renderIndicators()}
            </div>
          </div>

        </div>
      </div>

    </div>
  )
}
