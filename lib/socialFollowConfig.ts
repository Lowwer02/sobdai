export type SocialPlatformKey =
  | 'facebook'
  | 'line'
  | 'tiktok'

export type SocialFollowPlacementKey =
  | 'news_detail_end'
  | 'news_list_banner'
  | 'exam_result'
  | 'dashboard'
  | 'mobile_floating'

export interface SocialFollowPlacementConfig {
  enabled: boolean
  heading: string
  description: string
  platforms: SocialPlatformKey[]
  button_labels: Partial<Record<SocialPlatformKey, string>>
}

export interface SocialFollowConfig {
  enabled: boolean
  placements: Record<
    SocialFollowPlacementKey,
    SocialFollowPlacementConfig
  >
}

export interface SocialChannelSource {
  key: SocialPlatformKey
  label: string
  url: string
  active: boolean
}

export interface ResolvedSocialChannel {
  key: SocialPlatformKey
  label: string
  url: string
  button_label: string
}

export const SOCIAL_FOLLOW_DEFAULTS: SocialFollowConfig = {
  enabled: false,
  placements: {
    news_detail_end: {
      enabled: false,
      heading: 'ไม่อยากพลาดข่าวเปิดสอบใหม่?',
      description:
        'ติดตาม Sobdai เพื่อรับข่าวสมัครสอบ กำหนดการ และเนื้อหาสำคัญสำหรับคนเตรียมสอบราชการ',
      platforms: ['facebook', 'line', 'tiktok'],
      button_labels: {
        facebook: 'ติดตาม Facebook',
        line: 'เพิ่มเพื่อน LINE OA',
        tiktok: 'ติดตาม TikTok',
      },
    },

    news_list_banner: {
      enabled: false,
      heading: 'ติดตามข่าวสอบราชการทุกวัน',
      description:
        'รับข่าวเปิดสอบ ประกาศผล และกำหนดการสำคัญจาก Sobdai',
      platforms: ['facebook', 'line', 'tiktok'],
      button_labels: {
        facebook: 'ติดตาม Facebook',
        line: 'เพิ่มเพื่อน LINE OA',
        tiktok: 'ติดตาม TikTok',
      },
    },

    exam_result: {
      enabled: false,
      heading: 'ฝึกข้อสอบต่อกับ Sobdai',
      description:
        'ติดตามข้อสอบสั้น เทคนิคจำ และเนื้อหาสำหรับคนเตรียมสอบราชการ',
      platforms: ['facebook', 'line', 'tiktok'],
      button_labels: {
        facebook: 'ติดตาม Facebook',
        line: 'เพิ่มเพื่อน LINE OA',
        tiktok: 'ติดตาม TikTok',
      },
    },

    dashboard: {
      enabled: false,
      heading: 'เรียนต่อกับ Sobdai ทุกวัน',
      description:
        'ติดตามข่าวสอบ ข้อสอบรายวัน และเทคนิคเตรียมสอบเพิ่มเติม',
      platforms: ['facebook', 'line', 'tiktok'],
      button_labels: {
        facebook: 'ติดตาม Facebook',
        line: 'เพิ่มเพื่อน LINE OA',
        tiktok: 'ติดตาม TikTok',
      },
    },

    mobile_floating: {
      enabled: false,
      heading: 'ติดตาม Sobdai',
      description: 'ไม่พลาดข่าวสอบและเนื้อหาใหม่',
      platforms: ['facebook', 'line', 'tiktok'],
      button_labels: {
        facebook: 'ติดตาม Facebook',
        line: 'เพิ่มเพื่อน LINE OA',
        tiktok: 'ติดตาม TikTok',
      },
    },
  },
}

// ─── Defensive Normalizer ───────────────────────────────────────────────────

const CANONICAL_PLACEMENTS: SocialFollowPlacementKey[] = [
  'news_detail_end',
  'news_list_banner',
  'exam_result',
  'dashboard',
  'mobile_floating',
]

const ALLOWED_PLATFORMS: SocialPlatformKey[] = ['facebook', 'line', 'tiktok']

function copyDefaults(): SocialFollowConfig {
  const placements = {} as Record<SocialFollowPlacementKey, SocialFollowPlacementConfig>
  for (const key of CANONICAL_PLACEMENTS) {
    const defP = SOCIAL_FOLLOW_DEFAULTS.placements[key]
    placements[key] = {
      enabled: defP.enabled,
      heading: defP.heading,
      description: defP.description,
      platforms: [...defP.platforms],
      button_labels: { ...defP.button_labels },
    }
  }
  return {
    enabled: SOCIAL_FOLLOW_DEFAULTS.enabled,
    placements,
  }
}

function cleanString(v: unknown, fallback: string, maxLen: number): string {
  if (typeof v !== 'string') return fallback
  const trimmed = v.trim()
  if (trimmed.length === 0) return fallback
  return trimmed.slice(0, maxLen)
}

