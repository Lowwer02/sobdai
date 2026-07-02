'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useState, useTransition, useCallback } from 'react'
import { Search, Loader2, ChevronLeft, ChevronRight, Ban, CheckCircle, Plus, X } from 'lucide-react'
import { ORDER_STATUS } from '@/lib/orderUtils'
import { grantPackageAccess, updateOrderStatus } from './actions'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { toastEvent } from '@/hooks/useToast'

interface OrdersClientProps {
  orders: any[]
  users: any[]
  packages: any[]
  totalPages: number
  currentPage: number
  search: string
  statusFilter: string
}

export default function OrdersClient({
  orders,
  users,
  packages,
  totalPages,
  currentPage,
  search,
  statusFilter
}: OrdersClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  
  const [searchInput, setSearchInput] = useState(search)
  const [actingOnId, setActingOnId] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [granting, setGranting] = useState(false)
  const [selectedUser, setSelectedUser] = useState('')
  const [selectedPackage, setSelectedPackage] = useState('')
  const [error, setError] = useState('')
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean, orderId: string | null, action: 'revoke' | 'restore' | 'complete' | null }>({ isOpen: false, orderId: null, action: null })

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

  const handleRevoke = async () => {
    if (!confirmModal.orderId) return
    setActingOnId(confirmModal.orderId)
    setConfirmModal({ isOpen: false, orderId: null, action: null })
    await updateOrderStatus(confirmModal.orderId, ORDER_STATUS.CANCELLED)
    toastEvent('ยกเลิกสิทธิ์เข้าถึงสำเร็จ')
    setActingOnId(null)
  }

  const handleRestore = async () => {
    if (!confirmModal.orderId) return
    setActingOnId(confirmModal.orderId)
    setConfirmModal({ isOpen: false, orderId: null, action: null })
    await updateOrderStatus(confirmModal.orderId, ORDER_STATUS.PAID)
    toastEvent('คืนสิทธิ์เข้าถึงสำเร็จ')
    setActingOnId(null)
  }

  const handleComplete = async () => {
    if (!confirmModal.orderId) return
    setActingOnId(confirmModal.orderId)
    setConfirmModal({ isOpen: false, orderId: null, action: null })
    await updateOrderStatus(confirmModal.orderId, ORDER_STATUS.PAID)
    toastEvent('เปลี่ยนสถานะเป็นชำระเงินแล้วสำเร็จ')
    setActingOnId(null)
  }

  const confirmAction = () => {
    if (confirmModal.action === 'revoke') handleRevoke()
    else if (confirmModal.action === 'restore') handleRestore()
    else if (confirmModal.action === 'complete') handleComplete()
  }

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUser || !selectedPackage) {
      setError('Please select both user and package.')
      return
    }
    setError('')
    setGranting(true)
    const res = await grantPackageAccess(selectedUser, selectedPackage)
    setGranting(false)
    if (res?.success) {
      setIsModalOpen(false)
      setSelectedUser('')
      setSelectedPackage('')
    } else {
      setError(res?.error || 'Failed to grant access.')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display text-[#F5E9D6] tracking-tight">Orders</h1>
          <p className="text-[#A1866B] mt-1">Manage purchases and package access.</p>
        </div>
        <button type="button" 
          onClick={() => setIsModalOpen(true)}
          className="bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors"
        >
          <Plus size={18} />
          Grant Access
        </button>
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
              placeholder="Search by user email..." 
              className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl pl-10 pr-4 py-2 focus:outline-none focus:border-[#D4AF37]/50"
            />
          </form>
          
          <div className="flex items-center gap-3">
            <select 
              value={statusFilter} 
              onChange={(e) => updateParams({ status: e.target.value })}
              className="bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#D4AF37]/50"
            >
              <option value="all">ทุกสถานะ</option>
              <option value={ORDER_STATUS.PAID}>Paid</option>
              <option value={ORDER_STATUS.FREE}>Free</option>
              <option value={ORDER_STATUS.PENDING}>Pending</option>
              <option value={ORDER_STATUS.CANCELLED}>Cancelled</option>
              <option value="refunded">Refunded</option>
              <option value="revoked">Revoked</option>
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
                <th className="p-4 font-medium">Date</th>
                <th className="p-4 font-medium">Buyer</th>
                <th className="p-4 font-medium">Package</th>
                <th className="p-4 font-medium text-right">Amount</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(255,255,255,0.02)]">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-[#A1866B]">
                    No orders found.
                  </td>
                </tr>
              ) : orders.map((order) => (
                <tr key={order.id} className="hover:bg-[#D4AF37]/[0.02] transition-colors">
                  <td className="p-4 text-[#A1866B] text-sm whitespace-nowrap">
                    {new Date(order.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="p-4">
                    <div className="text-[#F5E9D6] font-medium text-sm">{order.user_email}</div>
                  </td>
                  <td className="p-4">
                    <div className="text-[#F5E9D6] font-medium text-sm truncate max-w-[200px]">{order.package_name}</div>
                    <div className="text-[#A1866B] text-xs mt-0.5">{order.payment_provider || 'Unknown'}</div>
                  </td>
                  <td className="p-4 text-right">
                    <span className="text-[#D4AF37] font-bold">฿{Number(order.amount).toLocaleString()}</span>
                  </td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 text-xs font-bold rounded-lg border ${
                      order.status === ORDER_STATUS.PAID || order.status === ORDER_STATUS.FREE ? 'text-[#22C55E] bg-[#22C55E]/10 border-[#22C55E]/20' :
                      order.status === ORDER_STATUS.PENDING ? 'text-[#D4AF37] bg-[#D4AF37]/10 border-[#D4AF37]/20' :
                      order.status === ORDER_STATUS.FAILED ? 'text-red-400 bg-red-400/10 border-red-400/20' :
                      order.status === ORDER_STATUS.REFUNDED ? 'text-purple-400 bg-purple-400/10 border-purple-400/20' :
                      'text-red-400 bg-red-400/10 border-red-400/20'
                    }`}>
                      {order.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {order.status === ORDER_STATUS.PENDING && (
                        <button type="button" 
                          onClick={() => setConfirmModal({ isOpen: true, orderId: order.id, action: 'complete' })}
                          disabled={actingOnId === order.id}
                          className="px-3 py-1.5 bg-[#22C55E]/10 text-[#22C55E] text-xs font-bold rounded hover:bg-[#22C55E]/20 transition-colors"
                        >
                          Mark Paid
                        </button>
                      )}
                      {(order.status === ORDER_STATUS.PAID || order.status === ORDER_STATUS.FREE) ? (
                        <button type="button" 
                          onClick={() => setConfirmModal({ isOpen: true, orderId: order.id, action: 'revoke' })}
                          disabled={actingOnId === order.id}
                          className="p-2 text-[#A1866B] hover:text-red-400 transition-colors rounded-lg hover:bg-red-400/10 disabled:opacity-50"
                          title="Revoke Access"
                        >
                          {actingOnId === order.id ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
                        </button>
                      ) : order.status === 'revoked' ? (
                        <button type="button" 
                          onClick={() => setConfirmModal({ isOpen: true, orderId: order.id, action: 'restore' })}
                          disabled={actingOnId === order.id}
                          className="p-2 text-[#A1866B] hover:text-green-500 transition-colors rounded-lg hover:bg-green-500/10 disabled:opacity-50"
                          title="Restore Access"
                        >
                          {actingOnId === order.id ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                        </button>
                      ) : (
                         <span className="text-xs text-[#A1866B]">N/A</span>
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

      {/* Grant Access Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-[rgba(255,255,255,0.05)] flex justify-between items-center">
              <h3 className="text-lg font-bold font-display text-[#F5E9D6]">Grant Package Access</h3>
              <button type="button" onClick={() => setIsModalOpen(false)} className="text-[#A1866B] hover:text-[#F5E9D6] transition-colors"><X size={20} /></button>
            </div>
            <form onSubmit={handleGrant} className="p-6 space-y-4">
              {error && <div className="p-3 bg-red-500/10 text-red-500 text-sm rounded-lg">{error}</div>}
              <div>
                <label className="text-sm text-[#F5E9D6] font-medium block mb-2">Select User</label>
                <select 
                  required
                  value={selectedUser} 
                  onChange={e => setSelectedUser(e.target.value)} 
                  className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2 focus:outline-none focus:border-[#D4AF37]/50"
                >
                  <option value="">-- Choose User --</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm text-[#F5E9D6] font-medium block mb-2">Select Package</label>
                <select 
                  required
                  value={selectedPackage} 
                  onChange={e => setSelectedPackage(e.target.value)} 
                  className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.1)] text-[#F5E9D6] rounded-xl px-4 py-2 focus:outline-none focus:border-[#D4AF37]/50"
                >
                  <option value="">-- Choose Package --</option>
                  {packages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="pt-4 flex gap-3 justify-end">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={granting}
                  className="px-4 py-2 rounded-xl text-[#F5E9D6] hover:bg-[#0F0B07] transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={granting}
                  className="px-4 py-2 rounded-xl bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] transition-colors text-sm font-bold flex items-center gap-2"
                >
                  {granting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                  Grant Access
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false, orderId: null, action: null })}
        onConfirm={confirmAction}
        title={confirmModal.action === 'revoke' ? 'ยกเลิกสิทธิ์เข้าถึง' : 'คืนสิทธิ์เข้าถึง'}
        description={
          confirmModal.action === 'revoke' 
            ? 'คุณต้องการยกเลิกสิทธิ์เข้าถึงแพ็กเกจของผู้ใช้งานนี้ใช่หรือไม่?' 
            : 'คุณต้องการคืนสิทธิ์เข้าถึงแพ็กเกจให้ผู้ใช้งานนี้ใช่หรือไม่?'
        }
        confirmText="ยืนยัน"
        cancelText="ยกเลิก"
        isDestructive={confirmModal.action === 'revoke'}
      />
    </div>
  )
}
