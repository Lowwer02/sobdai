import { requirePermission } from '@/lib/auth/server-protect'
import { getPaymentSettingsForAdmin } from './actions'
import PaymentSettingsClient from './PaymentSettingsClient'

export default async function PaymentSettingsPage() {
  await requirePermission('financial.manage')
  const settings = await getPaymentSettingsForAdmin()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-display text-[#F5E9D6] tracking-tight">Payment Settings</h1>
        <p className="text-[#A1866B] mt-1">ตั้งค่าผู้รับเงิน PromptPay สำหรับคำสั่งซื้อแบบชำระเงิน</p>
      </div>

      <PaymentSettingsClient initial={settings} />
    </div>
  )
}
