'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/auth/server-protect'
import { getHomepageSettings, normalizeHomepageSettings, HOMEPAGE_DEFAULTS } from '@/lib/homepageConfig'
import type { SupportConfig } from '@/lib/homepageConfig'

/**
 * Save only the Support configuration to extended_config.support.
 *
 * This is the dedicated save action for the Support admin page.
 * It reads the existing extended_config, merges the support key, and writes
 * back — preserving any other keys in extended_config.
 *
 * The homepage core fields (general/hero/cta/etc.) are NOT touched.
 */
export async function saveSupportSettings(supportInput: SupportConfig) {
  const { supabase } = await requirePermission('support.manage')

  // Validate through the normalizer by wrapping in the expected shape.
  // The normalizer checks raw.support first (top-level), which is what we pass.
  const clean = normalizeHomepageSettings({ support: supportInput })

  // Read the current extended_config so we merge without clobbering other keys.
  const { data: existing } = await supabase
    .from('homepage_settings')
    .select('extended_config')
    .eq('id', 1)
    .single()

  const existingExt = (existing?.extended_config && typeof existing.extended_config === 'object')
    ? existing.extended_config
    : {}

  const mergedExtendedConfig = {
    ...existingExt,
    support: clean.support,
  }

  const { error } = await supabase
    .from('homepage_settings')
    .update({ extended_config: mergedExtendedConfig })
    .eq('id', 1)

  if (error) {
    return { success: false, error: error.message }
  }

  // Revalidate all paths that consume support config
  revalidatePath('/')
  revalidatePath('/package', 'layout')
  return { success: true }
}

/** Read the current Support config for the admin page. */
export async function getSupportSettingsForAdmin(): Promise<SupportConfig> {
  const { supabase } = await requirePermission('support.manage')
  const settings = await getHomepageSettings(supabase)
  return settings.support
}
