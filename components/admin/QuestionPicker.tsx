'use client'

import { useState, useEffect, useMemo } from 'react'
import { Search, Loader2, Plus, Check, Trash2, GripVertical, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { fetchQuestionsForPicker, fetchUniqueFilters } from '../../app/admin/exam-sets/questions.action'
import { getSubjectDropdownOptions, getSubjectLabel, isUnassignedSubject } from '@/lib/subjects'

interface Question {
  id: string
  content: string
  subject: string
  document: string | null
  topic: string
  law: string
  difficulty: string
  is_common: boolean
  category: string
}

interface QuestionPickerProps {
  selectedQuestions: Question[]
  onChange: (questions: Question[]) => void
}

// Client-side "Question Status" filter for the picker.
// 'all' keeps the existing server-paginated flow unchanged; the other two
// values slice the rendered set client-side (no extra API calls).
type QuestionStatusFilter = 'all' | 'selected' | 'unselected'
const PAGE_SIZE = 10

export default function QuestionPicker({ selectedQuestions, onChange }: QuestionPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  
  // Filters
  const [search, setSearch] = useState('')
  const [subject, setSubject] = useState('')
  const [document, setDocument] = useState('')
  const [law, setLaw] = useState('')
  const [topic, setTopic] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [isCommon, setIsCommon] = useState<boolean | undefined>(undefined)
  const [page, setPage] = useState(1)

  // Question Status filter (client-side). Lives alongside the server-side
  // filters above; it never triggers a refetch.
  const [statusFilter, setStatusFilter] = useState<QuestionStatusFilter>('all')

  // Filter Options
  const [subjects, setSubjects] = useState<string[]>([])
  const [documents, setDocuments] = useState<string[]>([])
  const [laws, setLaws] = useState<string[]>([])
  const [topics, setTopics] = useState<string[]>([])

  useEffect(() => {
    fetchUniqueFilters().then(res => {
      setSubjects(res.uniqueSubjects)
      setDocuments(res.uniqueDocuments || [])
      setLaws(res.uniqueLaws)
      setTopics(res.uniqueTopics)
    })
  }, [])

  useEffect(() => {
    if (!isOpen) return
    let isMounted = true
    setLoading(true)

    fetchQuestionsForPicker({
      search, subject, document, law, topic, difficulty, is_common: isCommon, page, limit: PAGE_SIZE
    }).then(res => {
      if (isMounted) {
        setQuestions(res.data as Question[])
        setTotalCount(res.count)
        setLoading(false)
      }
    }).catch(err => {
      console.error(err)
      if (isMounted) setLoading(false)
    })

    return () => { isMounted = false }
  }, [isOpen, search, subject, document, law, topic, difficulty, isCommon, page])

  // --- Client-side Question Status filter (no API calls) ---
  // Reuses the existing `selectedQuestions` prop as the source of truth — no
  // duplicated selection state. Note: `statusFilter` is intentionally NOT in
  // the fetch effect's dependency array, so changing it never refetches.
  const selectedIdSet = useMemo(
    () => new Set(selectedQuestions.map(q => q.id)),
    [selectedQuestions]
  )

  // The full filtered set for the current status (before pagination).
  // - 'all'        → server-paginated `questions` (unchanged behaviour)
  // - 'selected'   → every selected question, cross-page (per spec example)
  // - 'unselected' → currently-loaded `questions` minus selected ones
  const displayQuestions = useMemo<Question[]>(() => {
    if (statusFilter === 'selected') return selectedQuestions
    if (statusFilter === 'unselected') return questions.filter(q => !selectedIdSet.has(q.id))
    return questions
  }, [statusFilter, selectedQuestions, questions, selectedIdSet])

  // In 'all' mode the server is authoritative for the total (it knows about
  // questions beyond the loaded page). In the other two modes the visible set
  // is fully client-side, so its length is the total.
  const effectiveTotal = statusFilter === 'all' ? totalCount : displayQuestions.length

  // Client-side pagination slice for the filtered modes. In 'all' mode the
  // server already returns only the current page, so we render it as-is.
  const pagedQuestions = useMemo(() => {
    if (statusFilter === 'all') return questions
    const from = (page - 1) * PAGE_SIZE
    return displayQuestions.slice(from, from + PAGE_SIZE)
  }, [statusFilter, questions, displayQuestions, page])

  const handleAdd = (q: Question) => {
    if (!selectedQuestions.find(sq => sq.id === q.id)) {
      onChange([...selectedQuestions, q])
    }
  }

  const handleRemove = (id: string) => {
    onChange(selectedQuestions.filter(q => q.id !== id))
  }

  const handleSelectAll = () => {
    const newSelected = [...selectedQuestions]
    let added = false
    questions.forEach(q => {
      if (!newSelected.find(sq => sq.id === q.id)) {
        newSelected.push(q)
        added = true
      }
    })
    if (added) onChange(newSelected)
  }

  const moveUp = (index: number) => {
    if (index === 0) return
    const newItems = [...selectedQuestions]
    const temp = newItems[index - 1]
    newItems[index - 1] = newItems[index]
    newItems[index] = temp
    onChange(newItems)
  }

  const moveDown = (index: number) => {
    if (index === selectedQuestions.length - 1) return
    const newItems = [...selectedQuestions]
    const temp = newItems[index + 1]
    newItems[index + 1] = newItems[index]
    newItems[index] = temp
    onChange(newItems)
  }

  return (
    <div className="space-y-4">
      {/* Selected Questions List */}
      <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-[rgba(255,255,255,0.05)] flex justify-between items-center bg-[#0F0B07]">
          <div>
            <h3 className="font-bold text-[#F5E9D6]">Selected Questions ({selectedQuestions.length})</h3>
            <p className="text-xs text-[#A1866B]">Est. Duration: {selectedQuestions.length * 1.5} mins</p>
          </div>
          <button 
            type="button"
            onClick={() => setIsOpen(true)}
            className="bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors"
          >
            <Plus size={16} />
            Add Questions
          </button>
        </div>

        <div className="divide-y divide-[rgba(255,255,255,0.05)] max-h-[500px] overflow-y-auto">
          {selectedQuestions.length === 0 ? (
            <div className="p-8 text-center text-[#A1866B] text-sm">
              No questions selected yet. Click "Add Questions" to pick from the Question Bank.
            </div>
          ) : selectedQuestions.map((q, index) => (
            <div key={q.id} className="p-4 flex items-start gap-4 hover:bg-[rgba(255,255,255,0.02)] transition-colors group">
              <div className="flex flex-col items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pt-1">
                <button type="button" onClick={() => moveUp(index)} disabled={index === 0} className="text-[#A1866B] hover:text-[#D4AF37] disabled:opacity-30"><ChevronLeft className="rotate-90" size={16}/></button>
                <button type="button" onClick={() => moveDown(index)} disabled={index === selectedQuestions.length - 1} className="text-[#A1866B] hover:text-[#D4AF37] disabled:opacity-30"><ChevronRight className="rotate-90" size={16}/></button>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[#F5E9D6] mb-1">
                  <span className="text-[#A1866B] mr-2">{index + 1}.</span>
                  <span className="line-clamp-2">{q.content}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-[10px] text-[#A1866B] bg-[#0F0B07] px-2 py-0.5 rounded border border-[rgba(255,255,255,0.05)]">
                    {isUnassignedSubject(q.subject) ? (q.category || 'ยังไม่กำหนด Subject') : getSubjectLabel(q.subject)}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${q.difficulty === 'Easy' ? 'text-[#22C55E] bg-[#22C55E]/10' : q.difficulty === 'Medium' ? 'text-[#EAB308] bg-[#EAB308]/10' : 'text-red-400 bg-red-400/10'}`}>
                    {q.difficulty}
                  </span>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => handleRemove(q.id)}
                className="p-2 text-[#A1866B] hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Picker Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl w-full max-w-5xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 flex flex-col h-[85vh]">
            
            {/* Modal Header */}
            <div className="p-4 border-b border-[rgba(255,255,255,0.05)] flex justify-between items-center bg-[#0F0B07] rounded-t-2xl shrink-0">
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-bold font-display text-[#F5E9D6]">Question Bank Picker</h2>
                {/* Live selected counter — updates instantly because `onChange`
                    lifts to parent state, which re-renders this prop. */}
                <span className="text-xs font-semibold text-[#D4AF37] bg-[#D4AF37]/10 border border-[rgba(212,175,55,0.3)] px-2.5 py-1 rounded-lg">
                  เลือกแล้ว {selectedQuestions.length} ข้อ
                </span>
                {questions.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-sm bg-[#1A140E] border border-[rgba(212,175,55,0.3)] text-[#D4AF37] px-3 py-1.5 rounded-lg hover:bg-[#D4AF37]/10 transition-colors"
                  >
                    Select All (Current Page)
                  </button>
                )}
              </div>
              <button type="button" onClick={() => setIsOpen(false)} className="p-2 text-[#A1866B] hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Filters */}
            <div className="p-4 border-b border-[rgba(255,255,255,0.05)] flex flex-wrap gap-3 shrink-0 bg-[#1A140E]">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1866B]" size={16} />
                <input 
                  type="text" 
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder="Search questions..." 
                  className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-[#D4AF37]/50"
                />
              </div>
              <select value={subject} onChange={e => { setSubject(e.target.value); setPage(1); }} className="bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm max-w-[150px]">
                <option value="">All Subjects</option>
                {getSubjectDropdownOptions().map(opt => <option key={opt.code} value={opt.code === '__unassigned__' ? '' : opt.code}>{opt.label}</option>)}
              </select>
              <select value={document} onChange={e => { setDocument(e.target.value); setPage(1); }} className="bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm max-w-[200px]">
                <option value="">All Documents</option>
                {documents.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <select value={topic} onChange={e => { setTopic(e.target.value); setPage(1); }} className="bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm max-w-[150px]">
                <option value="">All Topics</option>
                {topics.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={difficulty} onChange={e => { setDifficulty(e.target.value); setPage(1); }} className="bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm">
                <option value="">All Difficulties</option>
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
              <select value={isCommon === undefined ? '' : isCommon ? 'true' : 'false'} onChange={e => { setIsCommon(e.target.value === '' ? undefined : e.target.value === 'true'); setPage(1); }} className="bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm">
                <option value="">All Types (Common/Specific)</option>
                <option value="true">Common Only</option>
                <option value="false">Organization Specific</option>
              </select>
              {/* Question Status — client-side only, never triggers a refetch. */}
              <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value as QuestionStatusFilter); setPage(1); }} className="bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm">
                <option value="all">ทั้งหมด</option>
                <option value="selected">เลือกแล้ว</option>
                <option value="unselected">ยังไม่ได้เลือก</option>
              </select>
            </div>

            {/* Question List */}
            <div className="flex-1 overflow-y-auto relative p-4 bg-[#1A140E]">
              {loading && (
                <div className="absolute inset-0 bg-[#1A140E]/50 backdrop-blur-sm z-10 flex items-center justify-center">
                  <Loader2 className="animate-spin text-[#D4AF37]" size={32} />
                </div>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {pagedQuestions.map(q => {
                  const isSelected = selectedIdSet.has(q.id)
                  return (
                    <div 
                      key={q.id} 
                      onClick={() => isSelected ? handleRemove(q.id) : handleAdd(q)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-4 ${
                        isSelected 
                          ? 'bg-[#D4AF37]/10 border-[#D4AF37]' 
                          : 'bg-[#0F0B07] border-[rgba(255,255,255,0.05)] hover:border-[#D4AF37]/50'
                      }`}
                    >
                      <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center border shrink-0 ${
                        isSelected ? 'bg-[#D4AF37] border-[#D4AF37] text-black' : 'border-[#A1866B]'
                      }`}>
                        {isSelected && <Check size={14} strokeWidth={3} />}
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm line-clamp-3 mb-2 ${isSelected ? 'text-[#F5E9D6]' : 'text-[#A1866B]'}`}>{q.content}</p>
                        <div className="flex flex-wrap gap-2 mt-auto">
                          <span className="text-[10px] text-[#A1866B] bg-black/30 px-2 py-0.5 rounded border border-[rgba(255,255,255,0.05)]">
                            {isUnassignedSubject(q.subject) ? (q.category || 'ยังไม่กำหนด Subject') : getSubjectLabel(q.subject)}
                          </span>
                          <span className="text-[10px] text-[#A1866B] bg-black/30 px-2 py-0.5 rounded border border-[rgba(255,255,255,0.05)]">
                            {q.difficulty}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              {pagedQuestions.length === 0 && !loading && (
                <div className="text-center p-12 text-[#A1866B]">No questions found.</div>
              )}
            </div>

            {/* Pagination Footer */}
            <div className="p-4 border-t border-[rgba(255,255,255,0.05)] bg-[#0F0B07] rounded-b-2xl shrink-0 flex items-center justify-between">
              <div className="text-sm text-[#A1866B]">
                Showing {effectiveTotal === 0 ? 0 : Math.min((page - 1) * PAGE_SIZE + 1, effectiveTotal)} to {Math.min(page * PAGE_SIZE, effectiveTotal)} of {effectiveTotal} questions
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(p => p - 1)}
                  disabled={page <= 1 || loading}
                  className="px-3 py-1.5 rounded-lg bg-[#1A140E] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setPage(p => p + 1)}
                  disabled={page * PAGE_SIZE >= effectiveTotal || loading}
                  className="px-3 py-1.5 rounded-lg bg-[#1A140E] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
