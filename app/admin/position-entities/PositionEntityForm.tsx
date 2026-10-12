'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Lock,
  Plus,
  Save,
  Search,
  Trash2,
} from 'lucide-react'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { toastEvent } from '@/hooks/useToast'
import { POSITION_ENTITY_STATUS_VALUES, POSITION_MAPPING_SEARCH_PAGE_SIZE, computeMappingDiff } from '@/lib/position-entity'
import {
  replacePositionEntityMappingsAction,
  savePositionEntityAction,
  searchOperationalPositionsAction,
} from './actions'
import type { SearchedOperationalPosition } from './action-state'

export interface PositionEntityFormPosition {
  id: string
  name: string
  code: string | null
  organizationId: string | null
  organizationName: string | null
}

export interface PositionEntityFormValues {
  id: string | null
  slug: string
  name: string
  overview_markdown: string
  seo_title: string
  seo_description: string
  status: string
  sources_json: string
}

interface OrganizationOption {
  id: string
  name: string
  short_name: string | null
}

interface PendingMappingConfirmation {
  entityId: string
  nextIds: string[]
  addedNames: string[]
  removedNames: string[]
}

const MAX_MAPPED_POSITIONS = 2000

function formatNameList(names: readonly string[], max = 5): string {
  const shown = names.slice(0, max).join(', ')
  return names.length > max ? `${shown} +อีก ${names.length - max} รายการ` : shown
}

