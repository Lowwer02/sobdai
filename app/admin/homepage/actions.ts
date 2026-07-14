'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/auth/server-protect'
import { getHomepageSettings, normalizeHomepageSettings } from '@/lib/homepageConfig'

/**
 * Save the homepage_settings singleton.
 *
 * The form sends a plain object per group (general/hero/cta/sections/seo) plus
 * the features/howto arrays. We run it through `normalizeHomepageSettings`
 * BEFORE persisting so only validated, typed data is ever stored — never
 * free-form JSON. This keeps the DB clean and the render safe.
 */
export async function saveHomepageSettings(raw: any) {
  const { supabase } = await requirePermission('content.write')

  // Validate + coerce first; reject if normalization yields nothing usable.
  const clean = normalizeHomepageSettings(raw)

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
