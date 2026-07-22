import { requirePermission } from '@/lib/auth/server-protect'
import SupportSettingsClient from './SupportSettingsClient'
import { getSupportSettingsForAdmin } from './actions'

export default async function SupportSettingsPage() {
  await requirePermission('support.manage')
  const supportConfig = await getSupportSettingsForAdmin()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-display text-[#F5E9D6] tracking-tight">Support Sobdai</h1>
        <p className="text-[#A1866B] mt-1">จัดการ Support Card, QR Code และช่องทางสนับสนุน</p>
      </div>

      <SupportSettingsClient initial={supportConfig} />
    </div>
  )
}