export default function PositionEntityForm({
  values,
  loadedPositions,
  organizations,
}: {
  values: PositionEntityFormValues
  loadedPositions: PositionEntityFormPosition[]
  organizations: OrganizationOption[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [selectedPositions, setSelectedPositions] = useState<Map<string, PositionEntityFormPosition>>(
    () => new Map(loadedPositions.map((position) => [position.id, position])),
  )

  const [editorialError, setEditorialError] = useState('')
  const [mappingError, setMappingError] = useState('')
  const [serverReloadNotice, setServerReloadNotice] = useState('')
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingMappingConfirmation | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [organizationFilter, setOrganizationFilter] = useState('')
  const [page, setPage] = useState(1)
  const [searchResults, setSearchResults] = useState<SearchedOperationalPosition[]>([])
  const [hasMoreResults, setHasMoreResults] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [hasLoadedResults, setHasLoadedResults] = useState(false)

  const requestIdRef = useRef(0)

  // The server-loaded mapping set is the comparison baseline for the diff and
  // the staleness expectation sent with every save. When the server set
  // changes underneath the editor (stale-save recovery via router.refresh),
  // the local selection is re-synced from it; unrelated re-renders keep the
  // editor's in-progress selection intact.
  const loadedIds = useMemo(() => loadedPositions.map((position) => position.id), [loadedPositions])
  const loadedSignature = useMemo(() => [...loadedIds].sort().join(','), [loadedIds])
  const lastLoadedSignatureRef = useRef(loadedSignature)
  useEffect(() => {
    if (lastLoadedSignatureRef.current === loadedSignature) return
    lastLoadedSignatureRef.current = loadedSignature
    setSelectedPositions(new Map(loadedPositions.map((position) => [position.id, position])))
    setServerReloadNotice(
      'โหลดสถานะ mapping ล่าสุดจากเซิร์ฟเวอร์แล้ว ตรวจสอบรายการอีกครั้งก่อนบันทึก',
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedSignature])

  const selectedIds = useMemo(() => Array.from(selectedPositions.keys()), [selectedPositions])
  const mappingDiff = useMemo(() => computeMappingDiff(loadedIds, selectedIds), [loadedIds, selectedIds])

  // Debounced server search (300ms) with stale-response protection, mirroring
  // the ArticlePackagePicker pattern.
  useEffect(() => {
    let isMounted = true
    const isInitial = searchQuery.trim() === '' && !organizationFilter && page === 1
    const delay = isInitial ? 0 : 300

    const timer = setTimeout(() => {
      const currentRequest = ++requestIdRef.current
      setIsSearching(true)
      setSearchError('')

      searchOperationalPositionsAction(searchQuery, organizationFilter, page)
        .then((result) => {
          if (!isMounted || requestIdRef.current !== currentRequest) return
          setIsSearching(false)
          setHasLoadedResults(true)
          if (!result.ok) {
            setSearchError(result.error)
            setSearchResults([])
            setHasMoreResults(false)
          } else {
            setSearchResults(result.positions)
            setHasMoreResults(result.hasMore)
          }
        })
        .catch(() => {
          if (!isMounted || requestIdRef.current !== currentRequest) return
          setIsSearching(false)
          setHasLoadedResults(true)
          setSearchError('เกิดข้อผิดพลาดในการค้นหาตำแหน่ง')
          setSearchResults([])
          setHasMoreResults(false)
        })
    }, delay)

    return () => {
      isMounted = false
      clearTimeout(timer)
    }
  }, [searchQuery, organizationFilter, page])

  const addPosition = useCallback((row: SearchedOperationalPosition) => {
    setSelectedPositions((current) => {
      if (current.has(row.id)) return current
      if (current.size >= MAX_MAPPED_POSITIONS) {
        toastEvent('เลือกตำแหน่งได้ไม่เกิน 2,000 รายการ', 'warning')
        return current
      }
      const next = new Map(current)
      next.set(row.id, {
        id: row.id,
        name: row.name,
        code: row.code,
        organizationId: row.organizationId,
        organizationName: row.organizationName,
      })
      return next
    })
  }, [])

  const removePosition = useCallback((id: string) => {
    setSelectedPositions((current) => {
      const next = new Map(current)
      next.delete(id)
      return next
    })
  }, [])

  const performMappingSave = useCallback(
    async (entityId: string, nextIds: string[], expectedLoaded: string[]) => {
      setMappingError('')
      const result = await replacePositionEntityMappingsAction(entityId, nextIds, expectedLoaded)

      if (result.ok) {
        toastEvent(`บันทึก mapping สำเร็จ (${result.mappedCount} รายการ)`, 'success')
        router.push('/admin/position-entities')
        return
      }

      setMappingError(result.error)
      toastEvent(result.error, 'error')
      setPendingConfirmation(null)

      if (result.stale) {
        setServerReloadNotice(
          'ชุด mapping บนเซิร์ฟเวอร์เปลี่ยนแปลงระหว่างที่แก้ไข ระบบจะโหลดชุดปัจจุบันให้ใหม่',
        )
        router.refresh()
        return
      }

      // On create the entity itself was already persisted (editorial and
      // mapping saves are separate requests, never presented as atomic).
      // Land the editor on the new entity's edit page so the mapping can be
      // retried without losing the created record.
      if (!values.id) {
        toastEvent('บันทึกข้อมูล Entity สำเร็จแล้ว แต่ mapping ยังไม่ถูกบันทึก กรุณาบันทึก mapping อีกครั้ง', 'warning')
        router.push(`/admin/position-entities/${entityId}/edit`)
      }
    },
    [router, values.id],
  )

  const requestMappingSave = useCallback(
    (entityId: string) => {
      if (mappingDiff.removedIds.length === 0) {
        startTransition(() => {
          void performMappingSave(entityId, selectedIds, loadedIds)
        })
        return
      }

      setPendingConfirmation({
        entityId,
        nextIds: selectedIds,
        addedNames: mappingDiff.addedIds.map((id) => selectedPositions.get(id)?.name ?? id),
        removedNames: mappingDiff.removedIds.map((id) => selectedPositions.get(id)?.name ?? loadedPositions.find((p) => p.id === id)?.name ?? id),
      })
    },
    [loadedIds, mappingDiff, performMappingSave, selectedIds, selectedPositions],
  )

  const handleEditorialSubmit = useCallback(
    (formData: FormData) => {
      setEditorialError('')
      setMappingError('')
      startTransition(async () => {
        const result = await savePositionEntityAction(values.id, formData)

        if (!result.ok) {
          setEditorialError(result.error)
          toastEvent(result.error, 'error')
          return
        }

        if (mappingDiff.unchanged) {
          toastEvent('บันทึก Position Entity เรียบร้อยแล้ว', 'success')
          router.push('/admin/position-entities')
          return
        }

        if (mappingDiff.removedIds.length > 0) {
          setPendingConfirmation({
            entityId: result.entityId,
            nextIds: selectedIds,
            addedNames: mappingDiff.addedIds.map((id) => selectedPositions.get(id)?.name ?? id),
            removedNames: mappingDiff.removedIds.map((id) => selectedPositions.get(id)?.name ?? loadedPositions.find((p) => p.id === id)?.name ?? id),
          })
          return
        }

        await performMappingSave(result.entityId, selectedIds, loadedIds)
      })
    },
    [loadedIds, mappingDiff, performMappingSave, router, selectedIds, selectedPositions, values.id],
  )

  const emptiesAllMappings = pendingConfirmation !== null && pendingConfirmation.nextIds.length === 0
  const totalSelected = selectedPositions.size
  const isCreate = values.id === null

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const formData = new FormData(event.currentTarget)
        handleEditorialSubmit(formData)
      }}
      className="space-y-6 rounded-2xl border border-[rgba(212,175,55,0.15)] bg-[#1A140E] p-6 shadow-xl"
    >
      {(editorialError || mappingError) && (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm leading-6 text-red-200">
          {editorialError || mappingError}
        </div>
      )}
      {serverReloadNotice && (
        <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-6 text-amber-200">
          {serverReloadNotice}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="position-entity-slug" className="block text-sm font-bold text-[#A1866B]">Canonical slug *</label>
          <input id="position-entity-slug" name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={120} defaultValue={values.slug} readOnly={values.status === 'published'} className="w-full rounded-xl border border-white/10 bg-[#0F0B07] px-4 py-3 font-mono text-sm text-[#F5E9D6] focus:border-[#D4AF37] focus:outline-none read-only:cursor-not-allowed read-only:opacity-70" />
          <p className="text-xs leading-5 text-[#6E5B49]">ASCII lowercase kebab-case; a published slug cannot change.</p>
        </div>
        <div className="space-y-2">
          <label htmlFor="position-entity-name" className="block text-sm font-bold text-[#A1866B]">Canonical name *</label>
          <input id="position-entity-name" name="name" required defaultValue={values.name} className="w-full rounded-xl border border-white/10 bg-[#0F0B07] px-4 py-3 text-[#F5E9D6] focus:border-[#D4AF37] focus:outline-none" />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="position-entity-overview" className="block text-sm font-bold text-[#A1866B]">Editorial overview</label>
        <textarea id="position-entity-overview" name="overview_markdown" rows={10} defaultValue={values.overview_markdown} className="w-full resize-y rounded-xl border border-white/10 bg-[#0F0B07] px-4 py-3 text-sm leading-7 text-[#F5E9D6] focus:border-[#D4AF37] focus:outline-none" />
        <p className="text-xs leading-5 text-[#6E5B49]">Write factual evergreen content in Markdown. The public index gate requires meaningful unique editorial copy.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="position-entity-seo-title" className="block text-sm font-bold text-[#A1866B]">SEO title</label>
          <input id="position-entity-seo-title" name="seo_title" defaultValue={values.seo_title} className="w-full rounded-xl border border-white/10 bg-[#0F0B07] px-4 py-3 text-[#F5E9D6] focus:border-[#D4AF37] focus:outline-none" />
        </div>
        <div className="space-y-2">
          <label htmlFor="position-entity-status" className="block text-sm font-bold text-[#A1866B]">Lifecycle status *</label>
          <select id="position-entity-status" name="status" defaultValue={values.status} className="w-full appearance-none rounded-xl border border-white/10 bg-[#0F0B07] px-4 py-3 text-[#F5E9D6] focus:border-[#D4AF37] focus:outline-none">
            {POSITION_ENTITY_STATUS_VALUES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="position-entity-seo-description" className="block text-sm font-bold text-[#A1866B]">SEO description</label>
        <textarea id="position-entity-seo-description" name="seo_description" rows={3} defaultValue={values.seo_description} className="w-full resize-y rounded-xl border border-white/10 bg-[#0F0B07] px-4 py-3 text-sm leading-7 text-[#F5E9D6] focus:border-[#D4AF37] focus:outline-none" />
      </div>

      <div className="space-y-2">
        <label htmlFor="position-entity-sources" className="block text-sm font-bold text-[#A1866B]">Sources JSON</label>
        <textarea id="position-entity-sources" name="sources_json" rows={5} defaultValue={values.sources_json} className="w-full resize-y rounded-xl border border-white/10 bg-[#0F0B07] px-4 py-3 font-mono text-xs leading-6 text-[#F5E9D6] focus:border-[#D4AF37] focus:outline-none" />
        <p className="text-xs leading-5 text-[#6E5B49]">Use an array of objects such as [{"{"}&quot;label&quot;:&quot;Official source&quot;,&quot;url&quot;:&quot;https://example.go.th/&quot;{"}"}]. HTTPS is required.</p>
      </div>

      <fieldset className="space-y-4 border-t border-white/5 pt-6">
        <legend className="text-sm font-bold text-[#A1866B]">Mapped operational positions</legend>
        <p className="text-xs leading-5 text-[#6E5B49]">
          One operational position maps to exactly one canonical entity. Positions owned by another entity cannot be
          selected here; the save replaces the whole mapping set of this entity through the owner-only atomic RPC.
          {isCreate && ' The entity is created first, then the mapping is saved as a second step.'}
        </p>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Selected / mapped panel */}
          <div className="space-y-3 rounded-xl border border-[rgba(212,175,55,0.2)] bg-[#0F0B07] p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[#F5E9D6]">ตำแหน่งที่เลือก</h3>
              <span aria-live="polite" className="rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3 py-1 text-xs font-bold text-[#D4AF37]">
                {totalSelected} รายการ
              </span>
            </div>
            {!mappingDiff.unchanged && (
              <p aria-live="polite" className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300">
                สรุปการเปลี่ยนแปลง: เพิ่ม {mappingDiff.addedIds.length} · ถอด {mappingDiff.removedIds.length}
              </p>
            )}
            {totalSelected === 0 ? (
              <p className="rounded-lg border border-white/5 p-4 text-center text-xs text-[#A1866B]">
                ยังไม่มีตำแหน่งที่ map — ค้นหาและเพิ่มจากแผงด้านข้าง
              </p>
            ) : (
              <ul role="list" className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {Array.from(selectedPositions.values()).map((position) => {
                  const isCurrentlyMapped = loadedIds.includes(position.id)
                  return (
                    <li key={position.id} className="flex items-start justify-between gap-3 rounded-lg border border-[#D4AF37]/20 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#F5E9D6]">{position.name}</p>
                        <p className="mt-0.5 truncate text-xs text-[#A1866B]">
                          {position.organizationName ?? 'ไม่ระบุหน่วยงาน'}
                          {position.code && <span className="ml-1 font-mono">· {position.code}</span>}
                        </p>
                        <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${isCurrentlyMapped ? 'bg-emerald-500/10 text-emerald-300' : 'bg-[#D4AF37]/15 text-[#D4AF37]'}`}>
                          {isCurrentlyMapped ? 'map อยู่ในปัจจุบัน' : 'เพิ่มใหม่ (ยังไม่บันทึก)'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removePosition(position.id)}
                        aria-label={`ถอด ${position.name} ออกจากการเลือก`}
                        className="rounded p-1.5 text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            {!isCreate && !mappingDiff.unchanged && (
              <button
                type="button"
                onClick={() => requestMappingSave(values.id as string)}
                disabled={isPending}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#D4AF37]/20 px-4 py-2.5 text-sm font-bold text-[#D4AF37] transition-colors hover:bg-[#D4AF37]/30 disabled:cursor-wait disabled:opacity-60"
              >
                {isPending ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Save size={15} aria-hidden="true" />}
                บันทึก mapping เท่านั้น (เพิ่ม {mappingDiff.addedIds.length} · ถอด {mappingDiff.removedIds.length})
              </button>
            )}
          </div>

          {/* Searchable picker */}
          <div className="space-y-3 rounded-xl border border-white/10 bg-[#0F0B07] p-4">
            <h3 className="text-sm font-bold text-[#F5E9D6]">ค้นหาตำแหน่งปฏิบัติการ</h3>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#A1866B]" size={15} aria-hidden="true" />
              <input
                type="search"
                id="position-mapping-search"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value)
                  setPage(1)
                }}
                placeholder="ชื่อตำแหน่ง หรือรหัสตำแหน่ง"
                aria-label="ค้นหาตำแหน่งปฏิบัติการด้วยชื่อหรือรหัส"
                className="w-full rounded-lg border border-white/10 bg-[#1A140E] py-2 pl-9 pr-3 text-xs text-[#F5E9D6] placeholder-[#A1866B]/50 focus:border-[#D4AF37] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="position-mapping-org-filter" className="sr-only">กรองตามหน่วยงาน</label>
              <select
                id="position-mapping-org-filter"
                value={organizationFilter}
                onChange={(event) => {
                  setOrganizationFilter(event.target.value)
                  setPage(1)
                }}
                className="w-full rounded-lg border border-white/10 bg-[#1A140E] px-3 py-2 text-xs text-[#F5E9D6] focus:border-[#D4AF37] focus:outline-none"
              >
                <option value="">ทุกหน่วยงาน</option>
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.short_name || organization.name}
                  </option>
                ))}
              </select>
            </div>

            {searchError && (
              <p role="alert" className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-2.5 text-xs text-red-300">
                <AlertTriangle size={13} className="shrink-0" aria-hidden="true" />
                {searchError}
              </p>
            )}

            {isSearching ? (
              <p role="status" className="flex items-center gap-2 p-3 text-xs text-[#A1866B]">
                <Loader2 size={14} className="animate-spin text-[#D4AF37]" aria-hidden="true" />
                กำลังค้นหา…
              </p>
            ) : hasLoadedResults && !searchError && searchResults.length === 0 ? (
              <p className="rounded-lg border border-white/5 p-4 text-center text-xs text-[#A1866B]">ไม่พบตำแหน่งที่ค้นหา</p>
            ) : (
              <ul role="list" className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                {searchResults.map((row) => {
                  const isSelected = selectedPositions.has(row.id)
                  const ownedByOther = Boolean(row.owningEntity && row.owningEntity.id !== values.id)
                  const ownedByThis = Boolean(row.owningEntity && row.owningEntity.id === values.id)
                  return (
                    <li
                      key={row.id}
                      className={`flex items-center justify-between gap-2 rounded-lg border p-2.5 ${ownedByOther ? 'border-white/5 opacity-70' : 'border-[#D4AF37]/15'}`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-[#F5E9D6]">{row.name}</p>
                        <p className="truncate text-[11px] text-[#A1866B]">
                          {row.organizationName ?? 'ไม่ระบุหน่วยงาน'}
                          {row.code && <span className="ml-1 font-mono">· {row.code}</span>}
                        </p>
                        {ownedByOther && row.owningEntity && (
                          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-300" title={`/positions/${row.owningEntity.slug}`}>
                            <Lock size={10} aria-hidden="true" />
                            ถูกใช้โดย: {row.owningEntity.name}
                          </span>
                        )}
                        {isSelected && !ownedByOther && (
                          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${ownedByThis ? 'bg-emerald-500/10 text-emerald-300' : 'bg-[#D4AF37]/15 text-[#D4AF37]'}`}>
                            {ownedByThis ? 'map อยู่' : 'เลือกแล้ว'}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => addPosition(row)}
                        disabled={isSelected || ownedByOther}
                        aria-label={
                          ownedByOther
                            ? `${row.name} ถูกใช้โดย ${row.owningEntity?.name ?? 'entity อื่น'}`
                            : isSelected
                              ? `${row.name} ถูกเลือกแล้ว`
                              : `เพิ่ม ${row.name}`
                        }
                        className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
                          isSelected || ownedByOther
                            ? 'cursor-not-allowed border border-white/5 text-[#A1866B]/60'
                            : 'bg-[#D4AF37]/20 text-[#D4AF37] hover:bg-[#D4AF37] hover:text-[#0F0B07]'
                        }`}
                      >
                        {isSelected ? (
                          <span className="inline-flex items-center gap-1"><CheckCircle2 size={12} aria-hidden="true" /> เลือกอยู่</span>
                        ) : ownedByOther ? (
                          <span className="inline-flex items-center gap-1"><Lock size={12} aria-hidden="true" /> มีเจ้าของ</span>
                        ) : (
                          <span className="inline-flex items-center gap-1"><Plus size={12} aria-hidden="true" /> เพิ่ม</span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            {(searchResults.length > 0 || hasMoreResults) && !searchError && (
              <div className="flex items-center justify-between text-xs text-[#A1866B]">
                <span>แสดงหน้า {page} · สูงสุด {POSITION_MAPPING_SEARCH_PAGE_SIZE} รายการ/หน้า</span>
                <span className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={page <= 1 || isSearching}
                    aria-label="หน้าก่อนหน้า"
                    className="rounded border border-white/10 p-1.5 disabled:opacity-40"
                  >
                    <ChevronLeft size={13} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((current) => (hasMoreResults ? current + 1 : current))}
                    disabled={!hasMoreResults || isSearching}
                    aria-label="หน้าถัดไป"
                    className="rounded border border-white/10 p-1.5 disabled:opacity-40"
                  >
                    <ChevronRight size={13} aria-hidden="true" />
                  </button>
                </span>
              </div>
            )}
          </div>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-white/5 pt-6">
        <Link href="/admin/position-entities" className="inline-flex items-center gap-2 px-5 py-3 font-medium text-[#A1866B] transition-colors hover:text-[#F5E9D6]">
          <ArrowLeft size={16} aria-hidden="true" />
          Cancel
        </Link>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-[#D4AF37] px-7 py-3 font-bold text-[#1A140E] transition-colors hover:bg-[#F1D17A] disabled:cursor-wait disabled:opacity-60"
        >
          {isPending ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <Save size={17} aria-hidden="true" />}
          {isPending ? 'Saving...' : isCreate && !mappingDiff.unchanged ? 'Create & Save Mapping' : 'Save Position Entity'}
        </button>
      </div>

      <ConfirmDialog
        isOpen={pendingConfirmation !== null}
        onClose={() => setPendingConfirmation(null)}
        onConfirm={() => {
          if (!pendingConfirmation) return
          const confirmation = pendingConfirmation
          setPendingConfirmation(null)
          startTransition(() => {
            void performMappingSave(confirmation.entityId, confirmation.nextIds, loadedIds)
          })
        }}
        title={emptiesAllMappings ? 'ยืนยันการถอด mapping ทั้งหมด' : 'ยืนยันการบันทึก mapping'}
        isDestructive
        requireTyping={emptiesAllMappings ? 'ถอดทั้งหมด' : undefined}
        isLoading={isPending}
        description={
          pendingConfirmation ? (
            <span className="block space-y-2">
              <span className="block">การบันทึกจะแทนที่ชุด mapping ทั้งหมดของ entity นี้ (full replacement):</span>
              {pendingConfirmation.addedNames.length > 0 && (
                <span className="block text-emerald-300">+ เพิ่ม {pendingConfirmation.addedNames.length} รายการ: {formatNameList(pendingConfirmation.addedNames)}</span>
              )}
              {pendingConfirmation.removedNames.length > 0 && (
                <span className="block text-red-300">− ถอด {pendingConfirmation.removedNames.length} รายการ: {formatNameList(pendingConfirmation.removedNames)}</span>
              )}
              {emptiesAllMappings && (
                <span className="block font-bold text-red-300">คุณกำลังจะถอดตำแหน่งที่ map อยู่ทั้งหมดออกจาก entity นี้</span>
              )}
            </span>
          ) : ''
        }
      />
    </form>
  )
}
