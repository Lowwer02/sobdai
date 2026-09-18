'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/auth/server-protect'
import {
  PAYMENT_RECIPIENT_CHANGE_ERROR,
  PAYMENT_SETTINGS_MAX_DISPLAY_NAME_LENGTH,
  PAYMENT_SETTINGS_MAX_INSTRUCTION_LENGTH,
  PAYMENT_SETTINGS_UNAVAILABLE_ERROR,
  normalizeSettingsText,
  readPaymentSettings,
  toPaymentSettingsAdminView,
  type PaymentSettingsAdminView,
} from '@/lib/payment/payment-settings'
import { normalizeEWalletRecipient, renderPromptPayQr } from '@/lib/payment/promptpay'

export type SavePaymentSettingsInput = {
  enabled: boolean
  recipientIdentifier: string
  displayName: string
  instructionText: string
}

export type SavePaymentSettingsResult =
  | { success: true; settings: PaymentSettingsAdminView }
  | { success: false; error: string }

export async function getPaymentSettingsForAdmin(): Promise<PaymentSettingsAdminView> {
  const { supabase } = await requirePermission('financial.manage')
  const settings = await readPaymentSettings(supabase)

  if (!settings) {
    return {
      enabled: false,
      recipientType: 'ewallet',
      maskedRecipient: 'ยังไม่ได้ตั้งค่า',
      configured: false,
      displayName: '',
      instructionText: '',
    }
  }

  return toPaymentSettingsAdminView(settings)
}

export async function savePaymentSettings(input: SavePaymentSettingsInput): Promise<SavePaymentSettingsResult> {
  const { supabase } = await requirePermission('financial.manage')

  if (!input || typeof input.enabled !== 'boolean') {
    return { success: false, error: 'ข้อมูลการตั้งค่าไม่ถูกต้อง' }
  }

  const displayName = normalizeSettingsText(input.displayName, PAYMENT_SETTINGS_MAX_DISPLAY_NAME_LENGTH)
  const instructionText = normalizeSettingsText(input.instructionText, PAYMENT_SETTINGS_MAX_INSTRUCTION_LENGTH)

  if (displayName === null || instructionText === null) {
    return { success: false, error: 'ชื่อผู้รับหรือคำแนะนำยาวเกินกำหนดหรือมีอักขระที่ไม่รองรับ' }
  }

  let current
  try {
    current = await readPaymentSettings(supabase)
  } catch (error) {
    console.error('[PAYMENT] admin settings read failed:', error instanceof Error ? error.message : 'unknown error')
    return { success: false, error: PAYMENT_SETTINGS_UNAVAILABLE_ERROR }
  }

  if (!current) {
    return { success: false, error: PAYMENT_SETTINGS_UNAVAILABLE_ERROR }
  }

  let recipientIdentifier = current.recipient_identifier
  if (input.recipientIdentifier !== '') {
    try {
      // Do not trim or reformat this value: an explicit replacement must be
      // exactly the supported 15-digit E-Wallet identifier.
      recipientIdentifier = normalizeEWalletRecipient(input.recipientIdentifier)
    } catch {
      return { success: false, error: 'PromptPay E-Wallet ID ต้องเป็นตัวเลข 15 หลัก' }
    }
  }

  if (input.enabled && !/^\d{15}$/.test(recipientIdentifier)) {
    return { success: false, error: 'กรุณาระบุ PromptPay E-Wallet ID 15 หลักก่อนเปิดใช้งาน' }
  }

  const { data: updatedRows, error } = await supabase.rpc('update_payment_settings', {
    p_enabled: input.enabled,
    p_recipient_identifier: recipientIdentifier,
    p_display_name: displayName,
    p_instruction_text: instructionText,
  })

  if (error) {
    if (error.message.includes(PAYMENT_RECIPIENT_CHANGE_ERROR)) {
      return { success: false, error: PAYMENT_RECIPIENT_CHANGE_ERROR }
    }

    if (error.message.includes('E-Wallet ID')) {
      return { success: false, error: 'PromptPay E-Wallet ID ต้องเป็นตัวเลข 15 หลัก' }
    }

    console.error('[PAYMENT] admin settings update failed:', error.code || 'unknown')
    return { success: false, error: 'ไม่สามารถบันทึกการตั้งค่า PromptPay ได้' }
  }

  revalidatePath('/admin/payment')

  const updated = Array.isArray(updatedRows) ? updatedRows[0] : updatedRows

  return {
    success: true,
    settings: toPaymentSettingsAdminView({
      ...current,
      enabled: updated?.enabled ?? input.enabled,
      recipient_type: updated?.recipient_type ?? 'ewallet',
      recipient_identifier: updated?.recipient_identifier ?? recipientIdentifier,
      display_name: updated?.display_name ?? displayName,
      instruction_text: updated?.instruction_text ?? instructionText,
      updated_by: updated?.updated_by ?? current.updated_by,
    }),
  }
}

export async function previewPaymentSettingsQr(): Promise<{ success: true; dataUrl: string } | { success: false; error: string }> {
  const { supabase } = await requirePermission('financial.manage')

  try {
    const settings = await readPaymentSettings(supabase)
    if (!settings) {
      return { success: false, error: PAYMENT_SETTINGS_UNAVAILABLE_ERROR }
    }

    // Preview is deliberately allowed while the switch is off, so an
    // authorized financial manager can verify a newly saved recipient before
    // enabling checkout. It still requires the same exact E-Wallet shape.
    const recipient = normalizeEWalletRecipient(settings.recipient_identifier)
    const rendered = await renderPromptPayQr(recipient, '1.00')
    return { success: true, dataUrl: rendered.dataUrl }
  } catch (error) {
    console.error('[PAYMENT] payment settings preview failed:', error instanceof Error ? error.message : 'unknown error')
    return { success: false, error: 'ไม่สามารถสร้าง QR ทดสอบได้ กรุณาตรวจสอบการตั้งค่า' }
  }
}
