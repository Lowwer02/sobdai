'use client'

import { useState, useTransition } from 'react'
import { Loader2, QrCode, Save } from 'lucide-react'
import { toastEvent } from '@/hooks/useToast'
import {
  previewPaymentSettingsQr,
  savePaymentSettings,
  type SavePaymentSettingsInput,
} from './actions'
import type { PaymentSettingsAdminView } from '@/lib/payment/payment-settings'

const inputClass = 'w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.08)] text-[#F5E9D6] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#D4AF37]/50 transition-colors'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-[#A1866B] font-bold uppercase block">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-[#A1866B] leading-relaxed">{hint}</p>}
    </div>
  )
}

export default function PaymentSettingsClient({ initial }: { initial: PaymentSettingsAdminView }) {
  const [settings, setSettings] = useState(initial)
  const [recipientIdentifier, setRecipientIdentifier] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const update = <K extends keyof PaymentSettingsAdminView>(key: K, value: PaymentSettingsAdminView[K]) => {
    setSettings((current) => ({ ...current, [key]: value }))
    setIsDirty(true)
  }

  const handleSave = () => {
    const input: SavePaymentSettingsInput = {
      enabled: settings.enabled,
      recipientIdentifier,
      displayName: settings.displayName,
      instructionText: settings.instructionText,
    }

    startTransition(async () => {
      const result = await savePaymentSettings(input)
      if (!result.success) {
        toastEvent(result.error, 'error')
        return
      }

      setSettings(result.settings)
      setRecipientIdentifier('')
      setIsDirty(false)
      setPreviewUrl(null)
      toastEvent('บันทึกการตั้งค่า PromptPay เรียบร้อย', 'success')
    })
  }

  const handlePreview = () => {
    startTransition(async () => {
      const result = await previewPaymentSettingsQr()
      if (!result.success) {
        toastEvent(result.error, 'error')
        return
      }
      setPreviewUrl(result.dataUrl)
    })
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-5">
        <div>
          <h2 className="text-[#D4AF37] font-bold font-display">Manual PromptPay</h2>
          <p className="text-sm text-[#A1866B] mt-1">ใช้เฉพาะ QR สำหรับคำสั่งซื้อที่สร้างจากระบบเท่านั้น</p>
        </div>

        <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl bg-[#0F0B07] border border-[rgba(255,255,255,0.05)]">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(event) => update('enabled', event.target.checked)}
            className="w-4 h-4 accent-[#D4AF37]"
          />
          <span className="text-sm text-[#F5E9D6]">เปิดใช้งานการรับชำระ PromptPay</span>
        </label>

        <Field label="ประเภทผู้รับ">
          <div className={`${inputClass} text-[#A1866B]`}>E-Wallet ID</div>
        </Field>

        <Field
          label="PromptPay Recipient ID"
          hint="ปัจจุบัน: เว้นว่างเพื่อคงค่าเดิม หรือกรอก E-Wallet ID ใหม่ 15 หลักเพื่อแทนที่ ค่าเดิมจะไม่ถูกเติมลงใน HTML"
        >
          <div className="space-y-2">
            <div className="text-sm text-[#F5E9D6] bg-[#0F0B07] border border-[rgba(255,255,255,0.08)] rounded-xl px-3 py-2.5">
              {settings.maskedRecipient}
            </div>
            <input
              className={inputClass}
              value={recipientIdentifier}
              onChange={(event) => {
                setRecipientIdentifier(event.target.value)
                setIsDirty(true)
              }}
              placeholder="กรอกค่าใหม่ 15 หลัก (ไม่บังคับ)"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </Field>

        <Field label="ชื่อผู้รับที่แสดง">
          <input
            className={inputClass}
            value={settings.displayName}
            onChange={(event) => update('displayName', event.target.value)}
            placeholder="เช่น Sobdai"
          />
        </Field>

        <Field label="คำแนะนำการชำระเงิน">
          <textarea
            className={inputClass}
            rows={4}
            value={settings.instructionText}
            onChange={(event) => update('instructionText', event.target.value)}
            placeholder="เช่น สแกน QR แล้วโอนตามยอดคำสั่งซื้อ"
          />
        </Field>

        <div className="rounded-xl border border-[#D4AF37]/15 bg-[#0F0B07] p-4 text-sm text-[#A1866B] leading-relaxed">
          การเปลี่ยนผู้รับเงินจะถูกป้องกันขณะมีคำสั่งซื้อ PromptPay ที่รอชำระอยู่ ส่วนการปิดใช้งานจะไม่ยกเลิกคำสั่งซื้อเดิม แต่จะหยุดการสร้าง QR และคำสั่งซื้อใหม่ชั่วคราว
        </div>
      </section>

      <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[#D4AF37] font-bold font-display">QR Preview</h2>
            <p className="text-sm text-[#A1866B] mt-1">QR ทดสอบ ฿1.00 — ใช้ helper เดียวกับ Checkout</p>
          </div>
          <button
            type="button"
            onClick={handlePreview}
            disabled={isPending}
            className="flex items-center gap-2 rounded-xl border border-[#D4AF37]/30 px-4 py-2 text-sm font-semibold text-[#D4AF37] disabled:opacity-50"
          >
            {isPending ? <Loader2 size={16} className="animate-spin" /> : <QrCode size={16} />}
            สร้าง QR ทดสอบ
          </button>
        </div>

        {previewUrl ? (
          <div className="flex flex-col items-center gap-4 rounded-xl bg-white p-5">
            <img src={previewUrl} alt="QR ทดสอบ ฿1.00" width={256} height={256} className="h-64 w-64" />
            <div className="text-center text-sm text-slate-700">
              <p className="font-bold">สแกนด้วยแอปธนาคาร</p>
              <p>ตรวจสอบชื่อผู้รับและยอด ฿1.00 ให้ถูกต้อง ไม่จำเป็นต้องโอนเงินจริง</p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-[#A1866B]">
            บันทึกการตั้งค่าก่อน แล้วกดสร้าง QR ทดสอบเพื่อยืนยันชื่อผู้รับและยอด
          </div>
        )}
      </section>

      <div className="sticky bottom-4 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || !isDirty}
          className="bg-[#D4AF37] hover:bg-[#F1D17A] disabled:opacity-50 text-[#1A140E] font-bold px-6 py-3 rounded-xl flex items-center gap-2 transition-colors"
        >
          {isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          บันทึก
        </button>
      </div>
    </div>
  )
}
