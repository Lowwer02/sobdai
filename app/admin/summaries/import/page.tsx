'use client'

import { useState, useRef, useTransition } from 'react'
import { UploadCloud, FileText, CheckCircle2, AlertCircle, ArrowRight, Loader2, ArrowLeft, BookOpen, Clock, FileWarning } from 'lucide-react'
import { parseMarkdownSummary, ParsedSummary } from '@/lib/summaryParser'
import { validateSummaryImport, commitSummaryImport } from './actions'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import Link from 'next/link'

export default function SummaryImportPage() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [isDragging, setIsDragging] = useState(false)
  const [fileName, setFileName] = useState('')
  const [parsedData, setParsedData] = useState<ParsedSummary | null>(null)
  
  const [isPending, startTransition] = useTransition()
  
  // Validation state
  const [valResult, setValResult] = useState<{ success: boolean, error?: string, packageId?: string, packageName?: string, isDuplicate?: boolean } | null>(null)
  const [conflictResolution, setConflictResolution] = useState<'replace' | 'new'>('replace')

  // Final result
  const [importSummary, setImportSummary] = useState<{ success?: boolean, finalSlug?: string, error?: string } | null>(null)

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
    if (!file.name.endsWith('.md') && !file.name.endsWith('.markdown')) {
      alert('Please upload a .md or .markdown file.')
      return
    }

    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const result = parseMarkdownSummary(text)
      setParsedData(result)
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

  const handleValidate = () => {
    if (!parsedData?.isValid) return
    startTransition(async () => {
      const result = await validateSummaryImport(parsedData.metadata)
      setValResult(result)
      setStep(3)
    })
  }

  const handleCommit = () => {
    if (!valResult?.success || !parsedData) return
    
    startTransition(async () => {
      const dataToCommit = {
        ...parsedData.metadata,
        content_md: parsedData.content,
        read_time_minutes: parsedData.read_time_minutes,
        packageId: valResult.packageId,
        isDuplicate: valResult.isDuplicate
      }
      
      const result = await commitSummaryImport(dataToCommit, conflictResolution)
      setImportSummary(result)
      setStep(4)
    })
  }

  const resetPipeline = () => {
    setStep(1)
    setFileName('')
    setParsedData(null)
    setValResult(null)
    setImportSummary(null)
    setConflictResolution('replace')
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-20 font-sans">
      <div className="flex items-center gap-4">
        <Link href="/admin/summaries" className="p-2 bg-[#1A140E] text-[#A1866B] hover:text-[#F5E9D6] rounded-xl border border-[rgba(255,255,255,0.05)] transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-3xl font-bold font-display text-[#F5E9D6] tracking-tight">Import Summary</h1>
          <p className="text-[#A1866B] mt-1">Upload markdown files with Frontmatter metadata to import summaries.</p>
        </div>
      </div>

      <div className="flex items-center justify-between bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 shadow-xl mb-6">
        <div className={`flex items-center gap-3 ${step >= 1 ? 'text-[#D4AF37]' : 'text-[#A1866B] opacity-50'}`}>
          <div className="w-8 h-8 rounded-full bg-current/10 flex items-center justify-center font-bold">1</div>
          <span className="font-medium hidden sm:inline">Upload</span>
        </div>
        <div className="flex-1 border-t-2 border-dashed border-[rgba(255,255,255,0.05)] mx-2 sm:mx-4"></div>
        <div className={`flex items-center gap-3 ${step >= 2 ? 'text-[#D4AF37]' : 'text-[#A1866B] opacity-50'}`}>
          <div className="w-8 h-8 rounded-full bg-current/10 flex items-center justify-center font-bold">2</div>
          <span className="font-medium hidden sm:inline">Preview</span>
        </div>
        <div className="flex-1 border-t-2 border-dashed border-[rgba(255,255,255,0.05)] mx-2 sm:mx-4"></div>
        <div className={`flex items-center gap-3 ${step >= 3 ? 'text-[#D4AF37]' : 'text-[#A1866B] opacity-50'}`}>
          <div className="w-8 h-8 rounded-full bg-current/10 flex items-center justify-center font-bold">3</div>
          <span className="font-medium hidden sm:inline">Validate</span>
        </div>
        <div className="flex-1 border-t-2 border-dashed border-[rgba(255,255,255,0.05)] mx-2 sm:mx-4"></div>
        <div className={`flex items-center gap-3 ${step >= 4 ? 'text-[#D4AF37]' : 'text-[#A1866B] opacity-50'}`}>
          <div className="w-8 h-8 rounded-full bg-current/10 flex items-center justify-center font-bold">4</div>
          <span className="font-medium hidden sm:inline">Commit</span>
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
            Drag and drop your `.md` file containing YAML frontmatter and markdown body.
          </p>
          
          <input 
            type="file" 
            accept=".md,.markdown" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="bg-[#0F0B07] border border-[#D4AF37]/30 hover:border-[#D4AF37] text-[#D4AF37] px-8 py-3 rounded-xl font-bold flex items-center gap-2 transition-colors cursor-pointer"
          >
            Browse Files
          </button>
        </div>
      )}

      {step === 2 && parsedData && (
        <div className="space-y-6">
          <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-[rgba(255,255,255,0.05)] flex items-center justify-between bg-[#0F0B07]/50">
              <div className="flex items-center gap-2 font-medium text-[#F5E9D6]">
                <FileText size={16} className="text-[#D4AF37]" />
                {fileName}
              </div>
              <button 
                onClick={handleValidate}
                disabled={isPending || !parsedData.isValid}
                className="bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] px-5 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors text-sm disabled:opacity-50"
              >
                {isPending ? <Loader2 size={16} className="animate-spin" /> : 'Validate Metadata'}
                {!isPending && <ArrowRight size={16} />}
              </button>
            </div>
            
            <div className="p-6">
              {!parsedData.isValid ? (
                <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-xl">
                  <div className="flex items-center gap-2 text-red-500 font-bold mb-4">
                    <FileWarning size={20} /> File parsing failed
                  </div>
                  <ul className="list-disc list-inside text-red-400 space-y-1 text-sm">
                    {parsedData.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                  <button onClick={resetPipeline} className="mt-6 text-sm underline text-red-400">Try another file</button>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Metadata Panel */}
                  <div className="bg-[#0F0B07] rounded-xl p-5 border border-[rgba(255,255,255,0.05)] h-fit">
                    <h3 className="font-bold text-[#F5E9D6] mb-4 border-b border-[rgba(255,255,255,0.05)] pb-2 flex items-center gap-2">
                       <BookOpen size={16} className="text-[#D4AF37]" /> Extracted Metadata
                    </h3>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-[#A1866B]">Title</span>
                        <span className="text-[#F5E9D6] font-medium max-w-[200px] truncate text-right" title={parsedData.metadata.title}>{parsedData.metadata.title}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#A1866B]">Slug</span>
                        <span className="text-[#F5E9D6] font-medium">{parsedData.metadata.slug}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#A1866B]">Package Ref</span>
                        <span className="text-[#D4AF37] font-bold">{parsedData.metadata.package_slug}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#A1866B]">Status</span>
                        <span className={`${parsedData.metadata.published ? 'text-[#22C55E]' : 'text-gray-400'}`}>{parsedData.metadata.published ? 'Published' : 'Draft'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#A1866B]">Order</span>
                        <span className="text-[#F5E9D6]">{parsedData.metadata.sort || 0}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t border-[rgba(255,255,255,0.05)]">
                        <span className="text-[#A1866B] flex items-center gap-1"><Clock size={14} /> Est. Read Time</span>
                        <span className="text-[#22C55E] font-bold">{parsedData.read_time_minutes} min</span>
                      </div>
                    </div>
                  </div>

                  {/* Preview Panel */}
                  <div className="lg:col-span-2 bg-[#0F0B07] rounded-xl border border-[rgba(255,255,255,0.05)] flex flex-col h-[600px]">
                    <div className="p-3 border-b border-[rgba(255,255,255,0.05)] bg-[#1A140E] rounded-t-xl text-xs font-bold text-[#A1866B] uppercase tracking-wider">
                      Live Markdown Preview
                    </div>
                    <div className="flex-1 overflow-y-auto p-6">
                      <div className="prose prose-invert prose-yellow max-w-none prose-headings:font-display prose-headings:tracking-tight prose-a:text-[#D4AF37] prose-a:no-underline hover:prose-a:underline prose-img:rounded-2xl prose-img:border prose-img:border-[rgba(255,255,255,0.1)]">
                         <ReactMarkdown 
                           remarkPlugins={[remarkGfm]} 
                           rehypePlugins={[rehypeRaw]}
                           components={{
                             blockquote: ({node, ...props}) => {
                               const text = String(props.children)
                               if (text.includes('[!NOTE]') || text.includes('[!TIP]') || text.includes('[!IMPORTANT]') || text.includes('[!WARNING]')) {
                                 const isWarning = text.includes('[!WARNING]')
                                 const isImportant = text.includes('[!IMPORTANT]')
                                 return (
                                   <div className={`p-4 rounded-xl border-l-4 my-6 ${isWarning ? 'bg-red-500/10 border-red-500 text-red-200' : isImportant ? 'bg-purple-500/10 border-purple-500 text-purple-200' : 'bg-[#D4AF37]/10 border-[#D4AF37] text-[#F5E9D6]'}`}>
                                     <div className="font-bold mb-2">{isWarning ? '⚠️ WARNING' : isImportant ? '✨ IMPORTANT' : '💡 NOTE'}</div>
                                     <div className="text-sm opacity-90">{props.children}</div>
                                   </div>
                                 )
                               }
                               return <blockquote className="border-l-4 border-[#A1866B] pl-4 italic text-[#A1866B] my-6" {...props} />
                             },
                             table: ({node, ...props}) => (
                               <div className="overflow-x-auto my-8 rounded-xl border border-[rgba(255,255,255,0.05)]"><table className="w-full text-left text-sm" {...props} /></div>
                             ),
                             th: ({node, ...props}) => <th className="bg-[#1A140E] p-4 text-[#F5E9D6] font-bold border-b border-[rgba(255,255,255,0.05)]" {...props} />,
                             td: ({node, ...props}) => <td className="p-4 border-b border-[rgba(255,255,255,0.05)] text-[#A1866B]" {...props} />,
                           }}
                         >
                           {parsedData.content}
                         </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {step === 3 && valResult && (
        <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-8 shadow-xl max-w-2xl mx-auto">
          {!valResult.success ? (
            <div className="text-center">
               <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 mx-auto mb-4">
                 <AlertCircle size={32} />
               </div>
               <h2 className="text-xl font-bold text-[#F5E9D6] mb-2">Validation Failed</h2>
               <p className="text-[#A1866B] mb-6">{valResult.error}</p>
               <button onClick={resetPipeline} className="px-6 py-2 bg-[#0F0B07] text-[#A1866B] rounded-lg border border-[rgba(255,255,255,0.1)] hover:text-[#F5E9D6]">Start Over</button>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-4 mb-8 pb-8 border-b border-[rgba(255,255,255,0.05)]">
                <div className="w-12 h-12 rounded-full bg-[#22C55E]/10 flex items-center justify-center text-[#22C55E] shrink-0">
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-[#F5E9D6]">Validation Passed</h2>
                  <p className="text-[#A1866B] text-sm mt-1">Package <strong className="text-[#D4AF37]">{valResult.packageName}</strong> was found.</p>
                </div>
              </div>

              {valResult.isDuplicate && (
                <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-5 mb-8">
                  <h3 className="text-orange-400 font-bold flex items-center gap-2 mb-2"><AlertCircle size={18} /> Slug Conflict Detected</h3>
                  <p className="text-orange-200/70 text-sm mb-4">The slug <code className="bg-orange-500/20 px-1.5 py-0.5 rounded text-orange-300">{parsedData?.metadata.slug}</code> already exists in this package. How would you like to proceed?</p>
                  
                  <div className="space-y-3">
                    <label className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${conflictResolution === 'replace' ? 'bg-orange-500/20 border-orange-500 text-orange-200' : 'bg-[#0F0B07] border-[rgba(255,255,255,0.1)] text-[#A1866B]'}`}>
                      <input type="radio" name="conflict" checked={conflictResolution === 'replace'} onChange={() => setConflictResolution('replace')} className="mr-3 accent-orange-500" />
                      <div>
                        <div className="font-bold">Replace Existing Summary</div>
                        <div className="text-xs opacity-70">Will overwrite the existing summary with this slug.</div>
                      </div>
                    </label>
                    <label className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${conflictResolution === 'new' ? 'bg-orange-500/20 border-orange-500 text-orange-200' : 'bg-[#0F0B07] border-[rgba(255,255,255,0.1)] text-[#A1866B]'}`}>
                      <input type="radio" name="conflict" checked={conflictResolution === 'new'} onChange={() => setConflictResolution('new')} className="mr-3 accent-orange-500" />
                      <div>
                        <div className="font-bold">Auto-generate New Slug</div>
                        <div className="text-xs opacity-70">Will append a number (e.g. -2) to make it unique.</div>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button onClick={resetPipeline} className="px-5 py-2 text-[#A1866B] hover:text-[#F5E9D6] transition-colors">Cancel</button>
                <button 
                  onClick={handleCommit}
                  disabled={isPending}
                  className="bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] px-6 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  {isPending ? <Loader2 size={16} className="animate-spin" /> : 'Confirm Import'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 4 && importSummary && (
        <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-10 text-center flex flex-col items-center shadow-xl">
          {importSummary.success ? (
            <>
              <div className="w-20 h-20 rounded-full bg-[#22C55E]/10 flex items-center justify-center text-[#22C55E] mb-6">
                <CheckCircle2 size={40} />
              </div>
              <h2 className="text-2xl font-bold font-display text-[#F5E9D6] mb-2">Summary Imported!</h2>
              <p className="text-[#A1866B] mb-2">
                Successfully imported to <strong className="text-[#D4AF37]">{valResult?.packageName}</strong>
              </p>
              <div className="bg-[#0F0B07] text-[#A1866B] px-4 py-2 rounded-lg text-sm mb-8 font-mono">
                Slug: <span className="text-[#F5E9D6]">{importSummary.finalSlug}</span>
              </div>
              
              <div className="flex gap-4">
                <button 
                  onClick={resetPipeline}
                  className="bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.05)] text-[#F5E9D6] px-6 py-2.5 rounded-xl font-bold transition-colors"
                >
                  Import Another
                </button>
                <Link 
                  href="/admin/summaries"
                  className="bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] px-6 py-2.5 rounded-xl font-bold transition-colors"
                >
                  Go to Summaries
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 mb-6">
                <AlertCircle size={40} />
              </div>
              <h2 className="text-2xl font-bold font-display text-[#F5E9D6] mb-2">Import Failed</h2>
              <div className="bg-red-500/10 border border-red-500/30 text-red-500 p-4 rounded-xl text-sm font-medium w-full max-w-md text-left mb-8">
                {importSummary.error}
              </div>
              <button onClick={resetPipeline} className="bg-[#0F0B07] text-[#A1866B] px-6 py-2 rounded-xl">Try Again</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
