'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/auth/server-protect'
import { getHomepageSettings, type FooterSocialLink } from '@/lib/homepageConfig'
import {
  normalizeSocialFollowConfig,
  type SocialFollowConfig,
} from '@/lib/socialFollowConfig'

/**
 * Reads Social Follow config and master social links for the Admin UI.
 * Reuses getHomepageSettings to avoid redundant DB calls.
 */
export async function getSocialFollowSettingsForAdmin(): Promise<{
  socialFollow: SocialFollowConfig
  socialLinks: FooterSocialLink[]
}> {
  const { supabase } = await requirePermission('content.write')
  const settings = await getHomepageSettings(supabase)
  return {
    socialFollow: settings.social_follow,
    socialLinks: settings.footer.social_links,
  }
}

/**
 * Saves the Social Follow configuration to extended_config.social_follow.
 * Merges over existing extended_config keys so support, package_explorer,
 * footer, etc., are preserved intact.
 */
export async function saveSocialFollowSettings(
  input: SocialFollowConfig
): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requirePermission('content.write')

  const cleanConfig = normalizeSocialFollowConfig(input)

  const { data: existing } = await supabase
    .from('homepage_settings')
    .select('extended_config')
    .eq('id', 1)
    .single()

  const existingExt =
    existing?.extended_config && typeof existing.extended_config === 'object'
      ? existing.extended_config
      : {}

  const mergedExtendedConfig = {
    ...existingExt,
    social_follow: cleanConfig,
  }

  const { error } = await supabase
    .from('homepage_settings')
    .update({ extended_config: mergedExtendedConfig })
    .eq('id', 1)

  if (error) {
    return { success: false, error: error.message }
  }

  // Revalidate Admin UI and public routes consuming homepage/social config
  revalidatePath('/admin/social-follow')
  revalidatePath('/')
  revalidatePath('/news', 'layout')

  return { success: true }
}
