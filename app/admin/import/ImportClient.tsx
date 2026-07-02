'use client'

import { useState, useRef, useTransition } from 'react'
import { UploadCloud, FileText, CheckCircle2, AlertCircle, ArrowRight, Loader2, ArrowLeft } from 'lucide-react'
import { parseMarkdownQuestions, ParseResult, ParsedQuestion } from '@/lib/markdownParser'
import { importQuestionsAction } from './actions'

export default function ImportClient() {
  
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [isDragging, setIsDragging] = useState(false)
  const [fileName, setFileName] = useState('')
  const [results, setResults] = useState<ParseResult[]>([])
  
  const [isPending, startTransition] = useTransition()
  const [importSummary, setImportSummary] = useState<{ success?: boolean, count?: number, error?: string } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const processFile = (file: File) => {
    if (!file.name.endsWith('.md') && !file.name.endsWith('.txt')) {
      alert('Please upload a .md or .txt file.')
      return
    }

    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const parsedResults = parseMarkdownQuestions(text)
      setResults(parsedResults)
      setStep(2)
    }
    reader.readAsText(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0])
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0])
    }
  }

  const handleCommit = () => {
    const validQuestions = results.filter(r => r.isValid).map(r => r.data as ParsedQuestion)
    if (validQuestions.length === 0) return

    startTransition(async () => {
      const result = await importQuestionsAction(validQuestions)
      setImportSummary(result)
      setStep(3)
    })
  }

  const resetPipeline = () => {
    setStep(1)
    setFileName('')
    setResults([])
    setImportSummary(null)
  }

  const validCount = results.filter(r => r.isValid).length
  const invalidCount = results.filter(r => !r.isValid).length

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-20">
      <div>
        <h1 className="text-3xl font-bold font-display text-[#F5E9D6] tracking-tight">Import Center</h1>
        <p className="text-[#A1866B] mt-1">Upload markdown files to bulk import questions into the Question Bank.</p>
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
        <div 
          className={`bg-[#1A140E] border-2 border-dashed ${isDragging ? 'border-[#D4AF37] bg-[#D4AF37]/5' : 'border-[rgba(212,175,55,0.15)]'} rounded-2xl p-16 text-center flex flex-col items-center shadow-xl transition-all`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="w-20 h-20 rounded-2xl bg-[#D4AF37]/10 flex items-center justify-center text-[#D4AF37] mb-6">
            <UploadCloud size={40} />
          </div>
          <h2 className="text-2xl font-bold font-display text-[#F5E9D6] mb-2">Upload Markdown File</h2>
          <p className="text-[#A1866B] mb-8 max-w-md mx-auto">
            Drag and drop your `.md` file containing the questions using the standard Sobdai Markdown format.
          </p>
          
          <input 
            type="file" 
            accept=".md,.txt" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
          />
          <button type="button" 
            onClick={() => fileInputRef.current?.click()}
            className="bg-[#0F0B07] border border-[#D4AF37]/30 hover:border-[#D4AF37] text-[#D4AF37] px-8 py-3 rounded-xl font-bold flex items-center gap-2 transition-colors cursor-pointer"
          >
            Browse Files
          </button>
          <div className="mt-4 text-xs text-[#A1866B] opacity-70">Supports .md only.</div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <button type="button" onClick={resetPipeline} className="p-2 text-[#A1866B] hover:text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-lg transition-colors">
              <ArrowLeft size={20} />
            </button>
            <h2 className="text-xl font-bold text-[#F5E9D6]">Parsing Results</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 shadow-xl">
              <div className="text-[#A1866B] text-sm mb-1">Total Questions Found</div>
              <div className="text-3xl font-bold text-[#F5E9D6] font-display">{results.length}</div>
            </div>
            <div className={`bg-[#1A140E] border ${invalidCount > 0 ? 'border-red-500/20' : 'border-[rgba(212,175,55,0.15)]'} rounded-2xl p-6 shadow-xl relative overflow-hidden`}>
              {invalidCount > 0 && <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-bl-full pointer-events-none"></div>}
              <div className={`${invalidCount > 0 ? 'text-red-400' : 'text-[#A1866B]'} text-sm mb-1`}>Validation Errors</div>
              <div className={`text-3xl font-bold ${invalidCount > 0 ? 'text-red-500' : 'text-[#A1866B]'} font-display`}>{invalidCount}</div>
            </div>
            <div className={`bg-[#1A140E] border ${validCount > 0 ? 'border-[#22C55E]/20' : 'border-[rgba(212,175,55,0.15)]'} rounded-2xl p-6 shadow-xl`}>
              <div className={`${validCount > 0 ? 'text-[#22C55E]' : 'text-[#A1866B]'} text-sm mb-1`}>Ready to Import</div>
              <div className={`text-3xl font-bold ${validCount > 0 ? 'text-[#22C55E]' : 'text-[#A1866B]'} font-display`}>{validCount}</div>
            </div>
          </div>

          <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-[rgba(255,255,255,0.05)] flex items-center justify-between bg-[#0F0B07]/50">
              <div className="flex items-center gap-2 font-medium text-[#F5E9D6]">
                <FileText size={16} className="text-[#D4AF37]" />
                {fileName}
              </div>
              <button type="button" 
                onClick={handleCommit}
                disabled={isPending || validCount === 0}
                className="bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] px-5 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors text-sm disabled:opacity-50"
              >
                {isPending ? <Loader2 size={16} className="animate-spin" /> : 'Commit to Database'}
                {!isPending && <ArrowRight size={16} />}
              </button>
            </div>
            
            <div className="p-6 space-y-4 max-h-[500px] overflow-y-auto">
              {results.length === 0 && (
                <div className="text-center text-[#A1866B] py-8">No valid question chunks found in file. Ensure you use '---' separators.</div>
              )}
              {results.map((r, i) => (
                <div key={i} className={`p-4 rounded-xl border ${r.isValid ? 'border-[#22C55E]/20 bg-[#22C55E]/5' : 'border-red-500/20 bg-red-500/5'} flex items-start gap-3`}>
                  {r.isValid ? (
                    <CheckCircle2 size={20} className="text-[#22C55E] mt-0.5 shrink-0" />
                  ) : (
                    <AlertCircle size={20} className="text-red-500 mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1">
                    <h4 className={`${r.isValid ? 'text-[#22C55E]' : 'text-red-400'} font-medium mb-1 flex items-center gap-2`}>
                      Question #{r.index}
                      {!r.isValid && <span className="text-xs bg-red-500/10 px-2 py-0.5 rounded text-red-500">Invalid</span>}
                    </h4>
                    {r.isValid ? (
                      <p className="text-sm text-[#A1866B] line-clamp-1">{r.data?.content}</p>
                    ) : (
                      <ul className="text-sm text-[#A1866B] list-disc list-inside">
                        {r.errors.map((err, errIdx) => (
                          <li key={errIdx}>{err}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 3 && importSummary && (
        <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-10 text-center flex flex-col items-center shadow-xl">
          {importSummary.success ? (
            <>
              <div className="w-20 h-20 rounded-full bg-[#22C55E]/10 flex items-center justify-center text-[#22C55E] mb-6">
                <CheckCircle2 size={40} />
              </div>
              <h2 className="text-2xl font-bold font-display text-[#F5E9D6] mb-2">Import Successful!</h2>
              <p className="text-[#A1866B] mb-8">
                Successfully inserted <strong className="text-[#22C55E]">{importSummary.count}</strong> questions into the Question Bank.
              </p>
            </>
          ) : (
            <>
              <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 mb-6">
                <AlertCircle size={40} />
              </div>
              <h2 className="text-2xl font-bold font-display text-[#F5E9D6] mb-2">Import Failed</h2>
              <p className="text-[#A1866B] mb-4">A database error occurred during insertion.</p>
              <div className="bg-red-500/10 border border-red-500/30 text-red-500 p-4 rounded-xl text-sm font-medium w-full max-w-md text-left mb-8">
                {importSummary.error}
              </div>
            </>
          )}
          
          <button type="button" 
            onClick={resetPipeline}
            className="bg-[#0F0B07] border border-[#D4AF37]/30 hover:border-[#D4AF37] text-[#D4AF37] px-8 py-3 rounded-xl font-bold flex items-center gap-2 transition-colors cursor-pointer"
          >
            Import Another File
          </button>
        </div>
      )}
    </div>
  )
}
