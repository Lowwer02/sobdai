'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { ArrowLeft, Save, Loader2, BookOpen } from 'lucide-react'
import { updateQuestionAction } from '../actions'

export default function EditQuestionClient({ question }: { question: any }) {
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setErrorMsg('')
    const formData = new FormData(e.currentTarget)
    
    startTransition(async () => {
      const result = await updateQuestionAction(question.id, formData)
      if (result?.error) {
        setErrorMsg(result.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-5xl mx-auto pb-20">
      <div className="flex items-center gap-4">
        <Link href="/admin/questions">
          <button type="button" className="p-2 text-[#A1866B] hover:text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-lg transition-colors">
            <ArrowLeft size={20} />
          </button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold font-display text-[#F5E9D6] tracking-tight">Edit Question</h1>
          <p className="text-[#A1866B] mt-1">ID: {question.id.split('-')[0]}...</p>
        </div>
        
        <div className="ml-auto flex items-center gap-3">
          <button 
            type="submit" 
            disabled={isPending}
            className="bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] px-6 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            Save Changes
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-500 p-4 rounded-xl text-sm font-medium">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Column */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Content */}
          <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 shadow-xl space-y-5">
            <h2 className="text-[#D4AF37] font-bold font-display text-lg mb-4 flex items-center gap-2">
              <BookOpen size={18} /> Question Content
            </h2>
            
            <div className="space-y-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">Question Prompt *</label>
              <textarea defaultValue={question.content} required name="content" rows={4} className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-3 focus:outline-none focus:border-[#D4AF37]/50 transition-colors resize-none"></textarea>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-[#F5E9D6] font-medium block">Choice A *</label>
                <input defaultValue={question.choice_a} required name="choice_a" type="text" className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2 focus:outline-none focus:border-[#D4AF37]/50 transition-colors" />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-[#F5E9D6] font-medium block">Choice B *</label>
                <input defaultValue={question.choice_b} required name="choice_b" type="text" className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2 focus:outline-none focus:border-[#D4AF37]/50 transition-colors" />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-[#F5E9D6] font-medium block">Choice C *</label>
                <input defaultValue={question.choice_c} required name="choice_c" type="text" className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2 focus:outline-none focus:border-[#D4AF37]/50 transition-colors" />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-[#F5E9D6] font-medium block">Choice D *</label>
                <input defaultValue={question.choice_d} required name="choice_d" type="text" className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2 focus:outline-none focus:border-[#D4AF37]/50 transition-colors" />
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">Correct Answer *</label>
              <div className="flex gap-4">
                {['A', 'B', 'C', 'D'].map((opt) => (
                  <label key={opt} className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="correct_answer" 
                      value={opt} 
                      defaultChecked={question.correct_answer === opt}
                      className="w-4 h-4 text-[#D4AF37] bg-[#0F0B07] border-[rgba(255,255,255,0.2)] focus:ring-[#D4AF37]" 
                    />
                    <span className="text-[#F5E9D6] font-bold">{opt}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Explanations */}
          <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 shadow-xl space-y-5">
            <h2 className="text-[#D4AF37] font-bold font-display text-lg mb-4">Explanations & Feedback</h2>
            
            <div className="space-y-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">Hint</label>
              <input defaultValue={question.hint} name="hint" type="text" className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2 focus:outline-none focus:border-[#D4AF37]/50 transition-colors" />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">Full Explanation</label>
              <textarea defaultValue={question.full_explanation} name="full_explanation" rows={4} className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-3 focus:outline-none focus:border-[#D4AF37]/50 transition-colors resize-none"></textarea>
            </div>

            <div className="space-y-3 pt-2">
              <label className="text-sm text-[#F5E9D6] font-medium block border-b border-[rgba(255,255,255,0.05)] pb-2">Why Options are Wrong</label>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-[#A1866B]">Why A Wrong</label>
                  <textarea defaultValue={question.why_a_wrong} name="why_a_wrong" rows={2} className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#D4AF37]/50 resize-none"></textarea>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-[#A1866B]">Why B Wrong</label>
                  <textarea defaultValue={question.why_b_wrong} name="why_b_wrong" rows={2} className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#D4AF37]/50 resize-none"></textarea>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-[#A1866B]">Why C Wrong</label>
                  <textarea defaultValue={question.why_c_wrong} name="why_c_wrong" rows={2} className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#D4AF37]/50 resize-none"></textarea>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-[#A1866B]">Why D Wrong</label>
                  <textarea defaultValue={question.why_d_wrong} name="why_d_wrong" rows={2} className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#D4AF37]/50 resize-none"></textarea>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Sidebar Column */}
        <div className="space-y-6">
          
          {/* Status */}
          <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 shadow-xl space-y-5">
            <h2 className="text-[#D4AF37] font-bold font-display text-lg mb-4">Status & Visibility</h2>
            
            <div className="space-y-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">Current Status</label>
              <select defaultValue={question.status} name="status" className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#D4AF37]/50 transition-colors appearance-none font-bold">
                <option value="Draft">Draft (Not visible)</option>
                <option value="Review">Review (Needs checking)</option>
                <option value="Published">Published (Live)</option>
              </select>
            </div>
          </div>

          {/* Metadata */}
          <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 shadow-xl space-y-5">
            <h2 className="text-[#D4AF37] font-bold font-display text-lg mb-4">Metadata</h2>
            
            <div className="space-y-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">Difficulty</label>
              <select defaultValue={question.difficulty} name="difficulty" className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2.5 focus:outline-none focus:border-[#D4AF37]/50 transition-colors appearance-none">
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">Category (Legacy)</label>
              <input defaultValue={question.category} name="category" type="text" placeholder="e.g. Mathematics" className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2 focus:outline-none focus:border-[#D4AF37]/50 transition-colors" />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">Subject</label>
              <input defaultValue={question.subject} name="subject" type="text" placeholder="e.g. ความรู้ทั่วไป" className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2 focus:outline-none focus:border-[#D4AF37]/50 transition-colors" />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">Law (Optional)</label>
              <input defaultValue={question.law} name="law" type="text" placeholder="e.g. พ.ร.บ.ระเบียบข้าราชการพลเรือน" className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2 focus:outline-none focus:border-[#D4AF37]/50 transition-colors" />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">Topic</label>
              <input defaultValue={question.topic} name="topic" type="text" placeholder="e.g. วินัยข้าราชการ" className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2 focus:outline-none focus:border-[#D4AF37]/50 transition-colors" />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">Tags (Comma separated)</label>
              <input defaultValue={(question.tags || []).join(', ')} name="tags" type="text" placeholder="e.g. algebra, basic, exam1" className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#A1866B] rounded-xl px-4 py-2 focus:outline-none focus:border-[#D4AF37]/50 transition-colors text-sm" />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-[#F5E9D6] font-medium block">Reference Material</label>
              <input defaultValue={question.reference} name="reference" type="text" placeholder="e.g. Book A, Page 12" className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#A1866B] rounded-xl px-4 py-2 focus:outline-none focus:border-[#D4AF37]/50 transition-colors text-sm" />
            </div>
          </div>

        </div>
      </div>
    </form>
  )
}
