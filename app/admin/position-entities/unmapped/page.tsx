import Link from 'next/link'
import { requirePermission } from '@/lib/auth/server-protect'
import {
  excludePlaceholderPositions,
  isOperationalPositionPlaceholder,
} from '@/lib/position-entity'

/**
 * Unmapped operational positions report (read-only). Admins use it to find
 * operational positions that still have no canonical entity
 * (positions.position_entity_id IS NULL) and jump into the relevant Position
 * Entity editor. There is deliberately no mapping write on this page: mapping
 * writes go exclusively through the owner-only editor + RPC path.
 *
 * Placeholder/GEN exclusion mirrors the mapping RPC's predicate in SQL
 * (shared helper) so pagination counts stay exact; each rendered row is
 * re-checked with the canonical TypeScript predicate as defense in depth.
 */
const PAGE_SIZE = 15
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface UnmappedPositionRow {
  id: string
  code: string | null
  name: string
  created_at: string | null
  organizationName: string | null
}

interface MatchingEntity {
  id: string
  slug: string
  name: string
  status: string
}

function buildPageUrl(params: { page: number; search: string; organizationId: string }): string {
  const query = new URLSearchParams()
  if (params.page > 1) query.set('page', String(params.page))
  if (params.search) query.set('q', params.search)
  if (params.organizationId) query.set('org', params.organizationId)
  const queryString = query.toString()
  return queryString ? `/admin/position-entities/unmapped?${queryString}` : '/admin/position-entities/unmapped'
}

