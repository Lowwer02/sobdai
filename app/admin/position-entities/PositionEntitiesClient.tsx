'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Edit, Plus, Search } from 'lucide-react'

export interface PositionEntityListRow {
  id: string
  slug: string
  name: string
  status: string
  published_at: string | null
  updated_at: string | null
  positions?: Array<{
    id: string
    name: string
    organizationName: string | null
  }>
}

function statusLabel(status: string): string {
  if (status === 'published') return 'Published'
  if (status === 'archived') return 'Archived'
  return 'Draft'
}

export default function PositionEntitiesClient({
  entities,
  canManage,
  migrationError,
}: {
  entities: PositionEntityListRow[]
  canManage: boolean
  migrationError?: string
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return entities
    return entities.filter((entity) =>
      `${entity.name} ${entity.slug}`.toLowerCase().includes(term),
    )
  }, [entities, searchTerm])

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-[#F5E9D6]">Position Entities</h1>
          <p className="mt-1 text-[#A1866B]">Manage canonical SEO role pages and their organization-scoped mappings.</p>
        </div>
        {canManage && (
          <Link href="/admin/position-entities/create" className="flex w-fit items-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-2.5 font-bold text-[#1A140E] transition-colors hover:bg-[#F1D17A]">
            <Plus size={18} aria-hidden="true" />
            Create Position Entity
          </Link>
        )}
      </div>

      {migrationError && (
        <div role="status" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          {migrationError}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-[rgba(212,175,55,0.15)] bg-[#1A140E] shadow-xl">
        <div className="border-b border-white/5 bg-[#0F0B07]/50 p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1866B]" size={18} aria-hidden="true" />
            <input
              type="search"
              placeholder="Search entity name or slug..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#1A140E] py-2 pl-10 pr-4 text-[#F5E9D6] focus:border-[#D4AF37] focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-[#0F0B07] text-sm uppercase tracking-wider text-[#A1866B]">
                <th className="border-b border-white/5 p-4 font-bold">Entity</th>
                <th className="border-b border-white/5 p-4 font-bold">Status</th>
                <th className="border-b border-white/5 p-4 font-bold">Mapped positions</th>
                {canManage && <th className="border-b border-white/5 p-4 text-right font-bold">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 4 : 3} className="p-8 text-center text-[#A1866B]">No Position Entities found.</td>
                </tr>
              ) : filtered.map((entity) => (
                <tr key={entity.id} className="transition-colors hover:bg-[#0F0B07]/50">
                  <td className="p-4">
                    <div className="font-semibold text-[#F5E9D6]">{entity.name}</div>
                    <div className="mt-1 font-mono text-xs text-[#A1866B]">/{entity.slug}</div>
                  </td>
                  <td className="p-4 text-sm text-[#D4AF37]">{statusLabel(entity.status)}</td>
                  <td className="p-4 text-sm text-[#A1866B]">
                    <div>{entity.positions?.length ?? 0} rows</div>
                    {entity.positions && entity.positions.length > 0 && (
                      <div className="mt-1 max-w-md text-xs text-[#6E5B49]">
                        {entity.positions.map((position) => position.organizationName ? `${position.organizationName}: ${position.name}` : position.name).join(' · ')}
                      </div>
                    )}
                  </td>
                  {canManage && (
                    <td className="p-4 text-right">
                      <Link href={`/admin/position-entities/${entity.id}/edit`} className="inline-flex rounded-lg p-2 text-[#A1866B] transition-colors hover:bg-[#D4AF37]/10 hover:text-[#D4AF37]" aria-label={`Edit ${entity.name}`}>
                        <Edit size={18} aria-hidden="true" />
                      </Link>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