function cleanLabel(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const trimmed = v.trim()
  if (trimmed.length === 0) return null
  return trimmed.slice(0, 80)
}

/**
 * Coerces and normalizes raw input into a safe SocialFollowConfig object.
 * Never throws, never mutates raw input or defaults.
 */
export function normalizeSocialFollowConfig(raw: unknown): SocialFollowConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return copyDefaults()
  }

  const r = raw as Record<string, any>
  const enabled = typeof r.enabled === 'boolean' ? r.enabled : SOCIAL_FOLLOW_DEFAULTS.enabled
  const rawPlacements = typeof r.placements === 'object' && r.placements !== null && !Array.isArray(r.placements)
    ? r.placements
    : null

  const placements = {} as Record<SocialFollowPlacementKey, SocialFollowPlacementConfig>

  for (const key of CANONICAL_PLACEMENTS) {
    const defP = SOCIAL_FOLLOW_DEFAULTS.placements[key]
    const rawP = rawPlacements && typeof rawPlacements[key] === 'object' && rawPlacements[key] !== null && !Array.isArray(rawPlacements[key])
      ? rawPlacements[key]
      : null

    if (!rawP) {
      placements[key] = {
        enabled: defP.enabled,
        heading: defP.heading,
        description: defP.description,
        platforms: [...defP.platforms],
        button_labels: { ...defP.button_labels },
      }
      continue
    }

    const pEnabled = typeof rawP.enabled === 'boolean' ? rawP.enabled : defP.enabled
    const heading = cleanString(rawP.heading, defP.heading, 120)
    const description = cleanString(rawP.description, defP.description, 500)

    let platforms: SocialPlatformKey[]
    if (Array.isArray(rawP.platforms)) {
      const seen = new Set<SocialPlatformKey>()
      platforms = []
      for (const p of rawP.platforms) {
        if (typeof p === 'string' && ALLOWED_PLATFORMS.includes(p as SocialPlatformKey)) {
          const keyP = p as SocialPlatformKey
          if (!seen.has(keyP)) {
            seen.add(keyP)
            platforms.push(keyP)
          }
        }
      }
    } else {
      platforms = [...defP.platforms]
    }

    let button_labels: Partial<Record<SocialPlatformKey, string>>
    if (typeof rawP.button_labels === 'object' && rawP.button_labels !== null && !Array.isArray(rawP.button_labels)) {
      button_labels = {}
      for (const pKey of ALLOWED_PLATFORMS) {
        const val = rawP.button_labels[pKey]
        const fallback = defP.button_labels[pKey] || ''
        const cleaned = cleanString(val, fallback, 80)
        if (cleaned) {
          button_labels[pKey] = cleaned
        }
      }
    } else {
      button_labels = { ...defP.button_labels }
    }

    placements[key] = {
      enabled: pEnabled,
      heading,
      description,
      platforms,
      button_labels,
    }
  }

  return {
    enabled,
    placements,
  }
}

// ─── HTTP URL Normalizer ────────────────────────────────────────────────────

/**
 * Normalizes and validates an HTTP/HTTPS social link URL.
 * Returns trimmed original URL if valid, or null if invalid.
 */
export function normalizeSocialHttpUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    if (!parsed.hostname || parsed.hostname.length === 0) {
      return null
    }
    return trimmed
  } catch {
    return null
  }
}

// ─── Only Channel Resolver ──────────────────────────────────────────────────

/**
 * Resolves active social channels for a placement from master channels array.
 */
export function resolveSocialFollowChannels(
  config: SocialFollowConfig,
  placementKey: SocialFollowPlacementKey,
  channels: readonly SocialChannelSource[]
): ResolvedSocialChannel[] {
  if (!config || !config.enabled) return []

  const placement = config.placements?.[placementKey]
  if (!placement || !placement.enabled) return []

  if (!Array.isArray(channels)) return []

  const result: ResolvedSocialChannel[] = []
  const seenPlatforms = new Set<SocialPlatformKey>()

  for (const ch of channels) {
    if (!ch) continue
    if (ch.active !== true) continue

    const key: SocialPlatformKey = ch.key
    if (!placement.platforms.includes(key)) continue
    if (seenPlatforms.has(key)) continue

    const validUrl = normalizeSocialHttpUrl(ch.url)
    if (validUrl === null) continue

    let buttonLabel: string | null = cleanLabel(placement.button_labels?.[key])

    if (!buttonLabel) {
      const defaultLabel = SOCIAL_FOLLOW_DEFAULTS.placements[placementKey]?.button_labels?.[key]
      buttonLabel = cleanLabel(defaultLabel)
    }

    if (!buttonLabel) {
      buttonLabel = cleanLabel(ch.label) || key
    }

    seenPlatforms.add(key)
    result.push({
      key,
      label: ch.label,
      url: validUrl,
      button_label: buttonLabel,
    })
  }

  return result
}
