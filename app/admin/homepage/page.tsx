import { requirePermission } from '@/lib/auth/server-protect'
import HomepageSettingsClient from './HomepageSettingsClient'
import { getHomepageSettingsForAdmin } from './actions'

export default async function HomepageSettingsPage() {
  await requirePermission('content.write')
  const settings = await getHomepageSettingsForAdmin()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-display text-[#F5E9D6] tracking-tight">ตั้งค่าหน้าแรก</h1>
        <p className="text-[#A1866B] mt-1">แก้ไขเนื้อหาและการแสดงผลของหน้าแรกโดยไม่ต้อง Deploy</p>
      </div>

      <HomepageSettingsClient initial={settings} />
    </div>
  )
}