export default async function UnmappedPositionsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { supabase } = await requirePermission('content.read')
  const params = await searchParams

  const page = typeof params.page === 'string' ? Math.max(1, parseInt(params.page, 10) || 1) : 1
  const rawSearch = typeof params.q === 'string' ? params.q : ''
  const search = rawSearch.replace(/[,()]/g, ' ').trim()
  const organizationId =
    typeof params.org === 'string' && UUID_PATTERN.test(params.org) ? params.org : ''

  const from = (page - 1) * PAGE_SIZE

  let query = excludePlaceholderPositions(
    supabase
      .from('positions')
      .select('id, code, name, organization_id, created_at, organizations(name, short_name)', {
        count: 'exact',
      }),
  ).is('position_entity_id', null)
  if (organizationId) query = query.eq('organization_id', organizationId)
  if (search) query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`)

  const { data, count, error } = await query
    .order('name', { ascending: true })
    .order('id', { ascending: true })
    .range(from, from + PAGE_SIZE - 1)

  const rows = ((data ?? []) as Array<Record<string, unknown>>)
    .filter((row) => !isOperationalPositionPlaceholder({ code: row.code as string | null, name: row.name as string | null }))
    .map((row) => {
      const organization = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations
      return {
        id: String(row.id),
        code: typeof row.code === 'string' ? row.code : null,
        name: typeof row.name === 'string' ? row.name : '',
        created_at: typeof row.created_at === 'string' ? row.created_at : null,
        organizationName:
          (organization as { short_name?: string | null; name?: string | null } | null)?.short_name ||
          (organization as { short_name?: string | null; name?: string | null } | null)?.name ||
          null,
      } satisfies UnmappedPositionRow
    })

  const total = typeof count === 'number' ? count : rows.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Exact-name matches against existing entities let each row deep-link into
  // the likely-target editor instead of the generic create page.
  const rowNames = Array.from(new Set(rows.map((row) => row.name).filter((name) => name.length > 0)))
  let nameMatches = new Map<string, MatchingEntity>()
  if (rowNames.length > 0) {
    const { data: entityRows } = await supabase
      .from('position_entities')
      .select('id, slug, name, status')
      .in('name', rowNames)
    nameMatches = new Map(
      ((entityRows ?? []) as MatchingEntity[]).map((entity) => [entity.name, entity]),
    )
  }

  const { data: organizationRows } = await supabase
    .from('organizations')
    .select('id, name, short_name')
    .order('name', { ascending: true })

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-20">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-[#F5E9D6]">Unmapped Operational Positions</h1>
          <p className="mt-1 text-[#A1866B]">
            ตำแหน่งปฏิบัติการที่ยังไม่มี Canonical Position (อ่านอย่างเดียว — การ map ทำในหน้า Position Entity editor)
          </p>
        </div>
        <Link
          href="/admin/position-entities"
          className="inline-flex items-center gap-2 rounded-xl border border-[#D4AF37]/30 px-4 py-2 text-sm font-semibold text-[#D4AF37] transition-colors hover:bg-[#D4AF37]/10"
        >
          ไปที่รายการ Position Entities
        </Link>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border border-[rgba(212,175,55,0.15)] bg-[#1A140E] p-4">
        <div className="min-w-56 flex-1 space-y-1.5">
          <label htmlFor="unmapped-search" className="block text-xs font-bold text-[#A1866B]">ค้นหา (ชื่อ/รหัสตำแหน่ง)</label>
          <input
            id="unmapped-search"
            name="q"
            type="search"
            defaultValue={rawSearch}
            className="w-full rounded-xl border border-white/10 bg-[#0F0B07] px-4 py-2.5 text-sm text-[#F5E9D6] focus:border-[#D4AF37] focus:outline-none"
          />
        </div>
        <div className="min-w-52 space-y-1.5">
          <label htmlFor="unmapped-org" className="block text-xs font-bold text-[#A1866B]">หน่วยงาน</label>
          <select
            id="unmapped-org"
            name="org"
            defaultValue={organizationId}
            className="w-full appearance-none rounded-xl border border-white/10 bg-[#0F0B07] px-4 py-2.5 text-sm text-[#F5E9D6] focus:border-[#D4AF37] focus:outline-none"
          >
            <option value="">ทุกหน่วยงาน</option>
            {(organizationRows ?? []).map((organization: any) => (
              <option key={organization.id} value={organization.id}>
                {organization.short_name || organization.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-xl bg-[#D4AF37] px-6 py-2.5 text-sm font-bold text-[#1A140E] transition-colors hover:bg-[#F1D17A]"
        >
          ค้นหา
        </button>
        <Link
          href="/admin/position-entities/unmapped"
          className="rounded-xl px-4 py-2.5 text-sm font-medium text-[#A1866B] transition-colors hover:text-[#F5E9D6]"
        >
          ล้างตัวกรอง
        </Link>
      </form>

      {error ? (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm leading-6 text-red-200">
          โหลดรายงานไม่สำเร็จ: {error.message}
        </div>
      ) : (
        <>
          <p aria-live="polite" className="text-sm text-[#A1866B]">
            พบ <span className="font-bold text-[#F5E9D6]">{total.toLocaleString()}</span> ตำแหน่งที่ยังไม่ถูก map
            {totalPages > 1 && <> · หน้า {page} / {totalPages}</>}
          </p>

          <div className="overflow-hidden rounded-2xl border border-[rgba(212,175,55,0.15)] bg-[#1A140E]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-[#A1866B]">
                  <th scope="col" className="px-4 py-3">ตำแหน่ง</th>
                  <th scope="col" className="px-4 py-3">รหัส</th>
                  <th scope="col" className="px-4 py-3">หน่วยงาน</th>
                  <th scope="col" className="px-4 py-3 text-right">จัดการ mapping</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-[#A1866B]">
                      ไม่พบตำแหน่งที่ยังไม่ถูก map ตามเงื่อนไขที่เลือก
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const match = nameMatches.get(row.name)
                    return (
                      <tr key={row.id} className="border-b border-white/5 last:border-b-0">
                        <td className="px-4 py-3 font-semibold text-[#F5E9D6]">{row.name}</td>
                        <td className="px-4 py-3 font-mono text-xs text-[#A1866B]">{row.code ?? '—'}</td>
                        <td className="px-4 py-3 text-[#D6CBB8]">{row.organizationName ?? 'ไม่ระบุหน่วยงาน'}</td>
                        <td className="px-4 py-3 text-right">
                          {match ? (
                            <Link
                              href={`/admin/position-entities/${match.id}/edit`}
                              className="inline-flex items-center gap-1 rounded-lg bg-[#D4AF37]/15 px-3 py-1.5 text-xs font-bold text-[#D4AF37] transition-colors hover:bg-[#D4AF37] hover:text-[#0F0B07]"
                            >
                              ไปยัง “{match.name}”
                            </Link>
                          ) : (
                            <Link
                              href="/admin/position-entities/create"
                              className="inline-flex items-center gap-1 rounded-lg border border-[#D4AF37]/30 px-3 py-1.5 text-xs font-bold text-[#D4AF37] transition-colors hover:bg-[#D4AF37]/10"
                            >
                              สร้าง Entity ใหม่
                            </Link>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <nav aria-label="Pagination" className="flex items-center justify-between">
              {page > 1 ? (
                <Link
                  href={buildPageUrl({ page: page - 1, search, organizationId })}
                  className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-[#D6CBB8] transition-colors hover:border-[#D4AF37]/40 hover:text-[#F5E9D6]"
                >
                  ← ก่อนหน้า
                </Link>
              ) : (
                <span />
              )}
              {page < totalPages && (
                <Link
                  href={buildPageUrl({ page: page + 1, search, organizationId })}
                  className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-[#D6CBB8] transition-colors hover:border-[#D4AF37]/40 hover:text-[#F5E9D6]"
                >
                  ถัดไป →
                </Link>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  )
}
