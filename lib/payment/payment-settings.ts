import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeEWalletRecipient } from './promptpay'

export const PAYMENT_SETTINGS_ID = 1
export const PAYMENT_SETTINGS_UNAVAILABLE_ERROR = 'ขณะนี้การชำระเงินผ่าน PromptPay ไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง'
export const PAYMENT_RECIPIENT_CHANGE_ERROR = 'ยังมีคำสั่งซื้อ PromptPay ที่รอชำระอยู่ กรุณาจัดการคำสั่งซื้อเหล่านั้นก่อนเปลี่ยนผู้รับเงิน'

export const PAYMENT_SETTINGS_MAX_DISPLAY_NAME_LENGTH = 120
export const PAYMENT_SETTINGS_MAX_INSTRUCTION_LENGTH = 1000

export type PaymentSettingsRow = {
  id: number
  enabled: boolean
  recipient_type: 'ewallet'
  recipient_identifier: string
  display_name: string
  instruction_text: string
  updated_by?: string | null
}

export type PaymentSettingsAdminView = {
  enabled: boolean
  recipientType: 'ewallet'
  maskedRecipient: string
  configured: boolean
  displayName: string
  instructionText: string
}

export type PaymentSettingsQrView = {
  recipient: string
  displayName: string
  instructionText: string
}

export function maskPaymentRecipient(value: string): string {
  if (!value) return 'ยังไม่ได้ตั้งค่า'
  return `•••••••••••${value.slice(-4)}`
}

export function toPaymentSettingsAdminView(row: PaymentSettingsRow): PaymentSettingsAdminView {
  const configured = /^\d{15}$/.test(row.recipient_identifier)

  return {
    enabled: row.enabled,
    recipientType: 'ewallet',
    maskedRecipient: maskPaymentRecipient(row.recipient_identifier),
    configured,
    displayName: row.display_name,
    instructionText: row.instruction_text,
  }
}

export function toPaymentSettingsQrView(row: PaymentSettingsRow | null): PaymentSettingsQrView | null {
  if (!row || !row.enabled || row.recipient_type !== 'ewallet') return null

  try {
    return {
      recipient: normalizeEWalletRecipient(row.recipient_identifier),
      displayName: row.display_name,
      instructionText: row.instruction_text,
    }
  } catch {
    return null
  }
}

export async function readPaymentSettings(client: SupabaseClient): Promise<PaymentSettingsRow | null> {
  const { data, error } = await client
    .from('payment_settings')
    .select('id, enabled, recipient_type, recipient_identifier, display_name, instruction_text, updated_by')
    .eq('id', PAYMENT_SETTINGS_ID)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  return {
    id: Number(data.id),
    enabled: Boolean(data.enabled),
    recipient_type: data.recipient_type as 'ewallet',
    recipient_identifier: String(data.recipient_identifier ?? ''),
    display_name: String(data.display_name ?? ''),
    instruction_text: String(data.instruction_text ?? ''),
    updated_by: data.updated_by ?? null,
  }
}

export function normalizeSettingsText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null

  const normalized = value.trim()
  if (normalized.length > maxLength) return null
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(normalized)) return null
  return normalized
}
