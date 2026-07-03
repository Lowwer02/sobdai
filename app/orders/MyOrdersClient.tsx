'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Package, Search, Filter, ShoppingBag, ChevronLeft, ExternalLink } from 'lucide-react'

interface Order {
  id: string
  package_id: string
  amount: number
  status: string
  payment_provider: string | null
  created_at: string
  packages: {
    name: string
    slug: string
    package_code: string
    logo_url: string | null
    is_published: boolean
    organizations: {
      name: string
      logo_url: string | null
    } | null
  } | null
}

interface OrdersClientProps {
  orders: Order[]
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  paid: { label: 'สำเร็จ', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  free: { label: 'ฟรี', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  pending: { label: 'รอดำเนินการ', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  failed: { label: 'ไม่สำเร็จ', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  refunded: { label: 'คืนเงินแล้ว', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  cancelled: { label: 'ยกเลิก', color: 'text-[#A1866B]', bg: 'bg-[rgba(255,255,255,0.03)]', border: 'border-[rgba(255,255,255,0.05)]' },
}

const FILTER_OPTIONS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'free', label: 'ฟรี' },
  { value: 'paid', label: 'ชำระเงิน' },
  { value: 'pending', label: 'รอดำเนินการ' },
  { value: 'failed', label: 'ไม่สำเร็จ' },
]

export default function MyOrdersClient({ orders }: OrdersClientProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // Search filter
      const q = searchQuery.toLowerCase().trim()
      if (q) {
        const pkgName = order.packages?.name?.toLowerCase() || ''
        const pkgCode = order.packages?.package_code?.toLowerCase() || ''
        if (!pkgName.includes(q) && !pkgCode.includes(q)) return false
      }

      // Status filter
      if (activeFilter === 'all') return true
      if (activeFilter === 'paid') return order.status === 'paid'
      return order.status === activeFilter
    })
  }, [orders, searchQuery, activeFilter])

  const getStatusConfig = (status: string) => {
    return STATUS_CONFIG[status] || { label: status, color: 'text-[#A1866B]', bg: 'bg-[rgba(255,255,255,0.03)]', border: 'border-[rgba(255,255,255,0.05)]' }
  }

  const getLogoUrl = (order: Order) => {
    return order.packages?.logo_url || order.packages?.organizations?.logo_url || null
  }

  return (
    <div className="min-h-screen font-sans pb-20" style={{ backgroundColor: '#0F0B07', color: '#F5E9D6' }}>
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-8 md:py-12">

        {/* Back Link */}
        <Link href="/" className="inline-flex items-center gap-2 text-[#A1866B] hover:text-[#D4AF37] transition-colors text-sm font-medium mb-8 group focus:outline-none focus:ring-2 focus:ring-[#D4AF37] rounded-lg px-2 py-1 -ml-2">
          <ChevronLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
          หน้าแรก
        </Link>

        {/* Header */}
        <header className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold font-display text-[#F5E9D6] tracking-tight mb-2">
            คำสั่งซื้อของฉัน
          </h1>
          <p className="text-[#A1866B] text-sm md:text-base">
            ดูประวัติการซื้อแพ็กเกจทั้งหมดของคุณ
          </p>
        </header>

        {/* Search & Filter Bar */}
        <div className="space-y-4 mb-8">
          {/* Search */}
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A1866B]" />
            <input
              type="text"
              placeholder="ค้นหาชื่อแพ็กเกจ หรือรหัสแพ็กเกจ..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#1A140E] border border-[rgba(255,255,255,0.08)] text-[#F5E9D6] rounded-xl pl-12 pr-4 py-3 text-sm focus:outline-none focus:border-[#D4AF37]/50 transition-colors placeholder:text-[#A1866B]/60"
              aria-label="ค้นหาคำสั่งซื้อ"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="กรองตามสถานะ">
            {FILTER_OPTIONS.map(option => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={activeFilter === option.value}
                onClick={() => setActiveFilter(option.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                  activeFilter === option.value
                    ? 'bg-[#D4AF37]/10 border-[#D4AF37]/30 text-[#D4AF37]'
                    : 'bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.05)] text-[#A1866B] hover:text-[#F5E9D6] hover:border-[rgba(255,255,255,0.1)]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Results Count */}
        <div className="text-xs text-[#A1866B] mb-4 font-medium">
          แสดง {filteredOrders.length} จาก {orders.length} รายการ
        </div>

        {/* Order Cards */}
        {filteredOrders.length > 0 ? (
          <div className="space-y-4">
            {filteredOrders.map(order => {
              const statusConfig = getStatusConfig(order.status)
              const logoUrl = getLogoUrl(order)
              const isFree = order.status === 'free' || order.amount === 0
              const isSuccess = order.status === 'paid' || order.status === 'free'
              const isAvailable = order.packages?.is_published !== false && order.packages?.slug

              return (
                <article
                  key={order.id}
                  className="bg-[#1A140E] border border-[rgba(255,255,255,0.06)] rounded-2xl p-5 md:p-6 hover:border-[rgba(212,175,55,0.15)] transition-colors"
                >
                  <div className="flex gap-4 items-start">
                    {/* Logo */}
                    <div className="w-14 h-14 md:w-16 md:h-16 rounded-xl bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] flex items-center justify-center p-2 flex-shrink-0 overflow-hidden">
                      {logoUrl ? (
                        <Image src={logoUrl} alt="" width={64} height={64} className="w-full h-full object-contain" />
                      ) : (
                        <Package size={24} className="text-[#A1866B]" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="min-w-0">
                          <h2 className="text-[15px] md:text-base font-bold text-[#F5E9D6] truncate leading-snug">
                            {order.packages?.name || 'แพ็กเกจที่ถูกลบ'}
                          </h2>
                          <p className="text-xs text-[#A1866B] mt-0.5">
                            {order.packages?.organizations?.name || ''} {order.packages?.package_code ? `• ${order.packages.package_code}` : ''}
                          </p>
                        </div>
                        {/* Status Badge */}
                        <span className={`flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${statusConfig.bg} ${statusConfig.color} ${statusConfig.border}`}>
                          {statusConfig.label}
                        </span>
                      </div>

                      {/* Details Row */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-xs text-[#A1866B]">
                        <span>
                          {new Date(order.created_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>

                        <span className="w-px h-3 bg-[rgba(255,255,255,0.08)]" />

                        {isFree ? (
                          <span className="text-emerald-400 font-bold">ฟรี</span>
                        ) : (
                          <span className="text-[#D4AF37] font-bold">฿{order.amount.toLocaleString()}</span>
                        )}

                        {order.payment_provider && order.payment_provider !== 'free' && (
                          <>
                            <span className="w-px h-3 bg-[rgba(255,255,255,0.08)]" />
                            <span className="capitalize">{order.payment_provider === 'omise' ? 'บัตรเครดิต' : order.payment_provider}</span>
                          </>
                        )}
                      </div>

                      {/* Action */}
                      {isSuccess && (
                        <div className="mt-4">
                          {isAvailable ? (
                            <Link
                              href={`/package/${order.packages!.slug}`}
                              className="inline-flex items-center gap-1.5 text-sm font-bold text-[#D4AF37] hover:text-[#F1D17A] transition-colors focus:outline-none focus:ring-2 focus:ring-[#D4AF37] rounded-lg px-1 -ml-1"
                              aria-label={`เปิดแพ็กเกจ ${order.packages!.name}`}
                            >
                              เปิดแพ็กเกจ
                              <ExternalLink size={14} />
                            </Link>
                          ) : (
                            <p className="text-xs text-[#A1866B] italic">
                              แพ็กเกจนี้ไม่สามารถใช้งานได้แล้ว
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          /* Empty State */
          <div className="bg-[#1A140E] border border-[rgba(255,255,255,0.06)] rounded-2xl p-10 md:p-16 text-center">
            <div className="w-16 h-16 rounded-full bg-[rgba(212,175,55,0.1)] flex items-center justify-center mx-auto mb-6">
              <ShoppingBag size={28} className="text-[#D4AF37]" />
            </div>
            <h3 className="text-lg font-bold text-[#F5E9D6] mb-2 font-display">
              {searchQuery || activeFilter !== 'all' ? 'ไม่พบคำสั่งซื้อที่ตรงกับเงื่อนไข' : 'ยังไม่มีคำสั่งซื้อ'}
            </h3>
            <p className="text-sm text-[#A1866B] mb-8 max-w-sm mx-auto">
              {searchQuery || activeFilter !== 'all' ? 'ลองค้นหาด้วยคำอื่น หรือเปลี่ยนตัวกรอง' : 'คุณยังไม่ได้ซื้อแพ็กเกจใดๆ เริ่มต้นเรียนรู้ได้เลยวันนี้'}
            </p>
            {!searchQuery && activeFilter === 'all' && (
              <Link
                href="/#exams"
                className="inline-flex items-center gap-2 bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] font-bold px-6 py-3 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] shadow-[0_0_20px_rgba(212,175,55,0.2)] focus:outline-none focus:ring-4 focus:ring-[#D4AF37]/50"
              >
                <Package size={18} />
                เลือกแพ็กเกจ
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
