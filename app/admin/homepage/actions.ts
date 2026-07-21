'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/auth/server-protect'
import { getHomepageSettings, normalizeHomepageSettings } from '@/lib/homepageConfig'

/**
 * Save the homepage_settings singleton.
 *
 * Core fields (general/hero/cta/sections/seo/features/howto) are saved directly.
 * Support config lives under extended_config.support — we read the existing
 * extended_config row first, merge only the support key, then update so any
 * other extended_config data is preserved.
 */
export async function saveHomepageSettings(raw: any) {
  const { supabase } = await requirePermission('content.write')

  // Validate + coerce first; reject if normalization yields nothing usable.
  const clean = normalizeHomepageSettings(raw)

  // Read the current extended_config so we can merge support into it without
  // clobbering any future keys that may be stored there.
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
    support: {
      enabled: clean.support.enabled,
      title: clean.support.title,
      description: clean.support.description,
      button_label: clean.support.button_label,
    },
  }

  const { error } = await supabase
    .from('homepage_settings')
    .update({
      general: clean.general,
      hero: clean.hero,
      cta: clean.cta,
      sections: clean.sections,
      seo: clean.seo,
      features: clean.features,
      howto: clean.howto,
      extended_config: mergedExtendedConfig,
    })
    .eq('id', 1)

  if (error) {
    return { success: false, error: error.message }
  }

  // Refresh the ISR cache so the homepage reflects the change within its
  // revalidate window (immediately for the next request).
  revalidatePath('/')
  return { success: true }
}

/** Admin-only read (uses the admin session client, not the anon ISR client). */
export async function getHomepageSettingsForAdmin() {
  const { supabase } = await requirePermission('content.write')
  return getHomepageSettings(supabase)
}
