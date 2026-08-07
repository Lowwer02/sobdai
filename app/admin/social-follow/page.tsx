import { requirePermission } from '@/lib/auth/server-protect'
import { getHomepageSettings } from '@/lib/homepageConfig'
import SocialFollowSettingsClient from './SocialFollowSettingsClient'

export default async function SocialFollowPage() {
  await requirePermission('content.write')
  const settings = await getHomepageSettings()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold font-display text-[#F5E9D6] tracking-tight">
          Social Follow Settings
        </h1>
        <p className="text-[#A1866B] mt-1">
          จัดการการแสดงผลกล่องติดตามโซเชียลมีเดีย Sobdai
        </p>
      </div>

      <SocialFollowSettingsClient
        initialSocialFollow={settings.social_follow}
        globalSocialLinks={settings.footer.social_links}
      />
    </div>
  )
}
