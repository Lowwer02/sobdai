'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { Exam } from '@/lib/types'

interface CheckoutClientProps {
  exam: Exam
  userEmail: string
}

function ShieldIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  )
}

function CreditCardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
      <line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  )
}

function PromptPayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
      <line x1="14" y1="14" x2="14" y2="14"/><line x1="21" y1="14" x2="21" y2="14"/>
      <line x1="14" y1="21" x2="14" y2="21"/><line x1="21" y1="21" x2="21" y2="21"/>
    </svg>
  )
}

declare global {
  interface Window { OmiseCard: any }
}

export default function CheckoutClient({ exam, userEmail }: CheckoutClientProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [omiseLoaded, setOmiseLoaded] = useState(false)
  const [payMethod, setPayMethod] = useState<'card' | 'promptpay'>('card')

  // Load Omise.js
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://cdn.omise.co/omise.js'
    script.onload = () => setOmiseLoaded(true)
    document.head.appendChild(script)
    return () => { document.head.removeChild(script) }
  }, [])

  const handleCardPayment = () => {
    if (!omiseLoaded || !window.OmiseCard) {
      setError('กำลังโหลดระบบชำระเงิน กรุณารอสักครู่')
      return
    }

    setError('')
    window.OmiseCard.configure({
      publicKey: process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY,
    })

    window.OmiseCard.open({
      frameLabel: 'สอบได้',
      amount: exam.price * 100,
      currency: 'THB',
      defaultPaymentMethod: 'credit_card',
      submitLabel: `ชำระ ฿${exam.price.toLocaleString()}`,
      onCreateTokenSuccess: async (token: string) => {
        setLoading(true)
        try {
          const res = await fetch('/api/payment/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ examId: exam.id, token }),
          })
          const data = await res.json()
          if (data.success) {
            router.push(`/quiz/${exam.id}?success=1`)
          } else {
            setError(data.error || 'การชำระเงินไม่สำเร็จ')
          }
        } catch {
          setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
        } finally {
          setLoading(false)
        }
      },
      onFormClosed: () => setLoading(false),
    })
  }

  return (
    <div style={{ maxWidth: '520px', margin: '40px auto', padding: '0 20px 80px' }}>
      {/* Order Summary */}
      <div className="card" style={{ padding: '28px', marginBottom: '16px' }}>
        <h2 className="font-display" style={{ fontSize: '18px', marginBottom: '20px', color: 'var(--text-secondary)' }}>
          สรุปคำสั่งซื้อ
        </h2>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
            {exam.department}
          </div>
          <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>
            {exam.position}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            {exam.subject} · {exam.total_questions} ข้อ · ปี {exam.year}
          </div>
        </div>

        <div className="divider" />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-secondary)' }}>ราคา</span>
          <span className="font-display" style={{ fontSize: '24px', color: 'var(--gold-light)' }}>
            ฿{exam.price.toLocaleString()}
          </span>
        </div>

        <div
          style={{
            marginTop: '12px',
            padding: '10px 14px',
            background: 'var(--green-tint)',
            border: '1px solid rgba(45, 122, 79, 0.2)',
            borderRadius: 10,
            fontSize: '12.5px',
            color: 'var(--green-light)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <ShieldIcon />
          ซื้อขาด ใช้ได้ 1 ปี นับจากวันซื้อ
        </div>
      </div>

      {/* Payment Methods */}
      <div className="card" style={{ padding: '28px' }}>
        <h3 className="font-display" style={{ fontSize: '16px', marginBottom: '16px', color: 'var(--text-secondary)' }}>
          เลือกวิธีชำระเงิน
        </h3>

        {/* Method selector */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          {[
            { id: 'card', label: 'บัตรเครดิต/เดบิต', icon: <CreditCardIcon /> },
            { id: 'promptpay', label: 'PromptPay', icon: <PromptPayIcon /> },
          ].map((m) => (
            <button
              key={m.id}
              onClick={() => setPayMethod(m.id as 'card' | 'promptpay')}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: 10,
                border: `1.5px solid ${payMethod === m.id ? 'var(--gold-muted)' : 'var(--border-card)'}`,
                background: payMethod === m.id ? 'var(--gold-tint)' : 'var(--bg-input)',
                color: payMethod === m.id ? 'var(--gold-light)' : 'var(--text-muted)',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12.5px',
                fontFamily: "'Sarabun', sans-serif",
              }}
            >
              {m.icon}
              {m.label}
            </button>
          ))}
        </div>

        {error && (
          <div
            style={{
              background: 'var(--wrong-bg)',
              border: '1px solid rgba(224, 92, 92, 0.25)',
              borderRadius: 10,
              padding: '10px 14px',
              marginBottom: '16px',
              fontSize: '13.5px',
              color: 'var(--wrong)',
            }}
          >
            {error}
          </div>
        )}

        <button
          id="btn-pay"
          className="btn-primary"
          onClick={handleCardPayment}
          disabled={loading || !omiseLoaded}
          style={{
            width: '100%',
            padding: '14px',
            fontSize: '16px',
            opacity: loading || !omiseLoaded ? 0.6 : 1,
            cursor: loading || !omiseLoaded ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'กำลังดำเนินการ...' : `ชำระเงิน ฿${exam.price.toLocaleString()}`}
        </button>

        <p style={{ textAlign: 'center', fontSize: '11.5px', color: 'var(--text-faint)', marginTop: '14px', lineHeight: 1.65 }}>
          ปลอดภัยด้วย Omise — PCI DSS Level 1
          <br />
          ไม่เก็บข้อมูลบัตรบนเซิร์ฟเวอร์
        </p>
      </div>
    </div>
  )
}
