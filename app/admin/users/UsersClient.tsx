'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useState, useTransition, useCallback } from 'react'
import { Search, Loader2, ChevronLeft, ChevronRight, UserCircle, Shield, Ban, CheckCircle } from 'lucide-react'
import { updateUserRole, updateUserStatus } from './actions'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { toastEvent } from '@/hooks/useToast'

interface UsersClientProps {
  users: any[]
  totalPages: number
  currentPage: number
  search: string
  roleFilter: string
  statusFilter: string
  currentUserRole: string
}

export default function UsersClient({
  users,
  totalPages,
  currentPage,
  search,
  roleFilter,
  statusFilter,
  currentUserRole
}: UsersClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  
  const [searchInput, setSearchInput] = useState(search)
  const [actingOnId, setActingOnId] = useState<string | null>(null)

  // Dialog states
  const [roleModal, setRoleModal] = useState<{ isOpen: boolean, user: any, newRole: 'user' | 'admin' | 'owner' | 'editor' | 'support' | '' }>({ isOpen: false, user: null, newRole: '' })
  const [statusModal, setStatusModal] = useState<{ isOpen: boolean, user: any, newStatus: 'active' | 'banned' | '' }>({ isOpen: false, user: null, newStatus: '' })

  const updateParams = useCallback((updates: Record<string, string>) => {
    const params = new URLSearchParams(window.location.search)
    Object.entries(updates).forEach(([key, value]) => {
      if (value) params.set(key, value)
      else params.delete(key)
    })
    if (!updates.page) params.set('page', '1')

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }, [pathname, router])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateParams({ q: searchInput })
  }

  const handleRoleChange = async () => {
    if (!roleModal.user || !roleModal.newRole) return
    setActingOnId(roleModal.user.id)
    const newRole = roleModal.newRole as 'user' | 'admin' | 'owner' | 'editor' | 'support'
    setRoleModal({ isOpen: false, user: null, newRole: '' })
    await updateUserRole(roleModal.user.id, newRole)
    toastEvent('เปลี่ยนสิทธิ์สำเร็จ')
    setActingOnId(null)
  }

  const handleStatusChange = async () => {
    if (!statusModal.user || !statusModal.newStatus) return
    setActingOnId(statusModal.user.id)
    const newStatus = statusModal.newStatus as 'active' | 'banned'
    setStatusModal({ isOpen: false, user: null, newStatus: '' })
    await updateUserStatus(statusModal.user.id, newStatus)
    toastEvent(newStatus === 'banned' ? 'แบนผู้ใช้สำเร็จ' : 'ปลดแบนสำเร็จ')
    setActingOnId(null)
  }

  const handleRoleSelect = (user: any, newRole: 'user' | 'admin' | 'owner' | 'editor' | 'support') => {
    if (newRole === user.role) return
    setRoleModal({ isOpen: true, user, newRole })
  }

  const handleStatusSelect = (user: any, newStatus: 'active' | 'banned') => {
    if (newStatus === user.status) return
    setStatusModal({ isOpen: true, user, newStatus })
  }

  const canManageRoles = ['owner', 'admin'].includes(currentUserRole)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-display text-[#F5E9D6] tracking-tight">Users</h1>
        <p className="text-[#A1866B] mt-1">Manage accounts, roles, and access.</p>
      </div>

      <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl overflow-hidden shadow-xl">
        
        {/* Toolbar */}
        <div className="p-4 border-b border-[rgba(255,255,255,0.05)] flex flex-wrap gap-4 items-center justify-between">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1866B]" size={18} />
            <input 
              type="text" 
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by email..." 
              className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl pl-10 pr-4 py-2 focus:outline-none focus:border-[#D4AF37]/50"
            />
          </form>
          
          <div className="flex items-center gap-3">
            <select 
              value={roleFilter} 
              onChange={(e) => updateParams({ role: e.target.value })}
              className="bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]/50"
            >
              <option value="">All Roles</option>
              <option value="user">User</option>
              <option value="admin">Admin</option>
              <option value="owner">Owner</option>
              <option value="editor">Editor</option>
              <option value="support">Support</option>
            </select>

            <select 
              value={statusFilter} 
              onChange={(e) => updateParams({ status: e.target.value })}
              className="bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]/50"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="banned">Banned</option>
            </select>
          </div>
        </div>

        {/* Loading Overlay */}
        {isPending && (
          <div className="absolute inset-0 bg-[#1A140E]/50 backdrop-blur-sm z-10 flex items-center justify-center">
            <Loader2 className="animate-spin text-[#D4AF37]" size={32} />
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto min-h-[400px] relative">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#0F0B07]/50 text-[#A1866B] text-xs uppercase tracking-wider border-b border-[rgba(255,255,255,0.05)]">
                <th className="p-4 font-medium">User</th>
                <th className="p-4 font-medium">Role</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium">Registered</th>
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(255,255,255,0.02)]">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-[#A1866B]">
                    No users found.
                  </td>
                </tr>
              ) : users.map((user) => (
                <tr key={user.id} className="hover:bg-[#D4AF37]/[0.02] transition-colors">
                  <td className="p-4 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#D4AF37]/20 text-[#D4AF37] flex items-center justify-center font-bold">
                      {user.email.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-[#F5E9D6] font-medium text-sm">{user.email}</div>
                      <div className="text-[#A1866B] text-[10px] truncate max-w-[200px]">{user.id}</div>
                    </div>
                  </td>
                  <td className="p-4">
                    {canManageRoles && user.role !== 'owner' ? (
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleSelect(user, e.target.value as any)}
                        disabled={user.role === 'owner' || actingOnId === user.id}
                        className={`bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] rounded-md px-2 py-1 text-xs font-bold uppercase focus:outline-none focus:border-[#D4AF37]/50 ${
                          ['admin', 'editor', 'support'].includes(user.role) ? 'text-[#D4AF37]' : 'text-[#A1866B]'
                        }`}
                      >
                        <option value="user">USER</option>
                        <option value="support">SUPPORT</option>
                        <option value="editor">EDITOR</option>
                        <option value="admin">ADMIN</option>
                        {currentUserRole === 'owner' && <option value="owner">OWNER</option>}
                      </select>
                    ) : (
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border ${
                        ['admin', 'owner', 'editor', 'support'].includes(user.role) 
                          ? 'bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/30' 
                          : 'bg-[#0F0B07] text-[#A1866B] border-[rgba(255,255,255,0.1)]'
                      }`}>
                        {['admin', 'owner', 'editor', 'support'].includes(user.role) ? <Shield size={12} /> : <UserCircle size={12} />}
                        {user.role.toUpperCase()}
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    {user.deleted_at ? (
                      <span className="text-xs font-bold text-gray-400 bg-gray-500/10 px-2 py-1 rounded">ปิดการใช้งาน</span>
                    ) : user.status === 'banned' ? (
                      <span className="text-xs font-bold text-red-500 bg-red-500/10 px-2 py-1 rounded">Banned</span>
                    ) : (
                      <span className="text-xs font-bold text-[#22C55E] bg-[#22C55E]/10 px-2 py-1 rounded">ใช้งานอยู่</span>
                    )}
                  </td>
                  <td className="p-4 text-[#A1866B] text-sm">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {canManageRoles && user.role !== 'owner' && (
                        <button type="button" 
                          onClick={() => setStatusModal({ isOpen: true, user, newStatus: user.status === 'banned' ? 'active' : 'banned' })}
                          disabled={actingOnId === user.id}
                          className={`p-2 transition-colors rounded-lg disabled:opacity-50 ${
                            user.status === 'banned' 
                              ? 'text-green-500 hover:bg-green-500/10' 
                              : 'text-[#A1866B] hover:text-red-400 hover:bg-red-400/10'
                          }`} 
                          title={user.status === 'banned' ? 'Unban User' : 'Ban User'}
                        >
                          {actingOnId === user.id ? <Loader2 size={16} className="animate-spin" /> : user.status === 'banned' ? <CheckCircle size={16} /> : <Ban size={16} />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-[rgba(255,255,255,0.05)] flex items-center justify-between">
            <div className="text-sm text-[#A1866B]">
              Page <span className="text-[#F5E9D6] font-medium">{currentPage}</span> of <span className="text-[#F5E9D6] font-medium">{totalPages}</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" 
                onClick={() => updateParams({ page: String(currentPage - 1) })}
                disabled={currentPage <= 1 || isPending}
                className="p-2 rounded-lg bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] disabled:opacity-50 hover:bg-[rgba(255,255,255,0.05)]"
              >
                <ChevronLeft size={16} />
              </button>
              <button type="button" 
                onClick={() => updateParams({ page: String(currentPage + 1) })}
                disabled={currentPage >= totalPages || isPending}
                className="p-2 rounded-lg bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] disabled:opacity-50 hover:bg-[rgba(255,255,255,0.05)]"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={roleModal.isOpen}
        onClose={() => setRoleModal({ isOpen: false, user: null, newRole: '' })}
        onConfirm={handleRoleChange}
        title="เปลี่ยนสิทธิ์การใช้งาน"
        description={
          <div className="space-y-2 text-[#F5E9D6]">
            <div>ผู้ใช้: <span className="text-[#D4AF37] font-medium">{roleModal.user?.email}</span></div>
            <div>
              จาก <span className="bg-[#0F0B07] px-2 py-0.5 rounded font-mono text-xs text-[#A1866B]">{roleModal.user?.role?.toUpperCase()}</span> เป็น <span className="bg-[#D4AF37]/20 px-2 py-0.5 rounded font-mono text-xs text-[#D4AF37]">{roleModal.newRole.toUpperCase()}</span>
            </div>
            <p className="text-[#A1866B] text-xs pt-2">การเปลี่ยนสิทธิ์จะมีผลทันที</p>
          </div>
        }
        confirmText="ยืนยัน"
        cancelText="ยกเลิก"
      />

      <ConfirmDialog
        isOpen={statusModal.isOpen}
        onClose={() => setStatusModal({ isOpen: false, user: null, newStatus: '' })}
        onConfirm={handleStatusChange}
        title={statusModal.newStatus === 'banned' ? 'ระงับบัญชี' : 'ปลดระงับบัญชี'}
        description={
          <div className="space-y-2 text-[#F5E9D6]">
            <div>คุณต้องการ {statusModal.newStatus === 'banned' ? 'แบน' : 'ปลดแบน'}: <span className="text-[#D4AF37] font-medium">{statusModal.user?.email}</span> ใช่หรือไม่?</div>
          </div>
        }
        confirmText="ยืนยัน"
        cancelText="ยกเลิก"
        isDestructive={statusModal.newStatus === 'banned'}
      />
    </div>
  )
}
