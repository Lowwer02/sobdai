'use client'

import { useState } from 'react'
import { UploadCloud, FileText, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react'

export default function ImportCenterPage() {
  const [step, setStep] = useState<1 | 2>(1)
  
  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-20">
      <div>
        <h1 className="text-3xl font-bold font-display text-[#F5E9D6] tracking-tight">Import Center</h1>
        <p className="text-[#A1866B] mt-1">Upload markdown or excel files to bulk import questions.</p>
      </div>

      <div className="flex items-center justify-between bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 shadow-xl mb-6">
        <div className={`flex items-center gap-3 ${step >= 1 ? 'text-[#D4AF37]' : 'text-[#A1866B] opacity-50'}`}>
          <div className="w-8 h-8 rounded-full bg-current/10 flex items-center justify-center font-bold">1</div>
          <span className="font-medium">Upload File</span>
        </div>
        <div className="flex-1 border-t-2 border-dashed border-[rgba(255,255,255,0.05)] mx-4"></div>
        <div className={`flex items-center gap-3 ${step >= 2 ? 'text-[#D4AF37]' : 'text-[#A1866B] opacity-50'}`}>
          <div className="w-8 h-8 rounded-full bg-current/10 flex items-center justify-center font-bold">2</div>
          <span className="font-medium">Parse & Preview</span>
        </div>
        <div className="flex-1 border-t-2 border-dashed border-[rgba(255,255,255,0.05)] mx-4"></div>
        <div className={`flex items-center gap-3 ${step >= 3 ? 'text-[#D4AF37]' : 'text-[#A1866B] opacity-50'}`}>
          <div className="w-8 h-8 rounded-full bg-current/10 flex items-center justify-center font-bold">3</div>
          <span className="font-medium">Commit</span>
        </div>
      </div>

      {step === 1 && (
        <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-10 text-center flex flex-col items-center shadow-xl">
          <div className="w-20 h-20 rounded-2xl bg-[#D4AF37]/10 flex items-center justify-center text-[#D4AF37] mb-6">
            <UploadCloud size={40} />
          </div>
          <h2 className="text-2xl font-bold font-display text-[#F5E9D6] mb-2">Upload Markdown File</h2>
          <p className="text-[#A1866B] mb-8 max-w-md mx-auto">
            Drag and drop your `.md` file containing the questions. The system will automatically parse questions, choices, answers, and explanations.
          </p>
          
          <button 
            onClick={() => setStep(2)}
            className="bg-[#0F0B07] border border-[#D4AF37]/30 hover:border-[#D4AF37] text-[#D4AF37] px-8 py-3 rounded-xl font-bold flex items-center gap-2 transition-colors cursor-pointer relative"
          >
            <span>Browse Files</span>
          </button>
          <div className="mt-4 text-xs text-[#A1866B] opacity-70">Supports .md only. Max 5MB.</div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 shadow-xl">
              <div className="text-[#A1866B] text-sm mb-1">Questions Found</div>
              <div className="text-3xl font-bold text-[#F5E9D6] font-display">24</div>
            </div>
            <div className="bg-[#1A140E] border border-red-500/20 rounded-2xl p-6 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-bl-full pointer-events-none"></div>
              <div className="text-red-400 text-sm mb-1">Validation Errors</div>
              <div className="text-3xl font-bold text-red-500 font-display">2</div>
            </div>
            <div className="bg-[#1A140E] border border-[#22C55E]/20 rounded-2xl p-6 shadow-xl">
              <div className="text-[#22C55E] text-sm mb-1">Ready to Import</div>
              <div className="text-3xl font-bold text-[#22C55E] font-display">22</div>
            </div>
          </div>

          <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-[rgba(255,255,255,0.05)] flex items-center justify-between bg-[#0F0B07]/50">
              <div className="flex items-center gap-2 font-medium text-[#F5E9D6]">
                <FileText size={16} className="text-[#D4AF37]" />
                exam_set_1_aw.md
              </div>
              <button className="bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] px-5 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors text-sm">
                Commit to Drafts
                <ArrowRight size={16} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 flex items-start gap-3">
                <AlertCircle size={20} className="text-red-500 mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-red-400 font-medium mb-1">Question #12 is missing Correct Answer</h4>
                  <p className="text-sm text-[#A1866B]">The parser could not find a valid correct answer (A, B, C, or D) for this question.</p>
                </div>
              </div>
              
              <div className="p-4 rounded-xl border border-[#22C55E]/20 bg-[#22C55E]/5 flex items-start gap-3">
                <CheckCircle2 size={20} className="text-[#22C55E] mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-[#22C55E] font-medium mb-1">Question #1 to #11</h4>
                  <p className="text-sm text-[#A1866B]">Parsed successfully with choices and explanations.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
