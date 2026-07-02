'use client'

import { useState, useTransition } from 'react'
import { Plus, Edit, Trash2, Search, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { deletePosition } from './actions'

export default function PositionsClient({ positions }: { positions: any[] }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [isPending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete ${name}? This will affect all associated packages.`)) {
      setDeletingId(id)
      startTransition(async () => {
        await deletePosition(id)
        setDeletingId(null)
      })
    }
  }

  const filtered = positions.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.organizations?.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display text-[#F5E9D6] tracking-tight">Positions</h1>
          <p className="text-[#A1866B] mt-1">Manage job roles and exams for organizations.</p>
        </div>
        <Link 
          href="/admin/positions/create"
          className="bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors w-fit"
        >
          <Plus size={18} />
          Create Position
        </Link>
      </div>

      <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-[rgba(255,255,255,0.05)] bg-[#0F0B07]/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1866B]" size={18} />
            <input 
              type="text" 
              placeholder="Search positions or organizations..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#1A140E] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] pl-10 pr-4 py-2 rounded-xl focus:outline-none focus:border-[#D4AF37] transition-colors"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#0F0B07] text-[#A1866B] text-sm uppercase tracking-wider">
                <th className="p-4 font-bold border-b border-[rgba(255,255,255,0.05)]">Organization</th>
                <th className="p-4 font-bold border-b border-[rgba(255,255,255,0.05)]">Code</th>
                <th className="p-4 font-bold border-b border-[rgba(255,255,255,0.05)]">Name</th>
                <th className="p-4 font-bold border-b border-[rgba(255,255,255,0.05)] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(255,255,255,0.05)]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-[#A1866B]">No positions found.</td>
                </tr>
              ) : (
                filtered.map(pos => (
                  <tr key={pos.id} className="hover:bg-[#0F0B07]/50 transition-colors">
                    <td className="p-4 text-[#A1866B] font-medium">{pos.organizations?.name} <span className="text-xs ml-1 bg-[#1A140E] px-1.5 py-0.5 rounded border border-[rgba(255,255,255,0.05)]">{pos.organizations?.code}</span></td>
                    <td className="p-4 font-mono text-[#D4AF37] text-sm">{pos.code}</td>
                    <td className="p-4 text-[#F5E9D6] font-medium">{pos.name}</td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link 
                          href={`/admin/positions/${pos.id}/edit`}
                          className="p-2 text-[#A1866B] hover:text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-lg transition-colors"
                        >
                          <Edit size={18} />
                        </Link>
                        <button type="button" 
                          onClick={() => handleDelete(pos.id, pos.name)}
                          disabled={deletingId === pos.id || isPending}
                          className="p-2 text-[#A1866B] hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {deletingId === pos.id ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
