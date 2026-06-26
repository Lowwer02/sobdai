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
}

interface ExamRuntimeProps {
  pkg: any
  examSet: any
  questions: Question[]
}

export default function ExamRuntime({ pkg, examSet, questions }: ExamRuntimeProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, ChoiceLetter>>({})
  const [flagged, setFlagged] = useState<Record<string, boolean>>({})
  const [status, setStatus] = useState<'IN_PROGRESS' | 'CONFIRM_SUBMIT' | 'REVIEW'>('IN_PROGRESS')
  
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
    // Auto next on answer (optional, but good UX, wait small delay)
    if (currentIndex < questions.length - 1) {
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
    setCurrentIndex(0)
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

  // Choice rendering helper
  const renderChoice = (letter: ChoiceLetter, text: string) => {
    const isSelected = answers[q.id] === letter
    const isReview = status === 'REVIEW'
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

    return (
      <div key={letter} className="mb-3">
        <button 
          onClick={() => handleSelect(letter)}
          disabled={isReview}
          className={btnClass}
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
        
        {/* Explanation specifically for this wrong choice */}
        {isReview && isSelected && !isCorrectChoice && whyWrongText && (
          <div className="mt-2 ml-12 p-3 bg-red-500/5 border border-red-500/20 rounded-lg text-sm text-red-200/90 leading-relaxed">
            <span className="font-bold text-red-400 block mb-1">ทำไมข้อนี้ถึงผิด:</span>
            {whyWrongText}
          </div>
        )}
      </div>
    )
  }

  // CONFIRM SUBMIT MODAL
  if (status === 'CONFIRM_SUBMIT') {
    const unAnswered = questions.length - answeredCount
    const flaggedCount = Object.values(flagged).filter(Boolean).length
    return (
      <div className="min-h-screen bg-[#0F0B07] flex items-center justify-center p-4">
        <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.2)] p-8 rounded-2xl max-w-md w-full animate-in zoom-in-95 duration-200">
          <h2 className="text-2xl font-bold text-[#F5E9D6] mb-2 text-center">ยืนยันการส่งข้อสอบ?</h2>
          
          <div className="bg-[#0F0B07] rounded-xl p-6 my-6 border border-[rgba(255,255,255,0.05)] space-y-4">
            <div className="flex justify-between items-center text-sm">
              <span className="text-[#A1866B]">ทำไปแล้ว</span>
              <span className="text-[#F5E9D6] font-bold">{answeredCount} / {questions.length} ข้อ</span>
            </div>
            {unAnswered > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-red-400">ยังไม่ได้ทำ</span>
                <span className="text-red-400 font-bold">{unAnswered} ข้อ</span>
              </div>
            )}
            {flaggedCount > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-yellow-400">ปักหมุดไว้ทบทวน</span>
                <span className="text-yellow-400 font-bold">{flaggedCount} ข้อ</span>
              </div>
            )}
            <div className="flex justify-between items-center text-sm pt-4 border-t border-[rgba(255,255,255,0.05)]">
              <span className="text-[#A1866B]">เวลาที่เหลือ</span>
              <span className="text-[#D4AF37] font-bold">{formatTime(timeRemaining)}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={handleCancelSubmit} className="flex-1 bg-transparent border border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.05)] text-[#F5E9D6] font-bold py-3 rounded-xl transition-colors">
              กลับไปทำต่อ
            </button>
            <button onClick={handleForceSubmit} className="flex-1 bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] font-bold py-3 rounded-xl transition-colors">
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
              <div className="text-6xl font-display font-bold mb-2" style={{ color: accuracy >= 60 ? '#22c55e' : '#ef4444' }}>
                {accuracy}%
              </div>
              <div className="text-[#F5E9D6] font-bold text-lg mb-8">
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

          <div className="flex gap-4">
            <button onClick={() => setCurrentIndex(0)} className="flex-1 bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] font-bold py-4 rounded-xl transition-colors flex items-center justify-center gap-2">
              <BookOpen size={18} />
              ดูเฉลยอย่างละเอียด
            </button>
            <Link href={`/package/${pkg.slug}`} className="flex-1 bg-transparent border border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.05)] text-[#F5E9D6] font-bold py-4 rounded-xl transition-colors flex items-center justify-center gap-2">
              กลับหน้าหลัก
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // MAIN RUNTIME & REVIEW VIEW
  return (
    <div className="min-h-screen pb-20 font-sans" style={{ backgroundColor: '#0F0B07', color: '#F5E9D6' }}>
      
      {/* Header */}
      <div className="sticky top-0 z-50 bg-[#0F0B07]/80 backdrop-blur-xl border-b border-[rgba(212,175,55,0.1)]">
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
              <div className="text-sm font-bold text-[#F5E9D6]">ข้อ {currentIndex + 1} จาก {questions.length}</div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {status === 'IN_PROGRESS' ? (
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono text-sm font-bold transition-colors ${timeRemaining < 300 ? 'border-red-500/30 text-red-400 bg-red-500/10' : 'border-[rgba(255,255,255,0.05)] bg-[#1A140E] text-[#D4AF37]'}`}>
                <Clock size={14} className={timeRemaining < 300 ? "animate-pulse" : ""} />
                {formatTime(timeRemaining)}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[rgba(255,255,255,0.05)] bg-[#1A140E] text-[#A1866B] text-sm font-bold">
                <CheckCircle size={14} className={answers[q.id] === q.correct_answer ? "text-green-500" : "text-[#A1866B]"} />
                {answers[q.id] === q.correct_answer ? 'ตอบถูก' : 'ตอบผิด'}
              </div>
            )}
            
            {status === 'IN_PROGRESS' && (
              <button onClick={handleRequestSubmit} className="hidden sm:flex bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/20 px-4 py-1.5 rounded-lg text-sm font-bold transition-colors">
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
            <span className="inline-block px-3 py-1 rounded-md bg-[#1A140E] text-[#A1866B] text-xs font-bold border border-[rgba(255,255,255,0.05)]">
              ข้อที่ {currentIndex + 1}
            </span>
            {status === 'IN_PROGRESS' && (
              <button 
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

      {/* Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 w-full bg-[#0F0B07]/90 backdrop-blur-xl border-t border-[rgba(255,255,255,0.05)] pb-safe">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          
          <button 
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
              {questions.map((question, i) => {
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
                  <button 
                    key={question.id}
                    onClick={() => setCurrentIndex(i)}
                    className={`relative p-1 rounded-full hover:bg-[rgba(255,255,255,0.05)] transition-colors ${isCurrent ? 'ring-2 ring-[#D4AF37] ring-offset-2 ring-offset-[#0F0B07]' : ''}`}
                    aria-label={`ไปข้อที่ ${i + 1}`}
                  >
                    <div className={dotClass} />
                    {status === 'IN_PROGRESS' && flagged[question.id] && (
                      <div className="absolute -top-1.5 -right-1.5 w-2 h-2 rounded-full bg-yellow-500 border border-[#0F0B07]" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {status === 'IN_PROGRESS' && currentIndex === questions.length - 1 ? (
              <button 
                onClick={handleRequestSubmit} 
                className="flex items-center gap-2 font-bold px-5 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] transition-colors shadow-[0_0_15px_rgba(212,175,55,0.3)]"
              >
                ส่งข้อสอบ
              </button>
            ) : (
              <button 
                onClick={goNext} 
                disabled={currentIndex === questions.length - 1}
                className={`flex items-center gap-2 font-bold px-4 py-2.5 rounded-xl transition-colors ${currentIndex === questions.length - 1 ? 'text-[#A1866B] opacity-50 cursor-not-allowed' : 'bg-[#1A140E] text-[#F5E9D6] hover:bg-[#D4AF37]/10 hover:text-[#D4AF37] border border-[rgba(255,255,255,0.05)]'}`}
              >
                <span className="hidden sm:inline">ข้อถัดไป</span>
                <ChevronRight size={18} />
              </button>
            )}
          </div>
          
        </div>
      </div>

    </div>
  )
}
